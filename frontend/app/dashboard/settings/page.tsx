'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/dashboard/sidebar';
import { Settings as SettingsIcon, Copy, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [botInfo, setBotInfo] = useState<{
    bot_id: string | null;
    access_code: string | null;
    plan_type: string | null;
    plan_name: string | null;
    last_login: string | null;
  }>({
    bot_id: null,
    access_code: null,
    plan_type: null,
    plan_name: null,
    last_login: null,
  });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');

    // Check role (case-insensitive - can be 'USER', 'user', etc.)
    if (!token || !role || role.toUpperCase() !== 'USER') {
      console.log('[Settings] Authentication check failed:', { token: !!token, role });
      router.push('/access');
      return;
    }

    setIsAuthenticated(true);
    setIsLoading(false);
    fetchBotInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const fetchBotInfo = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('[Settings] No token available for bot info');
        return;
      }

      const response = await fetch('/api/user/info', {
        headers: { 
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        console.error('[Settings] Authentication failed for bot info');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setBotInfo({
          bot_id: data.bot_id || null,
          access_code: data.access_code || null,
          plan_type: data.plan_type || null,
          plan_name: data.plan_name || null,
          last_login: data.last_login || null,
        });
      }
    } catch (err) {
      console.error('Error fetching bot info:', err);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Invalid date';
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    router.push('/access');
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

  return (
    <div className="min-h-screen w-full flex" style={{ backgroundColor: '#000000' }}>
      <Sidebar onLogout={handleLogout} />
      <div className="flex-1 ml-72 relative z-10">
        <header 
          className="sticky top-0 z-30 border-b backdrop-blur-xl transition-all duration-300"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
          }}
        >
          <div className="px-8 py-6">
            <h1 
              className={`text-3xl font-bold tracking-tight transition-all duration-300 ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
              }`}
              style={{ color: '#FFFFFF' }}
            >
              Settings
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
              Adbot specific settings
            </p>
          </div>
        </header>
        <main className="p-8">
          <div 
            className={`rounded-2xl p-8 relative overflow-hidden transition-all duration-500 ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="flex items-center gap-4 mb-8">
              <div 
                className="inline-flex items-center justify-center w-12 h-12 rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
              >
                <SettingsIcon className="w-6 h-6" style={{ color: '#FFFFFF' }} />
              </div>
              <h2 className="text-2xl font-semibold" style={{ color: '#FFFFFF' }}>Bot Settings</h2>
            </div>

            <div className="space-y-6">
              {/* Bot ID */}
              {botInfo.bot_id && (
                <div 
                  className="p-6 rounded-xl"
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                        Bot ID
                      </p>
                      <p className="text-lg font-mono" style={{ color: '#FFFFFF' }}>
                        {botInfo.bot_id}
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(botInfo.bot_id!, 'bot_id')}
                      className="p-2 rounded-lg transition-all duration-300 hover:scale-110"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {copied === 'bot_id' ? (
                        <CheckCircle2 className="w-5 h-5" style={{ color: '#22c55e' }} />
                      ) : (
                        <Copy className="w-5 h-5" style={{ color: 'rgba(255, 255, 255, 0.7)' }} />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Access Code */}
              {botInfo.access_code && (
                <div 
                  className="p-6 rounded-xl"
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                        Access Code
                      </p>
                      <p className="text-lg font-mono" style={{ color: '#FFFFFF' }}>
                        {botInfo.access_code}
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(botInfo.access_code!, 'access_code')}
                      className="p-2 rounded-lg transition-all duration-300 hover:scale-110"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {copied === 'access_code' ? (
                        <CheckCircle2 className="w-5 h-5" style={{ color: '#22c55e' }} />
                      ) : (
                        <Copy className="w-5 h-5" style={{ color: 'rgba(255, 255, 255, 0.7)' }} />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Plan Type/Name */}
              {(botInfo.plan_name || botInfo.plan_type) && (
                <div 
                  className="p-6 rounded-xl"
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                      Plan
                    </p>
                    <p className="text-lg font-semibold" style={{ color: '#FFFFFF' }}>
                      {botInfo.plan_name || (botInfo.plan_type ? botInfo.plan_type.charAt(0).toUpperCase() + botInfo.plan_type.slice(1) : 'N/A')}
                    </p>
                  </div>
                </div>
              )}

              {/* Last Login */}
              <div 
                className="p-6 rounded-xl"
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                    Last Login
                  </p>
                  <p className="text-lg" style={{ color: '#FFFFFF' }}>
                    {formatDate(botInfo.last_login)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
