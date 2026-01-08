import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/queries';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id: adbotId, sessionId } = await params;
    const body = await request.json();
    const { reason } = body;

    // Get session details
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('id, session_file_path, phone_number')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Extract filename
    const filename = session.session_file_path?.split('/').pop();
    
    // Ban session in database
    const { data: updatedSession, error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({
        status: 'BANNED',
        banned_at: new Date().toISOString(),
        banned_reason: reason || 'Banned by admin',
        assigned_to_adbot_id: null,
        assigned_to_bot_id: null,
        assigned_at: null,
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Move file to banned folder via Python backend if filename exists
    if (filename) {
      try {
        const token = request.headers.get('Authorization') || '';
        await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/ban`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token,
          },
          body: JSON.stringify({ filename }),
        });
      } catch (backendError) {
        console.warn('Failed to move session file to banned folder:', backendError);
        // Continue - database is updated
      }
    }

    // Log activity
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'UPDATE',
      entity_type: 'session',
      entity_id: sessionId,
      details: {
        action: 'ban_session',
        adbot_id: adbotId,
        phone_number: session.phone_number,
        reason: reason || 'Banned by admin',
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Session banned successfully',
      data: updatedSession,
    });
  } catch (error) {
    console.error('Error banning session:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


