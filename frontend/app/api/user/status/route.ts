import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    const user = await getUserById(userId);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // In production, check actual account ban status from database
    // For now, using a placeholder - you would check a 'banned' field in users table
    const accountBanned = false; // Replace with: user.account_banned || false
    const bannedAccountsCount = 0; // Replace with: user.banned_accounts_count || 0
    const notificationCount = accountBanned ? 1 : 0;

    return NextResponse.json({
      accountBanned,
      bannedAccountsCount,
      notificationCount,
      planStatus: user.plan_status,
      planType: user.plan_type,
    });
  } catch (error) {
    console.error('Error fetching user status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

