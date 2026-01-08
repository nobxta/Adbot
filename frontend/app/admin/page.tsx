'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Bot,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Activity,
  Database,
  UserCheck,
  Calendar,
  Filter,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardData {
  totalSales: {
    today: number;
    week: number;
    month: number;
    lifetime: number;
    filtered: number;
  };
  activeAdbots: number;
  overallActiveAdbots: number;
  recentlyActiveAdbots: number;
  expiredAdbots: number;
  totalResellers: number;
  revenueChart: Array<{ date: string; amount: number }>;
  lowStockWarnings: {
    total: number;
    unused: number;
    assigned: number;
    banned: number;
    frozen: number;
  };
  failedAdbots: Array<{ id: string; user_id: string; status: string }>;
  dateRange?: string;
  systemHealth?: {
    pythonBackend?: {
      status: string;
      scheduler_running: boolean;
      active_users: number;
      read_only_mode: boolean;
      error?: string | null;
    };
    database?: {
      status: string;
      error?: string | null;
    };
    botWorker?: {
      status: string;
      active_sessions: number;
      banned_sessions: number;
      last_cycle_time?: string | null;
      last_error?: string | null;
    };
    adbots?: {
      running: number;
      crashed: number;
    };
    scheduler?: {
      lag_seconds?: number | null;
      is_lagging: boolean;
    };
  };
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<string>('lifetime');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, [dateRange, customStartDate, customEndDate]);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      
      // Build query params for date range
      const params = new URLSearchParams();
      params.set('dateRange', dateRange);
      if (dateRange === 'custom' && customStartDate && customEndDate) {
        params.set('startDate', customStartDate);
        params.set('endDate', customEndDate);
      }
      
      const [dashboardRes, healthRes] = await Promise.all([
        fetch(`/api/admin/dashboard?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch('/api/admin/system/health', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      // Handle authentication errors - don't auto-logout, just show error
      if (dashboardRes.status === 401 || dashboardRes.status === 403) {
        // Don't auto-logout - just set error and let user decide
        setError('Authentication failed. Please refresh the page or log out and log in again.');
        setLoading(false);
        return;
      }

      if (!dashboardRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const dashboardResult = await dashboardRes.json();
      if (!dashboardResult.success) {
        throw new Error(dashboardResult.error || 'Failed to load dashboard');
      }

      if (healthRes.ok) {
        const healthResult = await healthRes.json();
        if (healthResult.success) {
          dashboardResult.data.systemHealth = healthResult.data;
        }
      }

      setData(dashboardResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (status: string) => {
    if (status === 'healthy') return '#10b981';
    if (status === 'degraded') return '#f59e0b';
    return '#ef4444';
  };

  const getHealthLabel = (status: string) => {
    if (status === 'healthy') return 'Healthy';
    if (status === 'degraded') return 'Degraded';
    if (status === 'down') return 'Down';
    return 'Unknown';
  };

  // Stat Card Component
  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    iconColor = '#3B82F6',
    subtitle,
  }: {
    title: string;
    value: string | number;
    icon: any;
    iconColor?: string;
    subtitle?: string;
  }) => (
    <div className="glass-card rounded-2xl p-6 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          {title}
        </h3>
        <Icon className="w-5 h-5" style={{ color: iconColor }} />
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {subtitle && (
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      )}
    </div>
  );

  // Section Card Component
  const SectionCard = ({ 
    title, 
    icon: Icon, 
    children 
  }: { 
    title: string; 
    icon: any; 
    children: React.ReactNode;
  }) => (
    <div className="glass-card rounded-2xl p-6">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
        <Icon className="w-5 h-5 text-blue-400" />
        {title}
      </h2>
      {children}
    </div>
  );

  // Loading Skeleton
  if (loading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 space-y-8">
        {/* Header Skeleton */}
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>

        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card rounded-2xl p-6">
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-8 w-32" />
            </div>
          ))}
        </div>

        {/* Section Cards Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="glass-card rounded-2xl p-6">
              <Skeleton className="h-6 w-48 mb-6" />
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-card rounded-2xl p-8 text-center max-w-md">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <p className="text-red-400 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
          Dashboard
        </h1>
        <p className="text-gray-400">Real-time platform metrics and system overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          title="Active Ad Bots"
          value={data.overallActiveAdbots}
          icon={Bot}
          iconColor="#3B82F6"
          subtitle="All purchased plans"
        />
        <StatCard
          title="Currently Active"
          value={data.activeAdbots}
          icon={Bot}
          iconColor="#10B981"
          subtitle={`${data.recentlyActiveAdbots} recently purchased`}
        />
        <StatCard
          title="Resellers"
          value={data.totalResellers}
          icon={UserCheck}
          iconColor="#8B5CF6"
        />
        <StatCard
          title="Lifetime Revenue"
          value={`$${data.totalSales.lifetime.toFixed(2)}`}
          icon={TrendingUp}
          iconColor="#F59E0B"
        />
      </div>

      {/* Sales Overview */}
      <SectionCard title="Sales Overview" icon={DollarSign}>
        {/* Date Range Filter */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Filter:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['today', 'week', 'month', 'lifetime'].map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  dateRange === range
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {range === 'today' ? 'Today' : range === 'week' ? 'This Week' : range === 'month' ? 'This Month' : 'Lifetime'}
              </button>
            ))}
            <button
              onClick={() => setDateRange('custom')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                dateRange === 'custom'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Custom
            </button>
          </div>
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-2 rounded-lg bg-white/5 text-white text-sm border border-white/10 focus:outline-none focus:border-blue-500"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-2 rounded-lg bg-white/5 text-white text-sm border border-white/10 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>

        {/* Sales Display */}
        <div className="mb-6">
          <div className="flex items-baseline gap-3">
            <p className="text-xs md:text-sm font-medium text-gray-400 uppercase tracking-wider">
              {dateRange === 'today' ? 'Today' : dateRange === 'week' ? 'This Week' : dateRange === 'month' ? 'This Month' : dateRange === 'custom' ? 'Custom Range' : 'Lifetime'} Sales
            </p>
            <p className="text-3xl md:text-4xl font-bold text-white">
              ${(dateRange === 'lifetime' ? data.totalSales.lifetime : data.totalSales.filtered).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 pt-4 border-t border-white/10">
          {[
            { label: 'Today', value: data.totalSales.today },
            { label: 'This Week', value: data.totalSales.week },
            { label: 'This Month', value: data.totalSales.month },
            { label: 'Lifetime', value: data.totalSales.lifetime },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-xs md:text-sm font-medium text-gray-400 mb-2 uppercase tracking-wider">
                {item.label}
              </p>
              <p className="text-xl md:text-2xl font-bold text-white">
                ${item.value.toFixed(2)}
              </p>
            </div>
          ))}
        </div>

        {/* Revenue Chart */}
        {data.revenueChart && data.revenueChart.length > 0 && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">
              Revenue Trend
            </h3>
            <div className="h-48 flex items-end gap-1">
              {data.revenueChart.map((item, index) => {
                const maxAmount = Math.max(...data.revenueChart.map(r => r.amount), 1);
                const height = (item.amount / maxAmount) * 100;
                return (
                  <div key={index} className="flex-1 flex flex-col items-center group">
                    <div
                      className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t transition-all hover:from-blue-400 hover:to-blue-300"
                      style={{ height: `${height}%`, minHeight: '4px' }}
                      title={`${item.date}: $${item.amount.toFixed(2)}`}
                    />
                    {data.revenueChart.length <= 30 && (
                      <span className="text-xs text-gray-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {new Date(item.date).getDate()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* System Health & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* System Health */}
        <SectionCard title="System Health" icon={Activity}>
          <div className="space-y-3">
            {/* Database */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
              <span className="text-gray-300 text-sm font-medium">Database</span>
              <span
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{
                  background: `${getHealthColor(data.systemHealth?.database?.status || 'unknown')}20`,
                  color: getHealthColor(data.systemHealth?.database?.status || 'unknown'),
                  border: `1px solid ${getHealthColor(data.systemHealth?.database?.status || 'unknown')}40`,
                }}
              >
                {getHealthLabel(data.systemHealth?.database?.status || 'unknown')}
              </span>
            </div>

            {/* Python Backend */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
              <span className="text-gray-300 text-sm font-medium">Python Backend</span>
              <div className="flex flex-col items-end gap-1">
                <span
                  className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: `${getHealthColor(data.systemHealth?.pythonBackend?.status || 'unknown')}20`,
                    color: getHealthColor(data.systemHealth?.pythonBackend?.status || 'unknown'),
                    border: `1px solid ${getHealthColor(data.systemHealth?.pythonBackend?.status || 'unknown')}40`,
                  }}
                >
                  {getHealthLabel(data.systemHealth?.pythonBackend?.status || 'unknown')}
                </span>
                {data.systemHealth?.pythonBackend?.error && (
                  <span className="text-xs text-red-400">{data.systemHealth.pythonBackend.error}</span>
                )}
              </div>
            </div>

            {/* Scheduler */}
            {data.systemHealth?.pythonBackend?.scheduler_running !== undefined && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                <span className="text-gray-300 text-sm font-medium">Scheduler</span>
                <span
                  className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: data.systemHealth.pythonBackend.scheduler_running ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: data.systemHealth.pythonBackend.scheduler_running ? '#10b981' : '#ef4444',
                    border: `1px solid ${data.systemHealth.pythonBackend.scheduler_running ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                  }}
                >
                  {data.systemHealth.pythonBackend.scheduler_running ? 'Running' : 'Stopped'}
                </span>
              </div>
            )}

            {/* Bot Worker */}
            {data.systemHealth?.botWorker && (
              <>
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <span className="text-gray-300 text-sm font-medium">Bot Worker</span>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{
                      background: `${getHealthColor(data.systemHealth.botWorker.status)}20`,
                      color: getHealthColor(data.systemHealth.botWorker.status),
                      border: `1px solid ${getHealthColor(data.systemHealth.botWorker.status)}40`,
                    }}
                  >
                    {getHealthLabel(data.systemHealth.botWorker.status)}
                  </span>
                </div>
                <div className="pl-4 space-y-2 text-sm bg-white/3 rounded-lg p-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Active Sessions:</span>
                    <span className="text-white font-semibold">{data.systemHealth.botWorker.active_sessions}</span>
                  </div>
                  {data.systemHealth.botWorker.last_cycle_time && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Last Cycle:</span>
                      <span className="text-white font-semibold">
                        {new Date(data.systemHealth.botWorker.last_cycle_time).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                  {data.systemHealth.scheduler?.is_lagging && (
                    <div className="text-xs text-yellow-400 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Scheduler lag: {Math.round(data.systemHealth.scheduler.lag_seconds || 0)}s
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </SectionCard>

        {/* Adbot Runtime Status */}
        <SectionCard title="Adbot Runtime Status" icon={Bot}>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
              <span className="text-gray-300 text-sm font-medium">Intended (DB)</span>
              <span className="text-white font-bold">{data.activeAdbots} active</span>
            </div>
            {data.systemHealth?.adbots ? (
              <>
                <div className="flex items-center justify-between p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <span className="text-gray-300 text-sm font-medium">Actually Running</span>
                  <span className="text-green-400 font-bold">{data.systemHealth.adbots.running}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <span className="text-gray-300 text-sm font-medium">Crashed/Failed</span>
                  <span className="text-red-400 font-bold">{data.systemHealth.adbots.crashed}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                <span className="text-gray-300 text-sm font-medium">Status Unknown</span>
                <span className="text-yellow-400 text-xs">Backend unavailable</span>
              </div>
            )}
            {(data.systemHealth?.adbots?.crashed ?? 0) > 0 && (
              <div className="mt-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400 flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  {data.systemHealth?.adbots?.crashed ?? 0} adbot(s) marked active but not running
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Stock Overview */}
        <SectionCard title="Stock Overview" icon={Database}>
          <div className="space-y-3">
            {[
              { label: 'Total Sessions', value: data.lowStockWarnings.total, color: 'text-white' },
              { label: 'Unused', value: data.lowStockWarnings.unused, color: 'text-green-400' },
              { label: 'Assigned', value: data.lowStockWarnings.assigned, color: 'text-blue-400' },
              { label: 'Banned', value: data.lowStockWarnings.banned, color: 'text-red-400', description: 'Not authorized, cannot connect' },
              { label: 'Frozen', value: data.lowStockWarnings.frozen, color: 'text-yellow-400', description: 'Read-only, cannot send messages' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                <div className="flex flex-col">
                  <span className="text-gray-300 text-sm font-medium">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-gray-500 mt-0.5">{item.description}</span>
                  )}
                </div>
                <span className={`font-bold ${item.color}`}>{item.value}</span>
              </div>
            ))}
            {data.lowStockWarnings.unused < 10 && (
              <div className="mt-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-sm text-yellow-400 flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  Low stock: Only {data.lowStockWarnings.unused} unused sessions remaining
                </p>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Failed Adbots */}
      {data.failedAdbots.length > 0 && (
        <SectionCard title={`Failed Adbots (${data.failedAdbots.length})`} icon={AlertTriangle}>
          <div className="space-y-2">
            {data.failedAdbots.map((adbot) => (
              <div
                key={adbot.id}
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/20"
              >
                <p className="text-sm text-white font-medium mb-1">
                  Adbot ID: <span className="font-mono text-red-400">{adbot.id}</span>
                </p>
                <p className="text-xs text-gray-400">User ID: {adbot.user_id}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}