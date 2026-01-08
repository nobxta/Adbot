import { NextRequest, NextResponse } from 'next/server';
import { requireRole, generateAccessCode } from '@/lib/auth';
import { listUsers, suspendUser, updateUser, logActivity } from '@/lib/queries';

// GET /api/admin/users - List all users
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') as any;
    const isActive = searchParams.get('isActive');

    const filters: any = {};
    if (role) filters.role = role;
    if (isActive !== null) filters.is_active = isActive === 'true';

    const users = await listUsers(filters);

    return NextResponse.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('Error listing users:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


