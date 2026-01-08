import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/queries';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id: adbotId } = await params;

    // Get adbot details for logging
    const { data: adbot } = await supabaseAdmin
      .from('adbots')
      .select('id, user_id, bot_id, product_id, status, deleted_state, deletion_scheduled_at')
      .eq('id', adbotId)
      .single();

    if (!adbot) {
      return NextResponse.json(
        { error: 'Adbot not found' },
        { status: 404 }
      );
    }

    // Only allow permanent delete if already soft-deleted
    if (!adbot.deleted_state) {
      return NextResponse.json(
        { error: 'Adbot must be soft-deleted first before permanent deletion' },
        { status: 400 }
      );
    }

    // Unassign all sessions first
    await supabaseAdmin
      .from('sessions')
      .update({
        assigned_to_adbot_id: null,
        assigned_to_bot_id: null,
        status: 'UNUSED',
        assigned_at: null,
      })
      .eq('assigned_to_adbot_id', adbotId);

    // Log before deletion (for audit trail)
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'DELETE',
      entity_type: 'adbot',
      entity_id: adbotId,
      details: {
        action: 'permanent_delete',
        user_id: adbot.user_id,
        bot_id: adbot.bot_id,
        product_id: adbot.product_id,
        status: adbot.status,
        was_soft_deleted: true,
        timestamp: new Date().toISOString(),
      },
    });

    // Hard delete the adbot
    const { error: deleteError } = await supabaseAdmin
      .from('adbots')
      .delete()
      .eq('id', adbotId);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      success: true,
      message: 'Adbot permanently deleted',
    });
  } catch (error) {
    console.error('Error permanently deleting adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


