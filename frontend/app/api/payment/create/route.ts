import { NextRequest, NextResponse } from 'next/server';
import { sendOrderConfirmationEmail } from '@/lib/email';
import { createPayment, getUserByEmail, createUser, updateUser } from '@/lib/db';
import { createOrder } from '@/lib/queries';
import { randomUUID } from 'crypto';

// NowPayments API configuration
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || '';
const NOWPAYMENTS_API_URL = process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const IPN_CALLBACK_URL = process.env.IPN_CALLBACK_URL || `${BASE_URL}/api/payment/webhook`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, product_id, currency } = body;

    // CRITICAL: product_id is MANDATORY - reject requests without it
    // All commercial logic MUST come from database products
    if (!product_id) {
      return NextResponse.json(
        { error: 'product_id is required. All payment data must come from database products.' },
        { status: 400 }
      );
    }

    if (!email || !currency) {
      return NextResponse.json(
        { error: 'Missing required fields: email and currency are required' },
        { status: 400 }
      );
    }

    // CRITICAL: Fetch product from database - this is the SINGLE SOURCE OF TRUTH
    // NO FALLBACKS - fail hard if product not found
    const { supabase } = await import('@/lib/supabase');
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .eq('active', true) // Only allow active products
      .single();

    if (productError || !product) {
      console.error('Product lookup failed:', { product_id, error: productError });
      return NextResponse.json(
        { error: `Product ${product_id} not found or inactive. All commercial logic must come from database.` },
        { status: 404 }
      );
    }

    // CRITICAL: Validate product has required fields
    if (!product.plan_type) {
      return NextResponse.json(
        { error: `Product ${product_id} missing required plan_type field` },
        { status: 400 }
      );
    }

    if (!product.price || product.price <= 0) {
      return NextResponse.json(
        { error: `Product ${product_id} has invalid price` },
        { status: 400 }
      );
    }

    // ALL data comes from database product - NO frontend-provided values
    const actualProduct = product;
    const actualPlanName = product.name;
    const actualPlanType = product.plan_type; // Keep uppercase from DB
    const finalAmount = product.price; // ALWAYS use database price

    if (!NOWPAYMENTS_API_KEY) {
      return NextResponse.json(
        { error: 'Payment service not configured' },
        { status: 500 }
      );
    }

    // Ensure BASE_URL is a valid URL (remove trailing slash if present)
    const cleanBaseUrl = BASE_URL.replace(/\/$/, '');
    const successUrl = `${cleanBaseUrl}/payment-success`;
    const cancelUrl = `${cleanBaseUrl}/checkout`;

    // Validate URLs are properly formatted
    try {
      new URL(successUrl);
      new URL(cancelUrl);
      new URL(IPN_CALLBACK_URL);
    } catch (urlError) {
      console.error('Invalid URL format:', { BASE_URL, successUrl, cancelUrl, IPN_CALLBACK_URL });
      return NextResponse.json(
        { error: 'Invalid URL configuration', details: 'BASE_URL must be a valid URL (e.g., https://yourdomain.com)' },
        { status: 500 }
      );
    }

    const paymentPayload = {
      price_amount: finalAmount,
      price_currency: 'USD',
      pay_currency: currency.toLowerCase(),
      ipn_callback_url: IPN_CALLBACK_URL,
      order_id: `HQADZ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order_description: `${actualPlanName} Plan - ${actualPlanType}`,
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    console.log('Creating payment with NowPayments:', {
      url: `${NOWPAYMENTS_API_URL}/payment`,
      success_url: successUrl,
      cancel_url: cancelUrl,
      ipn_callback_url: IPN_CALLBACK_URL,
    });

    // Create payment with NowPayments
    const paymentResponse = await fetch(`${NOWPAYMENTS_API_URL}/payment`, {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentPayload),
    });

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json();
      console.error('NowPayments API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to create payment', details: errorData },
        { status: paymentResponse.status }
      );
    }

    const paymentData = await paymentResponse.json();

    // Get or create user
    let user = await getUserByEmail(email);
    if (!user) {
      // Create new user with a generated access code and license key
      const accessCode = `USER-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const licenseKey = `LIC-${randomUUID().toUpperCase().replace(/-/g, '').substr(0, 16)}`;
      
      user = await createUser({
        email,
        role: 'user',
        access_code: accessCode,
        license_key: licenseKey,
        plan_type: actualPlanType,
        plan_status: 'inactive', // Will be activated when payment is completed
      });
    } else {
      // Update existing user's plan info
      await updateUser(user.id, {
        plan_type: actualPlanType,
        plan_status: 'inactive',
      });
    }

    // CRITICAL: Order MUST be created BEFORE payment creation
    // Fail hard if order creation fails - no payment without order
    if (!user) {
      return NextResponse.json(
        { error: 'User creation/retrieval failed' },
        { status: 500 }
      );
    }

    let order;
    try {
      order = await createOrder({
        user_id: user.id,
        product_id: actualProduct.id,
        total_amount: finalAmount,
      });
      
      if (!order || !order.id) {
        throw new Error('Order creation returned invalid order');
      }
    } catch (orderError) {
      console.error('CRITICAL: Order creation failed:', orderError);
      return NextResponse.json(
        { error: 'Failed to create order. Payment cannot proceed without order.', details: orderError instanceof Error ? orderError.message : 'Unknown error' },
        { status: 500 }
      );
    }

    // Use order.id for payment tracking
    const orderId = order.id;

    // Store payment in database using db.ts function (matches Payment interface)
    // CRITICAL: payment_id column (not provider_payment_id) - matches webhook lookup
    const payment = await createPayment({
      payment_id: paymentData.payment_id, // Stored in 'payment_id' column
      email,
      plan_name: actualPlanName,
      plan_type: actualPlanType.toLowerCase() as 'starter' | 'enterprise', // Convert to lowercase for consistency
      amount: finalAmount,
      currency: currency || 'USD',
      user_id: user.id, // Guaranteed to exist at this point
      order_id: orderId, // Guaranteed to exist - order created above
      payment_status: paymentData.payment_status || 'waiting',
      payment_address: paymentData.pay_address,
      payment_amount: paymentData.pay_amount,
      payment_currency: paymentData.pay_currency,
      product_id: actualProduct.id, // Guaranteed to exist - validated above
    });

    // Send order confirmation email with payment instructions
    try {
      await sendOrderConfirmationEmail({
        email,
        planName: actualPlanName, // Use database value
        planType: actualPlanType, // Use database value
        amount: finalAmount, // Use database price
        paymentId: paymentData.payment_id,
        paymentAddress: paymentData.pay_address,
        paymentAmount: paymentData.pay_amount,
        paymentCurrency: paymentData.pay_currency,
      });
    } catch (emailError) {
      console.error('Failed to send order confirmation email:', emailError);
      // Continue even if email fails - payment is still created
    }

    return NextResponse.json({
      paymentId: paymentData.payment_id,
      paymentAddress: paymentData.pay_address,
      paymentAmount: paymentData.pay_amount,
      paymentCurrency: paymentData.pay_currency,
      paymentStatus: paymentData.payment_status,
      expiresAt: paymentData.expiration_estimate_date,
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

