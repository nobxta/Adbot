'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  Users,
  Bot,
  Package,
  Database,
  UserCheck,
  Bell,
  LogOut,
  Menu,
  X,
  Trash2,
  Users2,
} from 'lucide-react';
import QueuePopup from './QueuePopup';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Adbots', href: '/admin/adbots', icon: Bot },
  { name: 'Products', href: '/admin/products', icon: Package },
  { name: 'Stock', href: '/admin/stock', icon: Database },
  { name: 'Groups', href: '/admin/groups', icon: Users2 },
  { name: 'Resellers', href: '/admin/resellers', icon: UserCheck },
  { name: 'Notifications', href: '/admin/notifications', icon: Bell },
  { name: 'Cache', href: '/admin/cache', icon: Trash2 },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showQueuePopup, setShowQueuePopup] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');

    if (!token) {
      console.log('[AdminLayout] No token found, redirecting to /access');
      router.push('/access');
      return;
    }

    if (role !== 'ADMIN') {
      console.log('[AdminLayout] User role is not ADMIN:', role, '- redirecting to /access');
      // Clear invalid auth data
      localStorage.removeItem('accessToken');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userId');
      router.push('/access');
      return;
    }

    setIsAuthenticated(true);
    setIsLoading(false);

    // Check for queued adbots on admin login
    checkQueuedAdbots();
  }, [router]);

  const checkQueuedAdbots = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const response = await fetch('/api/admin/queue/list', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.count > 0) {
          // Show popup if there are queued adbots
          setShowQueuePopup(true);
        }
      }
    } catch (error) {
      console.error('Error checking queued adbots:', error);
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
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ backgroundColor: '#000000' }}
      >
        <div className="relative">
          <div 
            className="w-12 h-12 border-4 rounded-full animate-spin"
            style={{
              borderColor: 'rgba(59, 130, 246, 0.2)',
              borderTopColor: '#3B82F6',
            }}
          />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div
      className="min-h-screen w-full flex"
      style={{ backgroundColor: '#000000' }}
    >
      {/* Subtle Background Grid */}
      <div
        className="fixed inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Full Height */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-screen w-64 transform transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          background: 'rgba(10, 10, 10, 0.85)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div 
            className="relative p-6 border-b"
            style={{ 
              borderColor: 'rgba(255, 255, 255, 0.08)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo.png"
                  alt="HQAdz"
                  width={100}
                  height={33}
                  className="h-8 w-auto"
                  priority
                />
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-gray-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Admin Panel
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                    ${isActive
                      ? 'text-white'
                      : 'text-gray-400 hover:text-white'
                    }
                  `}
                  style={{
                    background: isActive 
                      ? 'rgba(59, 130, 246, 0.15)'
                      : 'transparent',
                    border: isActive 
                      ? '1px solid rgba(59, 130, 246, 0.3)' 
                      : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <Icon className={`w-5 h-5 relative z-10 ${isActive ? 'text-blue-400' : ''}`} />
                  <span className="font-medium relative z-10 text-sm">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Logout Button */}
          <div 
            className="p-4 border-t"
            style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}
          >
            <button
              onClick={handleLogout}
              className="w-full group relative flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#EF4444',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
              }}
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:ml-0 min-h-screen">
        {/* Mobile Header */}
        <header
          className="lg:hidden sticky top-0 z-30 border-b backdrop-blur-md"
          style={{
            background: 'rgba(10, 10, 10, 0.9)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
          }}
        >
          <div className="flex items-center justify-between p-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-400 hover:text-white transition-colors p-2"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Image
              src="/logo.png"
              alt="HQAdz"
              width={100}
              height={33}
              className="h-7 w-auto"
            />
            <div className="w-9" />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 relative z-10 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Queue Popup - Shows on every admin login if queued adbots exist */}
      {showQueuePopup && (
        <QueuePopup
          onClose={() => {
            setShowQueuePopup(false);
            // Re-check after closing to see if more queued adbots exist
            setTimeout(() => {
              checkQueuedAdbots();
            }, 1000);
          }}
        />
      )}
    </div>
  );
}