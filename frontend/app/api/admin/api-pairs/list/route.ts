import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    const token = request.headers.get('Authorization') || '';
    
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/admin/api-pairs/list`, {
      headers: {
        'Authorization': token,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to fetch API pairs');
    }

    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error listing API pairs:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

