import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getUserById } from '@/lib/db';
import { getBotsByOwnerUserId } from '@/lib/bot-db';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    
    if (!user.userId) {
      return NextResponse.json(
        { error: 'User ID not found' },
        { status: 401 }
      );
    }

    // Get user data
    const userData = await getUserById(user.userId);
    if (!userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get bot data (using owner_user_id)
    const bots = await getBotsByOwnerUserId(user.userId);
    const bot = bots && bots.length > 0 ? bots[0] : null;

    // Get adbot data to fetch product name and status
    let productName: string | null = null;
    let planType: string | null = bot?.plan_type || userData.plan_type || null;
    let frozenState = false;
    let suspendedState = false;
    let deletedState = false;
    let frozenReason: string | null = null;
    let suspendReason: string | null = null;
    let adbotId: string | null = null;
    let adbotData: any = null;
    let product: any = null;
    
    if (user.userId) {
      const { data: adbotDataResult } = await supabaseAdmin
        .from('adbots')
        .select(`
          *,
          product:products!adbots_product_id_fkey (
            id,
            name,
            plan_type,
            sessions_count,
            posting_interval_minutes,
            validity_days,
            price
          )
        `)
        .eq('user_id', user.userId)
        .eq('deleted_state', false) // Exclude deleted adbots
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (adbotDataResult) {
        adbotData = adbotDataResult;
        adbotId = adbotData.id;
        product = Array.isArray(adbotData.product) ? adbotData.product[0] : adbotData.product;
        productName = product?.name || null;
        planType = product?.plan_type || planType;
        frozenState = adbotData.frozen_state || false;
        suspendedState = !!adbotData.suspended_at;
        deletedState = adbotData.deleted_state || false;
        frozenReason = adbotData.frozen_reason || null;
        suspendReason = adbotData.suspend_reason || null;
      }
    }

    // Also check bot-level status
    if (bot) {
      frozenState = frozenState || bot.frozen_state || false;
      suspendedState = suspendedState || !!bot.suspended_at;
      if (bot.frozen_reason) frozenReason = bot.frozen_reason;
      if (bot.suspend_reason) suspendReason = bot.suspend_reason;
    }

    // Get sessions count for this adbot
    let sessionsCount = 0;
    if (adbotId) {
      const { count } = await supabaseAdmin
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to_adbot_id', adbotId)
        .eq('status', 'ASSIGNED');
      sessionsCount = count || 0;
    }

    return NextResponse.json({
      bot_id: bot?.bot_id || null,
      access_code: bot?.access_code || userData.access_code || null,
      plan_type: planType,
      plan_name: productName,
      last_login: bot?.last_login || userData.last_login || null,
      user_id: user.userId,
      adbot_id: adbotId || null,
      frozen_state: frozenState,
      suspended_state: suspendedState,
      deleted_state: deletedState,
      frozen_reason: frozenReason,
      suspend_reason: suspendReason,
      // Additional adbot details
      sessions_count: sessionsCount || product?.sessions_count || 0,
      posting_interval_minutes: adbotData?.posting_interval_minutes || product?.posting_interval_minutes || 0,
      valid_until: adbotData?.valid_until || null,
      product: product,
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


