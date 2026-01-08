import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { resolveQueuedAdbots } from '@/lib/queue-resolution';

/**
 * POST /api/admin/queue/resolve
 * Manually trigger queue resolution (also called automatically when sessions added)
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    const result = await resolveQueuedAdbots();

    return NextResponse.json({
      success: true,
      message: `Queue resolution complete: ${result.resolved} resolved, ${result.stillQueued} still queued`,
      data: result,
    });
  } catch (error) {
    console.error('Error resolving queue:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

