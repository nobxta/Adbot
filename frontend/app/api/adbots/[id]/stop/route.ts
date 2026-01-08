import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, hasRole, generateToken } from '@/lib/auth';
import { getAdbotById, updateAdbotStatus, logActivity } from '@/lib/queries';
import { stopAdbot } from '@/lib/python-backend';

export async function POST(
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

    // Check ownership (users can only stop their own adbots, admins can stop any)
    if (!hasRole(user.role, ['ADMIN']) && adbot.user_id !== user.userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Generate a token for the Python backend
    const backendToken = await generateToken({
      userId: adbot.user_id,
      role: 'USER',
    });

    // Stop adbot on Python backend
    const result = await stopAdbot(adbotId, backendToken);

    if (!result.success) {
      // Don't fail if Python backend is unavailable - still update DB status
      console.warn('Python backend stop failed:', result.error);
    }

    // Update adbot status
    await updateAdbotStatus(adbotId, 'STOPPED');

    // Log activity
    await logActivity({
      user_id: user.userId,
      action: 'STOP',
      entity_type: 'adbot',
      entity_id: adbotId,
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot stopped successfully',
    });
  } catch (error) {
    console.error('Error stopping adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


