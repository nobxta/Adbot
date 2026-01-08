import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/queries';
import { startAdbot } from '@/lib/python-backend';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id: adbotId } = await params;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Get adbot with all details
    const { data: adbot, error: fetchError } = await supabaseAdmin
      .from('adbots')
      .select(`
        *,
        product:products(id, name, plan_type),
        sessions:sessions!assigned_to_adbot_id(id, phone_number, api_id, api_hash, session_file_path, status)
      `)
      .eq('id', adbotId)
      .single();

    if (fetchError || !adbot) {
      return NextResponse.json(
        { error: 'Adbot not found' },
        { status: 404 }
      );
    }

    // ADMIN OVERRIDE: Force start even if frozen/suspended (but not deleted)
    if (adbot.deleted_state === true) {
      return NextResponse.json(
        { error: 'Cannot start deleted adbot' },
        { status: 400 }
      );
    }

    // Get assigned sessions
    const sessions = adbot.sessions?.filter((s: any) => s.status === 'ASSIGNED') || [];
    
    if (sessions.length === 0) {
      return NextResponse.json(
        { error: 'No sessions assigned to this adbot' },
        { status: 400 }
      );
    }

    // Start adbot on Python backend
    const result = await startAdbot({
      adbot_id: adbotId,
      user_id: adbot.user_id,
      post_link: adbot.post_link || '',
      target_groups: adbot.target_groups || [],
      posting_interval_minutes: adbot.posting_interval_minutes || 60,
      sessions: sessions.map((s: any) => ({
        phone_number: s.phone_number,
        api_id: s.api_id,
        api_hash: s.api_hash,
        session_file_path: s.session_file_path,
      })),
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to start adbot on backend' },
        { status: 500 }
      );
    }

    // Update adbot status to ACTIVE (admin override)
    const { data, error } = await supabaseAdmin
      .from('adbots')
      .update({ 
        status: 'ACTIVE',
        last_activity: new Date().toISOString()
      })
      .eq('id', adbotId)
      .select()
      .single();

    if (error) throw error;

    // Log admin action
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'UPDATE',
      entity_type: 'adbot',
      entity_id: adbotId,
      details: {
        action: 'force_start',
        admin_override: true,
        previous_status: adbot.status,
        new_status: 'ACTIVE',
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot force started successfully',
      data,
    });
  } catch (error) {
    console.error('Error force starting adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


