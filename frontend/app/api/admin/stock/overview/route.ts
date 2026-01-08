import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getStockOverview } from '@/lib/stock';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
const MAX_SESSIONS_PER_PAIR = 7;

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    // Get physical file counts from backend (source of truth)
    // Database is only for metadata, not for counting
    const token = request.headers.get('Authorization') || '';
    let sessionOverview = {
      total: 0,
      unused: 0,
      assigned: 0,
      banned: 0,
    };

    try {
      const physicalResponse = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/list`, {
        headers: {
          'Authorization': token,
        },
      });

      if (physicalResponse.ok) {
        const physicalResult = await physicalResponse.json();
        const counts = physicalResult.counts || {};
        
        // Use physical file counts as source of truth
        sessionOverview = {
          total: (counts.unused || 0) + (counts.assigned || 0) + (counts.banned || 0),
          unused: counts.unused || 0,
          assigned: counts.assigned || 0,
          banned: counts.banned || 0,
        };
      } else {
        console.error('Failed to fetch physical files from backend');
      }
    } catch (error) {
      console.error('Error fetching physical files:', error);
      // Return zeros if backend is unavailable
    }

    // Fetch API pairs from Python backend (reuse token from above)
    let apiPairsInfo = {
      total: 0,
      available: 0,
      used: 0,
      usage: [] as Array<{ pair_index: number; api_id: string; sessions_used: number; capacity: number }>,
    };

    try {
      const apiPairsResponse = await fetch(`${PYTHON_BACKEND_URL}/api/admin/api-pairs/list`, {
        headers: {
          'Authorization': token,
        },
      });

      if (apiPairsResponse.ok) {
        const apiPairsResult = await apiPairsResponse.json();
        const pairs = apiPairsResult.pairs || [];
        apiPairsInfo.total = pairs.length;

        // Calculate usage from assigned sessions
        // Each API pair can handle 7 sessions max
        // We need to estimate usage based on assigned sessions count
        const assignedSessions = sessionOverview.assigned || 0;
        const totalCapacity = pairs.length * MAX_SESSIONS_PER_PAIR;
        
        // Estimate: distribute assigned sessions across pairs
        const estimatedUsedPairs = Math.ceil(assignedSessions / MAX_SESSIONS_PER_PAIR);
        const estimatedAvailablePairs = Math.max(0, pairs.length - estimatedUsedPairs);
        
        // Calculate per-pair usage (simplified - assumes even distribution)
        for (let i = 0; i < pairs.length; i++) {
          const sessionsForThisPair = Math.min(
            Math.max(0, assignedSessions - (i * MAX_SESSIONS_PER_PAIR)),
            MAX_SESSIONS_PER_PAIR
          );
          apiPairsInfo.usage.push({
            pair_index: i,
            api_id: pairs[i].api_id,
            sessions_used: sessionsForThisPair,
            capacity: MAX_SESSIONS_PER_PAIR,
          });
        }

        // Calculate available pairs (pairs with capacity remaining)
        apiPairsInfo.available = apiPairsInfo.usage.filter(
          (u) => u.sessions_used < MAX_SESSIONS_PER_PAIR
        ).length;
        apiPairsInfo.used = apiPairsInfo.usage.filter(
          (u) => u.sessions_used > 0
        ).length;
      }
    } catch (error) {
      console.error('Error fetching API pairs:', error);
      // Continue without API pairs info
    }

    const response = NextResponse.json({
      success: true,
      data: {
        sessions: sessionOverview,
        api_pairs: apiPairsInfo,
      },
    });
    
    // Disable caching
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    
    return response;
  } catch (error) {
    console.error('Error fetching stock overview:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}


