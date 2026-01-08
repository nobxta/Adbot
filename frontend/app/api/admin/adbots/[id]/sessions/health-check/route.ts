import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireRole(request, ['ADMIN']);
    const { id: adbotId } = await params;
    const body = await request.json();
    const { session_filenames } = body;

    if (!session_filenames || !Array.isArray(session_filenames)) {
      return NextResponse.json(
        { error: 'session_filenames array is required' },
        { status: 400 }
      );
    }

    // Call Python backend for health check
    const token = request.headers.get('Authorization') || '';
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/health-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
      body: JSON.stringify({ session_filenames }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to check session health');
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      data: result.results || {},
    });
  } catch (error) {
    console.error('Error checking session health:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


