'use client';

import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

interface PricingProps {
  activePlanType?: 'starter' | 'enterprise';
  onPlanTypeChange?: (type: 'starter' | 'enterprise') => void;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  plan_type?: 'STARTER' | 'ENTERPRISE' | null;
  price: number;
  sessions_count: number;
  posting_interval_minutes: number;
}

const Pricing = ({ activePlanType = 'starter', onPlanTypeChange }: PricingProps) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, [activePlanType]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const planType = activePlanType === 'starter' ? 'STARTER' : 'ENTERPRISE';
      const response = await fetch(`/api/products/public?plan_type=${planType}&activeOnly=true`);
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setProducts(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Convert products to plan format
  const formatPlans = (products: Product[]) => {
    return products.map((product, index) => {
      const isEnterprise = product.plan_type === 'ENTERPRISE';
      const description = product.description || (isEnterprise ? 'For High-Volume Marketing' : 'For Solo Sellers & New Users');
      
      // Parse weekly price from description if it exists (format: "description | Weekly: $50")
      let priceWeekly: number | undefined;
      let priceMonthly = product.price;
      if (isEnterprise && product.description?.includes('Weekly:')) {
        const weeklyMatch = product.description.match(/Weekly:\s*\$\s*(\d+)/);
        if (weeklyMatch) {
          priceWeekly = parseInt(weeklyMatch[1]);
        }
      }

      // Format interval text
      const intervalText = product.posting_interval_minutes >= 60
        ? `${product.posting_interval_minutes / 60} hour${product.posting_interval_minutes / 60 > 1 ? 's' : ''}`
        : `${product.posting_interval_minutes} minute${product.posting_interval_minutes > 1 ? 's' : ''}`;

      const features = [
        `${product.sessions_count} Account${product.sessions_count > 1 ? 's' : ''}`,
        `Sends every ${intervalText}`,
        ...(isEnterprise ? ['Priority Support'] : []),
        ...(product.sessions_count >= 3 ? ['2 Free Account Replacements'] : ['1 Free Account Replacement']),
      ];

      return {
        id: product.id,
        name: product.name,
        price: priceWeekly ? `$${priceWeekly}` : `$${priceMonthly}`,
        pricePeriod: priceWeekly ? '/week' : undefined,
        priceAlt: priceWeekly ? `$${priceMonthly}/month` : undefined,
        description: description.split('|')[0].trim(), // Remove weekly price from description
        features,
        cta: 'Get Started',
        highlighted: index === Math.floor(products.length / 2), // Highlight middle plan
      };
    });
  };

  const plans = formatPlans(products);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-black dark:text-white mb-4 tracking-tight">
            Plans and Pricing
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-6">
            Select the perfect plan for your advertising needs
          </p>

          <div className="inline-flex items-center bg-black/[0.03] dark:bg-white/[0.03] rounded-full p-1">
            <button
              className={`px-6 py-2.5 rounded-full text-sm font-medium transition-colors ${activePlanType === 'starter'
                  ? 'bg-black/[0.07] dark:bg-white/[0.07] text-black dark:text-white'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                }`}
              onClick={() => onPlanTypeChange?.('starter')}
            >
              Starter
            </button>
            <button
              className={`px-6 py-2.5 rounded-full text-sm font-medium transition-colors ${activePlanType === 'enterprise'
                  ? 'bg-black/[0.07] dark:bg-white/[0.07] text-black dark:text-white'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                }`}
              onClick={() => onPlanTypeChange?.('enterprise')}
            >
              Enterprise
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-black/20 dark:border-white/20 border-t-black dark:border-t-white rounded-full animate-spin" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-12 text-zinc-600 dark:text-zinc-400">
            No plans available. Please contact support.
          </div>
        ) : (
          <div className={`grid grid-cols-1 ${plans.length === 4 ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-6 max-w-7xl mx-auto`}>
            {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border ${plan.highlighted
                  ? 'border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] scale-[1.02] shadow-xl'
                  : 'border-black/[0.08] dark:border-white/[0.08] hover:border-black/10 dark:hover:border-white/10'
                } p-6 transition-all duration-300`}
            >
              {plan.highlighted && (
                <>
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <div className="relative">
                      <div className="absolute inset-0 bg-black/10 dark:bg-white/10 rounded-full blur-[2px]" />

                      <div className="relative px-4 py-1.5 bg-black/[0.03] dark:bg-white/[0.03] backdrop-blur-sm rounded-full border border-black/10 dark:border-white/10">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-1 h-1 rounded-full bg-black/60 dark:bg-white/60 animate-pulse" />
                          <span className="text-xs font-medium text-black/80 dark:text-white/80">Most Popular</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-medium text-black dark:text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-black dark:text-white">{plan.price}</span>
                  {plan.pricePeriod && (
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {plan.pricePeriod}
                    </span>
                  )}
                  {!plan.pricePeriod && (
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      /month
                    </span>
                  )}
                </div>
                {plan.priceAlt && (
                  <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                    or {plan.priceAlt}
                  </div>
                )}
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-4">{plan.description}</p>
              </div>

              <div className="space-y-3 mb-6">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-black/30 dark:text-white/30" />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{feature}</span>
                  </div>
                ))}
              </div>

              <button
                className={`w-full py-2.5 px-4 rounded-xl text-sm font-medium transition-colors ${plan.highlighted
                    ? 'bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90'
                    : 'border border-black/10 dark:border-white/10 text-black dark:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
                  }`}
                onClick={() => {
                  // Find the product to get its ID and actual price
                  const product = products.find(p => p.id === plan.id);
                  if (!product) return;

                  const params = new URLSearchParams({
                    product_id: product.id,
                    plan: plan.name,
                    type: activePlanType,
                    price: product.price.toString(), // Use actual database price
                    description: plan.description,
                    features: JSON.stringify(plan.features),
                  });
                  
                  if (plan.pricePeriod) {
                    params.append('pricePeriod', plan.pricePeriod);
                  }
                  
                  if (plan.priceAlt) {
                    params.append('priceAlt', plan.priceAlt);
                  }
                  
                  window.location.href = `/checkout?${params.toString()}`;
                }}
              >
                {plan.cta}
              </button>
            </div>
          ))}
          </div>
        )}
    </div>
  );
};

export default Pricing;

