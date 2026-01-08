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

    // Get deleted adbot
    const { data: adbot, error: fetchError } = await supabaseAdmin
      .from('adbots')
      .select('deleted_state, deletion_scheduled_at')
      .eq('id', adbotId)
      .single();

    if (fetchError || !adbot) {
      return NextResponse.json(
        { error: 'Adbot not found' },
        { status: 404 }
      );
    }

    if (!adbot.deleted_state) {
      return NextResponse.json(
        { error: 'Adbot is not deleted' },
        { status: 400 }
      );
    }

    // Check if still within recovery window
    if (adbot.deletion_scheduled_at) {
      const deletionDate = new Date(adbot.deletion_scheduled_at);
      if (deletionDate < new Date()) {
        return NextResponse.json(
          { error: 'Recovery window has expired. This adbot cannot be recovered.' },
          { status: 400 }
        );
      }
    }

    // Recover adbot: Remove deleted state, restore to STOPPED
    const { data, error } = await supabaseAdmin
      .from('adbots')
      .update({
        status: 'STOPPED',
        deleted_state: false,
        deleted_at: null,
        deletion_scheduled_at: null,
        deleted_by_admin_id: null,
        delete_reason: null,
      })
      .eq('id', adbotId)
      .select()
      .single();

    if (error) throw error;

    // Log recovery action
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'UPDATE',
      entity_type: 'adbot',
      entity_id: adbotId,
      details: {
        action: 'recover',
        recovered_from_deleted: true,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot recovered successfully',
      data,
    });
  } catch (error) {
    console.error('Error recovering adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


