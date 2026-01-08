'use client';

import { useEffect, useState } from 'react';
import { UserCheck, Search, Mail, Calendar, DollarSign, Users } from 'lucide-react';

interface Reseller {
  id: string;
  user_id: string;
  commission_rate: number;
  total_earnings: number;
  created_at: string;
  user?: {
    email: string;
    access_code: string;
  };
}

export default function ResellersPage() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchResellers();
  }, []);

  const fetchResellers = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      // Fetch users with RESELLER role
      const response = await fetch('/api/admin/users?role=RESELLER', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch resellers');

      const result = await response.json();
      if (result.success) {
        // Map users to reseller format
        const resellerData = result.data.map((user: any) => ({
          id: user.id,
          user_id: user.id,
          commission_rate: 10, // Default, should come from resellers table
          total_earnings: 0, // Should be calculated from orders
          created_at: user.created_at,
          user: {
            email: user.email,
            access_code: user.access_code,
          },
        }));
        setResellers(resellerData);
      }
    } catch (error) {
      console.error('Error fetching resellers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredResellers = resellers.filter((reseller) =>
    reseller.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reseller.id.toLowerCase().includes(searchTerm.toLowerCase())
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
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <UserCheck className="w-8 h-8" />
          Reseller Management
        </h1>
        <p className="text-gray-400">Manage resellers and their commissions</p>
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
            placeholder="Search resellers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: 'rgba(10, 15, 30, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">Total Resellers</h3>
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-white">{resellers.length}</p>
        </div>

        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: 'rgba(10, 15, 30, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">Total Earnings</h3>
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-white">
            ${resellers.reduce((sum, r) => sum + (r.total_earnings || 0), 0).toFixed(2)}
          </p>
        </div>

        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: 'rgba(10, 15, 30, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">Avg Commission</h3>
            <DollarSign className="w-5 h-5 text-yellow-500" />
          </div>
          <p className="text-3xl font-bold text-white">
            {resellers.length > 0
              ? (resellers.reduce((sum, r) => sum + (r.commission_rate || 0), 0) / resellers.length).toFixed(1)
              : 0}%
          </p>
        </div>
      </div>

      {/* Resellers Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'rgba(10, 15, 30, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <th className="text-left p-4 text-sm font-semibold text-gray-400">Reseller</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-400">Access Code</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-400">Commission Rate</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-400">Total Earnings</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-400">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filteredResellers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    No resellers found
                  </td>
                </tr>
              ) : (
                filteredResellers.map((reseller) => (
                  <tr
                    key={reseller.id}
                    style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
                    className="hover:bg-white/5"
                  >
                    <td className="p-4">
                      <div>
                        <p className="text-white font-medium">{reseller.user?.email || 'No email'}</p>
                        <p className="text-xs text-gray-500 font-mono">{reseller.id}</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <code className="text-xs text-gray-400 font-mono">
                        {reseller.user?.access_code || 'N/A'}
                      </code>
                    </td>
                    <td className="p-4">
                      <span className="text-white font-semibold">{reseller.commission_rate}%</span>
                    </td>
                    <td className="p-4">
                      <span className="text-white font-semibold">
                        ${(reseller.total_earnings || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="w-3 h-3" />
                        {new Date(reseller.created_at).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

