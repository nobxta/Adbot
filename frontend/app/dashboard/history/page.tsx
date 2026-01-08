'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/dashboard/sidebar';
import { History, FileText, Clock } from 'lucide-react';

export default function HistoryPage() {
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
      console.log('[History] Authentication check failed:', { token: !!token, role });
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
              History
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
              Logs of Adbot activity
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
                <History className="w-6 h-6" style={{ color: '#FFFFFF' }} />
              </div>
              <h2 className="text-2xl font-semibold" style={{ color: '#FFFFFF' }}>Activity Logs</h2>
            </div>
            <div className="space-y-4">
              <div 
                className="flex items-center gap-4 p-6 rounded-xl transition-all duration-300 hover:scale-[1.02]"
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div 
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <FileText className="w-5 h-5" style={{ color: 'rgba(255, 255, 255, 0.8)' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1" style={{ color: '#FFFFFF' }}>Activity logs will appear here</p>
                  <p className="text-xs flex items-center gap-2" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                    <Clock className="w-3 h-3" />
                    Messages sent, status changes, and other activities
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
