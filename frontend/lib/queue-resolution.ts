// ============================================
// QUEUE RESOLUTION SYSTEM
// Automatically resolves QUEUED adbots when resources become available
// ============================================

import { supabaseAdmin } from './supabase';
import { listUnusedSessions, assignSessionToAdbot } from './queries';
import { createNotification, logActivity } from './queries';

/**
 * Check and resolve queued adbots when sessions become available
 * This should be called:
 * - After admin adds new sessions
 * - Periodically via cron job
 * - After session assignment operations
 */
export async function resolveQueuedAdbots(): Promise<{
  resolved: number;
  stillQueued: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let resolved = 0;
  let stillQueued = 0;

  try {
    // Get all QUEUED adbots ordered by queued_at (FIFO)
    const { data: queuedAdbots, error: fetchError } = await supabaseAdmin
      .from('adbots')
      .select('*')
      .eq('status', 'QUEUED')
      .order('queued_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch queued adbots: ${fetchError.message}`);
    }

    if (!queuedAdbots || queuedAdbots.length === 0) {
      return { resolved: 0, stillQueued: 0, errors: [] };
    }

    console.log(`Found ${queuedAdbots.length} queued adbots to process`);

    // Process each queued adbot
    for (const adbot of queuedAdbots) {
      try {
        const requiredSessions = adbot.required_sessions || adbot.sessions_assigned || 0;
        const currentAssigned = adbot.sessions_assigned || 0;
        const missingCount = adbot.missing_sessions_count || (requiredSessions - currentAssigned);

        if (missingCount <= 0) {
          // Already has enough sessions - resolve
          await resolveAdbot(adbot.id, currentAssigned);
          resolved++;
          continue;
        }

        // Check if enough unused sessions are available
        const { data: unusedSessions } = await supabaseAdmin
          .from('sessions')
          .select('id')
          .eq('status', 'UNUSED')
          .limit(missingCount);

        const availableCount = unusedSessions?.length || 0;

        if (availableCount >= missingCount) {
          // Enough sessions available - assign them
          const assignedCount = await assignMissingSessions(adbot.id, adbot.user_id, missingCount);
          
          if (assignedCount >= missingCount) {
            // All sessions assigned - resolve
            await resolveAdbot(adbot.id, currentAssigned + assignedCount);
            resolved++;
          } else {
            // Partial assignment - update missing count
            const newMissing = missingCount - assignedCount;
            await supabaseAdmin
              .from('adbots')
              .update({
                missing_sessions_count: newMissing,
                sessions_assigned: currentAssigned + assignedCount,
              })
              .eq('id', adbot.id);
            
            stillQueued++;
          }
        } else {
          // Still not enough sessions
          stillQueued++;
        }
      } catch (adbotError) {
        const errorMsg = `Failed to process queued adbot ${adbot.id}: ${adbotError instanceof Error ? adbotError.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
        stillQueued++;
      }
    }

    console.log(`Queue resolution complete: ${resolved} resolved, ${stillQueued} still queued, ${errors.length} errors`);

    return { resolved, stillQueued, errors };
  } catch (error) {
    const errorMsg = `Queue resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(errorMsg);
    return { resolved: 0, stillQueued: 0, errors: [errorMsg] };
  }
}

/**
 * Assign missing sessions to a queued adbot
 */
async function assignMissingSessions(adbotId: string, userId: string, count: number): Promise<number> {
  let assignedCount = 0;

  try {
    const unusedSessions = await listUnusedSessions(count);

    for (let i = 0; i < Math.min(unusedSessions.length, count); i++) {
      try {
        // Try normal assignment first
        await assignSessionToAdbot(unusedSessions[i].id, adbotId);
        assignedCount++;
      } catch (assignError) {
        // If normal assignment fails, try direct database update (admin bypass)
        try {
          const { error: directError } = await supabaseAdmin
            .from('sessions')
            .update({
              status: 'ASSIGNED',
              assigned_to_adbot_id: adbotId,
              assigned_to_user_id: userId,
              assigned_at: new Date().toISOString(),
            })
            .eq('id', unusedSessions[i].id);

          if (!directError) {
            assignedCount++;
          }
        } catch (directError) {
          console.error(`Failed to assign session ${unusedSessions[i].id}:`, directError);
        }
      }
    }
  } catch (error) {
    console.error(`Error assigning missing sessions to adbot ${adbotId}:`, error);
  }

  return assignedCount;
}

/**
 * Resolve a queued adbot (change status to STOPPED, clear queue fields)
 */
async function resolveAdbot(adbotId: string, finalSessionCount: number): Promise<void> {
  try {
    // Get adbot details for notification
    const { data: adbot } = await supabaseAdmin
      .from('adbots')
      .select('user_id, order_id, creation_source, product_id')
      .eq('id', adbotId)
      .single();

    // Update adbot status
    const { error: updateError } = await supabaseAdmin
      .from('adbots')
      .update({
        status: 'STOPPED',
        sessions_assigned: finalSessionCount,
        missing_sessions_count: 0,
        queued_reason: null,
        queued_at: null,
      })
      .eq('id', adbotId);

    if (updateError) {
      throw updateError;
    }

    console.log(`Resolved queued adbot ${adbotId}: ${finalSessionCount} sessions assigned`);

    // Notify admin
    await createNotification({
      type: 'SUCCESS',
      title: '✅ Queue Item Resolved',
      message: `Adbot ${adbotId} has been resolved. ${finalSessionCount} sessions assigned. Status changed to STOPPED.`,
    });

    // Log activity
    if (adbot) {
      await logActivity({
        user_id: adbot.user_id,
        action: 'QUEUE_RESOLVED',
        entity_type: 'adbot',
        entity_id: adbotId,
        details: {
          sessions_assigned: finalSessionCount,
          creation_source: adbot.creation_source,
        },
      });
    }
  } catch (error) {
    console.error(`Error resolving adbot ${adbotId}:`, error);
    throw error;
  }
}

/**
 * Get queue statistics for admin dashboard
 */
export async function getQueueStats(): Promise<{
  totalQueued: number;
  totalMissingSessions: number;
  oldestQueued: string | null;
  queuedBySource: { USER_PAYMENT: number; ADMIN_MANUAL: number };
}> {
  try {
    const { data: queuedAdbots } = await supabaseAdmin
      .from('adbots')
      .select('id, queued_at, missing_sessions_count, creation_source')
      .eq('status', 'QUEUED')
      .order('queued_at', { ascending: true });

    if (!queuedAdbots || queuedAdbots.length === 0) {
      return {
        totalQueued: 0,
        totalMissingSessions: 0,
        oldestQueued: null,
        queuedBySource: { USER_PAYMENT: 0, ADMIN_MANUAL: 0 },
      };
    }

    const totalMissingSessions = queuedAdbots.reduce(
      (sum, adbot) => sum + (adbot.missing_sessions_count || 0),
      0
    );

    const queuedBySource = {
      USER_PAYMENT: queuedAdbots.filter(a => a.creation_source === 'USER_PAYMENT').length,
      ADMIN_MANUAL: queuedAdbots.filter(a => a.creation_source === 'ADMIN_MANUAL').length,
    };

    const oldestQueued = queuedAdbots[0]?.queued_at || null;

    return {
      totalQueued: queuedAdbots.length,
      totalMissingSessions,
      oldestQueued,
      queuedBySource,
    };
  } catch (error) {
    console.error('Error getting queue stats:', error);
    return {
      totalQueued: 0,
      totalMissingSessions: 0,
      oldestQueued: null,
      queuedBySource: { USER_PAYMENT: 0, ADMIN_MANUAL: 0 },
    };
  }
}

