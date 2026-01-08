'use client';

import { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle2, Loader2, RefreshCw, Clock, User, ShoppingCart, Bot } from 'lucide-react';

interface QueuedAdbot {
  id: string;
  user_id: string;
  order_id: string | null;
  product_id: string;
  status: string;
  required_sessions: number;
  missing_sessions_count: number;
  sessions_assigned: number;
  queued_at: string;
  queued_reason: string | null;
  creation_source: 'USER_PAYMENT' | 'ADMIN_MANUAL';
  execution_mode: string;
  posting_interval_minutes: number;
  valid_until: string;
  order?: {
    id: string;
    total_amount: number;
    status: string;
    created_at: string;
  };
  product?: {
    id: string;
    name: string;
    plan_type: string;
    sessions_count: number;
  };
  user?: {
    id: string;
    email: string;
    access_code: string;
  };
}

interface QueuePopupProps {
  onClose: () => void;
}

export default function QueuePopup({ onClose }: QueuePopupProps) {
  const [queuedAdbots, setQueuedAdbots] = useState<QueuedAdbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [passingQueue, setPassingQueue] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchQueuedAdbots();
  }, []);

  const fetchQueuedAdbots = async () => {
    try {
      setRefreshing(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/queue/list', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch queued adbots');
      }

      const result = await response.json();
      if (result.success) {
        setQueuedAdbots(result.data || []);
        setErrors({});
      }
    } catch (error) {
      console.error('Error fetching queued adbots:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handlePassQueue = async (adbotId: string) => {
    if (passingQueue.has(adbotId)) {
      return; // Already processing
    }

    setPassingQueue(prev => new Set(prev).add(adbotId));
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[adbotId];
      return newErrors;
    });

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/queue/pass', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ adbot_id: adbotId }),
      });

      const result = await response.json();

      if (result.success) {
        // Remove from list
        setQueuedAdbots(prev => prev.filter(a => a.id !== adbotId));
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[adbotId];
          return newErrors;
        });

        // If no more queued adbots, close popup
        if (queuedAdbots.length === 1) {
          setTimeout(() => {
            onClose();
          }, 1000);
        }
      } else {
        // Show error inline - keep popup open
        const errorMessage = result.error || 'Failed to pass queue';
        setErrors(prev => ({
          ...prev,
          [adbotId]: errorMessage,
        }));

        // If 409 Conflict (concurrent update), refresh immediately
        if (response.status === 409) {
          // Another admin or process resolved it - refresh list
          setTimeout(() => {
            fetchQueuedAdbots();
          }, 500);
        } else {
          // Refresh to get updated missing count and reason
          fetchQueuedAdbots();
        }
      }
    } catch (error) {
      console.error('Error passing queue:', error);
      setErrors(prev => ({
        ...prev,
        [adbotId]: error instanceof Error ? error.message : 'Failed to pass queue',
      }));
    } finally {
      setPassingQueue(prev => {
        const newSet = new Set(prev);
        newSet.delete(adbotId);
        return newSet;
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
        <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="ml-3 text-white">Loading queued adbots...</span>
          </div>
        </div>
      </div>
    );
  }

  if (queuedAdbots.length === 0) {
    return null; // No queued adbots, don't show popup
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-yellow-500" />
            <div>
              <h2 className="text-2xl font-bold text-white">Queued AdBots</h2>
              <p className="text-gray-400 text-sm">
                {queuedAdbots.length} adbot{queuedAdbots.length !== 1 ? 's' : ''} waiting for sessions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchQueuedAdbots}
              disabled={refreshing}
              className="p-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {queuedAdbots.map((adbot) => (
              <div
                key={adbot.id}
                className="bg-gray-800 rounded-lg p-5 border border-gray-700"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="w-5 h-5 text-blue-500" />
                      <span className="font-mono text-sm text-gray-400">Bot ID: {adbot.id.substring(0, 8)}...</span>
                      {adbot.order_id && (
                        <>
                          <ShoppingCart className="w-4 h-4 text-gray-500 ml-3" />
                          <span className="font-mono text-sm text-gray-400">Order: {adbot.order_id.substring(0, 8)}...</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        adbot.creation_source === 'USER_PAYMENT'
                          ? 'bg-green-900 text-green-300'
                          : 'bg-blue-900 text-blue-300'
                      }`}>
                        {adbot.creation_source === 'USER_PAYMENT' ? 'User Payment' : 'Admin Manual'}
                      </span>
                      {adbot.product && (
                        <span className="text-gray-300">{adbot.product.name}</span>
                      )}
                      {adbot.user && (
                        <span className="text-gray-400 flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {adbot.user.email || adbot.user.access_code}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-yellow-500 text-sm mb-1">
                      <Clock className="w-4 h-4" />
                      <span>Queued: {formatDate(adbot.queued_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Session Info */}
                <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-gray-900 rounded">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Required Sessions</div>
                    <div className="text-lg font-semibold text-white">{adbot.required_sessions}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Assigned Sessions</div>
                    <div className="text-lg font-semibold text-green-400">{adbot.sessions_assigned}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Missing Sessions</div>
                    <div className="text-lg font-semibold text-red-400">{adbot.missing_sessions_count}</div>
                  </div>
                </div>

                {/* Queue Reason */}
                {adbot.queued_reason && (
                  <div className="mb-4 p-3 bg-yellow-900 bg-opacity-20 border border-yellow-800 rounded">
                    <div className="text-xs text-yellow-400 font-medium mb-1">Reason:</div>
                    <div className="text-sm text-yellow-300">{adbot.queued_reason}</div>
                  </div>
                )}

                {/* Error Message */}
                {errors[adbot.id] && (
                  <div className="mb-4 p-3 bg-red-900 bg-opacity-20 border border-red-800 rounded">
                    <div className="text-sm text-red-300">{errors[adbot.id]}</div>
                  </div>
                )}

                {/* Pass Queue Button */}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => handlePassQueue(adbot.id)}
                    disabled={passingQueue.has(adbot.id)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: passingQueue.has(adbot.id)
                        ? 'rgba(79, 107, 255, 0.5)'
                        : 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
                      color: '#FFFFFF',
                    }}
                  >
                    {passingQueue.has(adbot.id) ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Pass Queue</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-800">
          <p className="text-xs text-gray-400 text-center">
            Click "Pass Queue" to re-check session availability and attempt to complete provisioning.
            The popup will reappear on every admin login until all adbots are resolved.
          </p>
        </div>
      </div>
    </div>
  );
}

