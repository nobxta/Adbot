import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { broadcastNotification, logActivity } from '@/lib/queries';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const body = await request.json();

    const { title, message, type } = body;

    if (!title || !message) {
      return NextResponse.json(
        { error: 'Title and message are required' },
        { status: 400 }
      );
    }

    const count = await broadcastNotification({
      type: type || 'INFO',
      title,
      message,
    });

    await logActivity({
      admin_id: admin.userId,
      action: 'CREATE',
      entity_type: 'notification',
      entity_id: 'broadcast',
      details: { title, message, count },
    });

    return NextResponse.json({
      success: true,
      message: `Broadcast sent to ${count} users`,
      data: { count },
    });
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

