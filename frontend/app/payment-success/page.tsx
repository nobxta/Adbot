'use client';

import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Mail, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('paymentId');
  const email = searchParams.get('email');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verify payment status
    if (paymentId) {
      fetch(`/api/payment/status?paymentId=${paymentId}`)
        .then(res => res.json())
        .then(data => {
          setLoading(false);
        })
        .catch(err => {
          console.error('Payment verification error:', err);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [paymentId]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#05070F' }}>
      <div className="max-w-2xl w-full bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-8 sm:p-12 text-center">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Image
              src="/logo.png"
              alt="HQAdz"
              width={120}
              height={40}
              className="h-8 sm:h-10 w-auto"
            />
          </Link>
        </div>
        {loading ? (
          <div style={{ color: '#9CA3AF' }}>Verifying payment...</div>
        ) : (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
              <CheckCircle2 className="w-12 h-12" style={{ color: '#22c55e' }} />
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: '#E5E7EB' }}>
              Payment Successful!
            </h1>
            
            <p className="text-lg mb-8" style={{ color: '#9CA3AF' }}>
              Thank you for your purchase. Your payment has been confirmed.
            </p>

            {email && (
              <div className="mb-8 p-6 rounded-xl border" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', borderColor: 'rgba(255, 255, 255, 0.06)' }}>
                <div className="flex items-center justify-center gap-3 mb-2">
                  <Mail className="w-5 h-5" style={{ color: '#4F6BFF' }} />
                  <span className="text-sm font-medium" style={{ color: '#CBD5E1' }}>Account Details Sent</span>
                </div>
                <p className="text-sm" style={{ color: '#9CA3AF' }}>
                  Your account information and login credentials have been sent to:
                </p>
                <p className="text-base font-medium mt-2" style={{ color: '#E5E7EB' }}>{email}</p>
              </div>
            )}

            {paymentId && (
              <div className="mb-8 p-4 rounded-lg" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)' }}>
                <p className="text-xs mb-1" style={{ color: '#9CA3AF' }}>Payment ID</p>
                <p className="text-sm font-mono" style={{ color: '#CBD5E1' }}>{paymentId}</p>
              </div>
            )}

            <div className="space-y-4">
              <p className="text-sm" style={{ color: '#9CA3AF' }}>
                Please check your email for account setup instructions and access to your control panel.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    style={{
                      borderColor: 'rgba(255, 255, 255, 0.06)',
                      color: '#CBD5E1',
                    }}
                  >
                    Back to Home
                  </Button>
                </Link>
                
                <Button
                  className="w-full sm:w-auto font-semibold text-white"
                  style={{
                    background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
                    boxShadow: '0 4px 20px rgba(79, 107, 255, 0.3)'
                  }}
                >
                  Access Control Panel
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

