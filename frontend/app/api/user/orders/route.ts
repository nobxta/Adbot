import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { listOrdersByUser } from '@/lib/queries';

// GET /api/user/orders - List user's orders
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const orders = await listOrdersByUser(user.userId);

    return NextResponse.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error('Error listing user orders:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


