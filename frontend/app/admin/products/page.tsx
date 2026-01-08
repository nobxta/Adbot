'use client';

import { useEffect, useState } from 'react';
import { Package, Plus, Edit, Trash2, Search, DollarSign, Clock, Database } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  description: string | null;
  type: string;
  plan_type?: 'STARTER' | 'ENTERPRISE' | null;
  price: number;
  sessions_count: number;
  posting_interval_minutes: number;
  posting_interval_seconds?: number;
  validity_days: number;
  is_active: boolean;
  created_at: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'ADBOT_PLAN',
    plan_type: '' as '' | 'STARTER' | 'ENTERPRISE',
    price: '',
    sessions_count: '',
    posting_interval_minutes: '',
    validity_days: '',
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/products', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch products');

      const result = await response.json();
      if (result.success) {
        setProducts(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      description: '',
      type: 'ADBOT_PLAN',
      plan_type: '',
      price: '',
      sessions_count: '',
      posting_interval_minutes: '',
      validity_days: '',
    });
    setShowModal(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      type: product.type,
      plan_type: (product.plan_type as '' | 'STARTER' | 'ENTERPRISE') || '',
      price: product.price.toString(),
      sessions_count: product.sessions_count.toString(),
      posting_interval_minutes: product.posting_interval_minutes.toString(),
      validity_days: product.validity_days.toString(),
    });
    setShowModal(true);
  };

  const handleSeedPlans = async () => {
    if (!confirm('This will create default plans (Bronze, Silver, Gold, Diamond, Basic, Pro, Elite). Continue?')) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/products/seed', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to seed plans');
      }

      const result = await response.json();
      alert(result.message || 'Plans seeded successfully!');
      await fetchProducts();
    } catch (error) {
      console.error('Error seeding plans:', error);
      alert(error instanceof Error ? error.message : 'Failed to seed plans');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem('accessToken');
      const payload = {
        name: formData.name,
        description: formData.description || null,
        type: formData.type,
        plan_type: formData.plan_type || null,
        price: parseFloat(formData.price),
        sessions_count: parseInt(formData.sessions_count),
        posting_interval_minutes: parseInt(formData.posting_interval_minutes),
        validity_days: parseInt(formData.validity_days),
      };

      const url = editingProduct
        ? `/api/admin/products/${editingProduct.id}`
        : '/api/admin/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save product');

      setShowModal(false);
      await fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Failed to save product');
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to delete product');
      await fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            <Package className="w-8 h-8" />
            Product Management
          </h1>
          <p className="text-gray-400">Create and manage products</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSeedPlans}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{
              backgroundColor: 'rgba(79, 107, 255, 0.1)',
              border: '1px solid rgba(79, 107, 255, 0.2)',
              color: '#4F6BFF',
            }}
          >
            <Package className="w-4 h-4" />
            Seed Plans
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{
              background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
              color: '#FFFFFF',
            }}
          >
            <Plus className="w-4 h-4" />
            New Product
          </button>
        </div>
      </div>

      {/* Search */}
      <div
        className="rounded-xl p-6"
        style={{
          backgroundColor: 'rgba(10, 15, 30, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-400">
            No products found
          </div>
        ) : (
          filteredProducts.map((product) => (
            <div
              key={product.id}
              className="rounded-xl p-6"
              style={{
                backgroundColor: 'rgba(10, 15, 30, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">{product.name}</h3>
                  <p className="text-xs text-gray-500 capitalize">{product.type}</p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    product.is_active ? 'text-green-400' : 'text-gray-400'
                  }`}
                  style={{
                    backgroundColor: product.is_active
                      ? 'rgba(16, 185, 129, 0.2)'
                      : 'rgba(156, 163, 175, 0.2)',
                  }}
                >
                  {product.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {product.description && (
                <p className="text-sm text-gray-400 mb-4">{product.description}</p>
              )}

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    Price
                  </span>
                  <span className="text-white font-semibold">${product.price}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Database className="w-4 h-4" />
                    Sessions
                  </span>
                  <span className="text-white font-semibold">{product.sessions_count}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Interval
                  </span>
                  <span className="text-white font-semibold">{product.posting_interval_minutes} min</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Validity</span>
                  <span className="text-white font-semibold">{product.validity_days} days</span>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}>
                <button
                  onClick={() => handleEdit(product)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                  style={{
                    backgroundColor: 'rgba(79, 107, 255, 0.1)',
                    border: '1px solid rgba(79, 107, 255, 0.2)',
                    color: '#4F6BFF',
                  }}
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(product.id)}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className="rounded-xl p-6 w-full max-w-md"
            style={{
              backgroundColor: 'rgba(10, 15, 30, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <h2 className="text-2xl font-bold text-white mb-6">
              {editingProduct ? 'Edit Product' : 'Create Product'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Product Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="ADBOT_PLAN">Adbot Plan</option>
                  <option value="SESSION_PACK">Session Pack</option>
                  <option value="REPLACEMENT">Replacement</option>
                </select>
              </div>

              {formData.type === 'ADBOT_PLAN' && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Plan Type</label>
                  <select
                    value={formData.plan_type}
                    onChange={(e) => setFormData({ ...formData, plan_type: e.target.value as 'STARTER' | 'ENTERPRISE' })}
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select plan type</option>
                    <option value="STARTER">Starter</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Sessions</label>
                  <input
                    type="number"
                    required
                    value={formData.sessions_count}
                    onChange={(e) => setFormData({ ...formData, sessions_count: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Interval (min)</label>
                  <input
                    type="number"
                    required
                    value={formData.posting_interval_minutes}
                    onChange={(e) => setFormData({ ...formData, posting_interval_minutes: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Validity (days)</label>
                  <input
                    type="number"
                    required
                    value={formData.validity_days}
                    onChange={(e) => setFormData({ ...formData, validity_days: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                  style={{
                    backgroundColor: 'rgba(156, 163, 175, 0.1)',
                    border: '1px solid rgba(156, 163, 175, 0.2)',
                    color: '#9CA3AF',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                  style={{
                    background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
                    color: '#FFFFFF',
                  }}
                >
                  {editingProduct ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

