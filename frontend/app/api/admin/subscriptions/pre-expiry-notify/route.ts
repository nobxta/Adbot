import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createNotification, logActivity } from '@/lib/queries';
import { logCronRun } from '@/lib/cron-monitoring';
import { sendEmail } from '@/lib/email';

/**
 * POST /api/admin/subscriptions/pre-expiry-notify
 * Send pre-expiry notifications (48 hours before expiry)
 * Should be called periodically (e.g., every hour) by a cron job
 */
export async function POST(request: NextRequest) {
  const startTime = new Date();
  let affectedBotCount = 0;
  let errorMessage: string | undefined;
  
  try {
    // Allow both admin and system calls (with secret token)
    const authHeader = request.headers.get('Authorization') || '';
    const secretToken = request.headers.get('X-PreExpiry-Secret') || '';
    
    // Check if it's a system call with secret token
    const expectedSecret = process.env.PRE_EXPIRY_SECRET || 'pre-expiry-secret-change-in-production';
    if (secretToken === expectedSecret) {
      // System call - proceed without role check
    } else {
      // Admin call - require role
      await requireRole(request, ['ADMIN']);
    }

    const now = new Date();
    const warningThreshold = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
    const warningCutoff = new Date(now.getTime() + warningThreshold);

    // Find adbots expiring within 48 hours that haven't been notified
    const { data: expiringAdbots, error: fetchError } = await supabaseAdmin
      .from('adbots')
      .select('id, user_id, expires_at, subscription_status, pre_expiry_notification_sent')
      .eq('subscription_status', 'ACTIVE')
      .eq('pre_expiry_notification_sent', false)
      .gte('expires_at', now.toISOString())
      .lte('expires_at', warningCutoff.toISOString());

    if (fetchError) {
      throw fetchError;
    }

    const results = {
      notified: [] as string[],
      errors: [] as string[],
    };

    // Send notification for each expiring adbot
    for (const adbot of expiringAdbots || []) {
      try {
        const expiresAt = new Date(adbot.expires_at);
        const hoursUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));

        // Send notification
        await createNotification({
          user_id: adbot.user_id,
          type: 'WARNING',
          title: 'Subscription Expiring Soon',
          message: `Your subscription expires in ${hoursUntilExpiry} hours. Renew to avoid interruption.`,
        });

        // Mark notification as sent
        await supabaseAdmin
          .from('adbots')
          .update({ pre_expiry_notification_sent: true })
          .eq('id', adbot.id);

        results.notified.push(adbot.id);

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
              subject: 'Your AdBot plan expires soon',
              template: 'pre-expiry',
              data: {
                bot_id: adbot.id,
                expires_at: adbot.expires_at,
                renewal_url: renewalUrl,
              },
            });
          }
        } catch (emailError) {
          // Email failure is non-critical - log but continue
          console.error(`Failed to send pre-expiry email for adbot ${adbot.id}:`, emailError);
        }

        // Log activity
        await logActivity({
          user_id: adbot.user_id,
          action: 'PRE_EXPIRY_NOTIFICATION_SENT',
          entity_type: 'adbot',
          entity_id: adbot.id,
          details: {
            expires_at: adbot.expires_at,
            hours_until_expiry: hoursUntilExpiry,
          },
        });
      } catch (error) {
        results.errors.push(`Error notifying adbot ${adbot.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    affectedBotCount = results.notified.length;
    const status: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 
      results.errors.length === 0 ? 'SUCCESS' :
      results.notified.length > 0 ? 'PARTIAL' : 'FAILED';
    
    if (results.errors.length > 0) {
      errorMessage = results.errors.join('; ');
    }

    // Log cron execution (non-blocking)
    await logCronRun('pre-expiry-notify', status, affectedBotCount, startTime, errorMessage);

    return NextResponse.json({
      success: true,
      message: `Pre-expiry notification complete. ${results.notified.length} notifications sent, ${results.errors.length} errors.`,
      results,
    });
  } catch (error) {
    console.error('Error in pre-expiry notification:', error);
    errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Log cron execution failure (non-blocking)
    await logCronRun('pre-expiry-notify', 'FAILED', 0, startTime, errorMessage);
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

