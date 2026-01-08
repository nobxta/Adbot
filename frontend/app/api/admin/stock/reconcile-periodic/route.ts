import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

/**
 * POST /api/admin/stock/reconcile-periodic
 * Periodic reconciliation job (can be called by cron or scheduled task)
 * This endpoint should be called regularly (e.g., every hour) to keep filesystem and database in sync
 */
export async function POST(request: NextRequest) {
  try {
    // Allow both admin and system calls (with secret token)
    const authHeader = request.headers.get('Authorization') || '';
    const secretToken = request.headers.get('X-Reconcile-Secret') || '';
    
    // Check if it's a system call with secret token
    const expectedSecret = process.env.RECONCILE_SECRET || 'reconcile-secret-change-in-production';
    if (secretToken === expectedSecret) {
      // System call - proceed without role check
    } else {
      // Admin call - require role
      await requireRole(request, ['ADMIN']);
    }

    // Call the reconciliation endpoint
    const reconcileUrl = new URL('/api/admin/stock/reconcile', request.url);
    const reconcileResponse = await fetch(reconcileUrl.toString(), {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
      },
    });

    if (!reconcileResponse.ok) {
      const errorData = await reconcileResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Reconciliation failed');
    }

    const result = await reconcileResponse.json();

    return NextResponse.json({
      success: true,
      message: 'Periodic reconciliation completed',
      reconciliation: result.reconciliation,
    });
  } catch (error) {
    console.error('Error in periodic reconciliation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

