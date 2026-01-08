import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getAllCronHealth } from '@/lib/cron-monitoring';
import { createNotification } from '@/lib/queries';

/**
 * GET /api/admin/cron/health
 * Check health of all cron jobs
 * Returns health status and triggers alerts if unhealthy
 * Supports both admin token and secret header for automated cron calls
 */
export async function GET(request: NextRequest) {
  try {
    // Allow both admin and system calls (with secret token)
    const secretToken = request.headers.get('X-Cron-Health-Secret') || '';
    
    // Check if it's a system call with secret token
    const expectedSecret = process.env.CRON_HEALTH_SECRET || 'cron-health-secret-change-in-production';
    if (secretToken === expectedSecret) {
      // System call - proceed without role check
    } else {
      // Admin call - require role
      await requireRole(request, ['ADMIN']);
    }

    const healthStatuses = await getAllCronHealth();
    const unhealthyJobs: string[] = [];

    // Check for unhealthy jobs
    for (const [jobName, health] of Object.entries(healthStatuses)) {
      if (!health.healthy) {
        unhealthyJobs.push(jobName);
      }
    }

    // Trigger admin alert if any cron is unhealthy
    if (unhealthyJobs.length > 0) {
      try {
        await createNotification({
          type: 'ERROR',
          title: '⚠️ Subscription Cron Not Running',
          message: `The following cron jobs have not run in the last 2 hours: ${unhealthyJobs.join(', ')}. Please check cron configuration.`,
        });
      } catch (notifError) {
        // Notification failure is non-critical
        console.error('Failed to create cron health alert:', notifError);
      }
    }

    return NextResponse.json({
      success: true,
      health: healthStatuses,
      unhealthy_jobs: unhealthyJobs,
      all_healthy: unhealthyJobs.length === 0,
    });
  } catch (error) {
    console.error('Error checking cron health:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

