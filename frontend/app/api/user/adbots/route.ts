import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { listAdbotsByUser } from '@/lib/queries';

// GET /api/user/adbots - List user's adbots
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const adbots = await listAdbotsByUser(user.userId);

    return NextResponse.json({
      success: true,
      data: adbots,
    });
  } catch (error) {
    console.error('Error listing user adbots:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


