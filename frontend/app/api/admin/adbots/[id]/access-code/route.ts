import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// POST /api/admin/adbots/[id]/access-code - Change access code
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['ADMIN']);

    const { id: adbotId } = await params;
    const body = await request.json();
    const { access_code } = body;

    if (!access_code || access_code.trim().length === 0) {
      return NextResponse.json(
        { error: 'Access code is required' },
        { status: 400 }
      );
    }

    // Get adbot to find bot_id - use admin client to bypass RLS
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database admin client not configured' },
        { status: 500 }
      );
    }

    const { data: adbot, error: adbotError } = await supabaseAdmin
      .from('adbots')
      .select('bot_id, user_id')
      .eq('id', adbotId)
      .single();

    if (adbotError || !adbot) {
      return NextResponse.json(
        { error: 'Adbot not found' },
        { status: 404 }
      );
    }

    const updatedCodes = [];
    const accessCodeUpper = access_code.toUpperCase().trim();
    
    // Update bot access code if bot_id exists - use admin client to bypass RLS
    if (adbot.bot_id) {
      // First check if bot exists
      const { data: existingBot, error: checkError } = await supabaseAdmin
        .from('bots')
        .select('id, access_code')
        .eq('id', adbot.bot_id)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking bot existence:', checkError);
        throw new Error(`Failed to check bot: ${checkError.message}`);
      } else if (existingBot) {
        // Bot exists, update it
        const { data: updatedBot, error: botError } = await supabaseAdmin
          .from('bots')
          .update({ access_code: accessCodeUpper })
          .eq('id', adbot.bot_id)
          .select('access_code')
          .single();

        if (botError) {
          console.error('Error updating bot access code:', botError);
          throw new Error(`Failed to update bot access code: ${botError.message}`);
        }
        console.log('[access-code] Bot access code updated:', {
          bot_id: adbot.bot_id,
          old_code: existingBot.access_code,
          new_code: accessCodeUpper,
          updated_code: updatedBot?.access_code,
        });
        updatedCodes.push('bot');
      } else {
        console.warn(`Bot with id ${adbot.bot_id} not found, skipping bot update`);
      }
    }

    // Also update user access code - use admin client to bypass RLS
    if (adbot.user_id) {
      const { data: updatedUser, error: userError } = await supabaseAdmin
        .from('users')
        .update({ access_code: accessCodeUpper })
        .eq('id', adbot.user_id)
        .select('access_code')
        .single();

      if (userError) {
        console.error('Error updating user access code:', userError);
        throw new Error(`Failed to update user access code: ${userError.message}`);
      }
      console.log('[access-code] User access code updated:', {
        user_id: adbot.user_id,
        new_code: accessCodeUpper,
        updated_code: updatedUser?.access_code,
      });
      updatedCodes.push('user');
    }

    // If no bot_id exists, we need to create or link a bot
    if (!adbot.bot_id && adbot.user_id) {
      // Try to find existing bot for this user
      const { data: existingBot } = await supabaseAdmin
        .from('bots')
        .select('id')
        .eq('owner_user_id', adbot.user_id)
        .limit(1)
        .maybeSingle();

      if (existingBot) {
        // Link adbot to existing bot
        const { error: linkError } = await supabaseAdmin
          .from('adbots')
          .update({ bot_id: existingBot.id })
          .eq('id', adbotId);
        
        if (linkError) {
          console.error('Error linking bot to adbot:', linkError);
        } else {
          // Update bot access code
          const { error: botUpdateError } = await supabaseAdmin
            .from('bots')
            .update({ access_code: accessCodeUpper })
            .eq('id', existingBot.id);
          
          if (botUpdateError) {
            console.error('Error updating linked bot access code:', botUpdateError);
          } else {
            updatedCodes.push('bot (linked)');
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Access code updated successfully',
      updated: updatedCodes,
    });
  } catch (error) {
    console.error('Error updating access code:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

