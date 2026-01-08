import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getQueueStats } from '@/lib/queue-resolution';

/**
 * GET /api/admin/queue/stats
 * Get queue statistics for admin dashboard
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    const stats = await getQueueStats();

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

