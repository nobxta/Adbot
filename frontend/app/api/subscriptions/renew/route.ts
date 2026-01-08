import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getProductById, createOrder, createPayment } from '@/lib/queries';

/**
 * POST /api/subscriptions/renew
 * Renew an expired subscription (within grace period only)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    if (!user.userId) {
      return NextResponse.json(
        { error: 'User ID not found' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { adbot_id, product_id, currency = 'USD' } = body;

    if (!adbot_id || !product_id) {
      return NextResponse.json(
        { error: 'adbot_id and product_id are required' },
        { status: 400 }
      );
    }

    // Step 1: Verify adbot exists and belongs to user
    const { data: adbot, error: adbotError } = await supabaseAdmin
      .from('adbots')
      .select('id, user_id, subscription_status, expires_at, grace_expires_at, deleted_state')
      .eq('id', adbot_id)
      .eq('user_id', user.userId)
      .single();

    if (adbotError || !adbot) {
      return NextResponse.json(
        { error: 'Adbot not found or access denied' },
        { status: 404 }
      );
    }

    // Step 2: Verify subscription can be renewed
    if (adbot.subscription_status === 'DELETED' || adbot.deleted_state === true) {
      return NextResponse.json(
        { 
          error: 'Subscription expired and bot deleted. Renewal not possible.',
          subscription_status: 'DELETED',
        },
        { status: 403 }
      );
    }

    if (adbot.subscription_status === 'ACTIVE') {
      return NextResponse.json(
        { 
          error: 'Subscription is still active. No renewal needed.',
          subscription_status: 'ACTIVE',
        },
        { status: 400 }
      );
    }

    // Check if still in grace period
    if (adbot.subscription_status === 'EXPIRED') {
      const now = new Date();
      const graceExpiresAt = adbot.grace_expires_at ? new Date(adbot.grace_expires_at) : null;

      if (!graceExpiresAt || now > graceExpiresAt) {
        return NextResponse.json(
          { 
            error: 'Grace period expired. Renewal not possible.',
            subscription_status: 'DELETED',
          },
          { status: 403 }
        );
      }
    }

    // Step 3: Get product details
    const product = await getProductById(product_id);
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Step 4: Create renewal order
    const order = await createOrder({
      user_id: user.userId,
      product_id: product.id,
      total_amount: product.price,
    });

    // Step 5: Create payment request
    const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
    const NOWPAYMENTS_API_URL = process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1';

    if (!NOWPAYMENTS_API_KEY) {
      return NextResponse.json(
        { error: 'Payment gateway not configured' },
        { status: 500 }
      );
    }

    // Create payment request with NowPayments
    const paymentResponse = await fetch(`${NOWPAYMENTS_API_URL}/payment`, {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: product.price,
        price_currency: currency,
        pay_currency: currency,
        order_id: order.id,
        order_description: `Renewal: ${product.name}`,
        ipn_callback_url: `${request.nextUrl.origin}/api/payment/webhook`,
        success_url: `${request.nextUrl.origin}/dashboard?renewal=success`,
        cancel_url: `${request.nextUrl.origin}/dashboard?renewal=cancelled`,
      }),
    });

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: `Failed to create payment: ${errorData.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    const paymentData = await paymentResponse.json();

    // Step 6: Store payment record
    await createPayment({
      order_id: order.id,
      user_id: user.userId,
      amount: product.price,
      currency: currency,
      payment_provider: 'NOWPAYMENTS',
      provider_payment_id: paymentData.payment_id,
    });

    return NextResponse.json({
      success: true,
      message: 'Renewal payment created',
      payment: {
        payment_id: paymentData.payment_id,
        payment_url: paymentData.invoice_url,
        amount: product.price,
        currency: currency,
      },
      order_id: order.id,
    });
  } catch (error) {
    console.error('Error creating renewal:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

