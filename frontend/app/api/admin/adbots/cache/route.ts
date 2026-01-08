import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/admin/adbots/cache - List deleted adbots (admin cache)
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '10');

    // Get deleted adbots within recovery window
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data: deletedAdbots, error } = await supabaseAdmin
      .from('adbots')
      .select(`
        *,
        product:products(id, name, plan_type, price),
        user:users(id, email),
        bot:bots(id, bot_id, access_code),
        deleted_by:admins!deleted_by_admin_id(id, user_id)
      `)
      .eq('deleted_state', true)
      .gte('deleted_at', cutoffDate.toISOString())
      .order('deleted_at', { ascending: false });

    if (error) throw error;

    // Calculate days until permanent deletion
    const adbotsWithCountdown = deletedAdbots?.map((adbot: any) => {
      const deletionDate = adbot.deletion_scheduled_at 
        ? new Date(adbot.deletion_scheduled_at)
        : null;
      const daysUntilDeletion = deletionDate
        ? Math.max(0, Math.ceil((deletionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null;

      return {
        ...adbot,
        days_until_permanent_deletion: daysUntilDeletion,
        can_recover: daysUntilDeletion !== null && daysUntilDeletion > 0,
      };
    }) || [];

    return NextResponse.json({
      success: true,
      data: adbotsWithCountdown,
      count: adbotsWithCountdown.length,
    });
  } catch (error) {
    console.error('Error fetching deleted adbots:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


