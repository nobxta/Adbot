'use client';

import { useState } from 'react';
import Image from "next/image";
import { 
  Rocket, 
  PanelLeft, 
  Zap, 
  BarChart3, 
  Award, 
  Gem, 
  Star, 
  Crown, 
  Check,
  Menu,
  X
} from "lucide-react";
import { GridVignetteBackground } from "@/components/ui/vignette-grid-background";
import Pricing from "@/components/ui/pricing-component";

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activePlanType, setActivePlanType] = useState<'starter' | 'enterprise'>('starter');
  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: '#05070F' }}>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-6" style={{ backgroundColor: 'rgba(5, 7, 15, 0.8)', backdropFilter: 'blur(10px)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <a href="/" className="flex items-center">
              <Image
                src="/logo.png"
                alt="HQAdz"
                width={120}
                height={40}
                className="h-8 sm:h-10 w-auto"
                priority
              />
            </a>
          </div>
          <div className="hidden lg:flex items-center gap-8">
            <a href="#features" className="text-sm font-semibold transition-colors" style={{ color: '#E5E7EB' }} onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} onMouseLeave={(e) => e.currentTarget.style.color = '#E5E7EB'}>
              Features
            </a>
            <a href="#pricing" className="text-sm font-semibold transition-colors" style={{ color: '#E5E7EB' }} onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} onMouseLeave={(e) => e.currentTarget.style.color = '#E5E7EB'}>
              Pricing
            </a>
            <a href="#pricing" className="text-sm font-semibold transition-colors" style={{ color: '#E5E7EB' }} onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} onMouseLeave={(e) => e.currentTarget.style.color = '#E5E7EB'}>
              Get Started →
            </a>
          </div>
          <button
            className="lg:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ color: '#E5E7EB' }}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-4 pb-4 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}>
            <div className="flex flex-col gap-4 pt-4">
              <a 
                href="#features" 
                className="text-sm font-semibold transition-colors px-2 py-2" 
                style={{ color: '#E5E7EB' }}
                onClick={() => setMobileMenuOpen(false)}
                onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} 
                onMouseLeave={(e) => e.currentTarget.style.color = '#E5E7EB'}
              >
                Features
              </a>
              <a 
                href="#pricing" 
                className="text-sm font-semibold transition-colors px-2 py-2" 
                style={{ color: '#E5E7EB' }}
                onClick={() => setMobileMenuOpen(false)}
                onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} 
                onMouseLeave={(e) => e.currentTarget.style.color = '#E5E7EB'}
              >
                Pricing
              </a>
              <a 
                href="#pricing" 
                className="text-sm font-semibold transition-colors px-2 py-2" 
                style={{ color: '#E5E7EB' }}
                onClick={() => setMobileMenuOpen(false)}
                onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} 
                onMouseLeave={(e) => e.currentTarget.style.color = '#E5E7EB'}
              >
                Get Started →
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative h-screen w-full overflow-hidden flex items-center justify-center" style={{ backgroundColor: '#05070F' }}>
        {/* Grid Background */}
        <div className="absolute inset-0 z-0">
          <GridVignetteBackground
            className="opacity-80 absolute inset-0"
            x={50}
            y={50}
            intensity={100}
            horizontalVignetteSize={50}
            verticalVignetteSize={30}
            size={48}
          />
        </div>
        
        {/* Gradient Backgrounds */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80 h-screen"
        >
          <div
            style={{
              clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
              background: 'linear-gradient(to top right, oklch(0.7 0.15 280), oklch(0.6 0.2 320))'
            }}
            className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] max-w-none -translate-x-1/2 rotate-[30deg] opacity-60 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem] h-screen"
          />
        </div>
        
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)] h-screen"
        >
          <div
            style={{
              clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
              background: 'linear-gradient(to top right, oklch(0.7 0.15 280), oklch(0.6 0.2 320))'
            }}
            className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] max-w-none -translate-x-1/2 opacity-60 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem] h-screen"
          />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center pt-20 sm:pt-24">
          {/* Announcement Banner */}
          <div className="mb-4 sm:mb-6 flex justify-center">
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full backdrop-blur-sm" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <Rocket className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" style={{ color: '#CBD5E1' }} />
              <span className="text-xs sm:text-sm font-semibold" style={{ color: '#CBD5E1' }}>
                <span className="hidden sm:inline">First-Ever Live Control Panel for Telegram Adbot</span>
                <span className="sm:hidden">Live Control Panel</span>
              </span>
            </div>
          </div>

          {/* Main Title */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-4 sm:mb-6 leading-tight px-2">
            <span style={{ color: '#E5E7EB' }}>Amplify Your Reach with</span>
            <br />
            <span style={{ background: 'linear-gradient(135deg, oklch(0.7 0.15 280), oklch(0.6 0.2 320))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Telegram Adbot
            </span>
          </h1>

          {/* Description */}
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl mb-6 sm:mb-8 max-w-3xl mx-auto px-2" style={{ color: '#9CA3AF' }}>
            Share your messages to <span className="font-bold" style={{ color: '#4F6BFF' }}>thousands of groups</span> every second.
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            The most powerful Telegram advertisement tool with a live control panel.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center px-4">
            <button
              className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-xl transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
              style={{
                background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
                color: '#FFFFFF'
              }}
            >
              Purchase Adbot Now
            </button>
            <button
              className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-xl transition-all"
              style={{
                backgroundColor: 'rgba(10, 15, 30, 0.5)',
                color: '#CBD5E1',
                border: '1px solid rgba(255, 255, 255, 0.06)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(79, 107, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
              }}
            >
              View Control Panel
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-8 relative overflow-hidden" style={{ backgroundColor: '#05070F' }}>
        {/* Subtle background pattern */}
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              radial-gradient(circle at 20% 50%, rgba(79, 107, 255, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 80% 80%, rgba(106, 124, 255, 0.1) 0%, transparent 50%)
            `
          }}
        />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12 sm:mb-16 lg:mb-20">
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6" style={{ color: '#E5E7EB' }}>
              Powerful Features
            </h2>
            <p className="text-lg sm:text-xl md:text-2xl max-w-2xl mx-auto px-4" style={{ color: '#9CA3AF' }}>
              Everything you need to maximize your Telegram reach
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Feature Card 1 */}
            <div 
              className="group relative p-6 sm:p-8 rounded-2xl sm:rounded-3xl transition-all duration-300 transform hover:-translate-y-2 hover:scale-[1.02]"
              style={{ 
                backgroundColor: 'rgba(10, 15, 30, 0.5)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(79, 107, 255, 0.3)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(79, 107, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)';
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" style={{ background: 'linear-gradient(135deg, rgba(79, 107, 255, 0.1), transparent)' }}></div>
              <div className="relative z-10">
                <div className="w-12 h-12 sm:w-16 sm:h-16 mb-4 sm:mb-6 flex items-center justify-center rounded-xl sm:rounded-2xl transition-all duration-300 group-hover:scale-110" style={{ backgroundColor: 'rgba(79, 107, 255, 0.1)', border: '1px solid rgba(79, 107, 255, 0.2)' }}>
                  <PanelLeft className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: '#4F6BFF' }} />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4" style={{ color: '#E5E7EB' }}>
                  Live Control Panel
                </h3>
                <p className="text-sm sm:text-base leading-relaxed" style={{ color: '#9CA3AF' }}>
                  The first-ever website with a live control panel. Manage your ad campaigns in real-time with an intuitive interface.
                </p>
              </div>
            </div>

            {/* Feature Card 2 */}
            <div 
              className="group relative p-6 sm:p-8 rounded-2xl sm:rounded-3xl transition-all duration-300 transform hover:-translate-y-2 hover:scale-[1.02]"
              style={{ 
                backgroundColor: 'rgba(10, 15, 30, 0.5)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(79, 107, 255, 0.3)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(79, 107, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)';
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" style={{ background: 'linear-gradient(135deg, rgba(79, 107, 255, 0.1), transparent)' }}></div>
              <div className="relative z-10">
                <div className="w-12 h-12 sm:w-16 sm:h-16 mb-4 sm:mb-6 flex items-center justify-center rounded-xl sm:rounded-2xl transition-all duration-300 group-hover:scale-110" style={{ backgroundColor: 'rgba(79, 107, 255, 0.1)', border: '1px solid rgba(79, 107, 255, 0.2)' }}>
                  <Zap className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: '#4F6BFF' }} />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4" style={{ color: '#E5E7EB' }}>
                  Lightning Fast
                </h3>
                <p className="text-sm sm:text-base leading-relaxed" style={{ color: '#9CA3AF' }}>
                  Share your posts to thousands of groups every second. Scale your reach instantly according to your plan.
                </p>
              </div>
            </div>

            {/* Feature Card 3 */}
            <div 
              className="group relative p-6 sm:p-8 rounded-2xl sm:rounded-3xl transition-all duration-300 transform hover:-translate-y-2 hover:scale-[1.02] sm:col-span-2 lg:col-span-1"
              style={{ 
                backgroundColor: 'rgba(10, 15, 30, 0.5)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(79, 107, 255, 0.3)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(79, 107, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)';
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" style={{ background: 'linear-gradient(135deg, rgba(79, 107, 255, 0.1), transparent)' }}></div>
              <div className="relative z-10">
                <div className="w-12 h-12 sm:w-16 sm:h-16 mb-4 sm:mb-6 flex items-center justify-center rounded-xl sm:rounded-2xl transition-all duration-300 group-hover:scale-110" style={{ backgroundColor: 'rgba(79, 107, 255, 0.1)', border: '1px solid rgba(79, 107, 255, 0.2)' }}>
                  <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: '#4F6BFF' }} />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4" style={{ color: '#E5E7EB' }}>
                  Multiple Sessions
                </h3>
                <p className="text-sm sm:text-base leading-relaxed" style={{ color: '#9CA3AF' }}>
                  Run multiple accounts simultaneously. Each session can forward messages at optimized intervals for maximum efficiency.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-8 relative overflow-hidden" style={{ backgroundColor: '#05070F' }}>
        <Pricing activePlanType={activePlanType} onPlanTypeChange={setActivePlanType} />
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8" style={{ background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)' }}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6 px-2" style={{ color: '#FFFFFF' }}>
            Ready to Amplify Your Reach?
          </h2>
          <p className="text-lg sm:text-xl mb-6 sm:mb-8 px-4" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
            Join thousands of users who are already using HQAdz to maximize their Telegram advertising potential.
          </p>
          <button 
            className="px-8 sm:px-10 py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-xl transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
            style={{ 
              backgroundColor: '#FFFFFF',
              color: '#4F6BFF'
            }}
          >
            Get Started Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#05070F' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-6 sm:mb-8">
            <div>
              <a href="/" className="inline-block mb-4">
                <Image
                  src="/logo.png"
                  alt="HQAdz"
                  width={120}
                  height={40}
                  className="h-8 sm:h-10 w-auto"
                />
              </a>
              <p style={{ color: '#9CA3AF' }}>
                The first-ever Telegram Adbot with a live control panel. Amplify your reach today.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4" style={{ color: '#E5E7EB' }}>Quick Links</h4>
              <ul className="space-y-2">
                <li><a href="#features" className="transition-colors" style={{ color: '#9CA3AF' }} onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}>Features</a></li>
                <li><a href="#pricing" className="transition-colors" style={{ color: '#9CA3AF' }} onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}>Pricing</a></li>
                <li><a href="#" className="transition-colors" style={{ color: '#9CA3AF' }} onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}>Control Panel</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4" style={{ color: '#E5E7EB' }}>Support</h4>
              <ul className="space-y-2">
                <li><a href="#" className="transition-colors" style={{ color: '#9CA3AF' }} onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}>Documentation</a></li>
                <li><a href="#" className="transition-colors" style={{ color: '#9CA3AF' }} onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}>Contact Us</a></li>
                <li><a href="#" className="transition-colors" style={{ color: '#9CA3AF' }} onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'} onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}>FAQ</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 text-center" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <p style={{ color: '#9CA3AF' }}>
              © 2024 HQAdz. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
