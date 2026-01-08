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

    // Get adbot details for logging and operations
    const { data: adbot, error: fetchError } = await supabaseAdmin
      .from('adbots')
      .select('id, user_id, bot_id, product_id, status')
      .eq('id', adbotId)
      .single();

    if (fetchError || !adbot) {
      return NextResponse.json(
        { error: 'Adbot not found' },
        { status: 404 }
      );
    }

    // Unassign all sessions first (CRITICAL: Update both filesystem and database)
    const { revokeAdbotSessions } = await import('@/lib/session-reconciliation');
    const authHeader = request.headers.get('Authorization') || '';
    const adminToken = authHeader.replace('Bearer ', '');
    
    const revocationResult = await revokeAdbotSessions(adbotId, adminToken);
    if (revocationResult.errors.length > 0) {
      console.warn('Some sessions failed to revoke:', revocationResult.errors);
      // Continue with deletion even if some revocations failed
    }
    console.log(`Revoked ${revocationResult.revoked} sessions from adbot ${adbotId}`);
    
    // Stop the bot first if it's running
    if (adbot?.status === 'ACTIVE' || adbot?.status === 'RUNNING') {
      try {
        const { stopAdbot } = await import('@/lib/python-backend');
        await stopAdbot(adbotId);
      } catch (error) {
        console.warn('Failed to stop bot on backend:', error);
      }
    }
    
    // Soft delete: Mark as deleted with 10-day recovery window
    const deletion_date = new Date();
    deletion_date.setDate(deletion_date.getDate() + 10); // 10 days from now
    
    const { error: deleteError } = await supabaseAdmin
      .from('adbots')
      .update({
        status: 'DELETED',
        deleted_state: true,
        deleted_at: new Date().toISOString(),
        deletion_scheduled_at: deletion_date.toISOString(),
        deleted_by_admin_id: admin.userId || admin.botId,
        delete_reason: 'Deleted by admin'
      })
      .eq('id', adbotId);

    if (deleteError) throw deleteError;
    
    // Move to deleted table or keep in adbots with DELETED status
    // The actual deletion will be handled by a scheduled job

    // Optionally delete associated bot (if no other adbots use it)
    if (adbot.bot_id) {
      const { data: otherAdbots } = await supabaseAdmin
        .from('adbots')
        .select('id')
        .eq('bot_id', adbot.bot_id)
        .neq('id', adbotId)
        .limit(1);

      if (!otherAdbots || otherAdbots.length === 0) {
        // No other adbots use this bot, safe to delete
        await supabaseAdmin
          .from('bots')
          .delete()
          .eq('id', adbot.bot_id);
      }
    }

    // Log activity with deletion info
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'DELETE',
      entity_type: 'adbot',
      entity_id: adbotId,
      details: {
        action: 'delete_adbot',
        user_id: adbot.user_id,
        bot_id: adbot.bot_id,
        product_id: adbot.product_id,
        status: adbot.status,
        deleted_state: true, // Track that this is a deleted state
        deleted_at: new Date().toISOString(),
        deletion_scheduled_at: deletion_date.toISOString(),
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


