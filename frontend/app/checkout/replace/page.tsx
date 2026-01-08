'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const CRYPTOS = [
  { id: 'BTC', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'ETH', name: 'Ethereum', symbol: 'ETH' },
  { id: 'SOL', name: 'Solana', symbol: 'SOL' },
  { id: 'LTC', name: 'Litecoin', symbol: 'LTC' },
  { id: 'USDT', name: 'Tether', symbol: 'USDT' },
];

export default function ReplaceAccountCheckout() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [bannedCount, setBannedCount] = useState(0);
  const [selectedCrypto, setSelectedCrypto] = useState<string>('');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const count = parseInt(searchParams.get('bannedCount') || '1');
    setBannedCount(count);
  }, [searchParams]);

  // Calculate replacement cost based on banned accounts count
  // Example: $10 per replacement account, with discounts for multiple
  const calculatePrice = () => {
    const basePrice = 10;
    if (bannedCount === 1) return basePrice;
    if (bannedCount === 2) return basePrice * 1.8; // 10% discount
    if (bannedCount >= 3) return basePrice * bannedCount * 0.85; // 15% discount
    return basePrice * bannedCount;
  };

  const price = calculatePrice();

  const handlePayment = async () => {
    if (!selectedCrypto) {
      alert('Please select a cryptocurrency');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: localStorage.getItem('userEmail') || '',
          planName: `Account Replacement (${bannedCount} account${bannedCount > 1 ? 's' : ''})`,
          planType: 'starter', // Replacement is always starter tier
          amount: price,
          currency: selectedCrypto,
          isReplacement: true,
          bannedAccountsCount: bannedCount,
        }),
      });

      const data = await response.json();
      if (data.error) {
        alert(data.error);
        setLoading(false);
        return;
      }

      setPaymentData(data);
    } catch (error) {
      console.error('Payment error:', error);
      alert('Failed to create payment');
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden" style={{ backgroundColor: '#000000' }}>
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
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link href="/dashboard">
            <Image
              src="/logo.png"
              alt="HQAdz"
              width={120}
              height={40}
              className="h-8 sm:h-10 w-auto"
            />
          </Link>
        </div>
        {/* Back Button */}
        <Link 
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium mb-8 transition-all duration-300 hover:gap-3 group"
          style={{ color: 'rgba(255, 255, 255, 0.6)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'}
        >
          <ArrowLeft className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          <div 
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 transition-all duration-300 hover:scale-110"
            style={{ 
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.1))',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              boxShadow: '0 8px 32px rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <AlertCircle className="w-10 h-10" style={{ color: '#ef4444' }} />
          </div>
          <h1 className="text-4xl font-bold mb-3 tracking-tight" style={{ color: '#FFFFFF' }}>
            Replace Banned Account{bannedCount > 1 ? 's' : ''}
          </h1>
          <p className="text-sm tracking-wide uppercase" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            Purchase replacement account{bannedCount > 1 ? 's' : ''} for your Adbot
          </p>
        </div>

        {/* Checkout Card */}
        <div 
          className="rounded-2xl p-8 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {!paymentData ? (
            <>
              {/* Order Summary */}
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-6 tracking-wide" style={{ color: '#FFFFFF' }}>Order Summary</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 rounded-xl" style={{ background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <span className="text-sm font-medium" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                      Replacement Account{bannedCount > 1 ? 's' : ''} ({bannedCount})
                    </span>
                    <span className="text-sm font-bold" style={{ color: '#FFFFFF' }}>
                      ${price.toFixed(2)} USD
                    </span>
                  </div>
                  {bannedCount > 1 && (
                    <div className="text-xs pt-3 border-t text-center" style={{ borderColor: 'rgba(255, 255, 255, 0.1)', color: 'rgba(255, 255, 255, 0.5)' }}>
                      {bannedCount >= 3 ? '15%' : '10%'} discount applied for multiple accounts
                    </div>
                  )}
                </div>
              </div>

              {/* Crypto Selection */}
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-6 tracking-wide" style={{ color: '#FFFFFF' }}>Select Payment Method</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {CRYPTOS.map((crypto) => (
                    <button
                      key={crypto.id}
                      onClick={() => setSelectedCrypto(crypto.id)}
                      className="p-5 rounded-xl text-left transition-all duration-300 hover:scale-105 active:scale-95 relative overflow-hidden group"
                      style={{
                        background: selectedCrypto === crypto.id
                          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08))'
                          : 'rgba(0, 0, 0, 0.4)',
                        border: selectedCrypto === crypto.id
                          ? '1px solid rgba(255, 255, 255, 0.2)'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: selectedCrypto === crypto.id
                          ? '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                          : 'none',
                      }}
                    >
                      <div 
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
                        }}
                      />
                      <div className="font-semibold relative z-10" style={{ color: '#FFFFFF' }}>{crypto.name}</div>
                      <div className="text-xs mt-1 relative z-10" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>{crypto.symbol}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Button */}
              <button
                onClick={handlePayment}
                disabled={!selectedCrypto || loading}
                className="w-full py-4 px-6 rounded-xl text-base font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative overflow-hidden group hover:scale-105 active:scale-95"
                style={{
                  background: !selectedCrypto || loading
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#FFFFFF',
                  boxShadow: !selectedCrypto || loading
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
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin relative z-10" />
                    <span className="relative z-10">Processing...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 relative z-10" />
                    <span className="relative z-10">Proceed to Payment</span>
                  </>
                )}
              </button>
            </>
          ) : (
            /* Payment Instructions */
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-semibold mb-2 tracking-tight" style={{ color: '#FFFFFF' }}>Payment Instructions</h2>
                <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                  Send the exact amount to the address below
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-3 tracking-wide" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Amount to Pay</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      readOnly
                      value={`${paymentData.paymentAmount} ${paymentData.paymentCurrency}`}
                      className="flex-1 px-5 py-4 rounded-xl text-sm font-mono"
                      style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#FFFFFF',
                      }}
                    />
                    <button
                      onClick={() => copyToClipboard(`${paymentData.paymentAmount} ${paymentData.paymentCurrency}`)}
                      className="px-6 py-4 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#FFFFFF',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3 tracking-wide" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Payment Address</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      readOnly
                      value={paymentData.paymentAddress}
                      className="flex-1 px-5 py-4 rounded-xl text-sm font-mono break-all"
                      style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#FFFFFF',
                      }}
                    />
                    <button
                      onClick={() => copyToClipboard(paymentData.paymentAddress)}
                      className="px-6 py-4 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#FFFFFF',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div 
                  className="p-5 rounded-xl"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.1), rgba(255, 152, 0, 0.05))',
                    border: '1px solid rgba(255, 193, 7, 0.2)',
                    boxShadow: '0 4px 12px rgba(255, 193, 7, 0.1)',
                  }}
                >
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                    <strong>⚠️ Important:</strong> After payment is confirmed, your replacement account will be activated automatically. 
                    You will receive a confirmation email with your new account details.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(-20px) translateX(10px); }
        }
      `}</style>
    </div>
  );
}

