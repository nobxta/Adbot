import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/queries';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id: adbotId } = await params;
    const body = await request.json();
    const { user_id, user_email } = body;

    if (!user_id && !user_email) {
      return NextResponse.json(
        { error: 'user_id or user_email is required' },
        { status: 400 }
      );
    }

    // Get current adbot
    const { data: currentAdbot } = await supabaseAdmin
      .from('adbots')
      .select('user_id, bot_id')
      .eq('id', adbotId)
      .single();

    if (!currentAdbot) {
      return NextResponse.json(
        { error: 'Adbot not found' },
        { status: 404 }
      );
    }

    let targetUserId = user_id;

    // If email provided, find or create user
    if (!targetUserId && user_email) {
      // Check if user exists
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', user_email)
        .maybeSingle();

      if (existingUser) {
        targetUserId = existingUser.id;
      } else {
        // Create new user
        const { data: newUser, error: createError } = await supabaseAdmin
          .from('users')
          .insert({
            email: user_email,
            role: 'user',
            is_active: true,
            access_code: `TRANSFERRED-${Date.now()}`.substring(0, 15).toUpperCase(),
          })
          .select('id')
          .single();

        if (createError) throw createError;
        targetUserId = newUser.id;
      }
    }

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Failed to determine target user' },
        { status: 400 }
      );
    }

    // Update adbot user_id
    const { data: updatedAdbot, error } = await supabaseAdmin
      .from('adbots')
      .update({ user_id: targetUserId })
      .eq('id', adbotId)
      .select()
      .single();

    if (error) throw error;

    // Also update bot owner if bot_id exists
    if (currentAdbot.bot_id) {
      await supabaseAdmin
        .from('bots')
        .update({ owner_user_id: targetUserId, user_id: targetUserId })
        .eq('id', currentAdbot.bot_id);
    }

    // Log activity
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'UPDATE',
      entity_type: 'adbot',
      entity_id: adbotId,
      details: {
        action: 'transfer_ownership',
        old_user_id: currentAdbot.user_id,
        new_user_id: targetUserId,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot ownership transferred successfully',
      data: updatedAdbot,
    });
  } catch (error) {
    console.error('Error transferring ownership:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


