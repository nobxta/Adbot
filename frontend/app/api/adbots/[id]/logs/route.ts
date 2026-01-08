import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, hasRole } from '@/lib/auth';
import { getAdbotById } from '@/lib/queries';
import { getAdbotLogs } from '@/lib/python-backend';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { id: adbotId } = await params;

    if (!user.userId) {
      return NextResponse.json(
        { error: 'User ID not found' },
        { status: 400 }
      );
    }

    // Get adbot
    const adbot = await getAdbotById(adbotId);

    // Check ownership (users can only view their own adbot logs, admins can view any)
    if (!hasRole(user.role, ['ADMIN']) && adbot.user_id !== user.userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Get logs from Python backend
    const { searchParams } = new URL(request.url);
    const lines = parseInt(searchParams.get('lines') || '100');

    const result = await getAdbotLogs(adbotId, lines);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to get adbot logs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('Error getting adbot logs:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


