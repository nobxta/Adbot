import { NextRequest, NextResponse } from 'next/server';
import { requireRole, generateToken } from '@/lib/auth';
import { getAdbotById, logActivity } from '@/lib/queries';
import { startAdbot, stopAdbot, registerUserInBackend, syncExecutionMode } from '@/lib/python-backend';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id: adbotId } = await params;

    // Get adbot with all required data
    const { data: adbot, error: adbotError } = await supabaseAdmin
      .from('adbots')
      .select('*, subscription_status, expires_at, grace_expires_at, deleted_state, execution_mode')
      .eq('id', adbotId)
      .single();

    if (adbotError || !adbot) {
      return NextResponse.json(
        { error: 'Adbot not found' },
        { status: 404 }
      );
    }

    // Get sessions
    const { data: sessions } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('assigned_to_adbot_id', adbotId)
      .eq('status', 'ASSIGNED');

    if (!sessions || sessions.length === 0) {
      return NextResponse.json(
        { error: 'No sessions assigned to this adbot' },
        { status: 400 }
      );
    }

    // Stop the adbot first
    const stopResult = await stopAdbot(adbotId);
    if (!stopResult.success) {
      throw new Error(stopResult.error || 'Failed to stop adbot');
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Prepare to start - generate token and sync execution mode
    const planType = adbot.execution_mode === 'starter' ? 'STARTER' : 'ENTERPRISE';
    const backendToken = await generateToken({
      userId: adbot.user_id,
      role: 'USER',
      plan_status: 'active',
      plan_limits: {
        max_sessions: sessions.length,
        plan_type: planType,
      },
    });

    await registerUserInBackend(backendToken, 'active', {
      max_sessions: sessions.length,
      plan_type: planType,
    });

    const syncResult = await syncExecutionMode(adbot.user_id, adbot.execution_mode, backendToken);
    if (!syncResult.success) {
      return NextResponse.json(
        { error: `Failed to sync execution_mode: ${syncResult.error}` },
        { status: 500 }
      );
    }

    // Start the adbot with full config
    const startResult = await startAdbot({
      adbot_id: adbotId,
      user_id: adbot.user_id,
      post_link: adbot.post_link,
      target_groups: adbot.target_groups,
      posting_interval_minutes: adbot.posting_interval_minutes,
      sessions: sessions.map(s => ({
        phone_number: s.phone_number,
        api_id: s.api_id,
        api_hash: s.api_hash,
        session_file_path: s.session_file_path,
      })),
    }, backendToken);
    if (!startResult.success) {
      throw new Error(startResult.error || 'Failed to start adbot');
    }

    // Log activity
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'UPDATE',
      entity_type: 'adbot',
      entity_id: adbotId,
      details: {
        action: 'restart',
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot restarted successfully',
    });
  } catch (error) {
    console.error('Error restarting adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


