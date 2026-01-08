'use client';

import { useState, useEffect } from 'react';
import { Lock, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function AccessPage() {
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!accessCode.trim()) {
        setError('Please enter an access code');
        setIsLoading(false);
        return;
      }

      // Verify access code via API
      const response = await fetch('/api/auth/verify-access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid access code');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Invalid access code');
      }

      const { accessToken, user, bot } = result;
      
      // Store authentication data
      localStorage.setItem('accessToken', accessToken);
      // Use bot.role if available (from new token format), otherwise user.role
      const userRole = bot?.role || user?.role || 'USER';
      localStorage.setItem('userRole', userRole);
      localStorage.setItem('userId', user?.id || bot?.id || '');

      console.log('[AccessPage] Login successful, role:', userRole);

      // Redirect based on user role
      if (userRole === 'ADMIN') {
        router.push('/admin');
      } else if (userRole === 'USER') {
        router.push('/dashboard');
      } else {
        throw new Error(`Unknown user role: ${userRole}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid access code. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen w-full flex items-center justify-center px-4 sm:px-6 lg:px-8 relative overflow-hidden"
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
          }}
        />

        {/* Particle Effect - Only render on client to avoid hydration mismatch */}
        {mounted && typeof window !== 'undefined' && (
          <div className="absolute inset-0" suppressHydrationWarning>
            {[...Array(30)].map((_, i) => {
              // Use a seeded random based on index to ensure consistency
              // Using a simple hash function for deterministic values
              const hash = (i * 9301 + 49297) % 233280;
              const random1 = hash / 233280;
              const hash2 = (i * 9301 + 49297 + 1) % 233280;
              const random2 = hash2 / 233280;
              const hash3 = (i * 9301 + 49297 + 2) % 233280;
              const random3 = hash3 / 233280;
              const hash4 = (i * 9301 + 49297 + 3) % 233280;
              const random4 = hash4 / 233280;
              
              return (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: random1 * 4 + 2 + 'px',
                    height: random2 * 4 + 2 + 'px',
                    left: random3 * 100 + '%',
                    top: random4 * 100 + '%',
                    background: 'rgba(255, 255, 255, 0.3)',
                    animation: `twinkle ${random1 * 3 + 2}s infinite`,
                    animationDelay: random2 * 2 + 's',
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className={`relative z-10 w-full max-w-md transition-all duration-500 ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}>
        {/* Logo/Branding */}
        <div className="text-center mb-10">
          <div className="mb-6 flex justify-center">
            <Image
              src="/logo.png"
              alt="HQAdz"
              width={180}
              height={60}
              className="h-12 sm:h-16 w-auto"
              priority
            />
          </div>
          <p className="text-sm sm:text-base tracking-wide uppercase" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            Adbot Control Panel
          </p>
        </div>

        {/* Access Card */}
        <div 
          className="rounded-2xl p-8 sm:p-10 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Glow Effect */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
              animation: 'pulse 3s infinite',
            }}
          />

          <div className="text-center mb-8 relative z-10">
            <h2 className="text-2xl sm:text-3xl font-semibold mb-2" style={{ color: '#FFFFFF' }}>
              Access Control Panel
            </h2>
            <p className="text-sm sm:text-base" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
              Enter your access code to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            {/* Access Code Input */}
            <div>
              <label 
                htmlFor="accessCode" 
                className="block text-sm font-medium mb-3 tracking-wide"
                style={{ color: 'rgba(255, 255, 255, 0.9)' }}
              >
                Access Code
              </label>
              <div className="relative">
                <input
                  id="accessCode"
                  type="text"
                  value={accessCode}
                  onChange={(e) => {
                    setAccessCode(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter your access code"
                  className="w-full px-5 py-4 rounded-xl text-sm sm:text-base transition-all duration-300 focus:outline-none"
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: error 
                      ? '1px solid rgba(239, 68, 68, 0.5)' 
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#FFFFFF',
                    boxShadow: error ? '0 0 16px rgba(239, 68, 68, 0.2)' : 'none',
                  }}
                  onFocus={(e) => {
                    if (!error) {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                      e.target.style.boxShadow = '0 0 16px rgba(255, 255, 255, 0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = error 
                      ? 'rgba(239, 68, 68, 0.5)' 
                      : 'rgba(255, 255, 255, 0.1)';
                    e.target.style.boxShadow = error ? '0 0 16px rgba(239, 68, 68, 0.2)' : 'none';
                  }}
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 mt-3 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="w-4 h-4" style={{ color: '#ef4444' }} />
                  <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !accessCode.trim()}
              className="w-full py-4 px-6 rounded-xl text-sm sm:text-base font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative overflow-hidden group hover:scale-105 active:scale-95"
              style={{
                background: isLoading || !accessCode.trim()
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#FFFFFF',
                boxShadow: isLoading || !accessCode.trim() 
                  ? 'none' 
                  : '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              }}
            >
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
                }}
              />
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin relative z-10" />
                  <span className="relative z-10">Verifying...</span>
                </>
              ) : (
                <>
                  <span className="relative z-10">Access Control Panel</span>
                  <ArrowRight className="w-5 h-5 relative z-10 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          {/* Help Text */}
          <div className="mt-8 text-center relative z-10">
            <p className="text-xs sm:text-sm" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Don't have an access code?{' '}
              <a 
                href="/contact" 
                className="font-medium hover:underline transition-colors duration-300"
                style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#FFFFFF'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'}
              >
                Contact Support
              </a>
            </p>
          </div>

          {/* Back to Home */}
          <div className="mt-4 text-center relative z-10">
            <a 
              href="/" 
              className="text-xs sm:text-sm font-medium hover:underline transition-colors duration-300 inline-flex items-center gap-2"
              style={{ color: 'rgba(255, 255, 255, 0.5)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)'}
            >
              ← Back to Home
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.3)' }}>
            © 2024 HQAdz. All rights reserved.
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(-20px) translateX(10px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
