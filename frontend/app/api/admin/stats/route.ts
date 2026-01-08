import { NextRequest, NextResponse } from 'next/server';
import { getTotalUsers, getActiveBots, getTotalRevenue } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // In production, verify admin authentication here
    // const token = request.headers.get('authorization');
    // Verify token and check if user is admin

    const [totalUsers, activeBots, totalRevenue] = await Promise.all([
      getTotalUsers(),
      getActiveBots(),
      getTotalRevenue(),
    ]);

    return NextResponse.json({
      totalUsers,
      activeBots,
      totalRevenue: Math.round(totalRevenue * 100) / 100, // Round to 2 decimal places
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

