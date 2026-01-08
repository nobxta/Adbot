import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { checkPythonBackendHealth } from '@/lib/python-backend';
import { getSessionStockOverview } from '@/lib/queries';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    // Require admin role
    await requireRole(request, ['ADMIN']);

    // Get date range filter from query params
    const { searchParams } = new URL(request.url);
    const dateRange = searchParams.get('dateRange') || 'lifetime'; // today, week, month, lifetime, or custom
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Get total sales metrics
    const { data: orders } = await supabase
      .from('orders')
      .select('amount, created_at, status')
      .eq('status', 'PAID');

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate sales based on date range filter
    let filteredOrders = orders || [];
    if (dateRange === 'today') {
      filteredOrders = orders?.filter(o => new Date(o.created_at) >= todayStart) || [];
    } else if (dateRange === 'week') {
      filteredOrders = orders?.filter(o => new Date(o.created_at) >= weekStart) || [];
    } else if (dateRange === 'month') {
      filteredOrders = orders?.filter(o => new Date(o.created_at) >= monthStart) || [];
    } else if (dateRange === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include full end date
      filteredOrders = orders?.filter(o => {
        const orderDate = new Date(o.created_at);
        return orderDate >= start && orderDate <= end;
      }) || [];
    }
    // 'lifetime' uses all orders

    const totalSales = {
      today: orders?.filter(o => new Date(o.created_at) >= todayStart)
        .reduce((sum, o) => sum + (o.amount || 0), 0) || 0,
      week: orders?.filter(o => new Date(o.created_at) >= weekStart)
        .reduce((sum, o) => sum + (o.amount || 0), 0) || 0,
      month: orders?.filter(o => new Date(o.created_at) >= monthStart)
        .reduce((sum, o) => sum + (o.amount || 0), 0) || 0,
      lifetime: orders?.reduce((sum, o) => sum + (o.amount || 0), 0) || 0,
      filtered: filteredOrders.reduce((sum, o) => sum + (o.amount || 0), 0),
    };

    // Get adbot counts - overall active adbots (all purchased plans)
    const { data: adbots } = await supabase
      .from('adbots')
      .select('status, validity_end, created_at, product_id');

    // Get products to filter by ADBOT_PLAN type
    const { data: products } = await supabase
      .from('products')
      .select('id, type')
      .eq('type', 'ADBOT_PLAN');

    const adbotProductIds = new Set(products?.map(p => p.id) || []);

    // Overall active adbots (all purchased adbot plans, regardless of current status)
    const overallActiveAdbots = adbots?.filter(a => 
      adbotProductIds.has(a.product_id)
    ).length || 0;

    // Currently active adbots (active status and not expired)
    const currentlyActiveAdbots = adbots?.filter(a => 
      a.status === 'RUNNING' && (!a.validity_end || new Date(a.validity_end) > now) && adbotProductIds.has(a.product_id)
    ).length || 0;

    // Recently purchased active adbots (purchased in last 30 days and active)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentlyActiveAdbots = adbots?.filter(a => 
      new Date(a.created_at) >= thirtyDaysAgo &&
      a.status === 'RUNNING' &&
      (!a.validity_end || new Date(a.validity_end) > now) &&
      adbotProductIds.has(a.product_id)
    ).length || 0;

    const expiredAdbots = adbots?.filter(a => 
      a.validity_end && new Date(a.validity_end) <= now
    ).length || 0;

    // Get reseller count
    const { count: totalResellers } = await supabase
      .from('resellers')
      .select('*', { count: 'exact', head: true });

    // Get revenue chart data based on date range
    let chartDays = 30;
    let chartStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    if (dateRange === 'today') {
      chartDays = 1;
      chartStartDate = todayStart;
    } else if (dateRange === 'week') {
      chartDays = 7;
      chartStartDate = weekStart;
    } else if (dateRange === 'month') {
      chartDays = 30;
      chartStartDate = monthStart;
    } else if (dateRange === 'custom' && startDate && endDate) {
      chartStartDate = new Date(startDate);
      const end = new Date(endDate);
      chartDays = Math.ceil((end.getTime() - chartStartDate.getTime()) / (24 * 60 * 60 * 1000));
      chartDays = Math.min(chartDays, 365); // Limit to 365 days
    }

    const { data: revenueData } = await supabase
      .from('orders')
      .select('amount, created_at')
      .eq('status', 'PAID')
      .gte('created_at', chartStartDate.toISOString());

    // Group by date
    const revenueChart = [];
    for (let i = chartDays - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayRevenue = revenueData?.filter(r => 
        r.created_at.startsWith(dateStr)
      ).reduce((sum, r) => sum + (r.amount || 0), 0) || 0;
      
      revenueChart.push({
        date: dateStr,
        amount: dayRevenue,
      });
    }

    // Get stock overview including frozen sessions
    const stockOverview = await getSessionStockOverview();
    
    // Get frozen sessions from backend API
    let frozenCount = 0;
    try {
      const frozenResponse = await fetch(`${PYTHON_BACKEND_URL}/api/admin/sessions/list`, {
        signal: AbortSignal.timeout(5000),
      });
      if (frozenResponse.ok) {
        const frozenData = await frozenResponse.json();
        if (frozenData.success && frozenData.sessions) {
          frozenCount = frozenData.counts?.frozen || 0;
        }
      }
    } catch (error) {
      console.error('Error fetching frozen sessions:', error);
    }

    const lowStockWarnings = {
      total: stockOverview.total,
      unused: stockOverview.unused,
      assigned: stockOverview.assigned,
      banned: stockOverview.banned,
      frozen: frozenCount,
    };

    // Get failed adbots (stopped with errors)
    const { data: failedAdbots } = await supabase
      .from('adbots')
      .select('id, user_id, status')
      .eq('status', 'FAILED')
      .limit(10);

    // Check system health
    const pythonBackendHealthy = await checkPythonBackendHealth();
    
    const { error: dbError } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    const systemHealth = {
      database: dbError ? 'down' : 'healthy',
      pythonBackend: pythonBackendHealthy ? 'healthy' : 'down',
      payments: 'healthy', // TODO: Add actual payment gateway health check
    };

    return NextResponse.json({
      success: true,
      data: {
        totalSales,
        activeAdbots: currentlyActiveAdbots,
        overallActiveAdbots,
        recentlyActiveAdbots,
        expiredAdbots,
        totalResellers: totalResellers || 0,
        revenueChart,
        lowStockWarnings,
        failedAdbots: failedAdbots || [],
        systemHealth,
        dateRange, // Return selected date range
      },
    });
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}


