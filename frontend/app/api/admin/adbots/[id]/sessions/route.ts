import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// GET /api/admin/adbots/[id]/sessions - Get current sessions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['ADMIN']);

    const { id: adbotId } = await params;

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, phone_number, status, assigned_at, banned_at, banned_reason, session_file_path')
      .eq('assigned_to_adbot_id', adbotId)
      .order('assigned_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: sessions || [],
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

// POST /api/admin/adbots/[id]/sessions/reassign - Reassign sessions
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['ADMIN']);

    const { id: adbotId } = await params;
    const body = await request.json();
    const { session_count, action, selected_session_ids } = body; // action: 'add' or 'replace'

    if (!session_count || session_count < 1) {
      return NextResponse.json(
        { error: 'Session count must be at least 1' },
        { status: 400 }
      );
    }

    // Get current assigned sessions
    const { data: currentSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('assigned_to_adbot_id', adbotId)
      .eq('status', 'ASSIGNED');

    // If action is 'replace', unassign current sessions
    if (action === 'replace' && currentSessions && currentSessions.length > 0) {
      // If specific sessions are selected, only unassign those
      const sessionsToUnassign = selected_session_ids && Array.isArray(selected_session_ids) && selected_session_ids.length > 0
        ? currentSessions.filter(s => selected_session_ids.includes(s.id))
        : currentSessions;

      if (sessionsToUnassign.length > 0) {
        const { error: unassignError } = await supabase
          .from('sessions')
          .update({ 
            assigned_to_adbot_id: null,
            status: 'UNUSED',
            assigned_at: null,
          })
          .in('id', sessionsToUnassign.map(s => s.id));

        if (unassignError) throw unassignError;
      }
    }

    // Get unused sessions
    const { data: unusedSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('status', 'UNUSED')
      .limit(session_count);

    if (!unusedSessions || unusedSessions.length < session_count) {
      return NextResponse.json(
        { error: `Not enough unused sessions available. Requested: ${session_count}, Available: ${unusedSessions?.length || 0}` },
        { status: 400 }
      );
    }

    // Assign new sessions
    const assignedSessions = [];
    for (const session of unusedSessions) {
      const { error: assignError } = await supabase
        .from('sessions')
        .update({
          assigned_to_adbot_id: adbotId,
          status: 'ASSIGNED',
          assigned_at: new Date().toISOString(),
        })
        .eq('id', session.id);

      if (assignError) {
        console.error(`Error assigning session ${session.id}:`, assignError);
      } else {
        assignedSessions.push(session.id);
      }
    }

    // Update adbot sessions_assigned count
    const { data: adbot } = await supabase
      .from('adbots')
      .select('sessions_assigned, status, required_sessions, missing_sessions_count')
      .eq('id', adbotId)
      .single();

    const newCount = action === 'replace' 
      ? assignedSessions.length 
      : (adbot?.sessions_assigned || 0) + assignedSessions.length;

    // Check if adbot was QUEUED and should be resolved
    const wasQueued = adbot?.status === 'QUEUED';
    const requiredSessions = adbot?.required_sessions || newCount;
    const missingCount = Math.max(0, requiredSessions - newCount);
    const shouldResolve = wasQueued && missingCount === 0;

    // Update adbot
    await supabase
      .from('adbots')
      .update({
        sessions_assigned: newCount,
        missing_sessions_count: missingCount,
        status: shouldResolve ? 'STOPPED' : adbot?.status,
        queued_reason: shouldResolve ? null : adbot?.queued_reason,
        queued_at: shouldResolve ? null : adbot?.queued_at,
      })
      .eq('id', adbotId);

    // If adbot was resolved, trigger queue resolution for other queued adbots
    if (shouldResolve) {
      try {
        const { resolveQueuedAdbots } = await import('@/lib/queue-resolution');
        // Run in background (don't wait)
        resolveQueuedAdbots().catch(err => {
          console.error('Background queue resolution failed:', err);
        });
      } catch (importError) {
        console.error('Failed to import queue resolution:', importError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully ${action === 'replace' ? 'reassigned' : 'assigned'} ${assignedSessions.length} sessions${shouldResolve ? '. Adbot resolved from queue.' : ''}`,
      data: {
        assigned_count: assignedSessions.length,
        total_sessions: newCount,
        was_queued: wasQueued,
        resolved: shouldResolve,
        missing_sessions_count: missingCount,
      },
    });
  } catch (error) {
    console.error('Error reassigning sessions:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

