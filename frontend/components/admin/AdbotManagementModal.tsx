'use client';

import { useState, useEffect } from 'react';
import {
  X, Settings, Users, Calendar, Clock, Key, Link as LinkIcon,
  Play, Square, RefreshCw, Ban, Unlock, Shield, ShieldOff,
  Pause, PlayCircle, Trash2, Package, History, Download,
  ArrowRightLeft, CheckCircle, AlertCircle, Activity, FileText,
  Edit, Save, Plus, Minus, Copy, Check, ExternalLink
} from 'lucide-react';

interface AdbotManagementModalProps {
  adbot: any;
  onClose: () => void;
  onUpdate: () => void;
}

type TabType = 'overview' | 'sessions' | 'settings' | 'validity' | 'plan' | 'logs' | 'actions';

export default function AdbotManagementModal({ adbot, onClose, onUpdate }: AdbotManagementModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [saving, setSaving] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [sessionHealth, setSessionHealth] = useState<Record<string, any>>({});
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [postingLogs, setPostingLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  // Form states
  const [editingInterval, setEditingInterval] = useState(false);
  const [newInterval, setNewInterval] = useState(adbot?.posting_interval_minutes || 0);
  const [editingPostLink, setEditingPostLink] = useState(false);
  const [newPostLink, setNewPostLink] = useState(adbot?.post_link || '');
  const [editingTargetGroups, setEditingTargetGroups] = useState(false);
  const [newTargetGroups, setNewTargetGroups] = useState<string[]>(adbot?.target_groups || []);
  const [targetGroupInput, setTargetGroupInput] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [freezeReason, setFreezeReason] = useState('');

  useEffect(() => {
    if (adbot) {
      setNewInterval(adbot.posting_interval_minutes || 0);
      setNewPostLink(adbot.post_link || '');
      setNewTargetGroups(adbot.target_groups || []);
    }
  }, [adbot]);

  const handleHealthCheck = async () => {
    if (!adbot?.sessions || adbot.sessions.length === 0) return;
    
    setCheckingHealth(true);
    try {
      const token = localStorage.getItem('accessToken');
      const sessionFilenames = adbot.sessions.map((s: any) => s.session_file_path?.split('/').pop() || s.id);
      
      const response = await fetch(`/api/admin/adbots/${adbot.id}/sessions/health-check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_filenames: sessionFilenames }),
      });

      if (response.ok) {
        const result = await response.json();
        setSessionHealth(result.data || {});
      }
    } catch (error) {
      console.error('Error checking health:', error);
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleFreeze = async () => {
    if (!freezeReason.trim()) {
      alert('Please provide a reason for freezing');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbot.id}/freeze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: freezeReason }),
      });

      if (response.ok) {
        setFreezeReason('');
        onUpdate();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to freeze adbot');
      }
    } catch (error) {
      console.error('Error freezing adbot:', error);
      alert('Failed to freeze adbot');
    } finally {
      setSaving(false);
    }
  };

  const handleUnfreeze = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbot.id}/unfreeze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        onUpdate();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to unfreeze adbot');
      }
    } catch (error) {
      console.error('Error unfreezing adbot:', error);
      alert('Failed to unfreeze adbot');
    } finally {
      setSaving(false);
    }
  };

  const handleSuspend = async () => {
    if (!suspendReason.trim()) {
      alert('Please provide a reason for suspension');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbot.id}/suspend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: suspendReason }),
      });

      if (response.ok) {
        setSuspendReason('');
        onUpdate();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to suspend adbot');
      }
    } catch (error) {
      console.error('Error suspending adbot:', error);
      alert('Failed to suspend adbot');
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbot.id}/restart`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        onUpdate();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to restart adbot');
      }
    } catch (error) {
      console.error('Error restarting adbot:', error);
      alert('Failed to restart adbot');
    } finally {
      setSaving(false);
    }
  };

  const fetchPostingLogs = async () => {
    setLoadingLogs(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbot.id}/posting-logs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        setPostingLogs(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching posting logs:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const toggleSessionSelection = (sessionId: string) => {
    const newSelected = new Set(selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  const selectAllSessions = () => {
    if (selectedSessions.size === adbot?.sessions?.length) {
      setSelectedSessions(new Set());
    } else {
      setSelectedSessions(new Set(adbot?.sessions?.map((s: any) => s.id) || []));
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-500/20';
      case 'banned': return 'text-red-400 bg-red-500/20';
      case 'frozen': return 'text-blue-400 bg-blue-500/20';
      case 'limited': return 'text-yellow-400 bg-yellow-500/20';
      case 'unauthorized': return 'text-orange-400 bg-orange-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: Activity },
    { id: 'sessions' as TabType, label: 'Sessions', icon: Users },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
    { id: 'validity' as TabType, label: 'Validity', icon: Calendar },
    { id: 'plan' as TabType, label: 'Plan', icon: Package },
    { id: 'logs' as TabType, label: 'Logs', icon: FileText },
    { id: 'actions' as TabType, label: 'Actions', icon: Shield },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex">
      {/* Sidebar - Always Visible */}
      <div className="w-64 bg-gray-900 border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">Adbot Control</h2>
          <p className="text-sm text-gray-400 mt-1">{adbot?.product?.name || 'Adbot'}</p>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'logs') {
                    fetchPostingLogs();
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-white mb-6">Overview</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="rounded-xl p-6 bg-gray-800/50 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">Status</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      adbot?.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                      adbot?.status === 'SUSPENDED' ? 'bg-orange-500/20 text-orange-400' :
                      adbot?.status === 'STOPPED' ? 'bg-gray-500/20 text-gray-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {adbot?.status}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-white">{adbot?.status || 'N/A'}</p>
                </div>

                <div className="rounded-xl p-6 bg-gray-800/50 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">Sessions</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{adbot?.sessions?.length || 0}</p>
                </div>

                <div className="rounded-xl p-6 bg-gray-800/50 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">Messages Sent</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{adbot?.messages_sent || 0}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-white">Session Management</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleHealthCheck}
                    disabled={checkingHealth}
                    className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                  >
                    {checkingHealth ? 'Checking...' : 'Health Check'}
                  </button>
                  <button
                    onClick={selectAllSessions}
                    className="px-4 py-2 rounded-lg bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30 transition-colors"
                  >
                    {selectedSessions.size === adbot?.sessions?.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>

              {selectedSessions.size > 0 && (
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center justify-between">
                    <p className="text-blue-300 text-sm">
                      {selectedSessions.size} session(s) selected
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          // Ban selected sessions
                          const token = localStorage.getItem('accessToken');
                          for (const sessionId of selectedSessions) {
                            await fetch(`/api/admin/adbots/${adbot.id}/sessions/${sessionId}/ban`, {
                              method: 'POST',
                              headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({ reason: 'Banned by admin' }),
                            });
                          }
                          setSelectedSessions(new Set());
                          onUpdate();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 text-sm"
                      >
                        Ban Selected
                      </button>
                      <button
                        onClick={async () => {
                          // Replace selected sessions
                          const token = localStorage.getItem('accessToken');
                          const response = await fetch(`/api/admin/adbots/${adbot.id}/sessions`, {
                            method: 'POST',
                            headers: {
                              'Authorization': `Bearer ${token}`,
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              session_count: selectedSessions.size,
                              action: 'replace',
                              selected_session_ids: Array.from(selectedSessions),
                            }),
                          });
                          if (response.ok) {
                            setSelectedSessions(new Set());
                            onUpdate();
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 text-sm"
                      >
                        Replace Selected
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {adbot?.sessions?.map((session: any) => {
                  const health = sessionHealth[session.id] || sessionHealth[session.session_file_path?.split('/').pop() || ''];
                  const isSelected = selectedSessions.has(session.id);
                  
                  return (
                    <div
                      key={session.id}
                      className={`p-4 rounded-lg border transition-colors ${
                        isSelected
                          ? 'bg-blue-500/10 border-blue-500/30'
                          : 'bg-gray-800/50 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSessionSelection(session.id)}
                            className="w-4 h-4 rounded"
                          />
                          <div className="flex-1">
                            <p className="text-white font-medium">{session.phone_number || 'Unknown'}</p>
                            <p className="text-gray-400 text-xs font-mono">{session.id}</p>
                            {health && (
                              <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${getHealthStatusColor(health.status)}`}>
                                {health.status?.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            session.status === 'ASSIGNED' ? 'bg-green-500/20 text-green-400' :
                            session.status === 'BANNED' ? 'bg-red-500/20 text-red-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {session.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-white">Settings</h3>
              
              {/* Posting Interval */}
              <div className="rounded-xl p-6 bg-gray-800/50 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Posting Interval
                  </h4>
                  {!editingInterval ? (
                    <button
                      onClick={() => setEditingInterval(true)}
                      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          // Save interval
                          setEditingInterval(false);
                          onUpdate();
                        }}
                        className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingInterval(false);
                          setNewInterval(adbot?.posting_interval_minutes || 0);
                        }}
                        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                {editingInterval ? (
                  <input
                    type="number"
                    min="1"
                    value={newInterval}
                    onChange={(e) => setNewInterval(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
                  />
                ) : (
                  <p className="text-2xl font-bold text-white">{adbot?.posting_interval_minutes || 0} minutes</p>
                )}
              </div>

              {/* Post Link */}
              <div className="rounded-xl p-6 bg-gray-800/50 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                    <LinkIcon className="w-5 h-5" />
                    Post Link
                  </h4>
                  {!editingPostLink ? (
                    <button
                      onClick={() => setEditingPostLink(true)}
                      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          setEditingPostLink(false);
                          onUpdate();
                        }}
                        className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingPostLink(false);
                          setNewPostLink(adbot?.post_link || '');
                        }}
                        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                {editingPostLink ? (
                  <input
                    type="url"
                    value={newPostLink}
                    onChange={(e) => setNewPostLink(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
                    placeholder="https://t.me/..."
                  />
                ) : (
                  <a
                    href={adbot?.post_link || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-2"
                  >
                    {adbot?.post_link || 'Not set'}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-white">Admin Actions</h3>
              
              {/* Control Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={handleRestart}
                  disabled={saving}
                  className="p-4 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors flex items-center gap-3"
                >
                  <RefreshCw className="w-5 h-5" />
                  <span>Restart</span>
                </button>

                <button
                  onClick={() => {
                    const reason = prompt('Enter freeze reason:');
                    if (reason) {
                      setFreezeReason(reason);
                      handleFreeze();
                    }
                  }}
                  disabled={saving}
                  className="p-4 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors flex items-center gap-3"
                >
                  <Shield className="w-5 h-5" />
                  <span>Freeze</span>
                </button>
                
                <button
                  onClick={handleUnfreeze}
                  disabled={saving}
                  className="p-4 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors flex items-center gap-3"
                >
                  <ShieldOff className="w-5 h-5" />
                  <span>Unfreeze</span>
                </button>

                {adbot?.status === 'SUSPENDED' ? (
                  <button
                    onClick={async () => {
                      const token = localStorage.getItem('accessToken');
                      const response = await fetch(`/api/admin/adbots/${adbot.id}/resume`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                      });
                      if (response.ok) onUpdate();
                    }}
                    disabled={saving}
                    className="p-4 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors flex items-center gap-3"
                  >
                    <PlayCircle className="w-5 h-5" />
                    <span>Resume</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const reason = prompt('Enter suspension reason:');
                      if (reason) {
                        setSuspendReason(reason);
                        handleSuspend();
                      }
                    }}
                    disabled={saving}
                    className="p-4 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-colors flex items-center gap-3"
                  >
                    <Pause className="w-5 h-5" />
                    <span>Suspend</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'validity' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-white">Validity Management</h3>
              
              <div className="rounded-xl p-6 bg-gray-800/50 border border-white/10">
                <div className="mb-4">
                  <p className="text-gray-400 text-sm mb-2">Current Validity</p>
                  <p className="text-2xl font-bold text-white">
                    {adbot?.valid_until ? new Date(adbot.valid_until).toLocaleDateString() : 'N/A'}
                  </p>
                  {adbot?.valid_until && (
                    <p className="text-sm text-gray-400 mt-1">
                      {new Date(adbot.valid_until) < new Date() ? 'Expired' : 
                       `Expires in ${Math.ceil((new Date(adbot.valid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days`}
                    </p>
                  )}
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={async () => {
                      const token = localStorage.getItem('accessToken');
                      const response = await fetch(`/api/admin/adbots/${adbot.id}/extend`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ days: 7 }),
                      });
                      if (response.ok) onUpdate();
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30"
                  >
                    +7 Days
                  </button>
                  <button
                    onClick={async () => {
                      const token = localStorage.getItem('accessToken');
                      const response = await fetch(`/api/admin/adbots/${adbot.id}/extend`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ days: 30 }),
                      });
                      if (response.ok) onUpdate();
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30"
                  >
                    +30 Days
                  </button>
                  <button
                    onClick={async () => {
                      const token = localStorage.getItem('accessToken');
                      const response = await fetch(`/api/admin/adbots/${adbot.id}/extend`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ days: 90 }),
                      });
                      if (response.ok) onUpdate();
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30"
                  >
                    +90 Days
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'plan' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-white">Plan Management</h3>
              
              {adbot?.product && (
                <div className="rounded-xl p-6 bg-gray-800/50 border border-white/10">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Current Plan:</span>
                      <span className="text-white font-semibold">{adbot.product.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Type:</span>
                      <span className="text-white">{adbot.product.plan_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Price:</span>
                      <span className="text-white">${adbot.product.price}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Sessions:</span>
                      <span className="text-white">{adbot.product.sessions_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Interval:</span>
                      <span className="text-white">{adbot.product.posting_interval_minutes} min</span>
                    </div>
                  </div>
                  
                  <button
                    onClick={async () => {
                      // This would open a change plan modal
                      alert('Change plan functionality - to be implemented');
                    }}
                    className="mt-4 w-full px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30"
                  >
                    Change Plan
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-white">Posting Logs</h3>
              
              {loadingLogs ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              ) : postingLogs.length > 0 ? (
                <div className="space-y-2">
                  {postingLogs.map((log, index) => (
                    <div key={index} className="p-4 rounded-lg bg-gray-800/50 border border-white/10">
                      <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                        {JSON.stringify(log, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center py-8">No posting logs found</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

