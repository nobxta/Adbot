import { NextRequest, NextResponse } from 'next/server';
import { updateBotByUserId } from '@/lib/db';
import { backendApi } from '@/lib/backend-api';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const body = await request.json();
    const { action } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    if (action !== 'active' && action !== 'inactive') {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Call Python backend to start/stop bot
    let backendResponse;
    try {
      if (action === 'active') {
        backendResponse = await backendApi.startBot(userId);
      } else {
        backendResponse = await backendApi.stopBot(userId);
      }
    } catch (backendError: any) {
      console.error('Backend API error:', backendError);
      return NextResponse.json(
        { error: backendError.message || 'Failed to communicate with bot backend' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      status: action,
      message: `Bot ${action === 'active' ? 'started' : 'stopped'} successfully`,
      backend: backendResponse,
    });
  } catch (error) {
    console.error('Error controlling bot:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

