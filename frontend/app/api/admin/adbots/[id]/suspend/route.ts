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
    const body = await request.json();
    const { reason } = body;

    // Get adbot to check current status and bot_id
    const { data: adbot } = await supabaseAdmin
      .from('adbots')
      .select('status, bot_id')
      .eq('id', adbotId)
      .single();
    
    // Stop the bot first if it's running
    if (adbot?.status === 'ACTIVE' || adbot?.status === 'RUNNING') {
      try {
        const { stopAdbot } = await import('@/lib/python-backend');
        await stopAdbot(adbotId);
      } catch (error) {
        console.warn('Failed to stop bot on backend:', error);
      }
    }
    
    // Update adbot: Set suspended state
    const { data, error } = await supabaseAdmin
      .from('adbots')
      .update({ 
        status: 'SUSPENDED',
        suspended_at: new Date().toISOString(),
        suspend_reason: reason || 'Suspended by admin'
      })
      .eq('id', adbotId)
      .select()
      .single();
    
    // Also update bot table if linked
    if (adbot?.bot_id) {
      await supabaseAdmin
        .from('bots')
        .update({
          suspended_at: new Date().toISOString(),
          suspend_reason: reason || 'Suspended by admin',
          plan_status: 'suspended'
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
        action: 'suspend',
        old_status: 'ACTIVE',
        new_status: 'SUSPENDED',
        reason: reason || 'Suspended by admin',
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot suspended successfully',
      data,
    });
  } catch (error) {
    console.error('Error suspending adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


