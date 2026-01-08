import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { revokeAdbotSessions } from '@/lib/session-reconciliation';
import { logActivity, createNotification } from '@/lib/queries';
import { logCronRun } from '@/lib/cron-monitoring';
import { sendEmail } from '@/lib/email';

/**
 * POST /api/admin/subscriptions/expire-check
 * Check for expired subscriptions and handle grace period / revocation
 * Should be called periodically (e.g., every hour) by a cron job
 */
export async function POST(request: NextRequest) {
  const startTime = new Date();
  let affectedBotCount = 0;
  let errorMessage: string | undefined;
  
  try {
    // Allow both admin and system calls (with secret token)
    const authHeader = request.headers.get('Authorization') || '';
    const secretToken = request.headers.get('X-Expire-Check-Secret') || '';
    
    // Check if it's a system call with secret token
    const expectedSecret = process.env.EXPIRE_CHECK_SECRET || 'expire-check-secret-change-in-production';
    if (secretToken === expectedSecret) {
      // System call - proceed without role check
    } else {
      // Admin call - require role
      await requireRole(request, ['ADMIN']);
    }

    const now = new Date();
    const gracePeriodHours = 24;
    const gracePeriodMs = gracePeriodHours * 60 * 60 * 1000;

    // Step 1: Find adbots that are expired but within grace period
    const gracePeriodCutoff = new Date(now.getTime() - gracePeriodMs);
    
    const { data: expiredInGrace, error: graceError } = await supabaseAdmin
      .from('adbots')
      .select('id, user_id, valid_until, status')
      .lt('valid_until', now.toISOString())
      .gte('valid_until', gracePeriodCutoff.toISOString())
      .in('status', ['ACTIVE', 'RUNNING', 'STOPPED']);

    if (graceError) {
      throw graceError;
    }

    // Step 2: Find adbots that are expired beyond grace period (need revocation)
    const { data: expiredBeyondGrace, error: expiredError } = await supabaseAdmin
      .from('adbots')
      .select('id, user_id, valid_until, status, deleted_state, deletion_notification_sent')
      .lt('valid_until', gracePeriodCutoff.toISOString())
      .in('status', ['ACTIVE', 'RUNNING', 'STOPPED'])
      .eq('deleted_state', false);

    if (expiredError) {
      throw expiredError;
    }

    const results = {
      inGracePeriod: expiredInGrace?.length || 0,
      beyondGracePeriod: expiredBeyondGrace?.length || 0,
      revoked: [] as string[],
      errors: [] as string[],
    };

    // Step 3: Revoke sessions for adbots beyond grace period
    for (const adbot of expiredBeyondGrace || []) {
      try {
        // Stop bot if running
        if (adbot.status === 'ACTIVE' || adbot.status === 'RUNNING') {
          try {
            const { stopAdbot } = await import('@/lib/python-backend');
            await stopAdbot(adbot.id);
          } catch (stopError) {
            console.warn(`Failed to stop bot ${adbot.id}:`, stopError);
          }
        }

        // Revoke sessions (updates both filesystem and database)
        const revocationResult = await revokeAdbotSessions(adbot.id, authHeader.replace('Bearer ', ''));
        
        if (revocationResult.errors.length > 0) {
          results.errors.push(`Adbot ${adbot.id}: ${revocationResult.errors.join(', ')}`);
        }

        // Mark adbot as DELETED (irreversible)
        const { error: updateError } = await supabaseAdmin
          .from('adbots')
          .update({
            status: 'DELETED',
            subscription_status: 'DELETED',
            deleted_state: true,
            deleted_at: now.toISOString(),
            delete_reason: 'Subscription expired beyond grace period',
            deletion_notification_sent: true,
          })
          .eq('id', adbot.id);

        if (updateError) {
          results.errors.push(`Failed to mark adbot ${adbot.id} as expired: ${updateError.message}`);
        } else {
          results.revoked.push(adbot.id);

          // Log activity
          await logActivity({
            user_id: adbot.user_id,
            action: 'UPDATE',
            entity_type: 'adbot',
            entity_id: adbot.id,
            details: {
              action: 'subscription_expired',
              valid_until: adbot.valid_until,
              grace_period_hours: gracePeriodHours,
              sessions_revoked: revocationResult.revoked,
            },
          });

          // Notify user (only if not already sent)
          if (!adbot.deletion_notification_sent) {
            await createNotification({
              user_id: adbot.user_id,
              type: 'ERROR',
              title: 'Subscription Deleted',
              message: `Your subscription was deleted due to non-renewal. Renewal is no longer possible.`,
            });

            // Send email notification (non-blocking, fail-safe)
            try {
              // Get user email
              const { data: user } = await supabaseAdmin
                .from('users')
                .select('email')
                .eq('id', adbot.user_id)
                .single();

              if (user?.email) {
                await sendEmail({
                  to: user.email,
                  subject: 'Your AdBot was deleted due to non-renewal',
                  template: 'deletion',
                  data: {
                    bot_id: adbot.id,
                  },
                });
              }
            } catch (emailError) {
              // Email failure is non-critical - log but continue
              console.error(`Failed to send deletion email for adbot ${adbot.id}:`, emailError);
            }
          }
        }
      } catch (error) {
        results.errors.push(`Error processing adbot ${adbot.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    affectedBotCount = results.revoked.length;
    const status: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 
      results.errors.length === 0 ? 'SUCCESS' :
      results.revoked.length > 0 ? 'PARTIAL' : 'FAILED';
    
    if (results.errors.length > 0) {
      errorMessage = results.errors.join('; ');
    }

    // Log cron execution (non-blocking)
    await logCronRun('subscription-expire-check', status, affectedBotCount, startTime, errorMessage);

    return NextResponse.json({
      success: true,
      message: `Expiry check complete. ${results.inGracePeriod} in grace period, ${results.revoked.length} revoked, ${results.errors.length} errors.`,
      results,
    });
  } catch (error) {
    console.error('Error in expiry check:', error);
    errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Log cron execution failure (non-blocking)
    await logCronRun('subscription-expire-check', 'FAILED', 0, startTime, errorMessage);
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

