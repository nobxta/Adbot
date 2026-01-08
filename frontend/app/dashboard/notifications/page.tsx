'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/dashboard/sidebar';
import { Bell, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function NotificationsPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');

    // Check role (case-insensitive - can be 'USER', 'user', etc.)
    if (!token || !role || role.toUpperCase() !== 'USER') {
      console.log('[Notifications] Authentication check failed:', { token: !!token, role });
      router.push('/access');
      return;
    }

    setIsAuthenticated(true);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

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
              Notifications
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
              Important alerts and updates
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
                <Bell className="w-6 h-6" style={{ color: '#FFFFFF' }} />
              </div>
              <h2 className="text-2xl font-semibold" style={{ color: '#FFFFFF' }}>Alerts</h2>
            </div>
            <div className="space-y-4">
              <div 
                className="flex items-start gap-4 p-6 rounded-xl transition-all duration-300 hover:scale-[1.02]"
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div 
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1))',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                  }}
                >
                  <CheckCircle2 className="w-5 h-5" style={{ color: '#22c55e' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1" style={{ color: '#FFFFFF' }}>No notifications</p>
                  <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>You're all caught up!</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
