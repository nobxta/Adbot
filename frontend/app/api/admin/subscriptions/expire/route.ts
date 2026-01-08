import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createNotification, logActivity } from '@/lib/queries';
import { logCronRun } from '@/lib/cron-monitoring';
import { sendEmail } from '@/lib/email';

/**
 * POST /api/admin/subscriptions/expire
 * Mark subscriptions as EXPIRED when expires_at is reached
 * Should be called periodically (e.g., every hour) by a cron job
 */
export async function POST(request: NextRequest) {
  const startTime = new Date();
  let affectedBotCount = 0;
  let errorMessage: string | undefined;
  
  try {
    // Allow both admin and system calls (with secret token)
    const authHeader = request.headers.get('Authorization') || '';
    const secretToken = request.headers.get('X-Expire-Secret') || '';
    
    // Check if it's a system call with secret token
    const expectedSecret = process.env.EXPIRE_SECRET || 'expire-secret-change-in-production';
    if (secretToken === expectedSecret) {
      // System call - proceed without role check
    } else {
      // Admin call - require role
      await requireRole(request, ['ADMIN']);
    }

    const now = new Date();

    // Find adbots that are expired but still marked as ACTIVE
    const { data: expiredAdbots, error: fetchError } = await supabaseAdmin
      .from('adbots')
      .select('id, user_id, expires_at, grace_expires_at, subscription_status, expiry_notification_sent')
      .eq('subscription_status', 'ACTIVE')
      .lt('expires_at', now.toISOString());

    if (fetchError) {
      throw fetchError;
    }

    const results = {
      expired: [] as string[],
      errors: [] as string[],
      notifications_sent: 0,
    };

    // Mark each as EXPIRED
    for (const adbot of expiredAdbots || []) {
      try {
        // Update subscription status
        const { error: updateError } = await supabaseAdmin
          .from('adbots')
          .update({
            subscription_status: 'EXPIRED',
          })
          .eq('id', adbot.id);

        if (updateError) {
          results.errors.push(`Failed to mark adbot ${adbot.id} as expired: ${updateError.message}`);
          continue;
        }

        results.expired.push(adbot.id);

        // Send expiry notification (only once)
        if (!adbot.expiry_notification_sent) {
          try {
            await createNotification({
              user_id: adbot.user_id,
              type: 'WARNING',
              title: 'Subscription Expired',
              message: 'Your plan has expired. You have 24 hours to renew before your bot is permanently deleted.',
            });

            // Mark notification as sent
            await supabaseAdmin
              .from('adbots')
              .update({ expiry_notification_sent: true })
              .eq('id', adbot.id);

            results.notifications_sent++;

            // Send email notification (non-blocking, fail-safe)
            try {
              // Get user email
              const { data: user } = await supabaseAdmin
                .from('users')
                .select('email')
                .eq('id', adbot.user_id)
                .single();

              if (user?.email) {
                const renewalUrl = `${request.nextUrl.origin}/dashboard?renewal=true`;
                await sendEmail({
                  to: user.email,
                  subject: 'Your plan has expired – 24 hours left',
                  template: 'expiry',
                  data: {
                    bot_id: adbot.id,
                    expires_at: adbot.expires_at,
                    grace_expires_at: adbot.grace_expires_at,
                    renewal_url: renewalUrl,
                  },
                });
              }
            } catch (emailError) {
              // Email failure is non-critical - log but continue
              console.error(`Failed to send expiry email for adbot ${adbot.id}:`, emailError);
            }
          } catch (notifError) {
            console.error(`Failed to send expiry notification for adbot ${adbot.id}:`, notifError);
            // Continue - notification failure shouldn't block expiry
          }
        }

        // Log activity
        await logActivity({
          user_id: adbot.user_id,
          action: 'UPDATE',
          entity_type: 'adbot',
          entity_id: adbot.id,
          details: {
            action: 'subscription_expired',
            expires_at: adbot.expires_at,
            subscription_status: 'EXPIRED',
          },
        });
      } catch (error) {
        results.errors.push(`Error processing adbot ${adbot.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    affectedBotCount = results.expired.length;
    const status: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 
      results.errors.length === 0 ? 'SUCCESS' :
      results.expired.length > 0 ? 'PARTIAL' : 'FAILED';
    
    if (results.errors.length > 0) {
      errorMessage = results.errors.join('; ');
    }

    // Log cron execution (non-blocking)
    await logCronRun('subscription-expire', status, affectedBotCount, startTime, errorMessage);

    return NextResponse.json({
      success: true,
      message: `Expiry check complete. ${results.expired.length} subscriptions expired, ${results.notifications_sent} notifications sent, ${results.errors.length} errors.`,
      results,
    });
  } catch (error) {
    console.error('Error in expiry handler:', error);
    errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Log cron execution failure (non-blocking)
    await logCronRun('subscription-expire', 'FAILED', 0, startTime, errorMessage);
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

