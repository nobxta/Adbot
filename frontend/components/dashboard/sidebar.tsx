'use client';

import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  User, 
  History, 
  Settings, 
  Bell,
  LogOut
} from 'lucide-react';
import { useEffect, useState } from 'react';
import Image from 'next/image';

interface SidebarProps {
  onLogout: () => void;
  notificationCount?: number;
}

export default function Sidebar({ onLogout, notificationCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const navItems = [
    { 
      name: 'Dashboard', 
      icon: LayoutDashboard, 
      path: '/dashboard',
      description: 'Main overview'
    },
    { 
      name: 'Edit Adbot Profile', 
      icon: User, 
      path: '/dashboard/profile',
      description: 'Manage settings'
    },
    { 
      name: 'History', 
      icon: History, 
      path: '/dashboard/history',
      description: 'Activity logs'
    },
    { 
      name: 'Settings', 
      icon: Settings, 
      path: '/dashboard/settings',
      description: 'Adbot settings'
    },
    { 
      name: 'Notifications', 
      icon: Bell, 
      path: '/dashboard/notifications',
      description: 'Alerts & updates',
      badge: notificationCount > 0 ? notificationCount : undefined
    },
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname?.startsWith(path);
  };

  return (
    <aside 
      className="fixed left-0 top-0 h-full w-72 z-20 transition-all duration-500"
      style={{
        backgroundColor: '#000000',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px)',
        boxShadow: '4px 0 24px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Animated Background Glow */}
      <div 
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at left center, rgba(255, 255, 255, 0.03) 0%, transparent 70%)',
        }}
      />

      {/* Logo/Brand */}
      <div 
        className="p-8 border-b relative overflow-hidden"
        style={{ 
          borderColor: 'rgba(255, 255, 255, 0.08)',
        }}
      >
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent)',
            animation: 'shimmer 3s infinite',
          }}
        />
        <div className="flex items-center relative z-10">
          <a href="/dashboard" className="flex items-center">
            <Image
              src="/logo.png"
              alt="HQAdz"
              width={120}
              height={40}
              className="h-8 w-auto"
              priority
            />
          </a>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1 relative z-10">
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-300 relative group overflow-hidden ${
                mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
              }`}
              style={{
                transitionDelay: `${index * 50}ms`,
                backgroundColor: active 
                  ? 'rgba(255, 255, 255, 0.08)' 
                  : 'transparent',
                border: active 
                  ? '1px solid rgba(255, 255, 255, 0.12)' 
                  : '1px solid transparent',
                transform: active ? 'translateX(4px)' : 'translateX(0)',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.transform = 'translateX(0)';
                }
              }}
            >
              {/* Active Indicator */}
              {active && (
                <div 
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full transition-all duration-300"
                  style={{
                    background: 'linear-gradient(180deg, #FFFFFF, rgba(255, 255, 255, 0.5))',
                    boxShadow: '0 0 8px rgba(255, 255, 255, 0.3)',
                  }}
                />
              )}
              
              {/* Hover Glow */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.05) 0%, transparent 70%)',
                }}
              />

              <Icon 
                className="w-5 h-5 flex-shrink-0 relative z-10 transition-all duration-300" 
                style={{ 
                  color: active ? '#FFFFFF' : 'rgba(255, 255, 255, 0.6)',
                  transform: active ? 'scale(1.1)' : 'scale(1)',
                }} 
              />
              <div className="flex-1 min-w-0 relative z-10">
                <div 
                  className="text-sm font-medium truncate transition-colors duration-300"
                  style={{ color: active ? '#FFFFFF' : 'rgba(255, 255, 255, 0.8)' }}
                >
                  {item.name}
                </div>
                <div 
                  className="text-xs truncate mt-0.5 transition-colors duration-300"
                  style={{ color: active ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.4)' }}
                >
                  {item.description}
                </div>
              </div>
              {item.badge && (
                <span 
                  className="flex items-center justify-center min-w-[22px] h-5 px-2 rounded-full text-xs font-semibold relative z-10 animate-pulse"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#FFFFFF',
                    boxShadow: '0 0 12px rgba(239, 68, 68, 0.5)',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Logout Button */}
      <div 
        className="absolute bottom-0 left-0 right-0 p-4 border-t relative z-10"
        style={{ 
          borderColor: 'rgba(255, 255, 255, 0.08)',
          background: 'linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.5))',
        }}
      >
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-300 group relative overflow-hidden"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            e.currentTarget.style.transform = 'translateX(4px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
            e.currentTarget.style.transform = 'translateX(0)';
          }}
        >
          <div 
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.2) 0%, transparent 70%)',
            }}
          />
          <LogOut className="w-5 h-5 relative z-10" style={{ color: '#ef4444' }} />
          <span className="text-sm font-medium relative z-10" style={{ color: '#ef4444' }}>Logout</span>
        </button>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </aside>
  );
}
