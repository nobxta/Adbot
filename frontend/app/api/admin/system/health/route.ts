import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    // Check Python backend health and get heartbeat data
    let pythonBackend = { status: 'down', data: null, error: null };
    try {
      const response = await fetch(`${PYTHON_BACKEND_URL}/api/health`, {
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (response.ok) {
        const data = await response.json();
        pythonBackend = {
          status: data.status === 'healthy' ? 'healthy' : 'degraded',
          data: data,
          error: null,
        };
      } else {
        pythonBackend.status = 'down';
        pythonBackend.error = `HTTP ${response.status}`;
      }
    } catch (error) {
      pythonBackend.status = 'down';
      pythonBackend.error = error instanceof Error ? error.message : 'Connection failed';
    }

    // Check bot health from Python backend
    let botHealth = { status: 'unknown', data: null };
    try {
      const response = await fetch(`${PYTHON_BACKEND_URL}/api/bot/health`, {
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        const data = await response.json();
        botHealth = {
          status: data.success ? 'healthy' : 'degraded',
          data: data.health || data,
        };
      }
    } catch (error) {
      // Bot health check failed, python backend might be down
    }

    // Check database health
    let database = { status: 'down', error: null };
    try {
      const { error: dbError } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      database = {
        status: dbError ? 'down' : 'healthy',
        error: dbError ? dbError.message : null,
      };
    } catch (error) {
      database.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Get actual running adbots from heartbeats (via Python backend)
    let runningAdbots = 0;
    let crashedAdbots = 0;
    let lastCycleTime = null;
    
    if (botHealth.data) {
      // Parse bot health data
      lastCycleTime = botHealth.data.last_cycle_time;
      
      // Get adbot statuses from Supabase to compare with heartbeat
      const { data: adbots } = await supabase
        .from('adbots')
        .select('id, status, user_id');

      if (adbots && adbots.length > 0) {
        // For each adbot, check if it has a fresh heartbeat
        // This requires calling Python backend per adbot or getting all heartbeats
        // For now, use active_sessions as a proxy for running adbots
        runningAdbots = botHealth.data.active_sessions || 0;
        
        // Crashed = adbots with ACTIVE status but no heartbeat
        const activeInDb = adbots.filter(a => a.status === 'ACTIVE').length;
        crashedAdbots = Math.max(0, activeInDb - runningAdbots);
      }
    }

    // Calculate scheduler lag
    let schedulerLag = null;
    if (lastCycleTime) {
      const now = new Date();
      const lastCycle = new Date(lastCycleTime);
      const lagSeconds = (now.getTime() - lastCycle.getTime()) / 1000;
      schedulerLag = lagSeconds;
    }

    return NextResponse.json({
      success: true,
      data: {
        pythonBackend: {
          status: pythonBackend.status,
          scheduler_running: pythonBackend.data?.scheduler_running || false,
          active_users: pythonBackend.data?.active_users || 0,
          read_only_mode: pythonBackend.data?.read_only_mode || false,
          read_only_reason: pythonBackend.data?.read_only_reason || null,
          error: pythonBackend.error,
        },
        database: {
          status: database.status,
          error: database.error,
        },
        botWorker: {
          status: botHealth.status,
          active_sessions: botHealth.data?.active_sessions || 0,
          banned_sessions: botHealth.data?.banned_sessions || 0,
          last_cycle_time: lastCycleTime,
          last_error: botHealth.data?.last_error || null,
        },
        adbots: {
          running: runningAdbots,
          crashed: crashedAdbots,
        },
        scheduler: {
          lag_seconds: schedulerLag,
          is_lagging: schedulerLag ? schedulerLag > 60 : false, // > 1 minute is lagging
        },
      },
    });
  } catch (error) {
    console.error('Error fetching system health:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

