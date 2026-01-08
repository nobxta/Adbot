/**
 * Cron Monitoring Utilities
 * Tracks cron job execution for reliability monitoring
 */

import { supabaseAdmin } from './supabase';

export interface CronRunResult {
  job_name: string;
  start_time: string;
  end_time: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  affected_bot_count: number;
  error?: string;
  execution_time_ms: number;
}

/**
 * Log cron job execution
 * This is fail-safe - never throws, always returns
 */
export async function logCronRun(
  jobName: string,
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED',
  affectedBotCount: number,
  startTime: Date,
  error?: string
): Promise<void> {
  try {
    const endTime = new Date();
    const executionTimeMs = endTime.getTime() - startTime.getTime();

    await supabaseAdmin
      .from('cron_runs')
      .insert({
        job_name: jobName,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status,
        affected_bot_count: affectedBotCount,
        error: error || null,
        execution_time_ms: executionTimeMs,
      });
  } catch (logError) {
    // CRITICAL: Never throw - log and continue
    console.error('[CronMonitoring] Failed to log cron run:', {
      job_name: jobName,
      error: logError instanceof Error ? logError.message : 'Unknown error',
    });
  }
}

/**
 * Check if cron job is healthy (has run within last N hours)
 * Returns true if healthy, false if unhealthy
 */
export async function checkCronHealth(
  jobName: string,
  maxHoursSinceLastRun: number = 2
): Promise<{ healthy: boolean; lastRun?: Date; hoursSinceLastRun?: number; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cron_runs')
      .select('start_time')
      .eq('job_name', jobName)
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        healthy: false,
        error: error.message,
      };
    }

    if (!data) {
      return {
        healthy: false,
        error: 'No cron runs found',
      };
    }

    const lastRun = new Date(data.start_time);
    const now = new Date();
    const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

    return {
      healthy: hoursSinceLastRun <= maxHoursSinceLastRun,
      lastRun,
      hoursSinceLastRun,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get all cron health statuses
 */
export async function getAllCronHealth(): Promise<Record<string, { healthy: boolean; lastRun?: Date; hoursSinceLastRun?: number; error?: string }>> {
  const cronJobs = [
    'subscription-expire',
    'subscription-expire-check',
    'pre-expiry-notify',
    'permanent-delete-expired',
  ];

  const healthStatuses: Record<string, { healthy: boolean; lastRun?: Date; hoursSinceLastRun?: number; error?: string }> = {};

  for (const jobName of cronJobs) {
    healthStatuses[jobName] = await checkCronHealth(jobName);
  }

  return healthStatuses;
}

