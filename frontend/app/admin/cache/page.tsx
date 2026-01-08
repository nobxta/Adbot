'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Trash2,
  RotateCcw,
  Download,
  Calendar,
  AlertCircle,
  Clock,
  User,
  Package,
  Key,
  ExternalLink,
} from 'lucide-react';

interface DeletedAdbot {
  id: string;
  status: string;
  deleted_at: string;
  deletion_scheduled_at: string;
  delete_reason: string;
  days_until_permanent_deletion: number | null;
  can_recover: boolean;
  product?: {
    id: string;
    name: string;
    plan_type: string;
    price: number;
  };
  user?: {
    id: string;
    email: string;
  };
  bot?: {
    id: string;
    bot_id: string;
    access_code: string;
  };
  deleted_by?: {
    id: string;
    user_id: string;
  };
  valid_until: string;
  created_at: string;
}

export default function AdminCachePage() {
  const router = useRouter();
  const [deletedAdbots, setDeletedAdbots] = useState<DeletedAdbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchDeletedAdbots();
  }, []);

  const fetchDeletedAdbots = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/adbots/cache', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        setDeletedAdbots(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching deleted adbots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (adbotId: string) => {
    setRecovering(new Set([adbotId]));
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/recover`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await fetchDeletedAdbots();
        alert('Adbot recovered successfully');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to recover adbot');
      }
    } catch (error) {
      console.error('Error recovering adbot:', error);
      alert('Failed to recover adbot');
    } finally {
      setRecovering(new Set());
    }
  };

  const handlePermanentDelete = async (adbotId: string) => {
    if (!confirm('Are you sure you want to permanently delete this adbot? This action cannot be undone!')) {
      return;
    }

    setDeleting(new Set([adbotId]));
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/permanent-delete`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await fetchDeletedAdbots();
        alert('Adbot permanently deleted');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to permanently delete adbot');
      }
    } catch (error) {
      console.error('Error permanently deleting adbot:', error);
      alert('Failed to permanently delete adbot');
    } finally {
      setDeleting(new Set());
    }
  };

  const handleDownloadLogs = async (adbotId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/posting-logs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        const logs = result.data || [];
        
        // Create downloadable JSON file
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `adbot-${adbotId}-logs.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert('No logs available for this adbot');
      }
    } catch (error) {
      console.error('Error downloading logs:', error);
      alert('Failed to download logs');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getDaysUntilDeletion = (adbot: DeletedAdbot) => {
    if (adbot.days_until_permanent_deletion === null) return 'Unknown';
    if (adbot.days_until_permanent_deletion <= 0) return 'Expired';
    return `${adbot.days_until_permanent_deletion} days`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Admin Cache</h1>
          <p className="text-gray-400">Deleted adbots with 10-day recovery window</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        ) : deletedAdbots.length === 0 ? (
          <div className="rounded-xl p-12 text-center bg-gray-800/50 border border-white/10">
            <Trash2 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No deleted adbots in cache</p>
            <p className="text-gray-500 text-sm mt-2">Deleted adbots will appear here for 10 days</p>
          </div>
        ) : (
          <div className="space-y-4">
            {deletedAdbots.map((adbot) => (
              <div
                key={adbot.id}
                className="rounded-xl p-6 bg-gray-800/50 border border-white/10 hover:border-red-500/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-white">
                        {adbot.product?.name || 'Unknown Plan'}
                      </h3>
                      <span className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
                        DELETED
                      </span>
                      {adbot.days_until_permanent_deletion !== null && adbot.days_until_permanent_deletion <= 0 && (
                        <span className="px-2 py-1 rounded text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30">
                          EXPIRED
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-400">User:</span>
                        <span className="text-white">{adbot.user?.email || 'No email'}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm">
                        <Key className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-400">Access Code:</span>
                        <span className="text-white font-mono">{adbot.bot?.access_code || 'N/A'}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-400">Deleted:</span>
                        <span className="text-white">{formatDate(adbot.deleted_at)}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-400">Deletes in:</span>
                        <span className={`font-semibold ${
                          adbot.days_until_permanent_deletion !== null && adbot.days_until_permanent_deletion <= 3
                            ? 'text-red-400'
                            : 'text-yellow-400'
                        }`}>
                          {getDaysUntilDeletion(adbot)}
                        </span>
                      </div>
                    </div>
                    
                    {adbot.delete_reason && (
                      <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-sm text-red-300">
                          <strong>Reason:</strong> {adbot.delete_reason}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2 ml-4">
                    {adbot.can_recover && (
                      <button
                        onClick={() => handleRecover(adbot.id)}
                        disabled={recovering.has(adbot.id)}
                        className="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {recovering.has(adbot.id) ? 'Recovering...' : 'Recover'}
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleDownloadLogs(adbot.id)}
                      className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Logs
                    </button>
                    
                    <button
                      onClick={() => handlePermanentDelete(adbot.id)}
                      disabled={deleting.has(adbot.id)}
                      className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      {deleting.has(adbot.id) ? 'Deleting...' : 'Delete Forever'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


