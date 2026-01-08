import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    const body = await request.json();
    const { api_id, api_hash } = body;

    if (!api_id || !api_hash) {
      return NextResponse.json(
        { error: 'api_id and api_hash are required' },
        { status: 400 }
      );
    }

    const token = request.headers.get('Authorization') || '';
    
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/admin/api-pairs/add`, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ api_id, api_hash }),
    });

    if (!response.ok) {
      const error = await response.json();
      // Preserve the original status code (especially 409 for duplicates)
      return NextResponse.json(
        { 
          error: error.detail || error.error || 'Failed to add API pair',
          detail: error.detail, // Include detail for frontend
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error adding API pair:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

