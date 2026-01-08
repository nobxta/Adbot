import { NextRequest, NextResponse } from 'next/server';
import { requireRole, generateAccessCode } from '@/lib/auth';
import { updateUser, logActivity } from '@/lib/queries';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id: userId } = await params;

    // Get old access code for audit
    const { getUserById } = await import('@/lib/queries');
    const user = await getUserById(userId);
    const oldAccessCode = user?.access_code;

    const newAccessCode = generateAccessCode();
    await updateUser(userId, { access_code: newAccessCode });

    // Full audit log with old → new
    await logActivity({
      admin_id: admin.userId,
      action: 'UPDATE',
      entity_type: 'user',
      entity_id: userId,
      details: {
        action: 'reset_access_code',
        field: 'access_code',
        old_value: oldAccessCode,
        new_value: newAccessCode,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Access code reset successfully',
      accessCode: newAccessCode,
    });
  } catch (error) {
    console.error('Error resetting access code:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


