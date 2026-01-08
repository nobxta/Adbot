import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { logActivity } from '@/lib/queries';
import { startAdbot, stopAdbot } from '@/lib/python-backend';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id: adbotId } = await params;

    // Stop the adbot first
    const stopResult = await stopAdbot(adbotId);
    if (!stopResult.success) {
      throw new Error(stopResult.error || 'Failed to stop adbot');
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start the adbot
    const startResult = await startAdbot(adbotId);
    if (!startResult.success) {
      throw new Error(startResult.error || 'Failed to start adbot');
    }

    // Log activity
    await logActivity({
      admin_id: admin.userId || admin.botId,
      action: 'UPDATE',
      entity_type: 'adbot',
      entity_id: adbotId,
      details: {
        action: 'restart',
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Adbot restarted successfully',
    });
  } catch (error) {
    console.error('Error restarting adbot:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


