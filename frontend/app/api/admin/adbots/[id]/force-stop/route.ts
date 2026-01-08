import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/queries';
import { stopAdbot } from '@/lib/python-backend';

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

    // Get current adbot status
    const { data: adbot } = await supabaseAdmin
      .from('adbots')
      .select('status')
      .eq('id', adbotId)
      .single();

    if (!adbot) {
      return NextResponse.json(
        { error: 'Adbot not found' },
        { status: 404 }
      );
    }

    // Stop adbot on Python backend
    const result = await stopAdbot(adbotId);

    if (!result.success) {
      console.warn('Backend stop failed, continuing with database update:', result.error);
    }

    // Update adbot status to STOPPED (admin override)
    const { data, error } = await supabaseAdmin
      .from('adbots')
      .update({ 
        status: 'STOPPED',
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
        action: 'force_stop',
        admin_override: true,
        previous_status: adbot.status,
        new_status: 'STOPPED',
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot force stopped successfully',
      data,
    });
  } catch (error) {
    console.error('Error force stopping adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


