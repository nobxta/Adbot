import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/analytics/subscriptions
 * Read-only subscription analytics
 * Returns subscription counts and metrics
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    const now = new Date();
    const hours48 = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const hours24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const days7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Active subscriptions
    const { count: activeCount } = await supabaseAdmin
      .from('adbots')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'ACTIVE')
      .eq('deleted_state', false);

    // Expiring in 48 hours
    const { count: expiring48Count } = await supabaseAdmin
      .from('adbots')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'ACTIVE')
      .eq('deleted_state', false)
      .gte('expires_at', now.toISOString())
      .lte('expires_at', hours48.toISOString());

    // Expiring in 24 hours
    const { count: expiring24Count } = await supabaseAdmin
      .from('adbots')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'ACTIVE')
      .eq('deleted_state', false)
      .gte('expires_at', now.toISOString())
      .lte('expires_at', hours24.toISOString());

    // Currently in grace period
    const { count: inGraceCount } = await supabaseAdmin
      .from('adbots')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'EXPIRED')
      .eq('deleted_state', false)
      .gte('grace_expires_at', now.toISOString());

    // Deleted in last 7 days
    const { count: deleted7DaysCount } = await supabaseAdmin
      .from('adbots')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'DELETED')
      .gte('deleted_at', days7Ago.toISOString());

    // Deleted in last 30 days
    const { count: deleted30DaysCount } = await supabaseAdmin
      .from('adbots')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'DELETED')
      .gte('deleted_at', days30Ago.toISOString());

    // Expired (not yet deleted)
    const { count: expiredCount } = await supabaseAdmin
      .from('adbots')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'EXPIRED')
      .eq('deleted_state', false);

    return NextResponse.json({
      success: true,
      analytics: {
        active_subscriptions: activeCount || 0,
        expiring: {
          in_48_hours: expiring48Count || 0,
          in_24_hours: expiring24Count || 0,
        },
        in_grace_period: inGraceCount || 0,
        expired_not_deleted: expiredCount || 0,
        deleted: {
          last_7_days: deleted7DaysCount || 0,
          last_30_days: deleted30DaysCount || 0,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching subscription analytics:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

