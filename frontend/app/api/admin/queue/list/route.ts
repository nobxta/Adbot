import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/queue/list
 * Get all queued adbots for admin dashboard popup
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    // Fetch all QUEUED adbots ordered by queued_at (oldest first)
    const { data: queuedAdbots, error } = await supabaseAdmin
      .from('adbots')
      .select(`
        id,
        user_id,
        order_id,
        product_id,
        status,
        required_sessions,
        missing_sessions_count,
        sessions_assigned,
        queued_at,
        queued_reason,
        creation_source,
        execution_mode,
        posting_interval_minutes,
        valid_until,
        order:orders!adbots_order_id_fkey (
          id,
          total_amount,
          status,
          created_at
        ),
        product:products!adbots_product_id_fkey (
          id,
          name,
          plan_type,
          sessions_count
        ),
        user:users!adbots_user_id_fkey (
          id,
          email,
          access_code
        )
      `)
      .eq('status', 'QUEUED')
      .order('queued_at', { ascending: true });

    if (error) {
      throw error;
    }

    // Format response
    const formatted = (queuedAdbots || []).map(adbot => ({
      id: adbot.id,
      user_id: adbot.user_id,
      order_id: adbot.order_id,
      product_id: adbot.product_id,
      status: adbot.status,
      required_sessions: adbot.required_sessions || 0,
      missing_sessions_count: adbot.missing_sessions_count || 0,
      sessions_assigned: adbot.sessions_assigned || 0,
      queued_at: adbot.queued_at,
      queued_reason: adbot.queued_reason,
      creation_source: adbot.creation_source,
      execution_mode: adbot.execution_mode,
      posting_interval_minutes: adbot.posting_interval_minutes,
      valid_until: adbot.valid_until,
      order: Array.isArray(adbot.order) ? adbot.order[0] : adbot.order,
      product: Array.isArray(adbot.product) ? adbot.product[0] : adbot.product,
      user: Array.isArray(adbot.user) ? adbot.user[0] : adbot.user,
    }));

    return NextResponse.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error('Error fetching queued adbots:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

