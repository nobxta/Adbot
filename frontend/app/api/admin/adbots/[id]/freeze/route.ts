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

    // Update adbot: Set frozen state and stop it
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
    
    // Update adbot: Set frozen state, status to FROZEN, and stop it
    const { data, error } = await supabaseAdmin
      .from('adbots')
      .update({ 
        status: 'FROZEN',
        frozen_state: true,
        frozen_at: new Date().toISOString(),
        frozen_reason: reason || 'Frozen by admin'
      })
      .eq('id', adbotId)
      .select()
      .single();
    
    // Also update bot table if linked
    if (adbot?.bot_id) {
      await supabaseAdmin
        .from('bots')
        .update({
          frozen_state: true,
          frozen_at: new Date().toISOString(),
          frozen_reason: reason || 'Frozen by admin',
          plan_status: 'suspended' // Suspend plan when frozen
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
        action: 'freeze',
        reason: reason || 'Frozen by admin',
        frozen_state: true, // Track that this is a frozen state, not just stopped
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot frozen successfully',
      data,
    });
  } catch (error) {
    console.error('Error freezing adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

