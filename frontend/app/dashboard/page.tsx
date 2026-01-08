'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Bot, 
  Play, 
  Pause, 
  Activity, 
  MessageSquare, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  TrendingUp,
  FileText,
  ExternalLink,
  Sparkles,
  Edit3,
  Eye,
  EyeOff,
  Database,
  Clock,
  Users,
  Key,
  Zap,
  Shield,
  Crown,
  Gem,
  Award,
  Star
} from 'lucide-react';
import Sidebar from '@/components/dashboard/sidebar';
import EditAdvertisement from '@/components/dashboard/edit-advertisement';
import { getPlanBadge, formatPlanName } from './plan-helpers';

type GroupType = 'instagram-marketplace' | 'instagram' | 'telegram' | 'fraud-discussion' | 'developer-market';

interface DashboardStats {
  messagesSent: number;
  failedMessages: number;
  messagesThisWeek: number;
  planValidityDays: number;
  estimatedTraffic: number;
  groupsReached: number;
  uptimeHours: number;
  status: 'active' | 'inactive';
}

export default function Dashboard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    messagesSent: 0,
    failedMessages: 0,
    messagesThisWeek: 0,
    planValidityDays: 30,
    estimatedTraffic: 0,
    groupsReached: 0,
    uptimeHours: 0,
    status: 'inactive',
  });
  const [postLink, setPostLink] = useState('');
  const [postLinkValid, setPostLinkValid] = useState<boolean | null>(null);
  const [validatingPost, setValidatingPost] = useState(false);
  const [selectedGroupType, setSelectedGroupType] = useState<GroupType | ''>('');
  const [accountBanned, setAccountBanned] = useState(false);
  const [bannedAccountsCount, setBannedAccountsCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [showEditAd, setShowEditAd] = useState(false);
  const [advertisementConfig, setAdvertisementConfig] = useState<{
    postLink?: string;
    customText?: string;
    type?: 'link' | 'text';
  }>({});
  const [botInfo, setBotInfo] = useState<{
    bot_id: string | null;
    access_code: string | null;
    plan_type: string | null;
    plan_name: string | null;
    adbot_id: string | null;
    sessions_count?: number;
    posting_interval_minutes?: number;
    valid_until?: string | null;
    product?: any;
  }>({
    bot_id: null,
    access_code: null,
    plan_type: null,
    plan_name: null,
    adbot_id: null,
    sessions_count: 0,
    posting_interval_minutes: 0,
    valid_until: null,
    product: null,
  });
  const [showAccessCode, setShowAccessCode] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    
    // Check if user is authenticated
    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');
    const userId = localStorage.getItem('userId');

    console.log('[Dashboard] Auth check on mount:', { 
      hasToken: !!token, 
      role, 
      userId,
      tokenLength: token?.length 
    });

    // Check role (case-insensitive - can be 'USER', 'user', etc.)
    if (!token || !role || role.toUpperCase() !== 'USER') {
      console.log('[Dashboard] Authentication check failed:', { 
        token: !!token, 
        role,
        tokenValue: token ? `${token.substring(0, 20)}...` : 'null',
        timestamp: new Date().toISOString(),
      });
      // Don't redirect immediately - wait a bit to avoid race conditions during page load
      const redirectTimer = setTimeout(() => {
        // Double-check before redirecting (in case token was set in another tab/window)
        const recheckToken = localStorage.getItem('accessToken');
        const recheckRole = localStorage.getItem('userRole');
        if (!recheckToken || !recheckRole || recheckRole.toUpperCase() !== 'USER') {
          console.log('[Dashboard] Final auth check failed, redirecting to login');
          router.push('/access');
        } else {
          console.log('[Dashboard] Auth check passed on recheck, staying on dashboard');
          setIsAuthenticated(true);
          setIsLoading(false);
          if (recheckToken && userId) {
            fetchUserData(userId);
          }
        }
      }, 500);
      return () => clearTimeout(redirectTimer);
    }

    setIsAuthenticated(true);
    setIsLoading(false);

    // Fetch user stats and data
    if (userId) {
      fetchUserData(userId);
      fetchBotInfo();
    }

    // Auto-refresh validity and stats every 60 seconds
    const refreshInterval = setInterval(() => {
      if (userId) {
        fetchUserData(userId);
      }
    }, 60000); // Refresh every 60 seconds

    // Scroll handler for parallax effects
    const handleScroll = () => {
      if (mainRef.current) {
        setScrollY(mainRef.current.scrollTop);
      }
    };

    const mainElement = mainRef.current;
    if (mainElement) {
      mainElement.addEventListener('scroll', handleScroll);
    }

    return () => {
      clearInterval(refreshInterval);
      if (mainElement) {
        mainElement.removeEventListener('scroll', handleScroll);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount, not on every router change

  const fetchBotInfo = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('[Dashboard] No token available for bot info');
        return;
      }

      const response = await fetch('/api/user/info', {
        headers: { 
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        console.error('[Dashboard] Authentication failed for bot info');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setBotInfo({
          bot_id: data.bot_id || null,
          access_code: data.access_code || null,
          plan_type: data.plan_type || null,
          plan_name: data.plan_name || null,
          adbot_id: data.adbot_id || null,
          sessions_count: data.sessions_count || 0,
          posting_interval_minutes: data.posting_interval_minutes || 0,
          valid_until: data.valid_until || null,
          product: data.product || null,
        });
      }
    } catch (err) {
      console.error('Error fetching bot info:', err);
    }
  };

  const fetchUserData = async (userId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('[Dashboard] No token available for API calls');
        return;
      }

      const statsRes = await fetch('/api/user/stats', {
        headers: { 
          'x-user-id': userId,
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (statsRes.status === 401 || statsRes.status === 403) {
        console.error('[Dashboard] Authentication failed for stats API');
        handleLogout();
        return;
      }

      const statsData = await statsRes.json();
      
      if (!statsData.error) {
        setStats({
          messagesSent: statsData.messagesSent || 0,
          failedMessages: statsData.failedMessages || 0,
          messagesThisWeek: statsData.messagesThisWeek || 0,
          planValidityDays: statsData.planValidityDays ?? 0, // Use nullish coalescing, no default to 30
          estimatedTraffic: statsData.estimatedTraffic || 0,
          groupsReached: statsData.groupsReached || 0,
          uptimeHours: statsData.uptimeHours || 0,
          status: statsData.status || 'inactive',
        });
      }

      const userRes = await fetch(`/api/user/status?userId=${userId}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (userRes.status === 401 || userRes.status === 403) {
        console.error('[Dashboard] Authentication failed for status API');
        handleLogout();
        return;
      }

      const userData = await userRes.json();
      
      if (!userData.error) {
        setAccountBanned(userData.accountBanned || false);
        setBannedAccountsCount(userData.bannedAccountsCount || 0);
        setNotificationCount(userData.notificationCount || 0);
      }

      // Fetch advertisement configuration
      const adRes = await fetch(`/api/user/advertisement?userId=${userId}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (adRes.status === 401 || adRes.status === 403) {
        console.error('[Dashboard] Authentication failed for advertisement API');
        handleLogout();
        return;
      }

      const adData = await adRes.json();
      
      if (!adData.error && adData.config) {
        setAdvertisementConfig(adData.config);
        if (adData.config.postLink) {
          setPostLink(adData.config.postLink);
        } else if (adData.config.customText) {
          // For custom text, we don't set postLink but keep it in config
          setPostLink('');
        }
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
      // Don't logout on network errors, only on auth errors
    }
  };

  const handleSaveAdvertisement = async (data: { postLink?: string; customText?: string; type: 'link' | 'text' }) => {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('accessToken');
    if (!userId || !token) {
      console.error('[Dashboard] Missing userId or token for save advertisement');
      return;
    }

    try {
      const response = await fetch('/api/user/advertisement', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (response.status === 401 || response.status === 403) {
        console.error('[Dashboard] Authentication failed for save advertisement');
        handleLogout();
        return;
      }

      const result = await response.json();
      if (!result.error) {
        // Use the response config if available, otherwise use the data we sent
        const savedConfig = result.config || data;
        setAdvertisementConfig(savedConfig);
        if (savedConfig.postLink) {
          setPostLink(savedConfig.postLink);
        } else if (savedConfig.customText) {
          // For custom text, clear postLink input
          setPostLink('');
        }
        
        // Refresh from server to ensure we have the persisted version
        setTimeout(async () => {
          try {
            const refreshRes = await fetch(`/api/user/advertisement?userId=${userId}`, {
              headers: { 
                'Authorization': `Bearer ${token}`,
              },
            });
            const refreshData = await refreshRes.json();
            if (!refreshData.error && refreshData.config) {
              setAdvertisementConfig(refreshData.config);
              if (refreshData.config.postLink) {
                setPostLink(refreshData.config.postLink);
              } else if (refreshData.config.customText) {
                setPostLink('');
              }
            }
          } catch (err) {
            console.error('Error refreshing ad config:', err);
          }
        }, 300);
      }
    } catch (err) {
      console.error('Error saving advertisement:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    router.push('/access');
  };

  const validatePostLink = async (link: string) => {
    if (!link.trim()) {
      setPostLinkValid(null);
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.error('[Dashboard] No token for validate post link');
      return;
    }

    setValidatingPost(true);
    try {
      const response = await fetch('/api/bot/validate-post', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ postLink: link }),
      });

      if (response.status === 401 || response.status === 403) {
        console.error('[Dashboard] Authentication failed for validate post');
        handleLogout();
        return;
      }
      
      const data = await response.json();
      setPostLinkValid(data.valid || false);
    } catch (err) {
      console.error('Error validating post link:', err);
      setPostLinkValid(false);
    } finally {
      setValidatingPost(false);
    }
  };

  const handlePostLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPostLink(value);
    
    const timeoutId = setTimeout(() => {
      if (value.trim()) {
        validatePostLink(value);
      } else {
        setPostLinkValid(null);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  };

  const [botStatus, setBotStatus] = useState<{
    frozen_state?: boolean;
    suspended_state?: boolean;
    deleted_state?: boolean;
    frozen_reason?: string | null;
    suspend_reason?: string | null;
  }>({});

  useEffect(() => {
    // Fetch bot status on mount
    const fetchBotStatus = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        const response = await fetch('/api/user/info', {
          headers: { 
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setBotStatus({
            frozen_state: data.frozen_state || false,
            suspended_state: data.suspended_state || false,
            deleted_state: data.deleted_state || false,
            frozen_reason: data.frozen_reason || null,
            suspend_reason: data.suspend_reason || null,
          });
        }
      } catch (err) {
        console.error('Error fetching bot status:', err);
      }
    };

    fetchBotStatus();
  }, []);

  const toggleBot = async () => {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('accessToken');
    if (!userId || !token) {
      console.error('[Dashboard] Missing userId or token for toggle bot');
      return;
    }

    // STATUS ENFORCEMENT: Check if bot can be started/stopped
    if (botStatus.deleted_state) {
      alert('This bot has been deleted and cannot be controlled. Please contact support.');
      return;
    }
    if (botStatus.frozen_state) {
      alert(`This bot is frozen and cannot be controlled. Reason: ${botStatus.frozen_reason || 'Frozen by admin'}. Please contact support.`);
      return;
    }
    if (botStatus.suspended_state) {
      alert(`This bot is suspended and cannot be controlled. Reason: ${botStatus.suspend_reason || 'Suspended by admin'}. Please contact support.`);
      return;
    }

    const newStatus = stats.status === 'active' ? 'inactive' : 'active';
    
    try {
      // Use the proper adbot start/stop endpoints
      const adbotId = botInfo.adbot_id;
      
      if (!adbotId) {
        alert('Adbot ID not found. Please refresh the page.');
        return;
      }
      
      if (newStatus === 'active') {
        // Start adbot
        const response = await fetch(`/api/adbots/${adbotId}/start`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.status === 401 || response.status === 403) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.error) {
            alert(errorData.error);
          }
          console.error('[Dashboard] Authentication failed for bot control');
          handleLogout();
          return;
        }

        const data = await response.json();
        if (data.error) {
          alert(data.error);
        } else {
          setStats(prev => ({ ...prev, status: 'active' }));
          // Refresh status to get latest state
          fetchBotInfo();
        }
      } else {
        // Stop adbot
        const response = await fetch(`/api/adbots/${adbotId}/stop`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.status === 401 || response.status === 403) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.error) {
            alert(errorData.error);
          }
          console.error('[Dashboard] Authentication failed for bot control');
          handleLogout();
          return;
        }

        const data = await response.json();
        if (data.error) {
          alert(data.error);
        } else {
          setStats(prev => ({ ...prev, status: 'inactive' }));
        }
      }
    } catch (err) {
      console.error('Error toggling bot:', err);
      alert('Failed to toggle bot. Please try again.');
    }
  };

  const handleReplaceAccount = () => {
    router.push(`/checkout/replace?bannedCount=${bannedAccountsCount}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ backgroundColor: '#000000' }}>
        <div className="relative">
          <div className="w-12 h-12 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <div className="absolute inset-0 w-12 h-12 border-2 border-transparent border-r-white rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const groupTypes: { value: GroupType; label: string }[] = [
    { value: 'instagram-marketplace', label: 'Instagram Marketplace' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'telegram', label: 'Telegram' },
    { value: 'fraud-discussion', label: 'Fraud Discussion Groups' },
    { value: 'developer-market', label: 'Developer Market' },
  ];

  return (
    <div 
      className="min-h-screen w-full flex"
      style={{ backgroundColor: '#000000' }}
    >
      {/* Animated Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Gradient Orbs */}
        <div 
          className="absolute top-0 -left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 animate-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
            animation: 'float 6s ease-in-out infinite',
          }}
        />
        <div 
          className="absolute bottom-0 -right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, transparent 70%)',
            animation: 'float 8s ease-in-out infinite',
            animationDelay: '2s',
          }}
        />
        
        {/* Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
            transform: `translateY(${scrollY * 0.5}px)`,
          }}
        />

        {/* Particle Effect */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: Math.random() * 4 + 2 + 'px',
                height: Math.random() * 4 + 2 + 'px',
                left: Math.random() * 100 + '%',
                top: Math.random() * 100 + '%',
                background: 'rgba(255, 255, 255, 0.3)',
                animation: `twinkle ${Math.random() * 3 + 2}s infinite`,
                animationDelay: Math.random() * 2 + 's',
              }}
            />
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <Sidebar onLogout={handleLogout} notificationCount={notificationCount} />

      {/* Main Content */}
      <div className="flex-1 ml-72 relative z-10">
        {/* Top Header */}
        <header 
          className="sticky top-0 z-30 border-b backdrop-blur-xl transition-all duration-300"
          style={{
            backgroundColor: scrollY > 20 ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.4)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            boxShadow: scrollY > 20 ? '0 4px 24px rgba(0, 0, 0, 0.5)' : 'none',
          }}
        >
          <div className="px-8 py-6">
            <h1 
              className={`text-3xl font-bold tracking-tight transition-all duration-300 ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
              }`}
              style={{ color: '#FFFFFF' }}
            >
              Dashboard
            </h1>
            <p 
              className={`text-sm mt-2 transition-all duration-300 ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
              }`}
              style={{ 
                color: 'rgba(255, 255, 255, 0.6)',
                transitionDelay: '100ms',
              }}
            >
              Main overview of Adbot activity
            </p>
          </div>
        </header>

        {/* Main Content Area */}
        <main 
          ref={mainRef}
          className="h-[calc(100vh-120px)] overflow-y-auto"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255, 255, 255, 0.1) transparent',
          }}
        >
          <div className="p-8 space-y-8">
            {/* Status Notifications */}
            {botStatus.deleted_state && (
              <div 
                className={`rounded-2xl p-6 border-2 relative overflow-hidden transition-all duration-500 ${
                  mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
                style={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.05))',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  boxShadow: '0 8px 32px rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
              >
                <div 
                  className="absolute inset-0 opacity-20"
                  style={{
                    background: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.3) 0%, transparent 70%)',
                    animation: 'pulse 2s infinite',
                  }}
                />
                <div className="flex items-start gap-4 relative z-10">
                  <XCircle className="w-6 h-6 flex-shrink-0 animate-pulse" style={{ color: '#ef4444' }} />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2" style={{ color: '#FFFFFF' }}>
                      Adbot Deleted
                    </h3>
                    <p className="text-sm mb-4 leading-relaxed" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                      Your Adbot has been deleted by an administrator. You cannot start, stop, or modify it. 
                      Please contact support if you believe this is an error.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {botStatus.frozen_state && !botStatus.deleted_state && (
              <div 
                className={`rounded-2xl p-6 border-2 relative overflow-hidden transition-all duration-500 ${
                  mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
                style={{
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05))',
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                  boxShadow: '0 8px 32px rgba(59, 130, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
              >
                <div 
                  className="absolute inset-0 opacity-20"
                  style={{
                    background: 'radial-gradient(circle at center, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
                    animation: 'pulse 2s infinite',
                  }}
                />
                <div className="flex items-start gap-4 relative z-10">
                  <AlertCircle className="w-6 h-6 flex-shrink-0 animate-pulse" style={{ color: '#3b82f6' }} />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2" style={{ color: '#FFFFFF' }}>
                      Adbot Frozen
                    </h3>
                    <p className="text-sm mb-2 leading-relaxed" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                      Your Adbot is currently frozen by an administrator. You cannot start, stop, or modify it.
                    </p>
                    {botStatus.frozen_reason && (
                      <p className="text-sm mb-4 leading-relaxed font-medium" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                        Reason: {botStatus.frozen_reason}
                      </p>
                    )}
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                      Please contact support for assistance.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {botStatus.suspended_state && !botStatus.deleted_state && !botStatus.frozen_state && (
              <div 
                className={`rounded-2xl p-6 border-2 relative overflow-hidden transition-all duration-500 ${
                  mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
                style={{
                  background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.1), rgba(234, 88, 12, 0.05))',
                  borderColor: 'rgba(249, 115, 22, 0.3)',
                  boxShadow: '0 8px 32px rgba(249, 115, 22, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
              >
                <div 
                  className="absolute inset-0 opacity-20"
                  style={{
                    background: 'radial-gradient(circle at center, rgba(249, 115, 22, 0.3) 0%, transparent 70%)',
                    animation: 'pulse 2s infinite',
                  }}
                />
                <div className="flex items-start gap-4 relative z-10">
                  <Pause className="w-6 h-6 flex-shrink-0 animate-pulse" style={{ color: '#f97316' }} />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2" style={{ color: '#FFFFFF' }}>
                      Adbot Suspended
                    </h3>
                    <p className="text-sm mb-2 leading-relaxed" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                      Your Adbot is currently suspended by an administrator. You cannot start, stop, or modify it.
                    </p>
                    {botStatus.suspend_reason && (
                      <p className="text-sm mb-4 leading-relaxed font-medium" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                        Reason: {botStatus.suspend_reason}
                      </p>
                    )}
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                      Please contact support to appeal or resolve this issue.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Account Ban Notification */}
            {accountBanned && (
              <div 
                className={`rounded-2xl p-6 border-2 relative overflow-hidden transition-all duration-500 ${
                  mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
                style={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.05))',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  boxShadow: '0 8px 32px rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
              >
                <div 
                  className="absolute inset-0 opacity-20"
                  style={{
                    background: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.3) 0%, transparent 70%)',
                    animation: 'pulse 2s infinite',
                  }}
                />
                <div className="flex items-start gap-4 relative z-10">
                  <AlertCircle className="w-6 h-6 flex-shrink-0 animate-pulse" style={{ color: '#ef4444' }} />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2" style={{ color: '#FFFFFF' }}>
                      Account Banned
                    </h3>
                    <p className="text-sm mb-4 leading-relaxed" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                      Your AdBot account has been banned by Telegram. Please replace it. Your subscription is still active. 
                      You must buy a new account within 7 days or your AdBot access will be terminated by moderators.
                    </p>
                    <button
                      onClick={handleReplaceAccount}
                      className="px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-105 active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#FFFFFF',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      Add New Account
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modern Enhanced Dashboard */}
            {(() => {
              const planBadge = getPlanBadge(botInfo.plan_name, botInfo.plan_type);
              const PlanIcon = planBadge.icon;
              const planDisplayName = formatPlanName(botInfo.plan_name, botInfo.plan_type);
              const successRate = stats.messagesSent > 0 
                ? Math.round(((stats.messagesSent - stats.failedMessages) / stats.messagesSent) * 100) 
                : 0;
              
              return (
                <div className="space-y-8">
                  {/* Hero Section - Enhanced Glassmorphism */}
                  <div 
                    className={`rounded-3xl p-8 lg:p-10 relative overflow-hidden transition-all duration-700 ${
                      mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                    }`}
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 50%, rgba(255, 255, 255, 0.02) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      boxShadow: `
                        0 20px 60px rgba(0, 0, 0, 0.6),
                        0 0 0 1px rgba(255, 255, 255, 0.05) inset,
                        0 1px 0 rgba(255, 255, 255, 0.2) inset
                      `,
                      backdropFilter: 'blur(24px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                    }}
                  >
                    {/* Animated Background Gradient */}
                    <div 
                      className="absolute inset-0 opacity-30"
                      style={{
                        background: stats.status === 'active'
                          ? 'radial-gradient(ellipse at top left, rgba(34, 197, 94, 0.2) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(59, 130, 246, 0.15) 0%, transparent 50%)'
                          : 'radial-gradient(ellipse at top left, rgba(255, 255, 255, 0.05) 0%, transparent 50%)',
                        animation: stats.status === 'active' ? 'pulse 4s ease-in-out infinite' : 'none',
                      }}
                    />
                    
                    {/* Shimmer Effect */}
                    <div 
                      className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-1000"
                      style={{
                        background: 'linear-gradient(110deg, transparent 40%, rgba(255, 255, 255, 0.1) 50%, transparent 60%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 3s infinite',
                      }}
                    />

                    <div className="relative z-10">
                      {/* Top Row: Status, Plan, Actions - Enhanced */}
                      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 mb-10">
                        {/* Left: Status & Plan Info */}
                        <div className="flex flex-wrap items-center gap-6 flex-1">
                          {/* Enhanced Status Indicator */}
                          <div className="flex flex-col items-center gap-4 group">
                            <div 
                              className={`relative inline-flex items-center justify-center w-24 h-24 rounded-3xl transition-all duration-700 group-hover:scale-110 ${
                                stats.status === 'active' ? 'animate-pulse' : ''
                              }`}
                              style={{
                                background: stats.status === 'active'
                                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.3) 0%, rgba(22, 163, 74, 0.2) 50%, rgba(34, 197, 94, 0.15) 100%)'
                                  : 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.05) 100%)',
                                border: `2px solid ${stats.status === 'active' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(255, 255, 255, 0.2)'}`,
                                boxShadow: stats.status === 'active'
                                  ? `
                                    0 0 40px rgba(34, 197, 94, 0.5),
                                    0 8px 32px rgba(0, 0, 0, 0.4),
                                    inset 0 1px 0 rgba(255, 255, 255, 0.3),
                                    inset 0 -1px 0 rgba(0, 0, 0, 0.2)
                                  `
                                  : `
                                    0 8px 32px rgba(0, 0, 0, 0.4),
                                    inset 0 1px 0 rgba(255, 255, 255, 0.2),
                                    inset 0 -1px 0 rgba(0, 0, 0, 0.2)
                                  `,
                              }}
                            >
                              <Bot 
                                className="w-12 h-12 transition-all duration-500 group-hover:rotate-12" 
                                style={{ 
                                  color: stats.status === 'active' ? '#22c55e' : 'rgba(255, 255, 255, 0.8)',
                                  filter: stats.status === 'active' 
                                    ? 'drop-shadow(0 0 16px rgba(34, 197, 94, 0.8)) drop-shadow(0 0 8px rgba(34, 197, 94, 0.6))' 
                                    : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                                }} 
                              />
                              {stats.status === 'active' && (
                                <>
                                  <div 
                                    className="absolute -inset-2 rounded-3xl opacity-60"
                                    style={{
                                      background: 'radial-gradient(circle, rgba(34, 197, 94, 0.5) 0%, transparent 70%)',
                                      animation: 'ripple 2s infinite',
                                    }}
                                  />
                                  <div 
                                    className="absolute -inset-4 rounded-3xl opacity-30"
                                    style={{
                                      background: 'radial-gradient(circle, rgba(34, 197, 94, 0.3) 0%, transparent 70%)',
                                      animation: 'ripple 2s infinite',
                                      animationDelay: '0.5s',
                                    }}
                                  />
                                </>
                              )}
                            </div>
                            <div className="flex flex-col items-center gap-2">
                              <div 
                                className={`w-3 h-3 rounded-full transition-all duration-500 ${
                                  stats.status === 'active' ? 'animate-pulse' : ''
                                }`}
                                style={{
                                  backgroundColor: stats.status === 'active' ? '#22c55e' : 'rgba(255, 255, 255, 0.6)',
                                  boxShadow: stats.status === 'active' 
                                    ? '0 0 16px rgba(34, 197, 94, 1), 0 0 8px rgba(34, 197, 94, 0.8)' 
                                    : '0 0 4px rgba(255, 255, 255, 0.3)',
                                }}
                              />
                              <span 
                                className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full"
                                style={{ 
                                  color: stats.status === 'active' ? '#22c55e' : 'rgba(255, 255, 255, 0.7)',
                                  background: stats.status === 'active' 
                                    ? 'rgba(34, 197, 94, 0.15)' 
                                    : 'rgba(255, 255, 255, 0.05)',
                                  border: `1px solid ${stats.status === 'active' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                                }}
                              >
                                {stats.status === 'active' ? 'Running' : 'Stopped'}
                              </span>
                            </div>
                          </div>

                          {/* Enhanced Plan Badge */}
                          {(botInfo.plan_name || botInfo.plan_type) && (
                            <div 
                              className="flex-1 rounded-2xl p-6 border relative overflow-hidden group hover:scale-105 transition-all duration-500 min-w-[280px]"
                              style={{
                                background: `linear-gradient(135deg, ${planBadge.bgColor} 0%, rgba(0, 0, 0, 0.4) 100%)`,
                                borderColor: planBadge.borderColor,
                                borderWidth: '2px',
                                boxShadow: `
                                  0 12px 32px rgba(0, 0, 0, 0.5),
                                  inset 0 1px 0 ${planBadge.borderColor},
                                  0 0 30px ${planBadge.borderColor}50,
                                  inset 0 -1px 0 rgba(0, 0, 0, 0.3)
                                `,
                              }}
                            >
                              {/* Animated gradient overlay */}
                              <div 
                                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                style={{
                                  background: `linear-gradient(135deg, ${planBadge.borderColor}20 0%, transparent 100%)`,
                                }}
                              />
                              <div className="flex items-center gap-5 relative z-10">
                                <div 
                                  className="w-16 h-16 rounded-2xl flex items-center justify-center relative group-hover:rotate-12 transition-transform duration-500"
                                  style={{ 
                                    background: planBadge.gradient,
                                    boxShadow: `
                                      0 8px 24px ${planBadge.borderColor}80,
                                      inset 0 1px 0 rgba(255, 255, 255, 0.3),
                                      inset 0 -1px 0 rgba(0, 0, 0, 0.2)
                                    `,
                                  }}
                                >
                                  <PlanIcon className="w-8 h-8 transition-all duration-500 group-hover:scale-110" style={{ color: planBadge.textColor }} />
                                  <div 
                                    className="absolute inset-0 rounded-2xl opacity-50"
                                    style={{
                                      background: `radial-gradient(circle, ${planBadge.textColor}40 0%, transparent 70%)`,
                                      animation: 'pulse 2s infinite',
                                    }}
                                  />
                                </div>
                                <div className="flex-1">
                                  <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-70" style={{ color: '#FFFFFF' }}>
                                    Current Plan
                                  </p>
                                  <p className="text-3xl font-bold tracking-tight" style={{ 
                                    color: planBadge.textColor,
                                    textShadow: `0 2px 8px ${planBadge.borderColor}60`,
                                  }}>
                                    {planDisplayName}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Enhanced Validity Card */}
                          <div 
                            className="rounded-2xl p-6 border min-w-[160px] group hover:scale-105 transition-all duration-500 relative overflow-hidden"
                            style={{
                              background: stats.planValidityDays <= 7 
                                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.1) 50%, rgba(239, 68, 68, 0.05) 100%)'
                                : stats.planValidityDays <= 30
                                ? 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(234, 88, 12, 0.1) 50%, rgba(249, 115, 22, 0.05) 100%)'
                                : 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.08) 50%, rgba(59, 130, 246, 0.05) 100%)',
                              borderColor: stats.planValidityDays <= 7 
                                ? 'rgba(239, 68, 68, 0.5)'
                                : stats.planValidityDays <= 30
                                ? 'rgba(249, 115, 22, 0.5)'
                                : 'rgba(59, 130, 246, 0.4)',
                              borderWidth: '2px',
                              boxShadow: `
                                0 8px 24px rgba(0, 0, 0, 0.4),
                                inset 0 1px 0 rgba(255, 255, 255, 0.2),
                                0 0 20px ${stats.planValidityDays <= 7 
                                  ? 'rgba(239, 68, 68, 0.3)' 
                                  : stats.planValidityDays <= 30
                                  ? 'rgba(249, 115, 22, 0.3)'
                                  : 'rgba(59, 130, 246, 0.3)'}
                              `,
                            }}
                          >
                            <div className="flex flex-col items-center gap-3 relative z-10">
                              <div 
                                className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:rotate-12 transition-transform duration-500"
                                style={{
                                  background: stats.planValidityDays <= 7 
                                    ? 'rgba(239, 68, 68, 0.2)'
                                    : stats.planValidityDays <= 30
                                    ? 'rgba(249, 115, 22, 0.2)'
                                    : 'rgba(59, 130, 246, 0.2)',
                                  border: `1px solid ${stats.planValidityDays <= 7 
                                    ? 'rgba(239, 68, 68, 0.4)' 
                                    : stats.planValidityDays <= 30
                                    ? 'rgba(249, 115, 22, 0.4)'
                                    : 'rgba(59, 130, 246, 0.4)'}`,
                                }}
                              >
                                <Calendar className="w-6 h-6" style={{ 
                                  color: stats.planValidityDays <= 7 ? '#ef4444' : stats.planValidityDays <= 30 ? '#f97316' : '#3b82f6',
                                }} />
                              </div>
                              <div className="text-center">
                                <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-70" style={{ color: '#FFFFFF' }}>
                                  Validity
                                </p>
                                <p className="text-3xl font-bold mb-1" style={{ 
                                  color: stats.planValidityDays <= 7 ? '#ef4444' : stats.planValidityDays <= 30 ? '#f97316' : '#3b82f6',
                                  textShadow: `0 2px 8px ${stats.planValidityDays <= 7 
                                    ? 'rgba(239, 68, 68, 0.5)' 
                                    : stats.planValidityDays <= 30
                                    ? 'rgba(249, 115, 22, 0.5)'
                                    : 'rgba(59, 130, 246, 0.5)'}`,
                                }}>
                                  {stats.planValidityDays}
                                </p>
                                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                                  {stats.planValidityDays === 1 ? 'day' : 'days'} left
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Enhanced Action Buttons */}
                        <div className="flex items-center gap-4">
                          <button
                            onClick={toggleBot}
                            disabled={accountBanned || botStatus.deleted_state || botStatus.frozen_state || botStatus.suspended_state}
                            className="flex items-center gap-3 px-10 py-5 rounded-2xl text-base font-bold transition-all duration-500 hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 relative overflow-hidden group"
                            style={{
                              background: stats.status === 'active'
                                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.3) 0%, rgba(220, 38, 38, 0.2) 50%, rgba(239, 68, 68, 0.15) 100%)'
                                : 'linear-gradient(135deg, rgba(34, 197, 94, 0.3) 0%, rgba(22, 163, 74, 0.2) 50%, rgba(34, 197, 94, 0.15) 100%)',
                              border: `2px solid ${stats.status === 'active' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 197, 94, 0.6)'}`,
                              color: '#FFFFFF',
                              boxShadow: `
                                0 12px 32px rgba(0, 0, 0, 0.5),
                                0 0 30px ${stats.status === 'active' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'},
                                inset 0 1px 0 rgba(255, 255, 255, 0.3),
                                inset 0 -1px 0 rgba(0, 0, 0, 0.2)
                              `,
                            }}
                          >
                            {/* Hover glow effect */}
                            <div 
                              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                              style={{
                                background: `radial-gradient(circle at center, ${stats.status === 'active' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'} 0%, transparent 70%)`,
                              }}
                            />
                            {stats.status === 'active' ? (
                              <>
                                <Pause className="w-6 h-6 relative z-10 transition-transform duration-500 group-hover:scale-125" />
                                <span className="relative z-10">Stop Bot</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-6 h-6 relative z-10 transition-transform duration-500 group-hover:scale-125" />
                                <span className="relative z-10">Start Bot</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setShowEditAd(true)}
                            className="flex items-center gap-2.5 px-7 py-5 rounded-2xl text-sm font-bold transition-all duration-500 hover:scale-110 active:scale-95 relative overflow-hidden group"
                            style={{
                              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.05) 100%)',
                              border: '2px solid rgba(255, 255, 255, 0.25)',
                              color: '#FFFFFF',
                              boxShadow: `
                                0 8px 24px rgba(0, 0, 0, 0.4),
                                inset 0 1px 0 rgba(255, 255, 255, 0.3),
                                inset 0 -1px 0 rgba(0, 0, 0, 0.2)
                              `,
                            }}
                          >
                            <div 
                              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                              style={{
                                background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.15) 0%, transparent 70%)',
                              }}
                            />
                            <Edit3 className="w-5 h-5 relative z-10 transition-transform duration-500 group-hover:rotate-12" />
                            <span className="relative z-10">Edit Ad</span>
                          </button>
                        </div>
                      </div>

                      {/* Information Grid - Two Column Layout */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column: Configuration & Identity */}
                        <div className="space-y-4">
                          <h3 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                            Configuration
                          </h3>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Enhanced Sessions Card */}
                            <div 
                              className="rounded-2xl p-6 border group hover:scale-105 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden"
                              style={{
                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(0, 0, 0, 0.4) 100%)',
                                borderColor: 'rgba(59, 130, 246, 0.3)',
                                borderWidth: '2px',
                                boxShadow: `
                                  0 8px 24px rgba(0, 0, 0, 0.4),
                                  inset 0 1px 0 rgba(255, 255, 255, 0.15),
                                  0 0 20px rgba(59, 130, 246, 0.2)
                                `,
                              }}
                            >
                              <div 
                                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                style={{
                                  background: 'radial-gradient(circle at center, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
                                }}
                              />
                              <div className="flex items-center gap-4 relative z-10">
                                <div 
                                  className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:rotate-12 transition-transform duration-500" 
                                  style={{ 
                                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.2))',
                                    border: '2px solid rgba(59, 130, 246, 0.4)',
                                    boxShadow: '0 4px 16px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                  }}
                                >
                                  <Users className="w-6 h-6" style={{ color: '#3b82f6' }} />
                                </div>
                                <div className="flex-1">
                                  <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-70" style={{ color: '#FFFFFF' }}>
                                    Sessions
                                  </p>
                                  <p className="text-3xl font-bold" style={{ 
                                    color: '#FFFFFF',
                                    textShadow: '0 2px 8px rgba(59, 130, 246, 0.4)',
                                  }}>
                                    {botInfo.sessions_count || 0}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Enhanced Posting Interval Card */}
                            <div 
                              className="rounded-2xl p-6 border group hover:scale-105 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden"
                              style={{
                                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, rgba(0, 0, 0, 0.4) 100%)',
                                borderColor: 'rgba(168, 85, 247, 0.3)',
                                borderWidth: '2px',
                                boxShadow: `
                                  0 8px 24px rgba(0, 0, 0, 0.4),
                                  inset 0 1px 0 rgba(255, 255, 255, 0.15),
                                  0 0 20px rgba(168, 85, 247, 0.2)
                                `,
                              }}
                            >
                              <div 
                                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                style={{
                                  background: 'radial-gradient(circle at center, rgba(168, 85, 247, 0.15) 0%, transparent 70%)',
                                }}
                              />
                              <div className="flex items-center gap-4 relative z-10">
                                <div 
                                  className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:rotate-12 transition-transform duration-500" 
                                  style={{ 
                                    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(147, 51, 234, 0.2))',
                                    border: '2px solid rgba(168, 85, 247, 0.4)',
                                    boxShadow: '0 4px 16px rgba(168, 85, 247, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                  }}
                                >
                                  <Clock className="w-6 h-6" style={{ color: '#a855f7' }} />
                                </div>
                                <div className="flex-1">
                                  <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-70" style={{ color: '#FFFFFF' }}>
                                    Interval
                                  </p>
                                  <p className="text-3xl font-bold mb-1" style={{ 
                                    color: '#FFFFFF',
                                    textShadow: '0 2px 8px rgba(168, 85, 247, 0.4)',
                                  }}>
                                    {botInfo.posting_interval_minutes || 0}
                                  </p>
                                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                                    minutes
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Enhanced Access Code Card */}
                            {botInfo.access_code && (
                              <div 
                                className="rounded-2xl p-6 border group hover:scale-105 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden sm:col-span-2"
                                style={{
                                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(0, 0, 0, 0.4) 100%)',
                                  borderColor: 'rgba(34, 197, 94, 0.3)',
                                  borderWidth: '2px',
                                  boxShadow: `
                                    0 8px 24px rgba(0, 0, 0, 0.4),
                                    inset 0 1px 0 rgba(255, 255, 255, 0.15),
                                    0 0 20px rgba(34, 197, 94, 0.2)
                                  `,
                                }}
                              >
                                <div 
                                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                  style={{
                                    background: 'radial-gradient(circle at center, rgba(34, 197, 94, 0.15) 0%, transparent 70%)',
                                  }}
                                />
                                <div className="flex items-center gap-4 relative z-10">
                                  <div 
                                    className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:rotate-12 transition-transform duration-500" 
                                    style={{ 
                                      background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.2))',
                                      border: '2px solid rgba(34, 197, 94, 0.4)',
                                      boxShadow: '0 4px 16px rgba(34, 197, 94, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                    }}
                                  >
                                    <Key className="w-6 h-6" style={{ color: '#22c55e' }} />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-xs font-bold uppercase tracking-widest mb-3 opacity-70" style={{ color: '#FFFFFF' }}>
                                      Access Code
                                    </p>
                                    <div className="flex items-center gap-4">
                                      <p className="text-2xl font-bold font-mono tracking-widest" style={{ 
                                        color: '#FFFFFF',
                                        textShadow: '0 2px 8px rgba(34, 197, 94, 0.4)',
                                      }}>
                                        {showAccessCode ? botInfo.access_code : '••••-••••-••••'}
                                      </p>
                                      <button
                                        onClick={() => setShowAccessCode(!showAccessCode)}
                                        className="p-3 rounded-xl hover:bg-white/10 transition-all duration-500 hover:scale-110 hover:rotate-12 group/btn"
                                        style={{ 
                                          color: 'rgba(255, 255, 255, 0.9)',
                                          background: 'rgba(255, 255, 255, 0.08)',
                                          border: '1px solid rgba(255, 255, 255, 0.15)',
                                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                                        }}
                                        title={showAccessCode ? 'Hide' : 'Show'}
                                      >
                                        {showAccessCode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Bot ID */}
                            {botInfo.bot_id && (
                              <div 
                                className="rounded-xl p-5 border group hover:scale-105 transition-all duration-300 sm:col-span-2"
                                style={{
                                  background: 'rgba(0, 0, 0, 0.4)',
                                  borderColor: 'rgba(255, 255, 255, 0.12)',
                                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ 
                                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1))',
                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                  }}>
                                    <Database className="w-5 h-5" style={{ color: '#3b82f6' }} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                                      Bot ID
                                    </p>
                                    <p className="text-sm font-mono truncate" style={{ color: '#FFFFFF' }}>
                                      {botInfo.bot_id}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right Column: Performance Metrics */}
                        <div className="space-y-4">
                          <h3 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                            Performance
                          </h3>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Enhanced Total Messages Sent */}
                            <div 
                              className="rounded-2xl p-6 border group hover:scale-105 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden"
                              style={{
                                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.18) 0%, rgba(22, 163, 74, 0.1) 100%)',
                                borderColor: 'rgba(34, 197, 94, 0.4)',
                                borderWidth: '2px',
                                boxShadow: `
                                  0 8px 24px rgba(0, 0, 0, 0.4),
                                  inset 0 1px 0 rgba(255, 255, 255, 0.2),
                                  0 0 25px rgba(34, 197, 94, 0.25)
                                `,
                              }}
                            >
                              <div 
                                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                style={{
                                  background: 'radial-gradient(circle at center, rgba(34, 197, 94, 0.2) 0%, transparent 70%)',
                                }}
                              />
                              <div className="flex items-center gap-4 relative z-10">
                                <div 
                                  className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:rotate-12 transition-transform duration-500" 
                                  style={{ 
                                    background: 'rgba(34, 197, 94, 0.25)',
                                    border: '2px solid rgba(34, 197, 94, 0.5)',
                                    boxShadow: '0 4px 16px rgba(34, 197, 94, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                                  }}
                                >
                                  <MessageSquare className="w-6 h-6" style={{ color: '#22c55e' }} />
                                </div>
                                <div className="flex-1">
                                  <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-70" style={{ color: '#FFFFFF' }}>
                                    Total Sent
                                  </p>
                                  <p className="text-3xl font-bold" style={{ 
                                    color: '#22c55e',
                                    textShadow: '0 2px 8px rgba(34, 197, 94, 0.5)',
                                  }}>
                                    {stats.messagesSent.toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Failed Messages */}
                            <div 
                              className="rounded-xl p-5 border group hover:scale-105 transition-all duration-300"
                              style={{
                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.08))',
                                borderColor: 'rgba(239, 68, 68, 0.3)',
                                borderWidth: '2px',
                                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                              }}
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ 
                                  background: 'rgba(239, 68, 68, 0.2)',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                }}>
                                  <XCircle className="w-5 h-5" style={{ color: '#ef4444' }} />
                                </div>
                                <div className="flex-1">
                                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                                    Failed
                                  </p>
                                  <p className="text-2xl font-bold" style={{ color: '#ef4444' }}>
                                    {stats.failedMessages.toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Success Rate */}
                            <div 
                              className="rounded-xl p-5 border group hover:scale-105 transition-all duration-300 sm:col-span-2"
                              style={{
                                background: 'rgba(0, 0, 0, 0.4)',
                                borderColor: 'rgba(255, 255, 255, 0.12)',
                                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ 
                                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1))',
                                    border: '1px solid rgba(34, 197, 94, 0.3)',
                                  }}>
                                    <Activity className="w-5 h-5" style={{ color: '#22c55e' }} />
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                                      Success Rate
                                    </p>
                                    <p className="text-2xl font-bold" style={{ color: '#FFFFFF' }}>
                                      {stats.messagesSent > 0 
                                        ? Math.round(((stats.messagesSent - stats.failedMessages) / stats.messagesSent) * 100) 
                                        : 0}%
                                    </p>
                                  </div>
                                </div>
                                {stats.messagesSent > 0 && (
                                  <div className="flex-1 max-w-[200px]">
                                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.1)' }}>
                                      <div 
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                          width: `${Math.round(((stats.messagesSent - stats.failedMessages) / stats.messagesSent) * 100)}%`,
                                          background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                                          boxShadow: '0 0 12px rgba(34, 197, 94, 0.5)',
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Messages This Week */}
                            <div 
                              className="rounded-xl p-5 border group hover:scale-105 transition-all duration-300 sm:col-span-2"
                              style={{
                                background: 'rgba(0, 0, 0, 0.4)',
                                borderColor: 'rgba(255, 255, 255, 0.12)',
                                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ 
                                  background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(234, 88, 12, 0.1))',
                                  border: '1px solid rgba(249, 115, 22, 0.3)',
                                }}>
                                  <TrendingUp className="w-5 h-5" style={{ color: '#f97316' }} />
                                </div>
                                <div className="flex-1">
                                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                                    This Week
                                  </p>
                                  <p className="text-2xl font-bold" style={{ color: '#FFFFFF' }}>
                                    {stats.messagesThisWeek.toLocaleString()}
                                  </p>
                                  <p className="text-xs font-medium" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                                    messages sent
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Real-time Metrics Grid */}
            {(stats.status === 'active' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { label: 'Total Messages Sent', value: stats.messagesSent, icon: MessageSquare, color: '#FFFFFF' },
                  { label: 'Failed Messages', value: stats.failedMessages, icon: XCircle, color: '#ef4444' },
                  { label: 'Messages This Week', value: stats.messagesThisWeek, icon: Calendar, color: '#FFFFFF' },
                  { label: 'Plan Validity', value: `${stats.planValidityDays} days`, icon: Calendar, color: '#FFFFFF', subtext: 'remaining' },
                  { label: 'Estimated Traffic', value: stats.estimatedTraffic, icon: TrendingUp, color: '#FFFFFF' },
                  { label: 'Overall Performance', value: `${stats.messagesSent > 0 ? Math.round(((stats.messagesSent - stats.failedMessages) / stats.messagesSent) * 100) : 0}%`, icon: Activity, color: '#22c55e', subtext: 'success rate' },
                ].map((metric, index) => (
                  <div
                    key={metric.label}
                    className={`rounded-2xl p-6 relative overflow-hidden transition-all duration-500 hover:scale-105 ${
                      mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                    }`}
                    style={{
                      transitionDelay: `${(index + 1) * 100}ms`,
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                        {metric.label}
                      </h3>
                      <metric.icon className="w-5 h-5" style={{ color: metric.color, opacity: 0.6 }} />
                    </div>
                    <p className="text-3xl font-bold mb-1" style={{ color: '#FFFFFF' }}>
                      {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                    </p>
                    {metric.subtext && (
                      <p className="text-xs mt-1" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                        {metric.subtext}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: 'Total Messages Sent', value: stats.messagesSent, icon: MessageSquare },
                  { label: 'Plan Validity', value: `${stats.planValidityDays} days`, icon: Calendar, subtext: 'remaining' },
                  { label: 'Groups Reached', value: stats.groupsReached, icon: Activity },
                ].map((metric, index) => (
                  <div
                    key={metric.label}
                    className={`rounded-2xl p-6 relative overflow-hidden transition-all duration-500 hover:scale-105 ${
                      mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                    }`}
                    style={{
                      transitionDelay: `${(index + 1) * 100}ms`,
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                        {metric.label}
                      </h3>
                      <metric.icon className="w-5 h-5" style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
                    </div>
                    <p className="text-3xl font-bold mb-1" style={{ color: '#FFFFFF' }}>
                      {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                    </p>
                    {metric.subtext && (
                      <p className="text-xs mt-1" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                        {metric.subtext}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Edit Advertisement Modal */}
      <EditAdvertisement
        isOpen={showEditAd}
        onClose={() => setShowEditAd(false)}
        currentPostLink={advertisementConfig.postLink}
        currentCustomText={advertisementConfig.customText}
        onSave={handleSaveAdvertisement}
      />

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(-20px) translateX(10px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        @keyframes ripple {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}
