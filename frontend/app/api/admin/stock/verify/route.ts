import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);
    
    const body = await request.json();
    const { filename } = body;

    if (!filename) {
      return NextResponse.json(
        { error: 'filename is required' },
        { status: 400 }
      );
    }

    // Call Python backend to verify the physical file
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': request.headers.get('Authorization') || '',
      },
      body: JSON.stringify({ filename }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Verification failed' }));
      return NextResponse.json(
        { error: error.detail || 'Failed to verify session file' },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error verifying session:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

