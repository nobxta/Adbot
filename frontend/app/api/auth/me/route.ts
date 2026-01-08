import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getUserById } from '@/lib/queries';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const authUser = await requireAuth(request);

    // Get full user details
    const user = await getUserById(authUser.userId);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        accessCode: user.access_code,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        isSuspended: user.is_suspended,
        telegramId: user.telegram_id,
        createdAt: user.created_at,
        lastLogin: user.last_login,
      },
    });
  } catch (error) {
    console.error('Error getting user:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}


