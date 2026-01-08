import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/queries';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id: adbotId, sessionId } = await params;

    // Get session details
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('id, phone_number')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Unban session - move back to unused
    const { data: updatedSession, error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({
        status: 'UNUSED',
        banned_at: null,
        banned_reason: null,
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log activity
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'UPDATE',
      entity_type: 'session',
      entity_id: sessionId,
      details: {
        action: 'unban_session',
        adbot_id: adbotId,
        phone_number: session.phone_number,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Session unbanned successfully',
      data: updatedSession,
    });
  } catch (error) {
    console.error('Error unbanning session:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


