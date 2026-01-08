import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { suspendUser, logActivity } from '@/lib/queries';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const userId = params.id;
    const body = await request.json().catch(() => ({}));
    const suspend = body.suspend !== false; // Default to true

    // Get current user state for audit log
    const { getUserById } = await import('@/lib/queries');
    const user = await getUserById(userId);
    const oldValue = user?.is_active;

    await suspendUser(userId);

    // Log with old and new values
    await logActivity({
      admin_id: admin.userId,
      action: 'UPDATE',
      entity_type: 'user',
      entity_id: userId,
      details: {
        action: suspend ? 'suspended' : 'activated',
        field: 'is_active',
        old_value: oldValue,
        new_value: !suspend,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: suspend ? 'User suspended successfully' : 'User activated successfully',
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


