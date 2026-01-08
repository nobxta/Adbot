import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { listUnusedSessions, assignSessionToAdbot, logActivity, createNotification } from '@/lib/queries';

/**
 * POST /api/admin/queue/pass
 * Manual queue override - re-attempt session assignment for a queued adbot
 * This is EXPLICIT admin action, not automatic
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireRole(request, ['ADMIN']);

    const body = await request.json();
    const { adbot_id } = body;

    if (!adbot_id) {
      return NextResponse.json(
        { error: 'adbot_id is required' },
        { status: 400 }
      );
    }

    // CRITICAL: Race condition prevention
    // Fetch adbot and verify status atomically
    // Supabase doesn't support FOR UPDATE, so we use optimistic locking:
    // 1. Fetch with status check
    // 2. Update only if status is still QUEUED (atomic check)
    const { data: adbot, error: fetchError } = await supabaseAdmin
      .from('adbots')
      .select('*')
      .eq('id', adbot_id)
      .eq('status', 'QUEUED') // CRITICAL: Only process QUEUED adbots
      .single();

    if (fetchError || !adbot) {
      return NextResponse.json(
        { error: 'Adbot not found or not in QUEUED status. It may have been resolved by another admin.' },
        { status: 404 }
      );
    }

    // Double-check status (defense in depth)
    if (adbot.status !== 'QUEUED') {
      return NextResponse.json(
        { 
          error: `Adbot is no longer QUEUED. Current status: ${adbot.status}. It may have been resolved by another admin.`,
          current_status: adbot.status,
        },
        { status: 400 }
      );
    }

    const requiredSessions = adbot.required_sessions || adbot.sessions_assigned || 0;
    const currentAssigned = adbot.sessions_assigned || 0;
    const missingCount = adbot.missing_sessions_count || (requiredSessions - currentAssigned);

    if (missingCount <= 0) {
      // Already has enough sessions - resolve immediately
      const { error: resolveError } = await supabaseAdmin
        .from('adbots')
        .update({
          status: 'STOPPED',
          missing_sessions_count: 0,
          queued_reason: null,
          queued_at: null,
        })
        .eq('id', adbot_id);

      if (resolveError) {
        throw resolveError;
      }

      return NextResponse.json({
        success: true,
        message: 'Adbot resolved - already has sufficient sessions',
        data: {
          adbot_id,
          sessions_assigned: currentAssigned,
          required_sessions: requiredSessions,
        },
      });
    }

    // Re-check session availability (DO NOT reuse old assignment result)
    const unusedSessions = await listUnusedSessions(missingCount);
    const availableCount = unusedSessions?.length || 0;

    if (availableCount < missingCount) {
      // Still insufficient - update missing count and reason
      // CRITICAL: Only update if still QUEUED (prevents race condition)
      const newMissingCount = missingCount - availableCount;
      const { data: updatedAdbotInsufficient, error: updateError } = await supabaseAdmin
        .from('adbots')
        .update({
          missing_sessions_count: newMissingCount,
          queued_reason: `Still insufficient sessions. Required: ${requiredSessions}, Currently assigned: ${currentAssigned}, Available: ${availableCount}, Missing: ${newMissingCount}. Add more sessions and retry.`,
        })
        .eq('id', adbot_id)
        .eq('status', 'QUEUED') // CRITICAL: Only update if still QUEUED (atomic check)
        .select()
        .single();

      if (updateError || !updatedAdbotInsufficient) {
        // Row was updated by another process (race condition detected)
        return NextResponse.json({
          success: false,
          error: 'Adbot status changed during processing. Please refresh and try again.',
          data: {
            adbot_id,
            reason: 'concurrent_update',
          },
        }, { status: 409 }); // 409 Conflict
      }

      // Log the failed pass attempt
      await logActivity({
        admin_id: admin.userId || admin.botId,
        action: 'UPDATE',
        entity_type: 'adbot',
        entity_id: adbot_id,
        details: {
          action: 'queue_pass_failed',
          required_sessions: requiredSessions,
          current_assigned: currentAssigned,
          available_sessions: availableCount,
          missing_sessions: newMissingCount,
          reason: 'Still insufficient sessions',
        },
      });

      return NextResponse.json({
        success: false,
        error: `Still insufficient sessions. Required: ${requiredSessions}, Currently assigned: ${currentAssigned}, Available: ${availableCount}, Missing: ${newMissingCount}. Add more sessions and retry.`,
        data: {
          adbot_id,
          required_sessions: requiredSessions,
          current_assigned: currentAssigned,
          available_sessions: availableCount,
          missing_sessions: newMissingCount,
        },
      }, { status: 400 });
    }

    // Enough sessions available - assign them
    const assignedSessions = [];
    const sessionsToAssign = Math.min(availableCount, missingCount);

    // Get admin token for Python backend authentication
    const authHeader = request.headers.get('Authorization') || '';
    const adminToken = authHeader.replace('Bearer ', '');

    for (let i = 0; i < sessionsToAssign; i++) {
      if (!unusedSessions[i] || !unusedSessions[i].id) {
        continue;
      }

      try {
        const assigned = await assignSessionToAdbot(unusedSessions[i].id, adbot_id, adminToken);
        if (assigned) {
          assignedSessions.push(assigned);
        }
      } catch (assignError) {
        console.error(`Failed to assign session ${unusedSessions[i]?.id}:`, assignError);
        // Try direct database assignment as fallback
        if (supabaseAdmin) {
          try {
            const { error: directError } = await supabaseAdmin
              .from('sessions')
              .update({
                status: 'ASSIGNED',
                assigned_to_adbot_id: adbot_id,
                assigned_to_user_id: adbot.user_id,
                assigned_at: new Date().toISOString(),
              })
              .eq('id', unusedSessions[i].id);

            if (!directError) {
              assignedSessions.push({ id: unusedSessions[i].id });
            }
          } catch (directError) {
            console.error(`Direct assignment also failed:`, directError);
          }
        }
      }
    }

    const finalAssignedCount = currentAssigned + assignedSessions.length;
    const finalMissingCount = Math.max(0, requiredSessions - finalAssignedCount);

    if (finalMissingCount > 0) {
      // Partial assignment - update but keep QUEUED
      // CRITICAL: Only update if still QUEUED (prevents race condition)
      const { data: updatedAdbotPartial, error: updateErrorPartial } = await supabaseAdmin
        .from('adbots')
        .update({
          sessions_assigned: finalAssignedCount,
          missing_sessions_count: finalMissingCount,
          queued_reason: `Partial assignment. Required: ${requiredSessions}, Assigned: ${finalAssignedCount}, Missing: ${finalMissingCount}.`,
        })
        .eq('id', adbot_id)
        .eq('status', 'QUEUED') // CRITICAL: Only update if still QUEUED (atomic check)
        .select()
        .single();

      if (updateErrorPartial || !updatedAdbotPartial) {
        // Row was updated by another process (race condition detected)
        return NextResponse.json({
          success: false,
          error: 'Adbot status changed during processing. Please refresh and try again.',
          data: {
            adbot_id,
            reason: 'concurrent_update',
          },
        }, { status: 409 }); // 409 Conflict
      }

      await logActivity({
        admin_id: admin.userId || admin.botId,
        action: 'UPDATE',
        entity_type: 'adbot',
        entity_id: adbot_id,
        details: {
          action: 'queue_pass_partial',
          required_sessions: requiredSessions,
          assigned_sessions: finalAssignedCount,
          missing_sessions: finalMissingCount,
        },
      });

      return NextResponse.json({
        success: false,
        error: `Partial assignment completed. Required: ${requiredSessions}, Assigned: ${finalAssignedCount}, Missing: ${finalMissingCount}. Add more sessions and retry.`,
        data: {
          adbot_id,
          required_sessions: requiredSessions,
          assigned_sessions: finalAssignedCount,
          missing_sessions: finalMissingCount,
        },
      }, { status: 400 });
    }

    // All sessions assigned - resolve adbot
    // CRITICAL: Only update if still QUEUED (prevents race condition with concurrent Pass Queue clicks)
    const { data: updatedAdbot, error: resolveError } = await supabaseAdmin
      .from('adbots')
      .update({
        status: 'STOPPED',
        sessions_assigned: finalAssignedCount,
        missing_sessions_count: 0,
        queued_reason: null,
        queued_at: null,
      })
      .eq('id', adbot_id)
      .eq('status', 'QUEUED') // CRITICAL: Only update if still QUEUED (atomic check)
      .select()
      .single();

    if (resolveError || !updatedAdbot) {
      // Row was updated by another process (race condition detected)
      // This is safe - another admin or automatic resolution already handled it
      return NextResponse.json({
        success: false,
        error: 'Adbot was already resolved by another process. Please refresh the queue list.',
        data: {
          adbot_id,
          reason: 'concurrent_resolution',
        },
      }, { status: 409 }); // 409 Conflict
    }

    // Log successful resolution
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'UPDATE',
      entity_type: 'adbot',
      entity_id: adbot_id,
      details: {
        action: 'queue_pass_success',
        required_sessions: requiredSessions,
        assigned_sessions: finalAssignedCount,
        method: 'manual_pass',
      },
    });

    // Notify admin
    await createNotification({
      type: 'SUCCESS',
      title: '✅ Queue Item Resolved',
      message: `Adbot ${adbot_id} has been resolved via manual Pass Queue. ${finalAssignedCount} sessions assigned. Status changed to STOPPED.`,
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot resolved successfully',
      data: {
        adbot_id,
        required_sessions: requiredSessions,
        assigned_sessions: finalAssignedCount,
        status: 'STOPPED',
      },
    });
  } catch (error) {
    console.error('Error passing queue:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

