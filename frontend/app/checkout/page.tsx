'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, Mail, CheckCircle2, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';

interface PlanData {
  name: string;
  price: string;
  pricePeriod?: string;
  priceAlt?: string;
  description: string;
  features: string[];
  planType: 'starter' | 'enterprise';
  productId?: string;
  actualPrice?: number; // Actual price from database
}

const CRYPTOS = [
  { id: 'BTC', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'ETH', name: 'Ethereum', symbol: 'ETH' },
  { id: 'SOL', name: 'Solana', symbol: 'SOL' },
  { id: 'LTC', name: 'Litecoin', symbol: 'LTC' },
  { id: 'USDT', name: 'Tether', symbol: 'USDT' },
];

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [step, setStep] = useState<'email' | 'payment'>('email');
  const [selectedCrypto, setSelectedCrypto] = useState<string>('');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'confirming' | 'paid'>('pending');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Get plan data from URL params
    const productId = searchParams.get('product_id');
    const planName = searchParams.get('plan');
    const planType = searchParams.get('type') as 'starter' | 'enterprise';
    const price = searchParams.get('price');
    const pricePeriod = searchParams.get('pricePeriod');
    const priceAlt = searchParams.get('priceAlt');
    const description = searchParams.get('description');
    const features = searchParams.get('features');

    // If product_id is provided, fetch from database (preferred)
    if (productId) {
      fetchProductFromDatabase(productId);
    } else if (planName && planType && price) {
      // Fallback to URL params (for backward compatibility)
      setPlanData({
        name: planName,
        price,
        pricePeriod: pricePeriod || undefined,
        priceAlt: priceAlt || undefined,
        description: description || '',
        features: features ? JSON.parse(decodeURIComponent(features)) : [],
        planType,
      });
    } else {
      router.push('/');
    }
  }, [searchParams, router]);

  const fetchProductFromDatabase = async (productId: string) => {
    try {
      const response = await fetch(`/api/products/public`);
      if (response.ok) {
        const result = await response.json();
        const product = result.data?.find((p: any) => p.id === productId);
        
        if (product) {
          const isEnterprise = product.plan_type === 'ENTERPRISE';
          let priceWeekly: number | undefined;
          let priceMonthly = product.price;
          
          // Parse weekly price from description if it exists
          if (isEnterprise && product.description?.includes('Weekly:')) {
            const weeklyMatch = product.description.match(/Weekly:\s*\$\s*(\d+)/);
            if (weeklyMatch) {
              priceWeekly = parseInt(weeklyMatch[1]);
            }
          }

          const intervalText = product.posting_interval_minutes >= 60
            ? `${product.posting_interval_minutes / 60} hour${product.posting_interval_minutes / 60 > 1 ? 's' : ''}`
            : `${product.posting_interval_minutes} minute${product.posting_interval_minutes > 1 ? 's' : ''}`;

          const features = [
            `${product.sessions_count} Account${product.sessions_count > 1 ? 's' : ''}`,
            `Sends every ${intervalText}`,
            ...(isEnterprise ? ['Priority Support'] : []),
            ...(product.sessions_count >= 3 ? ['2 Free Account Replacements'] : ['1 Free Account Replacement']),
          ];

          setPlanData({
            name: product.name,
            price: priceWeekly ? `$${priceWeekly}` : `$${priceMonthly}`,
            pricePeriod: priceWeekly ? '/week' : undefined,
            priceAlt: priceWeekly ? `$${priceMonthly}/month` : undefined,
            description: (product.description || '').split('|')[0].trim(),
            features,
            planType: isEnterprise ? 'enterprise' : 'starter',
            productId: product.id,
            actualPrice: priceMonthly, // Store actual database price
          });
        } else {
          router.push('/');
        }
      }
    } catch (error) {
      console.error('Error fetching product:', error);
      router.push('/');
    }
  };

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    setStep('payment');
  };

  const handleCryptoSelect = async (cryptoId: string) => {
    if (!planData) return;

    setSelectedCrypto(cryptoId);
    setLoading(true);

    try {
      // Use actual database price if available, otherwise parse from display price
      let amount: number;
      if (planData.actualPrice) {
        // Use database price (always monthly for now)
        amount = planData.actualPrice;
      } else {
        // Fallback: parse from display price
        const priceValue = parseFloat(planData.price.replace('$', '').replace(',', ''));
        // If it's weekly, convert to monthly (multiply by 4.33 for average weeks per month)
        amount = planData.pricePeriod === '/week' ? priceValue * 4.33 : priceValue;
      }

      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          product_id: planData.productId, // Include product_id if available
          planName: planData.name,
          planType: planData.planType,
          amount,
          currency: cryptoId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create payment');
      }

      const data = await response.json();
      setPaymentData(data);
      setPaymentStatus('pending');

      // Start polling for payment status
      if (data.paymentId) {
        startPaymentPolling(data.paymentId);
      }
    } catch (error: any) {
      console.error('Payment creation error:', error);
      alert(error.message || 'Failed to create payment. Please try again.');
      setLoading(false);
    }
  };

  const startPaymentPolling = (paymentId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/payment/status?paymentId=${paymentId}`);
        if (!response.ok) return;

        const data = await response.json();
        if (data.status === 'finished' || data.status === 'confirmed') {
          setPaymentStatus('paid');
          clearInterval(interval);
          // Redirect to success page or show success message
          setTimeout(() => {
            router.push(`/payment-success?paymentId=${paymentId}&email=${encodeURIComponent(email)}`);
          }, 2000);
        } else if (data.status === 'confirming') {
          setPaymentStatus('confirming');
        }
      } catch (error) {
        console.error('Payment status check error:', error);
      }
    }, 5000); // Check every 5 seconds

    // Clear interval after 30 minutes
    setTimeout(() => clearInterval(interval), 30 * 60 * 1000);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmPayment = async () => {
    if (!paymentData) return;

    setPaymentStatus('confirming');
    // The polling will handle status updates
  };

  if (!planData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#05070F' }}>
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const displayPrice = planData.pricePeriod 
    ? `${planData.price}${planData.pricePeriod}${planData.priceAlt ? ` (or ${planData.priceAlt})` : ''}`
    : `${planData.price}/month`;

  return (
      <div className="min-h-screen" style={{ backgroundColor: '#05070F' }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
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
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm mb-8 transition-colors"
          style={{ color: '#9CA3AF' }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#CBD5E1'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Pricing
        </Link>

        {/* Step 1: Email Collection */}
        {step === 'email' && (
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-8 sm:p-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(79, 107, 255, 0.1)' }}>
                <Mail className="w-6 h-6" style={{ color: '#4F6BFF' }} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold" style={{ color: '#E5E7EB' }}>
                Checkout
              </h1>
            </div>

            {/* Plan Summary */}
            <div className="mb-8 p-6 rounded-xl border" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', borderColor: 'rgba(255, 255, 255, 0.06)' }}>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#E5E7EB' }}>{planData.name} Plan</h2>
              <p className="text-sm mb-4" style={{ color: '#9CA3AF' }}>{planData.description}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ color: '#E5E7EB' }}>{displayPrice}</span>
              </div>
            </div>

            {/* Email Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: '#CBD5E1' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError('');
                  }}
                  className="w-full px-4 py-3 rounded-xl border transition-colors"
                  style={{
                    backgroundColor: 'rgba(10, 15, 30, 0.5)',
                    borderColor: emailError ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.06)',
                    color: '#E5E7EB',
                  }}
                  placeholder="your.email@example.com"
                  required
                />
                {emailError && (
                  <p className="mt-2 text-sm" style={{ color: '#ef4444' }}>{emailError}</p>
                )}
                <p className="mt-2 text-xs" style={{ color: '#9CA3AF' }}>
                  Payment details and account information will be sent to this email
                </p>
              </div>

              <Button
                type="submit"
                className="w-full font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
                  boxShadow: '0 4px 20px rgba(79, 107, 255, 0.3)'
                }}
              >
                Continue to Payment
              </Button>
            </form>
          </div>
        )}

        {/* Step 2: Payment */}
        {step === 'payment' && (
          <div className="space-y-6">
            {/* Plan Summary Card */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold mb-1" style={{ color: '#E5E7EB' }}>{planData.name} Plan</h2>
                  <p className="text-sm" style={{ color: '#9CA3AF' }}>{planData.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold" style={{ color: '#E5E7EB' }}>{displayPrice}</div>
                </div>
              </div>
              <div className="text-sm" style={{ color: '#9CA3AF' }}>
                Email: {email}
              </div>
            </div>

            {/* Crypto Selection */}
            {!paymentData && (
              <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-8">
                <h3 className="text-2xl font-semibold mb-6" style={{ color: '#E5E7EB' }}>
                  Select Payment Method
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {CRYPTOS.map((crypto) => (
                    <button
                      key={crypto.id}
                      onClick={() => handleCryptoSelect(crypto.id)}
                      disabled={loading}
                      className="p-4 rounded-xl border transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: selectedCrypto === crypto.id ? 'rgba(79, 107, 255, 0.1)' : 'rgba(10, 15, 30, 0.5)',
                        borderColor: selectedCrypto === crypto.id ? 'rgba(79, 107, 255, 0.5)' : 'rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      <div className="text-lg font-semibold" style={{ color: '#E5E7EB' }}>{crypto.symbol}</div>
                      <div className="text-xs mt-1" style={{ color: '#9CA3AF' }}>{crypto.name}</div>
                    </button>
                  ))}
                </div>
                {loading && (
                  <div className="mt-6 text-center" style={{ color: '#9CA3AF' }}>Creating payment...</div>
                )}
              </div>
            )}

            {/* Payment Instructions */}
            {paymentData && (
              <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-8">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="w-5 h-5" style={{ color: '#4F6BFF' }} />
                    <h3 className="text-2xl font-semibold" style={{ color: '#E5E7EB' }}>
                      Payment Instructions
                    </h3>
                  </div>
                  <div className="p-4 rounded-lg mb-4" style={{ backgroundColor: 'rgba(255, 193, 7, 0.1)', borderColor: 'rgba(255, 193, 7, 0.3)', border: '1px solid' }}>
                    <p className="text-sm font-medium" style={{ color: '#FFC107' }}>
                      ⚠️ Important: Do not refresh or close this page during payment. Each address is unique to your order and expires after a short time.
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Payment Amount */}
                  <div className="p-6 rounded-xl border" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', borderColor: 'rgba(255, 255, 255, 0.06)' }}>
                    <div className="text-sm mb-2" style={{ color: '#9CA3AF' }}>Amount to Pay</div>
                    <div className="text-3xl font-bold" style={{ color: '#E5E7EB' }}>
                      {paymentData.paymentAmount} {selectedCrypto}
                    </div>
                  </div>

                  {/* Payment Address */}
                  <div className="p-6 rounded-xl border" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', borderColor: 'rgba(255, 255, 255, 0.06)' }}>
                    <div className="text-sm mb-3" style={{ color: '#9CA3AF' }}>Payment Address</div>
                    <div className="flex items-center gap-3">
                      <code className="flex-1 px-4 py-3 rounded-lg font-mono text-sm break-all" style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', color: '#E5E7EB' }}>
                        {paymentData.paymentAddress}
                      </code>
                      <button
                        onClick={() => handleCopy(paymentData.paymentAddress)}
                        className="px-4 py-3 rounded-lg border transition-colors"
                        style={{
                          backgroundColor: 'rgba(10, 15, 30, 0.5)',
                          borderColor: 'rgba(255, 255, 255, 0.06)',
                          color: '#E5E7EB',
                        }}
                      >
                        {copied ? <CheckCircle2 className="w-5 h-5" style={{ color: '#4F6BFF' }} /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                    <p className="text-xs mt-3" style={{ color: '#9CA3AF' }}>
                      Send exactly {paymentData.paymentAmount} {selectedCrypto} to this address
                    </p>
                  </div>

                  {/* Payment Status */}
                  <div className="p-6 rounded-xl border" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', borderColor: 'rgba(255, 255, 255, 0.06)' }}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-3 h-3 rounded-full ${paymentStatus === 'paid' ? 'bg-green-500' : paymentStatus === 'confirming' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'}`}></div>
                      <div className="text-sm font-medium" style={{ color: '#E5E7EB' }}>
                        {paymentStatus === 'paid' ? 'Payment Confirmed' : paymentStatus === 'confirming' ? 'Confirming Payment...' : 'Awaiting Payment'}
                      </div>
                    </div>
                    {paymentStatus === 'pending' && (
                      <p className="text-sm" style={{ color: '#9CA3AF' }}>
                        After sending the payment, click "I've Paid" to confirm. The system will verify your payment automatically.
                      </p>
                    )}
                    {paymentStatus === 'confirming' && (
                      <p className="text-sm" style={{ color: '#9CA3AF' }}>
                        Payment detected. Waiting for blockchain confirmation...
                      </p>
                    )}
                  </div>

                  {/* Confirm Payment Button */}
                  {paymentStatus === 'pending' && (
                    <Button
                      onClick={handleConfirmPayment}
                      className="w-full font-semibold text-white"
                      style={{
                        background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
                        boxShadow: '0 4px 20px rgba(79, 107, 255, 0.3)'
                      }}
                    >
                      I've Paid
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

