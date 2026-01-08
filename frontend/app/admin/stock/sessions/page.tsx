'use client';

import { useEffect, useState } from 'react';
import { Database, AlertTriangle, CheckCircle, XCircle, Trash2 } from 'lucide-react';

interface Session {
  id: string;
  phone_number: string;
  status: string;
  session_file_path: string;
  file_exists: boolean;
  file_missing: boolean;
  usable: boolean;
  assigned_to_adbot_id: string | null;
  created_at: string;
}

export default function SessionsListPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/stock/list', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch sessions');

      const result = await response.json();
      if (result.success) {
        setSessions(result.data.sessions || []);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'UNUSED':
        return { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' };
      case 'ASSIGNED':
        return { bg: 'rgba(79, 107, 255, 0.2)', text: '#4F6BFF' };
      case 'BANNED':
        return { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' };
      case 'INVALID_FILE':
        return { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' };
      case 'UPLOADING':
        return { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' };
      default:
        return { bg: 'rgba(156, 163, 175, 0.2)', text: '#9CA3AF' };
    }
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
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Database className="w-8 h-8" />
          Session Files (VPS Reality)
        </h1>
        <p className="text-gray-400">Shows database metadata + physical file existence on VPS</p>
      </div>

      {/* Sessions Table */}
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
                <th className="text-left p-4 text-sm font-semibold text-gray-400">Phone Number</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-400">Status</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-400">File Exists</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-400">Usable</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-400">File Path</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-400">Created</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    No sessions found
                  </td>
                </tr>
              ) : (
                sessions.map((session) => {
                  const statusColor = getStatusColor(session.status);
                  
                  return (
                    <tr
                      key={session.id}
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
                      className="hover:bg-white/5"
                    >
                      <td className="p-4">
                        <span className="text-white font-mono">{session.phone_number}</span>
                      </td>
                      <td className="p-4">
                        <span
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: statusColor.bg,
                            color: statusColor.text,
                          }}
                        >
                          {session.status}
                        </span>
                      </td>
                      <td className="p-4">
                        {session.file_exists ? (
                          <div className="flex items-center gap-1 text-green-400">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-sm">YES</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-red-400">
                            <XCircle className="w-4 h-4" />
                            <span className="text-sm">NO</span>
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        {session.usable ? (
                          <span className="text-green-400 text-sm font-medium">YES</span>
                        ) : (
                          <span className="text-red-400 text-sm font-medium">NO</span>
                        )}
                      </td>
                      <td className="p-4">
                        <code className="text-xs text-gray-400 font-mono">
                          {session.session_file_path || 'N/A'}
                        </code>
                      </td>
                      <td className="p-4">
                        <span className="text-xs text-gray-400">
                          {new Date(session.created_at).toLocaleDateString()}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warning for missing files */}
      {sessions.some(s => s.file_missing) && (
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
          <div>
            <p className="text-red-400 font-medium">Database/VPS Mismatch Detected</p>
            <p className="text-sm text-red-300 mt-1">
              {sessions.filter(s => s.file_missing).length} session(s) have database records but files are missing from VPS.
              These sessions cannot be assigned and should be marked as INVALID_FILE.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

