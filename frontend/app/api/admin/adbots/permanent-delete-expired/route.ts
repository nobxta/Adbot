import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity, createNotification } from '@/lib/queries';
import { revokeAdbotSessions } from '@/lib/session-reconciliation';
import { logCronRun } from '@/lib/cron-monitoring';

/**
 * POST /api/admin/adbots/permanent-delete-expired
 * Permanently delete soft-deleted adbots after 10-day recovery window expires
 * Should be called daily (e.g., at 2 AM) by a cron job
 */
export async function POST(request: NextRequest) {
  const startTime = new Date();
  let affectedBotCount = 0;
  let errorMessage: string | undefined;
  
  try {
    // Allow both admin and system calls (with secret token)
    const authHeader = request.headers.get('Authorization') || '';
    const secretToken = request.headers.get('X-Permanent-Delete-Secret') || '';
    
    // Check if it's a system call with secret token
    const expectedSecret = process.env.PERMANENT_DELETE_SECRET || 'permanent-delete-secret-change-in-production';
    if (secretToken === expectedSecret) {
      // System call - proceed without role check
    } else {
      // Admin call - require role
      await requireRole(request, ['ADMIN']);
    }

    const now = new Date();

    // Find adbots that are soft-deleted and past the recovery window
    const { data: expiredDeletions, error: fetchError } = await supabaseAdmin
      .from('adbots')
      .select('id, user_id, bot_id, product_id, status, deleted_state, deletion_scheduled_at')
      .eq('deleted_state', true)
      .not('deletion_scheduled_at', 'is', null)
      .lt('deletion_scheduled_at', now.toISOString());

    if (fetchError) {
      throw fetchError;
    }

    const results = {
      deleted: [] as string[],
      errors: [] as string[],
    };

    // Permanently delete each expired soft-deleted adbot
    for (const adbot of expiredDeletions || []) {
      try {
        // Revoke sessions (updates both filesystem and database)
        try {
          const adminToken = authHeader.replace('Bearer ', '');
          const revocationResult = await revokeAdbotSessions(adbot.id, adminToken);
          if (revocationResult.errors.length > 0) {
            results.errors.push(`Adbot ${adbot.id}: Session revocation errors: ${revocationResult.errors.join(', ')}`);
          }
        } catch (revokeError) {
          results.errors.push(`Adbot ${adbot.id}: Failed to revoke sessions: ${revokeError instanceof Error ? revokeError.message : 'Unknown error'}`);
          // Continue with deletion even if revocation fails
        }

        // Stop bot if running
        if (adbot.status === 'ACTIVE' || adbot.status === 'RUNNING') {
          try {
            const { stopAdbot } = await import('@/lib/python-backend');
            await stopAdbot(adbot.id);
          } catch (stopError) {
            console.warn(`Failed to stop bot ${adbot.id}:`, stopError);
            // Continue with deletion even if stop fails
          }
        }

        // Log activity before deletion (for audit trail)
        await logActivity({
          action: 'PERMANENT_DELETE',
          entity_type: 'adbot',
          entity_id: adbot.id,
          details: {
            action: 'permanent_delete_expired',
            user_id: adbot.user_id,
            bot_id: adbot.bot_id,
            product_id: adbot.product_id,
            status: adbot.status,
            was_soft_deleted: true,
            deletion_scheduled_at: adbot.deletion_scheduled_at,
            timestamp: now.toISOString(),
          },
        });

        // Hard delete the adbot (permanent removal from database)
        const { error: deleteError } = await supabaseAdmin
          .from('adbots')
          .delete()
          .eq('id', adbot.id);

        if (deleteError) {
          results.errors.push(`Failed to permanently delete adbot ${adbot.id}: ${deleteError.message}`);
          continue;
        }

        // Optionally delete associated bot (if no other adbots use it)
        if (adbot.bot_id) {
          const { data: otherAdbots } = await supabaseAdmin
            .from('adbots')
            .select('id')
            .eq('bot_id', adbot.bot_id)
            .neq('id', adbot.id)
            .limit(1);

          if (!otherAdbots || otherAdbots.length === 0) {
            // No other adbots use this bot, safe to delete
            await supabaseAdmin
              .from('bots')
              .delete()
              .eq('id', adbot.bot_id);
          }
        }

        results.deleted.push(adbot.id);
      } catch (error) {
        results.errors.push(`Error processing adbot ${adbot.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    affectedBotCount = results.deleted.length;
    const status: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 
      results.errors.length === 0 ? 'SUCCESS' :
      results.deleted.length > 0 ? 'PARTIAL' : 'FAILED';
    
    if (results.errors.length > 0) {
      errorMessage = results.errors.join('; ');
    }

    // Log cron execution (non-blocking)
    await logCronRun('permanent-delete-expired', status, affectedBotCount, startTime, errorMessage);

    // Notify admin if significant deletions occurred
    if (results.deleted.length > 0) {
      try {
        await createNotification({
          type: 'INFO',
          title: 'Permanent Deletion Completed',
          message: `${results.deleted.length} soft-deleted adbot(s) permanently deleted after recovery window expired.`,
        });
      } catch (notifError) {
        // Notification failure is non-critical
        console.error('Failed to create permanent deletion notification:', notifError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Permanent deletion complete. ${results.deleted.length} adbots permanently deleted, ${results.errors.length} errors.`,
      results,
    });
  } catch (error) {
    console.error('Error in permanent deletion:', error);
    errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Log cron execution failure (non-blocking)
    await logCronRun('permanent-delete-expired', 'FAILED', 0, startTime, errorMessage);
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

