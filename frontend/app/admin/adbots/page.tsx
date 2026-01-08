'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Play, Square, Clock, Search, Calendar, User, AlertCircle, Plus, X, Key, ExternalLink, CheckCircle2, Loader2 } from 'lucide-react';

interface Adbot {
  id: string;
  user_id: string;
  bot_id?: string;
  product_id: string;
  status: string;
  valid_until: string;
  created_at: string;
  config: any;
  user?: {
    id: string;
    email: string;
    access_code?: string;
  };
  product?: {
    name: string;
  };
  bot?: {
    id: string;
    access_code: string;
  };
}

interface User {
  id: string;
  email: string;
}

interface Product {
  id: string;
  name: string;
  type: 'ADBOT_PLAN' | 'SESSION_PACK' | 'REPLACEMENT';
  plan_type: 'STARTER' | 'ENTERPRISE' | 'starter' | 'enterprise' | null;
  sessions_count: number;
  posting_interval_minutes: number;
  validity_days: number;
}

export default function AdbotsPage() {
  const router = useRouter();
  const [adbots, setAdbots] = useState<Adbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Create adbot modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [unusedSessions, setUnusedSessions] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<{ access_code?: string; password?: string } | null>(null);
  
  // Form fields
  const [formData, setFormData] = useState({
    plan_type: '' as '' | 'STARTER' | 'ENTERPRISE',
    product_id: '',
    duration_type: '30' as '7' | '30' | 'custom',
    custom_date: '',
    session_source: 'unused' as 'unused' | 'custom',
    custom_sessions: 1,
    user_email: '',
    access_code: '',
  });
  
  // Selected product details
  const selectedProduct = products.find(p => p.id === formData.product_id);
  
  // Filter products by plan_type
  // Note: plan_type in database might be 'STARTER' or 'ENTERPRISE' (uppercase) or 'starter'/'enterprise' (lowercase)
  const filteredProducts = formData.plan_type
    ? products.filter(p => {
        if (p.type !== 'ADBOT_PLAN') return false;
        if (!p.plan_type) return false;
        
        const productPlanType = String(p.plan_type).toUpperCase();
        const selectedPlanType = formData.plan_type.toUpperCase();
        const matches = productPlanType === selectedPlanType;
        
        if (!matches) {
          console.log(`Product ${p.name} plan_type "${p.plan_type}" doesn't match selected "${formData.plan_type}"`);
        }
        
        return matches;
      })
    : [];
  
  // Debug logging
  if (formData.plan_type) {
    console.log('Filtering products for plan_type:', formData.plan_type);
    console.log('Available products:', products.map(p => ({ name: p.name, plan_type: p.plan_type, type: p.type })));
    console.log('Filtered products:', filteredProducts.map(p => ({ name: p.name, plan_type: p.plan_type })));
  }

  useEffect(() => {
    fetchAdbots();
    if (showCreateModal) {
      fetchUsers();
      fetchProducts();
      fetchUnusedSessions();
    }
  }, [filterStatus, showCreateModal]);
  
  const fetchUnusedSessions = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      // Fetch from stock overview which gets actual physical file count from backend
      const response = await fetch('/api/admin/stock/overview', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Get unused count from physical files (backend counts actual files)
          const unusedCount = result.data.sessions?.unused || 0;
          
          // Create placeholder array for compatibility (we only need the count)
          // The actual assignment will happen via API which checks physical files
          const unused = Array(unusedCount).fill(null).map((_, i) => ({
            id: `unused-${i}`,
            filename: `session-${i}.session`,
            status: 'UNUSED',
            usable: true,
          }));
          
          setUnusedSessions(unused);
          console.log(`Found ${unusedCount} unused sessions in backend (physical files)`);
        }
      } else {
        console.error('Failed to fetch unused sessions count:', response.status);
        setUnusedSessions([]);
      }
    } catch (error) {
      console.error('Error fetching unused sessions:', error);
      setUnusedSessions([]);
    }
  };
  
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setUsers(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };
  
  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/products', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Filter only ADBOT_PLAN products (don't filter by plan_type here, let user select plan type first)
          const adbotProducts = (result.data || []).filter((p: Product) => 
            p.type === 'ADBOT_PLAN'
          );
          setProducts(adbotProducts);
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchAdbots = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/adbots', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch adbots');

      const result = await response.json();
      if (result.success) {
        setAdbots(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching adbots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (adbotId: string) => {
    if (!confirm('Are you sure you want to start this adbot?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/bot/start?adbotId=${adbotId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to start adbot');
      await fetchAdbots();
    } catch (error) {
      console.error('Error starting adbot:', error);
      alert('Failed to start adbot');
    }
  };

  const handleStop = async (adbotId: string) => {
    if (!confirm('Are you sure you want to stop this adbot?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/bot/stop?adbotId=${adbotId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to stop adbot');
      await fetchAdbots();
    } catch (error) {
      console.error('Error stopping adbot:', error);
      alert('Failed to stop adbot');
    }
  };

  const handleExtend = async (adbotId: string, days: number = 30) => {
    if (!confirm(`Extend this adbot by ${days} days?`)) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/extend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ days }),
      });

      if (!response.ok) throw new Error('Failed to extend adbot');
      await fetchAdbots();
    } catch (error) {
      console.error('Error extending adbot:', error);
      alert('Failed to extend adbot');
    }
  };
  
  const handleCreateAdbot = async () => {
    // Validate form
    if (!formData.plan_type) {
      alert('Please select a plan type (Starter or Enterprise)');
      return;
    }
    
    if (!formData.product_id) {
      alert('Please select a specific plan');
      return;
    }
    
    // Calculate valid_until date
    let validUntil: string;
    if (formData.duration_type === 'custom') {
      if (!formData.custom_date) {
        alert('Please select a custom date');
        return;
      }
      validUntil = new Date(formData.custom_date).toISOString();
    } else {
      const days = parseInt(formData.duration_type);
      const date = new Date();
      date.setDate(date.getDate() + days);
      validUntil = date.toISOString();
    }
    
    // Get sessions count
    const sessionsCount = formData.session_source === 'custom' 
      ? formData.custom_sessions 
      : (selectedProduct?.sessions_count || 1);
    
    // Check if enough unused sessions available
    if (formData.session_source === 'unused' && unusedSessions.length < sessionsCount) {
      alert(`Not enough unused sessions. Available: ${unusedSessions.length}, Required: ${sessionsCount}`);
      return;
    }
    
    setCreating(true);
    
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/adbots/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: formData.product_id,
          plan_type: formData.plan_type,
          sessions_assigned: sessionsCount,
          posting_interval_minutes: selectedProduct?.posting_interval_minutes || 5,
          valid_until: validUntil,
          user_email: formData.user_email.trim() || undefined,
          access_code: formData.access_code.trim() || undefined, // Auto-generate if empty
          session_source: formData.session_source,
          creation_type: 'manual', // Mark as manual creation by admin
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create adbot');
      }
      
      const result = await response.json();
      
      // Extract credentials for success message
      const credentials = result.data?.credentials || (result.data?.bot?.access_code 
        ? { access_code: result.data?.bot?.access_code }
        : null);
      
      if (credentials?.access_code) {
        setSuccessMessage({
          access_code: credentials.access_code,
          password: result.data?.credentials?.password,
        });
        console.log('[AdbotCreate] Access code created:', credentials.access_code);
      } else {
        setSuccessMessage({});
        console.warn('[AdbotCreate] No access code in response:', result.data);
      }
      
      // Reset form
      setFormData({
        plan_type: '' as '' | 'STARTER' | 'ENTERPRISE',
        product_id: '',
        duration_type: '30' as '7' | '30' | 'custom',
        custom_date: '',
        session_source: 'unused' as 'unused' | 'custom',
        custom_sessions: 1,
        user_email: '',
        access_code: '',
      });
      
      // Refresh adbots list
      await fetchAdbots();
      
      // Trigger stock overview refresh in other tabs/windows
      // This will be picked up by the stock page if it's open
      window.dispatchEvent(new CustomEvent('stockRefresh'));
      
      // Auto-close modal after 5 seconds if success message is shown
      setTimeout(() => {
        setShowCreateModal(false);
        setSuccessMessage(null);
      }, 5000);
    } catch (error) {
      console.error('Error creating adbot:', error);
      // Show error in UI instead of alert
      setSuccessMessage(null);
      // You can add an error state here if needed
    } finally {
      setCreating(false);
    }
  };
  

  const filteredAdbots = adbots.filter((adbot) => {
    const matchesSearch =
      adbot.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      adbot.user_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (adbot.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    
    const matchesStatus = filterStatus === 'all' || adbot.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' };
      case 'SUSPENDED':
        return { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' };
      case 'STOPPED':
        return { bg: 'rgba(156, 163, 175, 0.2)', text: '#9CA3AF' };
      default:
        return { bg: 'rgba(156, 163, 175, 0.2)', text: '#9CA3AF' };
    }
  };

  const isExpired = (validUntil: string) => {
    return new Date(validUntil) < new Date();
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Bot className="w-8 h-8" />
            Adbot Management
          </h1>
          <p className="text-gray-400">Monitor and manage all adbots</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
          style={{
            background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
            color: '#FFFFFF',
          }}
        >
          <Plus className="w-4 h-4" />
          Create Adbot
        </button>
      </div>
      
      {/* Create Adbot Modal */}
      {showCreateModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !creating) {
              setShowCreateModal(false);
              setSuccessMessage(null);
            }
          }}
        >
          <div
            className="rounded-2xl p-8 space-y-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto relative"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(20px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Loading Overlay */}
            {creating && (
              <div 
                className="absolute inset-0 rounded-2xl flex items-center justify-center z-50"
                style={{
                  background: 'rgba(0, 0, 0, 0.8)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <div className="text-center space-y-4">
                  <Loader2 className="w-12 h-12 animate-spin mx-auto" style={{ color: '#4F6BFF' }} />
                  <p className="text-lg font-semibold" style={{ color: '#FFFFFF' }}>Creating Adbot...</p>
                  <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                    Please wait while we set up your adbot
                  </p>
                </div>
              </div>
            )}

            {/* Success Message */}
            {successMessage !== null && !creating && (
              <div 
                className="mb-6 p-6 rounded-xl relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1))',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  boxShadow: '0 4px 16px rgba(34, 197, 94, 0.2)',
                }}
              >
                <div className="flex items-start gap-4">
                  <div 
                    className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
                    style={{
                      background: 'rgba(34, 197, 94, 0.2)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                    }}
                  >
                    <CheckCircle2 className="w-6 h-6" style={{ color: '#22c55e' }} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2" style={{ color: '#FFFFFF' }}>
                      Adbot Created Successfully!
                    </h3>
                    {successMessage.access_code && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4" style={{ color: 'rgba(255, 255, 255, 0.7)' }} />
                          <span className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Access Code:</span>
                          <span className="text-base font-mono font-semibold" style={{ color: '#FFFFFF' }}>
                            {successMessage.access_code}
                          </span>
                        </div>
                        {successMessage.password && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Password:</span>
                            <span className="text-base font-mono font-semibold" style={{ color: '#FFFFFF' }}>
                              {successMessage.password}
                            </span>
                          </div>
                        )}
                        <p className="text-xs mt-3" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                          User can login with this access code. This message will close automatically.
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setSuccessMessage(null);
                    }}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold" style={{ color: '#FFFFFF' }}>Create New Adbot</h2>
              {!creating && (
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setSuccessMessage(null);
                  }}
                  className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
                >
                  <X className="w-6 h-6" />
                </button>
              )}
            </div>
            
            {/* Plan Type Selection */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                Plan Type <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, plan_type: 'STARTER', product_id: '' })}
                  disabled={creating}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                    formData.plan_type === 'STARTER'
                      ? 'scale-105'
                      : 'hover:scale-102'
                  }`}
                  style={{
                    background: formData.plan_type === 'STARTER'
                      ? 'linear-gradient(135deg, #4F6BFF, #6A7CFF)'
                      : 'rgba(0, 0, 0, 0.3)',
                    border: formData.plan_type === 'STARTER'
                      ? '1px solid rgba(79, 107, 255, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    color: formData.plan_type === 'STARTER' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)',
                    boxShadow: formData.plan_type === 'STARTER'
                      ? '0 4px 16px rgba(79, 107, 255, 0.3)'
                      : 'none',
                    opacity: creating ? 0.5 : 1,
                    cursor: creating ? 'not-allowed' : 'pointer',
                  }}
                >
                  Starter Plan
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, plan_type: 'ENTERPRISE', product_id: '' })}
                  disabled={creating}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                    formData.plan_type === 'ENTERPRISE'
                      ? 'scale-105'
                      : 'hover:scale-102'
                  }`}
                  style={{
                    background: formData.plan_type === 'ENTERPRISE'
                      ? 'linear-gradient(135deg, #4F6BFF, #6A7CFF)'
                      : 'rgba(0, 0, 0, 0.3)',
                    border: formData.plan_type === 'ENTERPRISE'
                      ? '1px solid rgba(79, 107, 255, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    color: formData.plan_type === 'ENTERPRISE' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)',
                    boxShadow: formData.plan_type === 'ENTERPRISE'
                      ? '0 4px 16px rgba(79, 107, 255, 0.3)'
                      : 'none',
                    opacity: creating ? 0.5 : 1,
                    cursor: creating ? 'not-allowed' : 'pointer',
                  }}
                >
                  Enterprise Plan
                </button>
              </div>
            </div>
            
            {/* Specific Plan Selection */}
            {formData.plan_type && (
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                  Select Plan <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formData.product_id}
                  onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  disabled={creating}
                  className="w-full px-4 py-3 rounded-xl text-white focus:outline-none transition-all duration-300"
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    opacity: creating ? 0.5 : 1,
                    cursor: creating ? 'not-allowed' : 'pointer',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(79, 107, 255, 0.5)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(79, 107, 255, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.target.style.boxShadow = 'none';
                  }}
                >
                  <option value="" style={{ background: 'rgba(10, 15, 30, 0.95)' }}>Select a plan</option>
                  {filteredProducts.map((product) => (
                    <option key={product.id} value={product.id} style={{ background: 'rgba(10, 15, 30, 0.95)' }}>
                      {product.name} ({product.sessions_count} sessions, {product.posting_interval_minutes} min interval)
                    </option>
                  ))}
                </select>
                {selectedProduct && (
                  <div 
                    className="mt-3 p-4 rounded-xl"
                    style={{
                      background: 'rgba(79, 107, 255, 0.1)',
                      border: '1px solid rgba(79, 107, 255, 0.2)',
                    }}
                  >
                    <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                      Plan includes: <strong>{selectedProduct.sessions_count} sessions</strong> and{' '}
                      <strong>{selectedProduct.posting_interval_minutes} minutes</strong> posting interval
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {/* Duration Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Duration <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, duration_type: '7' })}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    formData.duration_type === '7'
                      ? 'bg-blue-500 text-white'
                      : 'bg-black/30 text-gray-400 hover:bg-black/50'
                  }`}
                >
                  7 Days
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, duration_type: '30' })}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    formData.duration_type === '30'
                      ? 'bg-blue-500 text-white'
                      : 'bg-black/30 text-gray-400 hover:bg-black/50'
                  }`}
                >
                  30 Days
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, duration_type: 'custom' })}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    formData.duration_type === 'custom'
                      ? 'bg-blue-500 text-white'
                      : 'bg-black/30 text-gray-400 hover:bg-black/50'
                  }`}
                >
                  Custom
                </button>
              </div>
              {formData.duration_type === 'custom' && (
                <input
                  type="date"
                  value={formData.custom_date}
                  onChange={(e) => setFormData({ ...formData, custom_date: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                />
              )}
            </div>
            
            {/* Session Source */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Sessions <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, session_source: 'unused' })}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    formData.session_source === 'unused'
                      ? 'bg-blue-500 text-white'
                      : 'bg-black/30 text-gray-400 hover:bg-black/50'
                  }`}
                >
                  From Unused Pool ({unusedSessions.length} available)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, session_source: 'custom' })}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    formData.session_source === 'custom'
                      ? 'bg-blue-500 text-white'
                      : 'bg-black/30 text-gray-400 hover:bg-black/50'
                  }`}
                >
                  Custom Count
                </button>
              </div>
              {formData.session_source === 'unused' && selectedProduct && (
                <div className="space-y-1">
                  <p className="text-sm text-gray-400">
                    Will use <strong>{selectedProduct.sessions_count}</strong> sessions from unused pool
                  </p>
                  {unusedSessions.length === 0 && (
                    <p className="text-sm text-yellow-400 flex items-center gap-1">
                      ⚠️ No unused sessions available. Please upload sessions first.
                    </p>
                  )}
                  {unusedSessions.length > 0 && unusedSessions.length < selectedProduct.sessions_count && (
                    <p className="text-sm text-yellow-400 flex items-center gap-1">
                      ⚠️ Only {unusedSessions.length} session(s) available. Need {selectedProduct.sessions_count}.
                    </p>
                  )}
                </div>
              )}
              {formData.session_source === 'custom' && (
                <input
                  type="number"
                  min="1"
                  value={formData.custom_sessions}
                  onChange={(e) => setFormData({ ...formData, custom_sessions: parseInt(e.target.value) || 1 })}
                  placeholder="Number of sessions"
                  className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              )}
            </div>
            
            {/* User Email */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                User Email (Optional)
              </label>
              <input
                type="email"
                value={formData.user_email}
                onChange={(e) => setFormData({ ...formData, user_email: e.target.value })}
                placeholder="user@example.com"
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave blank if user doesn't have an email. User account will be created with access code.
              </p>
            </div>
            
            {/* Access Code */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Access Code (Optional)
              </label>
              <input
                type="text"
                value={formData.access_code}
                onChange={(e) => setFormData({ ...formData, access_code: e.target.value.toUpperCase() })}
                placeholder="Leave blank to auto-generate"
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave blank to auto-generate. User will login with this access code.
              </p>
            </div>
            
            {/* Action Buttons */}
            {!successMessage && (
              <div className="flex gap-3 pt-6 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <button
                  onClick={handleCreateAdbot}
                  disabled={creating || !formData.product_id}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{
                    background: creating || !formData.product_id
                      ? 'rgba(79, 107, 255, 0.3)'
                      : 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
                    color: '#FFFFFF',
                    boxShadow: creating || !formData.product_id
                      ? 'none'
                      : '0 4px 16px rgba(79, 107, 255, 0.3)',
                  }}
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      Create Adbot
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setSuccessMessage(null);
                  }}
                  disabled={creating}
                  className="px-6 py-3 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: 'rgba(156, 163, 175, 0.1)',
                    border: '1px solid rgba(156, 163, 175, 0.2)',
                    color: '#9CA3AF',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div
        className="rounded-xl p-6 space-y-4"
        style={{
          backgroundColor: 'rgba(10, 15, 30, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by ID, user ID, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="STOPPED">Stopped</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>

        <div className="text-sm text-gray-400">
          Showing {filteredAdbots.length} of {adbots.length} adbots
        </div>
      </div>

      {/* Adbots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAdbots.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-400">
            No adbots found
          </div>
        ) : (
          filteredAdbots.map((adbot) => {
            const statusColor = getStatusColor(adbot.status);
            const expired = isExpired(adbot.valid_until);

            return (
              <div
                key={adbot.id}
                className="rounded-xl p-6 cursor-pointer transition-all hover:scale-[1.02] hover:border-blue-500/50"
                style={{
                  backgroundColor: 'rgba(10, 15, 30, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
                onClick={() => {
                  // Navigate to adbot detail page
                  router.push(`/admin/adbots/${adbot.id}`);
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {adbot.product?.name || 'Adbot'}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono">{adbot.id}</p>
                  </div>
                  <span
                    className="px-2 py-1 rounded text-xs font-medium"
                    style={{
                      backgroundColor: statusColor.bg,
                      color: statusColor.text,
                    }}
                  >
                    {adbot.status}
                  </span>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-400">User:</span>
                    <span className="text-white">{adbot.user?.email || adbot.user_id}</span>
                    {adbot.user_id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/users?userId=${adbot.user_id}`);
                        }}
                        className="ml-auto p-1 rounded hover:bg-blue-500/20 transition-colors"
                        title="View user panel"
                      >
                        <ExternalLink className="w-3 h-3 text-blue-400" />
                      </button>
                    )}
                  </div>

                  {(adbot.bot?.access_code || adbot.user?.access_code) && (
                    <div className="flex items-center gap-2 text-sm">
                      <Key className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-400">Access Code:</span>
                      <span className="text-white font-mono text-xs">
                        {adbot.bot?.access_code || adbot.user?.access_code || 'N/A'}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-400">Valid until:</span>
                    <span className={`${expired ? 'text-red-400' : 'text-white'}`}>
                      {new Date(adbot.valid_until).toLocaleDateString()}
                    </span>
                    {expired && <AlertCircle className="w-4 h-4 text-red-400" />}
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-400">Created:</span>
                    <span className="text-white">
                      {new Date(adbot.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div 
                  className="flex gap-2 pt-4 border-t" 
                  style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}
                  onClick={(e) => e.stopPropagation()} // Prevent card click when clicking buttons
                >
                  {adbot.status === 'ACTIVE' ? (
                    <button
                      onClick={() => handleStop(adbot.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: '#ef4444',
                      }}
                    >
                      <Square className="w-4 h-4" />
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStart(adbot.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                      style={{
                        background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
                        color: '#FFFFFF',
                      }}
                    >
                      <Play className="w-4 h-4" />
                      Start
                    </button>
                  )}

                  <button
                    onClick={() => handleExtend(adbot.id, 30)}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                    style={{
                      backgroundColor: 'rgba(79, 107, 255, 0.1)',
                      border: '1px solid rgba(79, 107, 255, 0.2)',
                      color: '#4F6BFF',
                    }}
                    title="Extend by 30 days"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

