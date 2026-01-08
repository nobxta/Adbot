import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/queries';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id: adbotId } = await params;

    // Get adbot to check bot_id
    const { data: adbot } = await supabaseAdmin
      .from('adbots')
      .select('bot_id')
      .eq('id', adbotId)
      .single();
    
    // Update adbot: Remove suspended state, set status to STOPPED
    const { data, error } = await supabaseAdmin
      .from('adbots')
      .update({ 
        status: 'STOPPED',
        suspended_at: null,
        suspend_reason: null
      })
      .eq('id', adbotId)
      .select()
      .single();
    
    // Also update bot table if linked
    if (adbot?.bot_id) {
      await supabaseAdmin
        .from('bots')
        .update({
          suspended_at: null,
          suspend_reason: null,
          plan_status: 'active' // Restore plan status
        })
        .eq('id', adbot.bot_id);
    }

    if (error) throw error;

    // Log activity
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'UPDATE',
      entity_type: 'adbot',
      entity_id: adbotId,
      details: {
        action: 'resume',
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot resumed successfully',
      data,
    });
  } catch (error) {
    console.error('Error resuming adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}
