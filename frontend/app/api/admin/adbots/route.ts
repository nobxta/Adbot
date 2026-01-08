import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { listAllAdbots } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

// GET /api/admin/adbots - List all adbots with bot and user data
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    // Fetch adbots with related data
    const { data: adbots, error: adbotsError } = await supabase
      .from('adbots')
      .select(`
        *,
        product:products!adbots_product_id_fkey (
          id,
          name,
          plan_type
        )
      `)
      .order('created_at', { ascending: false });

    if (adbotsError) throw adbotsError;

    // Enrich with bot and user data
    const enrichedAdbots = await Promise.all(
      (adbots || []).map(async (adbot: any) => {
        const result: any = {
          ...adbot,
          product: adbot.product ? (Array.isArray(adbot.product) ? adbot.product[0] : adbot.product) : null,
        };

        // Fetch bot data if bot_id exists
        if (adbot.bot_id) {
          const { data: bot } = await supabase
            .from('bots')
            .select('id, access_code')
            .eq('id', adbot.bot_id)
            .single();
          result.bot = bot;
        }

        // Fetch user data
        if (adbot.user_id) {
          const { data: user } = await supabase
            .from('users')
            .select('id, email, access_code')
            .eq('id', adbot.user_id)
            .single();
          result.user = user;
        }

        return result;
      })
    );

    return NextResponse.json({
      success: true,
      data: enrichedAdbots,
    });
  } catch (error) {
    console.error('Error listing adbots:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


