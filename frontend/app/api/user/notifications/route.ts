import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { listNotificationsByUser, markNotificationAsRead } from '@/lib/queries';

// GET /api/user/notifications - List user's notifications
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const notifications = await listNotificationsByUser(user.userId);

    return NextResponse.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error('Error listing notifications:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

// PATCH /api/user/notifications - Mark notification as read
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { notificationId } = body;

    if (!notificationId) {
      return NextResponse.json(
        { error: 'Notification ID is required' },
        { status: 400 }
      );
    }

    const notification = await markNotificationAsRead(notificationId);

    return NextResponse.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


