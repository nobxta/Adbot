import { NextRequest, NextResponse } from 'next/server';
import { getBotByUserId, getUserById } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    const user = await getUserById(userId);
    const bot = await getBotByUserId(userId);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get adbot to calculate validity and stats
    const { data: adbotData } = await supabaseAdmin
      .from('adbots')
      .select('id, valid_until, messages_sent, groups_reached, status, last_run, created_at')
      .eq('user_id', userId)
      .eq('deleted_state', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Calculate plan validity days from valid_until
    let planValidityDays = 0;
    if (adbotData?.valid_until) {
      const now = new Date();
      const validUntil = new Date(adbotData.valid_until);
      const diffMs = validUntil.getTime() - now.getTime();
      // Calculate days remaining (can be decimal, but we show as integer)
      const daysRemaining = diffMs / (1000 * 60 * 60 * 24);
      planValidityDays = Math.max(0, Math.floor(daysRemaining)); // Use floor to show full days remaining
    }

    // Get messages sent and failed from adbot stats
    const messagesSent = adbotData?.messages_sent || bot?.messages_sent || 0;
    const groupsReached = adbotData?.groups_reached || bot?.groups_reached || 0;
    
    // Calculate messages this week (from last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const { data: weeklyLogs } = await supabaseAdmin
      .from('activity_logs')
      .select('*')
      .eq('entity_type', 'adbot')
      .eq('entity_id', adbotData?.id || '')
      .eq('action', 'POST')
      .gte('created_at', weekAgo.toISOString())
      .limit(1000);

    const messagesThisWeek = weeklyLogs?.length || 0;

    // Calculate failed messages (posts that failed)
    const { data: failedLogs } = await supabaseAdmin
      .from('activity_logs')
      .select('*')
      .eq('entity_type', 'adbot')
      .eq('entity_id', adbotData?.id || '')
      .eq('action', 'POST')
      .contains('details', { success: false })
      .limit(1000);

    const failedMessages = failedLogs?.length || 0;

    // Calculate uptime hours from last_run and status
    let uptimeHours = 0;
    if (adbotData?.last_run && adbotData?.status === 'ACTIVE') {
      const lastRun = new Date(adbotData.last_run);
      const now = new Date();
      const diffMs = now.getTime() - lastRun.getTime();
      uptimeHours = Math.floor(diffMs / (1000 * 60 * 60));
    } else if (bot?.uptime_hours) {
      uptimeHours = bot.uptime_hours;
    }

    // Get status from adbot or bot
    const status = adbotData?.status === 'ACTIVE' || adbotData?.status === 'RUNNING' 
      ? 'active' 
      : (bot?.plan_status === 'active' ? 'active' : 'inactive');

    return NextResponse.json({
      messagesSent,
      failedMessages,
      messagesThisWeek,
      planValidityDays,
      estimatedTraffic: groupsReached,
      groupsReached,
      uptimeHours,
      status,
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
