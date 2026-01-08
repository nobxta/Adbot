'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Users, Search, Ban, RefreshCw, Calendar, Shield, Plus, X, Copy, Check } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface User {
  id: string;
  email?: string;  // Optional - users can be created without email
  role: string;
  is_active: boolean;
  access_code: string;
  plan_type?: string;
  plan_status?: string;
  created_at: string;
  last_login: string | null;
}

export default function UsersPage() {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    access_code: '',
    password: '',
    plan_type: 'starter' as 'starter' | 'enterprise',
  });
  const [createdCredentials, setCreatedCredentials] = useState<{ access_code: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchUsers();
    // If userId is in query params, filter to that user
    const userId = searchParams.get('userId');
    if (userId) {
      setSearchTerm(userId);
    }
  }, [filterRole, filterActive, searchParams]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      let url = '/api/admin/users?';
      if (filterRole !== 'all') url += `role=${filterRole}&`;
      if (filterActive !== 'all') url += `isActive=${filterActive === 'active'}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch users');

      const result = await response.json();
      if (result.success) {
        setUsers(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async (userId: string, currentStatus: boolean) => {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'suspend' : 'activate'} this user?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to update user status');

      await fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user status');
    }
  };

  const handleResetCode = async (userId: string) => {
    if (!confirm('Are you sure you want to reset this user\'s access code?')) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/users/${userId}/reset-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to reset access code');

      const result = await response.json();
      if (result.success) {
        alert(`New access code: ${result.accessCode}`);
        await fetchUsers();
      }
    } catch (error) {
      console.error('Error resetting code:', error);
      alert('Failed to reset access code');
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.access_code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="glass-card rounded-2xl p-6">
          <Skeleton className="h-12 w-full mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Users className="w-6 h-6 md:w-8 md:h-8" />
          User Management
        </h1>
        <p className="text-gray-400 text-sm md:text-base">Manage users, access codes, and permissions</p>
      </div>

      {/* Filters and Search */}
      <div className="glass-card rounded-2xl p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email, ID, or access code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
            />
          </div>

          {/* Role Filter */}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
          >
            <option value="all">All Roles</option>
            <option value="USER">Users</option>
            <option value="ADMIN">Admins</option>
            <option value="RESELLER">Resellers</option>
          </select>

          {/* Active Filter */}
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Suspended</option>
          </select>
        </div>

        <div className="text-sm text-gray-400">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </div>

      {/* Users Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-4 text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-wider">User</th>
                <th className="text-left p-4 text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-wider">Role</th>
                <th className="text-left p-4 text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Plan</th>
                <th className="text-left p-4 text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left p-4 text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Access Code</th>
                <th className="text-left p-4 text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Created</th>
                <th className="text-right p-4 text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="p-4">
                      <div>
                        <p className="text-white font-medium text-sm md:text-base">{user.email || 'No email'}</p>
                        <p className="text-xs text-gray-500 font-mono hidden lg:block">{user.id}</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className="px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 w-fit"
                        style={{
                          backgroundColor:
                            user.role === 'ADMIN'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : user.role === 'RESELLER'
                              ? 'rgba(139, 92, 246, 0.15)'
                              : 'rgba(59, 130, 246, 0.15)',
                          color:
                            user.role === 'ADMIN'
                              ? '#EF4444'
                              : user.role === 'RESELLER'
                              ? '#8B5CF6'
                              : '#3B82F6',
                          border: `1px solid ${
                            user.role === 'ADMIN'
                              ? 'rgba(239, 68, 68, 0.3)'
                              : user.role === 'RESELLER'
                              ? 'rgba(139, 92, 246, 0.3)'
                              : 'rgba(59, 130, 246, 0.3)'
                          }`,
                        }}
                      >
                        {user.role === 'ADMIN' && <Shield className="w-3 h-3" />}
                        {user.role}
                      </span>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div>
                        <p className="text-white text-sm capitalize">{user.plan_type || 'N/A'}</p>
                        <p className="text-xs text-gray-500 capitalize">{user.plan_status || 'N/A'}</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded-lg text-xs font-medium ${
                          user.is_active ? 'text-green-400' : 'text-red-400'
                        }`}
                        style={{
                          backgroundColor: user.is_active
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                          border: `1px solid ${user.is_active
                            ? 'rgba(16, 185, 129, 0.3)'
                            : 'rgba(239, 68, 68, 0.3)'
                          }`,
                        }}
                      >
                        {user.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      <code className="text-xs text-gray-400 font-mono bg-white/5 px-2 py-1 rounded">{user.access_code}</code>
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="w-3 h-3" />
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSuspend(user.id, user.is_active)}
                          className="btn-secondary p-2 rounded-lg transition-all"
                          style={{
                            color: user.is_active ? '#EF4444' : '#10B981',
                          }}
                          title={user.is_active ? 'Suspend' : 'Activate'}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleResetCode(user.id)}
                          className="btn-secondary p-2 rounded-lg text-blue-400 transition-all"
                          title="Reset Access Code"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div 
            className="rounded-2xl p-6 max-w-md w-full mx-4"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {!createdCredentials ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-white">Create New User</h2>
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreateForm({ access_code: '', password: '', plan_type: 'starter' });
                    }}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setCreating(true);
                    try {
                      const token = localStorage.getItem('accessToken');
                      const response = await fetch('/api/admin/users/create', {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          access_code: createForm.access_code || undefined,
                          password: createForm.password,
                          plan_type: createForm.plan_type,
                        }),
                      });

                      if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || 'Failed to create user');
                      }

                      const result = await response.json();
                      setCreatedCredentials(result.credentials);
                      await fetchUsers();
                    } catch (error) {
                      alert(error instanceof Error ? error.message : 'Failed to create user');
                    } finally {
                      setCreating(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Access Code (optional - auto-generated if empty)
                    </label>
                    <input
                      type="text"
                      value={createForm.access_code}
                      onChange={(e) => setCreateForm({ ...createForm, access_code: e.target.value.toUpperCase() })}
                      placeholder="Leave empty to auto-generate"
                      className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Password <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                      placeholder="Minimum 6 characters"
                      required
                      minLength={6}
                      className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Plan Type
                    </label>
                    <select
                      value={createForm.plan_type}
                      onChange={(e) => setCreateForm({ ...createForm, plan_type: e.target.value as 'starter' | 'enterprise' })}
                      className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50"
                    >
                      <option value="starter">Starter</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setCreateForm({ access_code: '', password: '', plan_type: 'starter' });
                      }}
                      className="flex-1 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creating || !createForm.password}
                      className="flex-1 px-4 py-2 rounded-xl text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: creating || !createForm.password
                          ? 'rgba(79, 107, 255, 0.5)'
                          : 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
                      }}
                    >
                      {creating ? 'Creating...' : 'Create User'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div>
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-white mb-2">User Created Successfully</h2>
                  <p className="text-sm text-gray-400 mb-4">
                    Save these credentials - they will not be shown again.
                  </p>
                </div>

                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Access Code</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm">
                        {createdCredentials.access_code}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdCredentials.access_code);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="p-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm">
                        {createdCredentials.password}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdCredentials.password);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="p-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreatedCredentials(null);
                    setCreateForm({ access_code: '', password: '', plan_type: 'starter' });
                  }}
                  className="w-full px-4 py-2 rounded-xl text-white font-medium transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
                  }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}