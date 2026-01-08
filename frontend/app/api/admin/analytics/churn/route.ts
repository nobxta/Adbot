import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/analytics/churn
 * Read-only churn metrics
 * Churn = subscription deleted without renewal
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    const now = new Date();
    const days7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get deleted subscriptions (churned)
    const { data: deletedAdbots, error: deletedError } = await supabaseAdmin
      .from('adbots')
      .select('id, user_id, deleted_at, created_at')
      .eq('subscription_status', 'DELETED')
      .gte('deleted_at', days30Ago.toISOString())
      .order('deleted_at', { ascending: false });

    if (deletedError) {
      throw deletedError;
    }

    // Calculate daily churn (last 7 days)
    const dailyChurn: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      dailyChurn[dateStr] = 0;
    }

    // Count churn per day
    for (const adbot of deletedAdbots || []) {
      if (adbot.deleted_at) {
        const deletedDate = new Date(adbot.deleted_at);
        const dateStr = deletedDate.toISOString().split('T')[0];
        if (dailyChurn[dateStr] !== undefined) {
          dailyChurn[dateStr]++;
        }
      }
    }

    // 7-day churn count
    const churn7Days = deletedAdbots?.filter(adbot => {
      if (!adbot.deleted_at) return false;
      const deletedDate = new Date(adbot.deleted_at);
      return deletedDate >= days7Ago;
    }).length || 0;

    // 30-day churn count
    const churn30Days = deletedAdbots?.length || 0;

    // Calculate renewal success rate
    // Get all expired subscriptions in last 30 days
    const { data: expiredAdbots, error: expiredError } = await supabaseAdmin
      .from('adbots')
      .select('id, user_id, expires_at')
      .eq('subscription_status', 'EXPIRED')
      .gte('expires_at', days30Ago.toISOString())
      .lte('expires_at', now.toISOString());

    if (expiredError) {
      throw expiredError;
    }

    // Check which expired subscriptions were renewed (have new adbot with same user/product)
    let renewedCount = 0;
    for (const expiredAdbot of expiredAdbots || []) {
      // Check if user has a newer adbot (renewal)
      const { data: newerAdbot } = await supabaseAdmin
        .from('adbots')
        .select('id')
        .eq('user_id', expiredAdbot.user_id)
        .eq('subscription_status', 'ACTIVE')
        .gt('created_at', expiredAdbot.expires_at)
        .limit(1)
        .maybeSingle();

      if (newerAdbot) {
        renewedCount++;
      }
    }

    const totalExpired = (expiredAdbots?.length || 0);
    const renewalSuccessRate = totalExpired > 0 
      ? (renewedCount / totalExpired) * 100 
      : 0;

    return NextResponse.json({
      success: true,
      churn: {
        daily: dailyChurn,
        last_7_days: churn7Days,
        last_30_days: churn30Days,
      },
      renewal: {
        expired_last_30_days: totalExpired,
        renewed: renewedCount,
        renewal_success_rate: Math.round(renewalSuccessRate * 100) / 100, // Round to 2 decimals
      },
    });
  } catch (error) {
    console.error('Error fetching churn metrics:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

