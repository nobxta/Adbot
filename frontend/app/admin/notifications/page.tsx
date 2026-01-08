'use client';

import { useEffect, useState } from 'react';
import { Bell, Send, Users, CheckCircle } from 'lucide-react';

export default function NotificationsPage() {
  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'INFO',
  });
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setStatus(null);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/notifications/broadcast', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send broadcast');
      }

      const result = await response.json();
      setStatus({
        type: 'success',
        message: result.message || 'Broadcast sent successfully',
      });

      setFormData({ title: '', message: '', type: 'INFO' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to send broadcast',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Bell className="w-8 h-8" />
          Notifications
        </h1>
        <p className="text-gray-400">Send broadcast notifications to all users</p>
      </div>

      {/* Broadcast Form */}
      <div
        className="rounded-xl p-6 max-w-2xl"
        style={{
          backgroundColor: 'rgba(10, 15, 30, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Send className="w-5 h-5" />
          Send Broadcast
        </h2>

        <form onSubmit={handleSendBroadcast} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Notification Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="INFO">Info</option>
              <option value="SUCCESS">Success</option>
              <option value="WARNING">Warning</option>
              <option value="ERROR">Error</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Notification title"
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Message</label>
            <textarea
              required
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Notification message"
              rows={5}
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {status && (
            <div
              className={`p-3 rounded-lg flex items-center gap-2 ${
                status.type === 'success'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {status.type === 'success' && <CheckCircle className="w-5 h-5" />}
              <p>{status.message}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
              color: '#FFFFFF',
            }}
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send to All Users
              </>
            )}
          </button>
        </form>
      </div>

      {/* Info Box */}
      <div
        className="rounded-xl p-6 max-w-2xl"
        style={{
          backgroundColor: 'rgba(79, 107, 255, 0.1)',
          border: '1px solid rgba(79, 107, 255, 0.2)',
        }}
      >
        <div className="flex items-start gap-3">
          <Users className="w-5 h-5 text-blue-400 mt-1" />
          <div>
            <h3 className="text-blue-400 font-medium mb-1">Broadcast Information</h3>
            <p className="text-sm text-blue-300">
              This will send a notification to all active users in the system. Users will see this in their notification panel.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

