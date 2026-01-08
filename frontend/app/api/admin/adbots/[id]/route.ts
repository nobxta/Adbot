import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// GET /api/admin/adbots/[id] - Get single adbot with all details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['ADMIN']);

    const { id: adbotId } = await params;

    // Fetch adbot with all related data (including status fields)
    const { data: adbot, error: adbotError } = await supabaseAdmin
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
        ),
        order:orders!adbots_order_id_fkey (
          id,
          amount,
          status,
          created_at
        )
      `)
      .eq('id', adbotId)
      .single();

    if (adbotError) throw adbotError;

    const result: any = {
      ...adbot,
      product: adbot.product ? (Array.isArray(adbot.product) ? adbot.product[0] : adbot.product) : null,
      order: adbot.order ? (Array.isArray(adbot.order) ? adbot.order[0] : adbot.order) : null,
    };

    // Fetch bot data if bot_id exists - use admin client to bypass RLS
    if (adbot.bot_id && supabaseAdmin) {
      const { data: bot, error: botError } = await supabaseAdmin
        .from('bots')
        .select('id, bot_id, access_code, plan_type, plan_status, cycle_delay, expires_at, created_at')
        .eq('id', adbot.bot_id)
        .maybeSingle();
      
      if (botError) {
        console.error('Error fetching bot:', botError);
      } else {
        result.bot = bot;
        console.log('[adbot-detail] Fetched bot:', {
          bot_id: bot?.bot_id,
          access_code: bot?.access_code,
        });
      }
    }

    // Fetch user data with last login - use admin client to bypass RLS
    if (adbot.user_id && supabaseAdmin) {
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, email, access_code, role, is_active, is_suspended, created_at, last_login')
        .eq('id', adbot.user_id)
        .maybeSingle();
      
      if (userError) {
        console.error('Error fetching user:', userError);
      } else {
        result.user = user;
        console.log('[adbot-detail] Fetched user:', {
          user_id: user?.id,
          access_code: user?.access_code,
        });
      }
    }

    // Fetch assigned sessions - check both adbot_id and bot_id (use admin client)
    let sessions = [];
    
    // First, try to get sessions assigned to this adbot
    const { data: adbotSessions } = await supabaseAdmin
      .from('sessions')
      .select('id, phone_number, status, assigned_at, banned_at, banned_reason')
      .eq('assigned_to_adbot_id', adbotId)
      .order('assigned_at', { ascending: false });
    
    sessions = adbotSessions || [];
    
    // Also check if sessions are assigned via bot_id
    if (adbot.bot_id && sessions.length === 0) {
      const { data: botSessions } = await supabaseAdmin
        .from('sessions')
        .select('id, phone_number, status, assigned_at, banned_at, banned_reason')
        .eq('assigned_to_bot_id', adbot.bot_id)
        .order('assigned_at', { ascending: false });
      
      if (botSessions && botSessions.length > 0) {
        sessions = botSessions;
      }
    }

    result.sessions = sessions;

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

// PUT /api/admin/adbots/[id] - Update adbot
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['ADMIN']);

    const { id: adbotId } = await params;
    const body = await request.json();

    // Allowed fields to update
    const allowedFields = [
      'posting_interval_minutes',
      'valid_until',
      'post_link',
      'target_groups',
      'status',
    ];

    const updateData: any = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('adbots')
      .update(updateData)
      .eq('id', adbotId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error updating adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

