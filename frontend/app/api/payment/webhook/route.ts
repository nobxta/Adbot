import { NextRequest, NextResponse } from 'next/server';
import { sendPaymentSuccessEmail } from '@/lib/email';
import {
  getPaymentByOrderId,
  updatePaymentStatus,
  updateOrderStatus,
  getOrderById,
  getProductById,
  createAdbot,
  logActivity,
  createNotification,
} from '@/lib/queries';
import { autoAssignSessions } from '@/lib/stock';
import { supabase } from '@/lib/supabase';

// Webhook to receive payment status updates from NowPayments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Verify webhook signature (if enabled in NowPayments settings)
    // const signature = request.headers.get('x-nowpayments-sig');
    // Verify signature here if needed

    const {
      payment_id,
      payment_status,
      pay_address,
      price_amount,
      price_currency,
      pay_amount,
      pay_currency,
      actually_paid,
      order_id,
    } = body;

    console.log('Payment webhook received:', {
      payment_id,
      payment_status,
      order_id,
    });

    // Get payment record from database
    // CRITICAL: Use 'payment_id' column (not 'provider_payment_id')
    // This matches the column name used in createPayment() in create/route.ts
    // Schema: frontend/supabase/schema.sql line 35 defines 'payment_id TEXT UNIQUE NOT NULL'
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('payment_id', payment_id)
      .single();
    
    if (paymentError || !payment) {
      console.error('Payment not found in database:', {
        payment_id,
        error: paymentError,
        column_used: 'payment_id',
        reason: 'Payment lookup uses payment_id column which matches createPayment() storage'
      });
      return NextResponse.json(
        { error: 'Payment not found', payment_id },
        { status: 404 }
      );
    }

    // Update payment status in database
    await updatePaymentStatus(payment.id, payment_status === 'finished' || payment_status === 'confirmed' ? 'COMPLETED' : 'FAILED', {
      payment_address: pay_address,
      payment_amount: pay_amount,
      payment_currency: pay_currency,
      actually_paid,
    });

    // Handle successful payment
    if (payment_status === 'finished' || payment_status === 'confirmed') {
      console.log('Payment completed, processing order:', payment.order_id);
      
      // Get order and product details
      const order = await getOrderById(payment.order_id);
      const product = await getProductById(order.product_id);

      // Check if this is a renewal (existing adbot for this user/product)
      const { data: existingAdbot } = await supabaseAdmin
        .from('adbots')
        .select('id, subscription_status, expires_at, grace_expires_at')
        .eq('user_id', order.user_id)
        .eq('product_id', product.id)
        .eq('deleted_state', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const isRenewal = existingAdbot && (existingAdbot.subscription_status === 'EXPIRED' || existingAdbot.subscription_status === 'ACTIVE');

      // Update order status
      await updateOrderStatus(order.id, 'COMPLETED');

      // CRITICAL: Map product.plan_type to execution_mode (canonical mapping)
      // This is the SINGLE SOURCE OF TRUTH for execution_mode
      // product.plan_type is 'STARTER' | 'ENTERPRISE' (uppercase from DB)
      // execution_mode must be 'starter' | 'enterprise' (lowercase for Python backend)
      if (!product.plan_type) {
        console.error('Product missing plan_type:', product.id);
        throw new Error(`Product ${product.id} missing required plan_type field`);
      }
      
      const execution_mode = product.plan_type.toUpperCase() === 'STARTER' ? 'starter' : 'enterprise';
      
      // Attempt to auto-assign sessions (returns partial results, does NOT throw)
      const sessionAssignment = await autoAssignSessions(order.id, product.sessions_count);
      
      // Determine adbot status based on session assignment
      let adbotStatus: 'STOPPED' | 'QUEUED' = 'STOPPED';
      let missingSessionsCount = 0;
      let queuedReason: string | undefined;
      
      if (!sessionAssignment.hasEnough) {
        // Not enough sessions - set to QUEUED
        adbotStatus = 'QUEUED';
        missingSessionsCount = sessionAssignment.missingCount;
        queuedReason = `Insufficient sessions. Required: ${sessionAssignment.requiredCount}, Available: ${sessionAssignment.assignedCount}, Missing: ${missingSessionsCount}`;
        
        console.warn(`Adbot will be QUEUED due to insufficient sessions:`, {
          order_id: order.id,
          required: sessionAssignment.requiredCount,
          assigned: sessionAssignment.assignedCount,
          missing: missingSessionsCount,
        });
        
        // CRITICAL: Notify admin immediately
        await createNotification({
          type: 'ERROR',
          title: '⚠️ Order Queued: Insufficient Sessions',
          message: `Order ${order.id} requires ${sessionAssignment.requiredCount} sessions but only ${sessionAssignment.assignedCount} available. Missing: ${missingSessionsCount}. Adbot created in QUEUED state.`,
        });
      } else {
        console.log(`Successfully assigned ${sessionAssignment.assignedCount} sessions to order ${order.id}`);
      }
      
      let adbot;
      
      if (isRenewal && existingAdbot) {
        // RENEWAL: Update existing adbot subscription
        const now = new Date();
        const newExpiresAt = new Date(now.getTime() + product.validity_days * 24 * 60 * 60 * 1000);
        const newGraceExpiresAt = new Date(newExpiresAt.getTime() + 24 * 60 * 60 * 1000); // +24 hours

        const { data: renewedAdbot, error: renewError } = await supabaseAdmin
          .from('adbots')
          .update({
            activated_at: now.toISOString(),
            expires_at: newExpiresAt.toISOString(),
            grace_expires_at: newGraceExpiresAt.toISOString(),
            subscription_status: 'ACTIVE',
            validity_days: product.validity_days,
            valid_until: newExpiresAt.toISOString(),
            pre_expiry_notification_sent: false, // Reset for new subscription
            expiry_notification_sent: false, // Reset for new subscription
            deletion_notification_sent: false, // Reset for new subscription
            status: adbotStatus, // QUEUED or STOPPED (based on session assignment)
          })
          .eq('id', existingAdbot.id)
          .select()
          .single();

        if (renewError) {
          throw new Error(`Failed to renew subscription: ${renewError.message}`);
        }

        adbot = renewedAdbot;

        // Assign sessions if needed (for renewal)
        if (sessionAssignment.hasEnough && sessionAssignment.assignedCount > 0) {
          // Sessions already assigned by autoAssignSessions above
          // Just update the adbot's sessions_assigned count
          await supabaseAdmin
            .from('adbots')
            .update({ sessions_assigned: sessionAssignment.assignedCount })
            .eq('id', adbot.id);
        }

        // Send renewal success email (non-blocking, fail-safe)
        try {
          const { data: user } = await supabaseAdmin
            .from('users')
            .select('email')
            .eq('id', order.user_id)
            .single();

          if (user?.email) {
            const { sendEmail } = await import('@/lib/email');
            await sendEmail({
              to: user.email,
              subject: 'Subscription Renewed',
              template: 'renewal-success',
              data: {
                bot_id: adbot.id,
                expires_at: newExpiresAt.toISOString(),
              },
            });
          }
        } catch (emailError) {
          // Email failure is non-critical - log but continue
          console.error(`Failed to send renewal success email for adbot ${adbot.id}:`, emailError);
        }
      } else {
        // NEW SUBSCRIPTION: Create new adbot
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + product.validity_days);

        adbot = await createAdbot({
          user_id: order.user_id,
          order_id: order.id,
          product_id: product.id,
          post_link: '', // User will configure this
          target_groups: [],
          sessions_assigned: sessionAssignment.assignedCount, // Actual assigned count
          posting_interval_minutes: product.posting_interval_minutes,
          valid_until: validUntil.toISOString(),
          execution_mode, // CRITICAL: Set execution_mode from product.plan_type
          status: adbotStatus, // QUEUED or STOPPED
          required_sessions: sessionAssignment.requiredCount,
          missing_sessions_count: missingSessionsCount,
          queued_reason: queuedReason,
          creation_source: 'USER_PAYMENT',
          validity_days: product.validity_days, // CRITICAL: Pass validity_days for subscription lifecycle
        });
      }

      // CRITICAL: Sync execution_mode to Python backend user_data
      // This ensures Python backend has execution_mode when bot starts
      // Note: execution_mode is stored in adbots table and will be synced when bot starts
      // For now, we register user with plan_limits that include plan_type
      // The start route will sync execution_mode from adbot.execution_mode to user_data
      try {
        const { registerUserInBackend } = await import('@/lib/python-backend');
        const { generateToken } = await import('@/lib/auth');
        
        const syncToken = await generateToken({
          userId: order.user_id,
          role: 'USER',
          plan_status: 'active',
          plan_limits: {
            max_sessions: product.sessions_count,
            plan_type: product.plan_type, // Pass plan_type for validation
          },
        });
        
        // Register user with plan info (execution_mode will be synced on first start)
        await registerUserInBackend(syncToken, 'active', {
          max_sessions: product.sessions_count,
          plan_type: product.plan_type,
        });
        
        console.log('Registered user in Python backend with plan info:', {
          user_id: order.user_id,
          execution_mode,
          plan_type: product.plan_type,
        });
      } catch (syncError) {
        console.error('WARNING: Failed to register user in Python backend:', syncError);
        // Log but don't fail - user will be registered when bot starts
      }

      // Log activity
      await logActivity({
        user_id: order.user_id,
        action: 'PURCHASE',
        entity_type: 'adbot',
        entity_id: adbot.id,
        details: {
          order_id: order.id,
          product_id: product.id,
          amount: order.total_amount,
        },
      });

      // Create notification for user
      await createNotification({
        user_id: order.user_id,
        type: 'SUCCESS',
        title: 'Payment Successful',
        message: `Your ${product.name} has been activated! You can now configure and start your adbot.`,
      });

      // Get user details for email
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', order.user_id)
        .single();

      // Send success email
      if (user && user.email) {
        try {
          await sendPaymentSuccessEmail({
            email: user.email,
            planName: product.name,
            planType: product.type,
            paymentId: payment_id,
            accessCode: user.access_code,
            licenseKey: adbot.id,
          });
        } catch (emailError) {
          console.error('Failed to send payment success email:', emailError);
        }
      }

      console.log('Order processed successfully:', order.id);
    } else if (payment_status === 'failed' || payment_status === 'expired') {
      // Update order status to failed
      await updateOrderStatus(payment.order_id, 'FAILED');
      
      console.log('Payment failed for order:', payment.order_id);
    }

    return NextResponse.json({ received: true, payment_status });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

