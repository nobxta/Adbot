import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, hasRole, generateToken } from '@/lib/auth';
import { getAdbotById, updateAdbotStatus, logActivity } from '@/lib/queries';
import { startAdbot, registerUserInBackend, syncExecutionMode } from '@/lib/python-backend';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { id: adbotId } = await params;

    if (!user.userId) {
      return NextResponse.json(
        { error: 'User ID not found' },
        { status: 400 }
      );
    }

    // Get adbot with all status fields including subscription status (use admin client to ensure we get all fields)
    const { data: adbot, error: adbotError } = await supabaseAdmin
      .from('adbots')
      .select('*, subscription_status, expires_at, grace_expires_at, deleted_state')
      .eq('id', adbotId)
      .single();

    if (adbotError || !adbot) {
      return NextResponse.json(
        { error: 'Adbot not found' },
        { status: 404 }
      );
    }

    // Check ownership (users can only start their own adbots, admins can start any)
    if (!hasRole(user.role, ['ADMIN']) && adbot.user_id !== user.userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // STATUS ENFORCEMENT: Check if adbot can be started
    // Check if queued (CRITICAL: Must check before other status checks)
    if (adbot.status === 'QUEUED') {
      const missingInfo = adbot.missing_sessions_count 
        ? ` Missing ${adbot.missing_sessions_count} sessions.`
        : '';
      const reasonInfo = adbot.queued_reason 
        ? ` Reason: ${adbot.queued_reason}`
        : '';
      return NextResponse.json(
        { 
          error: `Bot is queued. Waiting for sessions/API pairs.${missingInfo}${reasonInfo}`,
          status: 'QUEUED',
          missing_sessions_count: adbot.missing_sessions_count || 0,
          queued_reason: adbot.queued_reason || 'Unknown',
        },
        { status: 403 }
      );
    }
    
    // Check if deleted
    if (adbot.deleted_state === true) {
      return NextResponse.json(
        { error: 'This adbot has been deleted and cannot be started' },
        { status: 403 }
      );
    }
    
    // Check if frozen
    if (adbot.frozen_state === true) {
      return NextResponse.json(
        { 
          error: `This adbot is frozen and cannot be started. Reason: ${adbot.frozen_reason || 'Frozen by admin'}`,
          reason: adbot.frozen_reason || 'Frozen by admin'
        },
        { status: 403 }
      );
    }
    
    // Check if suspended
    if (adbot.suspended_at) {
      return NextResponse.json(
        { 
          error: `This adbot is suspended and cannot be started. Reason: ${adbot.suspend_reason || 'Suspended by admin'}`,
          reason: adbot.suspend_reason || 'Suspended by admin'
        },
        { status: 403 }
      );
    }
    
    // CRITICAL: Check subscription status (replaces old valid_until check)
    const subscriptionStatus = adbot.subscription_status || 'ACTIVE';
    if (subscriptionStatus !== 'ACTIVE') {
      if (subscriptionStatus === 'DELETED') {
        return NextResponse.json(
          { 
            error: 'Subscription expired and bot deleted. Renewal not possible.',
            subscription_status: 'DELETED',
          },
          { status: 403 }
        );
      }
      
      if (subscriptionStatus === 'EXPIRED') {
        const now = new Date();
        const graceExpiresAt = adbot.grace_expires_at ? new Date(adbot.grace_expires_at) : null;
        
        // Check if still in grace period
        if (!graceExpiresAt || now > graceExpiresAt) {
          return NextResponse.json(
            { 
              error: 'Subscription expired and bot deleted. Renewal not possible.',
              subscription_status: 'DELETED',
            },
            { status: 403 }
          );
        }
        
        // Still in grace period - allow access but show error
        return NextResponse.json(
          { 
            error: 'Subscription expired. Renew to continue.',
            subscription_status: 'EXPIRED',
            grace_expires_at: adbot.grace_expires_at,
          },
          { status: 403 }
        );
      }
    }

    // RUNTIME SAFETY GUARDS - Fail hard if any required data is missing
    
    // Guard 1: order_id MUST exist (except for manual admin-created adbots)
    if (!adbot.order_id) {
      console.error('CRITICAL: Adbot missing order_id:', adbotId);
      return NextResponse.json(
        { error: 'Adbot missing required order_id. Cannot start bot without order reference.' },
        { status: 400 }
      );
    }

    // Guard 2: execution_mode MUST exist and be valid
    if (!adbot.execution_mode || !['starter', 'enterprise'].includes(adbot.execution_mode)) {
      console.error('CRITICAL: Adbot missing or invalid execution_mode:', {
        adbotId,
        execution_mode: adbot.execution_mode,
        reason: 'execution_mode must be set during adbot creation from product.plan_type'
      });
      return NextResponse.json(
        { error: `Adbot missing required execution_mode. Current value: ${adbot.execution_mode || 'undefined'}. Must be 'starter' or 'enterprise'.` },
        { status: 400 }
      );
    }

    // Guard 3: Sessions MUST be assigned
    const { data: sessions } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('assigned_to_adbot_id', adbotId)
      .eq('status', 'ASSIGNED');

    if (!sessions || sessions.length === 0) {
      console.error('CRITICAL: No sessions assigned to adbot:', adbotId);
      return NextResponse.json(
        { error: 'No sessions assigned to this adbot. Cannot start bot without assigned sessions.' },
        { status: 400 }
      );
    }

    // Guard 4: Group file MUST exist for the plan type
    // This is checked in Python backend, but we log it here for visibility
    const planType = adbot.execution_mode === 'starter' ? 'STARTER' : 'ENTERPRISE';
    console.log('Starting adbot with execution_mode:', {
      adbotId,
      execution_mode: adbot.execution_mode,
      planType,
      sessions_count: sessions.length,
      order_id: adbot.order_id,
    });

    // Generate a token for the Python backend
    // Use the adbot's user_id (not the current user's) so the backend knows which user's bot to start
    // CRITICAL: Include plan_type in plan_limits so Python backend can validate execution_mode
    const backendToken = await generateToken({
      userId: adbot.user_id,
      role: 'USER',
      plan_status: 'active', // The adbot passed all checks, so plan is active
      plan_limits: {
        max_sessions: sessions.length,
        plan_type: planType, // CRITICAL: Pass plan_type for Python backend validation
      },
    });

    // First, register user in Python backend (idempotent - safe to call multiple times)
    const registerResult = await registerUserInBackend(backendToken, 'active', {
      max_sessions: sessions.length,
      plan_type: planType, // Pass plan_type for validation
    });

    if (!registerResult.success) {
      console.error('Failed to register user in backend:', registerResult.error);
      // Don't fail here - the user might already be registered
    }

    // CRITICAL: Sync execution_mode from adbot to Python backend user_data
    // This ensures Python backend has execution_mode before starting bot
    try {
      const syncResult = await syncExecutionMode(adbot.user_id, adbot.execution_mode, backendToken);
      if (!syncResult.success) {
        console.error('CRITICAL: Failed to sync execution_mode to Python backend:', syncResult.error);
        // Fail hard - execution_mode is required
        return NextResponse.json(
          { error: `Failed to sync execution_mode to Python backend: ${syncResult.error}` },
          { status: 500 }
        );
      }
      console.log('Synced execution_mode to Python backend:', {
        user_id: adbot.user_id,
        execution_mode: adbot.execution_mode,
      });
    } catch (syncError) {
      console.error('CRITICAL: Error syncing execution_mode:', syncError);
      return NextResponse.json(
        { error: `Failed to sync execution_mode: ${syncError instanceof Error ? syncError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Start adbot on Python backend
    const result = await startAdbot({
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

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to start adbot' },
        { status: 500 }
      );
    }

    // Update adbot status
    await updateAdbotStatus(adbotId, 'ACTIVE');

    // Log activity
    await logActivity({
      user_id: user.userId,
      action: 'START',
      entity_type: 'adbot',
      entity_id: adbotId,
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot started successfully',
    });
  } catch (error) {
    console.error('Error starting adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


