'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Key,
  User,
  Calendar,
  Clock,
  Play,
  Square,
  RefreshCw,
  Settings,
  Users,
  AlertCircle,
  CheckCircle,
  Edit,
  Save,
  X,
  Copy,
  Check,
  Pause,
  PlayCircle,
  Trash2,
  Download,
  ExternalLink,
  Ban,
  Unlock,
  ArrowRightLeft,
  Package,
  History,
  MessageSquare,
  Link as LinkIcon,
  Shield,
  ShieldOff,
  Plus,
  Minus,
} from 'lucide-react';
import { startAdbot, stopAdbot } from '@/lib/python-backend';
import AdbotManagementModal from '@/components/admin/AdbotManagementModal';

interface AdbotDetail {
  id: string;
  user_id: string;
  bot_id?: string;
  product_id: string;
  status: string;
  valid_until: string;
  created_at: string;
  posting_interval_minutes: number;
  sessions_assigned: number;
  messages_sent: number;
  groups_reached: number;
  post_link?: string;
  target_groups?: string[];
  product?: {
    id: string;
    name: string;
    plan_type: string;
    sessions_count: number;
    posting_interval_minutes: number;
    validity_days: number;
    price: number;
  };
  bot?: {
    id: string;
    bot_id: string;
    access_code: string;
    plan_type: string;
    plan_status: string;
    cycle_delay: number;
    expires_at: string;
  };
  user?: {
    id: string;
    email: string;
    access_code: string;
    role: string;
    is_active: boolean;
    is_suspended: boolean;
    created_at: string;
    last_login: string | null;
  };
  sessions?: Array<{
    id: string;
    phone_number: string;
    status: string;
    assigned_at: string;
    banned_at?: string;
    banned_reason?: string;
  }>;
}

export default function AdbotDetailPage() {
  const router = useRouter();
  const params = useParams();
  const adbotId = params?.id as string;

  const [adbot, setAdbot] = useState<AdbotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Edit states
  const [editingAccessCode, setEditingAccessCode] = useState(false);
  const [newAccessCode, setNewAccessCode] = useState('');
  const [editingInterval, setEditingInterval] = useState(false);
  const [newInterval, setNewInterval] = useState(0);
  const [editingValidity, setEditingValidity] = useState(false);
  const [newValidity, setNewValidity] = useState('');
  const [reassignSessions, setReassignSessions] = useState(false);
  const [sessionCount, setSessionCount] = useState(1);
  const [reassignAction, setReassignAction] = useState<'add' | 'replace'>('replace');
  
  // Additional management states
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [showActivityLogs, setShowActivityLogs] = useState(false);
  const [editingPostLink, setEditingPostLink] = useState(false);
  const [editingTargetGroups, setEditingTargetGroups] = useState(false);
  const [newPostLink, setNewPostLink] = useState('');
  const [newTargetGroups, setNewTargetGroups] = useState<string[]>([]);
  const [targetGroupInput, setTargetGroupInput] = useState('');
  const [transferUserId, setTransferUserId] = useState('');
  const [transferUserEmail, setTransferUserEmail] = useState('');
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [selectedNewProductId, setSelectedNewProductId] = useState('');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showManagementModal, setShowManagementModal] = useState(false);

  useEffect(() => {
    if (adbotId) {
      fetchAdbot();
    }
  }, [adbotId]);

  const fetchAdbot = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch adbot');

      const result = await response.json();
      if (result.success) {
        setAdbot(result.data);
        // Initialize access code from bot or user
        const accessCode = result.data.bot?.access_code || result.data.user?.access_code || '';
        console.log('[AdbotDetail] Fetched adbot:', {
          bot_id: result.data.bot_id,
          bot_access_code: result.data.bot?.access_code,
          user_access_code: result.data.user?.access_code,
          final_access_code: accessCode,
        });
        setNewAccessCode(accessCode);
        setNewInterval(result.data.posting_interval_minutes || 0);
        setNewValidity(result.data.valid_until || '');
        setSessionCount(result.data.sessions_assigned || 1);
        setNewPostLink(result.data.post_link || '');
        setNewTargetGroups(result.data.target_groups || []);
      }
    } catch (error) {
      console.error('Error fetching adbot:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!adbot) return;
    try {
      const result = await startAdbot(adbot.id);
      if (result.success) {
        await fetchAdbot();
      } else {
        alert(`Failed to start: ${result.error}`);
      }
    } catch (error) {
      console.error('Error starting adbot:', error);
      alert('Failed to start adbot');
    }
  };

  const handleStop = async () => {
    if (!adbot) return;
    try {
      const result = await stopAdbot(adbot.id);
      if (result.success) {
        await fetchAdbot();
      } else {
        alert(`Failed to stop: ${result.error}`);
      }
    } catch (error) {
      console.error('Error stopping adbot:', error);
      alert('Failed to stop adbot');
    }
  };

  const handleUpdateAccessCode = async () => {
    if (!newAccessCode.trim()) {
      alert('Access code cannot be empty');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/access-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_code: newAccessCode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update access code');
      }

      setEditingAccessCode(false);
      // Refresh the adbot data to get the updated access code
      await fetchAdbot();
      // Update the state with the new access code
      const updatedCode = newAccessCode.toUpperCase().trim();
      setNewAccessCode(updatedCode);
      alert('Access code updated successfully');
    } catch (error) {
      console.error('Error updating access code:', error);
      alert(error instanceof Error ? error.message : 'Failed to update access code');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateInterval = async () => {
    if (newInterval < 1) {
      alert('Interval must be at least 1 minute');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ posting_interval_minutes: newInterval }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update interval');
      }

      setEditingInterval(false);
      await fetchAdbot();
      alert('Posting interval updated successfully');
    } catch (error) {
      console.error('Error updating interval:', error);
      alert(error instanceof Error ? error.message : 'Failed to update interval');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateValidity = async () => {
    if (!newValidity) {
      alert('Please select a validity date');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ valid_until: newValidity }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update validity');
      }

      setEditingValidity(false);
      await fetchAdbot();
      alert('Validity updated successfully');
    } catch (error) {
      console.error('Error updating validity:', error);
      alert(error instanceof Error ? error.message : 'Failed to update validity');
    } finally {
      setSaving(false);
    }
  };

  const handleReassignSessions = async () => {
    if (sessionCount < 1) {
      alert('Session count must be at least 1');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_count: sessionCount,
          action: reassignAction,
        }),
      });

      if (!response.ok) {
        // Check if response is JSON or HTML
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to reassign sessions');
        } else {
          const text = await response.text();
          console.error('Non-JSON error response:', text);
          throw new Error(`Failed to reassign sessions: ${response.status} ${response.statusText}`);
        }
      }

      setReassignSessions(false);
      await fetchAdbot();
      alert('Sessions reassigned successfully');
    } catch (error) {
      console.error('Error reassigning sessions:', error);
      alert(error instanceof Error ? error.message : 'Failed to reassign sessions');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const showMessage = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  };
  
  const handleSuspend = async () => {
    if (!adbot) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/suspend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to suspend adbot');
      }
      
      setShowSuspendConfirm(false);
      showMessage('success', 'Adbot suspended successfully');
      await fetchAdbot();
    } catch (error) {
      console.error('Error suspending adbot:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to suspend adbot');
    } finally {
      setSaving(false);
    }
  };
  
  const handleResume = async () => {
    if (!adbot) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/resume`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resume adbot');
      }
      
      const result = await response.json();
      showMessage('success', result.message || 'Adbot resumed successfully');
      await fetchAdbot();
    } catch (error) {
      console.error('Error resuming adbot:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to resume adbot');
    } finally {
      setSaving(false);
    }
  };
  
  const handleExtendValidity = async (days: number) => {
    if (!adbot) return;
    setSaving(true);
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
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to extend validity');
      }
      
      showMessage('success', `Validity extended by ${days} days`);
      await fetchAdbot();
    } catch (error) {
      console.error('Error extending validity:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to extend validity');
    } finally {
      setSaving(false);
    }
  };
  
  const handleChangePlan = async () => {
    if (!selectedNewProductId) {
      showMessage('error', 'Please select a new plan');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/change-plan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product_id: selectedNewProductId }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to change plan');
      }
      
      const result = await response.json();
      setShowChangePlanModal(false);
      showMessage('success', result.message || 'Plan changed successfully');
      await fetchAdbot();
    } catch (error) {
      console.error('Error changing plan:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to change plan');
    } finally {
      setSaving(false);
    }
  };
  
  const handleTransfer = async () => {
    if (!transferUserId && !transferUserEmail) {
      showMessage('error', 'Please provide user ID or email');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/transfer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: transferUserId || undefined,
          user_email: transferUserEmail || undefined,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to transfer ownership');
      }
      
      setShowTransferModal(false);
      setTransferUserId('');
      setTransferUserEmail('');
      showMessage('success', 'Ownership transferred successfully');
      await fetchAdbot();
    } catch (error) {
      console.error('Error transferring ownership:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to transfer ownership');
    } finally {
      setSaving(false);
    }
  };
  
  const handleDelete = async () => {
    if (!adbot) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete adbot');
      }
      
      showMessage('success', 'Adbot deleted successfully');
      setTimeout(() => {
        router.push('/admin/adbots');
      }, 1500);
    } catch (error) {
      console.error('Error deleting adbot:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to delete adbot');
      setSaving(false);
    }
  };
  
  const handleBanSession = async (sessionId: string, reason?: string) => {
    if (!confirm(`Ban this session? ${reason ? `Reason: ${reason}` : ''}`)) return;
    
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/sessions/${sessionId}/ban`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: reason || 'Banned by admin' }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to ban session');
      }
      
      showMessage('success', 'Session banned successfully');
      await fetchAdbot();
    } catch (error) {
      console.error('Error banning session:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to ban session');
    } finally {
      setSaving(false);
    }
  };
  
  const handleUnbanSession = async (sessionId: string) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}/sessions/${sessionId}/unban`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to unban session');
      }
      
      showMessage('success', 'Session unbanned successfully');
      await fetchAdbot();
    } catch (error) {
      console.error('Error unbanning session:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to unban session');
    } finally {
      setSaving(false);
    }
  };
  
  const handleUpdatePostLink = async () => {
    if (!newPostLink.trim()) {
      showMessage('error', 'Post link cannot be empty');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ post_link: newPostLink }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update post link');
      }
      
      setEditingPostLink(false);
      showMessage('success', 'Post link updated successfully');
      await fetchAdbot();
    } catch (error) {
      console.error('Error updating post link:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to update post link');
    } finally {
      setSaving(false);
    }
  };
  
  const handleUpdateTargetGroups = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/adbots/${adbotId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target_groups: newTargetGroups }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update target groups');
      }
      
      setEditingTargetGroups(false);
      setTargetGroupInput('');
      showMessage('success', 'Target groups updated successfully');
      await fetchAdbot();
    } catch (error) {
      console.error('Error updating target groups:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to update target groups');
    } finally {
      setSaving(false);
    }
  };
  
  const addTargetGroup = () => {
    if (targetGroupInput.trim() && !newTargetGroups.includes(targetGroupInput.trim())) {
      setNewTargetGroups([...newTargetGroups, targetGroupInput.trim()]);
      setTargetGroupInput('');
    }
  };
  
  const removeTargetGroup = (index: number) => {
    setNewTargetGroups(newTargetGroups.filter((_, i) => i !== index));
  };
  
  const exportAdbotData = () => {
    if (!adbot) return;
    
    const exportData = {
      id: adbot.id,
      user_id: adbot.user_id,
      bot_id: adbot.bot_id,
      product_id: adbot.product_id,
      status: adbot.status,
      valid_until: adbot.valid_until,
      created_at: adbot.created_at,
      posting_interval_minutes: adbot.posting_interval_minutes,
      sessions_assigned: adbot.sessions_assigned,
      messages_sent: adbot.messages_sent,
      groups_reached: adbot.groups_reached,
      post_link: adbot.post_link,
      target_groups: adbot.target_groups,
      product: adbot.product,
      bot: adbot.bot,
      user: adbot.user,
      sessions: adbot.sessions,
      exported_at: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adbot-${adbot.id}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showMessage('success', 'Adbot data exported successfully');
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!adbot) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-400">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" />
          <p>Adbot not found</p>
          <button
            onClick={() => router.push('/admin/adbots')}
            className="mt-4 px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600"
          >
            Back to Adbots
          </button>
        </div>
      </div>
    );
  }

  const expired = new Date(adbot.valid_until) < new Date();
  const statusColor = adbot.status === 'ACTIVE' ? 'text-green-400' : adbot.status === 'STOPPED' ? 'text-gray-400' : 'text-red-400';

  return (
    <div className="p-6 space-y-6">
      {/* Action Message */}
      {actionMessage && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center gap-3 ${
            actionMessage.type === 'success'
              ? 'bg-green-500/20 border border-green-500/30 text-green-400'
              : 'bg-red-500/20 border border-red-500/30 text-red-400'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="ml-2 hover:opacity-70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/admin/adbots')}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              {adbot.product?.name || 'Adbot'} Management
              <span className={`text-sm font-normal ${statusColor}`}>
                ({adbot.status})
              </span>
            </h1>
            <p className="text-gray-400 text-sm font-mono mt-1">{adbot.id}</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Management Modal Button */}
          <button
            onClick={() => setShowManagementModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Manage
          </button>
          
          {adbot.status === 'ACTIVE' ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={expired}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Start
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Access Code Section */}
          <div className="rounded-xl p-6" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Key className="w-5 h-5" />
                Access Code
              </h2>
              {!editingAccessCode ? (
                <button
                  onClick={() => setEditingAccessCode(true)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdateAccessCode}
                    disabled={saving}
                    className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingAccessCode(false);
                      setNewAccessCode(adbot.bot?.access_code || adbot.user?.access_code || '');
                    }}
                    className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            {editingAccessCode ? (
              <input
                type="text"
                value={newAccessCode}
                onChange={(e) => setNewAccessCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white font-mono focus:outline-none focus:border-blue-500"
                placeholder="Enter new access code"
              />
            ) : (
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-3 rounded-lg bg-black/30 border border-white/10 text-white font-mono text-lg">
                  {newAccessCode || adbot.bot?.access_code || adbot.user?.access_code || 'N/A'}
                </code>
                <button
                  onClick={() => copyToClipboard(newAccessCode || adbot.bot?.access_code || adbot.user?.access_code || '')}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>

          {/* User Information */}
          <div className="rounded-xl p-6" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
              <User className="w-5 h-5" />
              User Information
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Email:</span>
                <span className="text-white">{adbot.user?.email || (adbot.user_id ? 'No email' : 'N/A')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">User ID:</span>
                <span className="text-white font-mono text-sm">{adbot.user_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Last Login:</span>
                <span className="text-white">
                  {adbot.user?.last_login ? new Date(adbot.user.last_login).toLocaleString() : 'Never'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Account Status:</span>
                <span className={`${adbot.user?.is_active !== false ? 'text-green-400' : 'text-red-400'}`}>
                  {adbot.user?.is_active !== false ? 'Active' : 'Inactive'}
                  {adbot.user?.is_suspended && ' (Suspended)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Created:</span>
                <span className="text-white">
                  {adbot.user?.created_at ? new Date(adbot.user.created_at).toLocaleDateString() : 
                   adbot.created_at ? new Date(adbot.created_at).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Sessions Management */}
          <div className="rounded-xl p-6" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Users className="w-5 h-5" />
                Sessions ({adbot.sessions?.length || 0})
              </h2>
              <button
                onClick={() => setReassignSessions(!reassignSessions)}
                className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors text-sm"
              >
                <RefreshCw className="w-4 h-4 inline mr-2" />
                Reassign
              </button>
            </div>

            {reassignSessions && (
              <div className="mb-4 p-4 rounded-lg bg-black/30 border border-white/10">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Action</label>
                    <select
                      value={reassignAction}
                      onChange={(e) => setReassignAction(e.target.value as 'add' | 'replace')}
                      className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="replace">Replace All Sessions</option>
                      <option value="add">Add More Sessions</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Session Count</label>
                    <input
                      type="number"
                      min="1"
                      value={sessionCount}
                      onChange={(e) => setSessionCount(parseInt(e.target.value) || 1)}
                      className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleReassignSessions}
                    disabled={saving}
                    className="w-full px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                  >
                    {saving ? 'Processing...' : 'Confirm Reassignment'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {adbot.sessions && adbot.sessions.length > 0 ? (
                adbot.sessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-3 rounded-lg bg-black/30 border border-white/5 flex justify-between items-center gap-2"
                  >
                    <div className="flex-1">
                      <p className="text-white text-sm">{session.phone_number || 'Unknown'}</p>
                      <p className="text-gray-500 text-xs font-mono truncate">{session.id}</p>
                      {session.banned_reason && (
                        <p className="text-red-400 text-xs mt-1">Reason: {session.banned_reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        session.status === 'ASSIGNED' ? 'bg-green-500/20 text-green-400' :
                        session.status === 'BANNED' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {session.status}
                      </span>
                      {session.status === 'ASSIGNED' ? (
                        <button
                          onClick={() => handleBanSession(session.id)}
                          className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                          title="Ban session"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      ) : session.status === 'BANNED' ? (
                        <button
                          onClick={() => handleUnbanSession(session.id)}
                          className="p-1.5 rounded hover:bg-green-500/20 text-green-400 transition-colors"
                          title="Unban session"
                        >
                          <Unlock className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-center py-4">No sessions assigned</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Settings */}
        <div className="space-y-6">
          {/* Posting Interval */}
          <div className="rounded-xl p-6" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Posting Interval
              </h2>
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
                    onClick={handleUpdateInterval}
                    disabled={saving}
                    className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingInterval(false);
                      setNewInterval(adbot.posting_interval_minutes || 0);
                    }}
                    className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            {editingInterval ? (
              <div className="space-y-2">
                <input
                  type="number"
                  min="1"
                  value={newInterval}
                  onChange={(e) => setNewInterval(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-400">Minutes between posts</p>
              </div>
            ) : (
              <div>
                <p className="text-2xl font-bold text-white">{adbot.posting_interval_minutes || 0}</p>
                <p className="text-sm text-gray-400">minutes</p>
              </div>
            )}
          </div>

          {/* Validity */}
          <div className="rounded-xl p-6" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Validity
                {expired && <AlertCircle className="w-4 h-4 text-red-400" />}
              </h2>
              {!editingValidity ? (
                <button
                  onClick={() => setEditingValidity(true)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdateValidity}
                    disabled={saving}
                    className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingValidity(false);
                      setNewValidity(adbot.valid_until || '');
                    }}
                    className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            {editingValidity ? (
              <input
                type="datetime-local"
                value={newValidity ? new Date(newValidity).toISOString().slice(0, 16) : ''}
                onChange={(e) => setNewValidity(new Date(e.target.value).toISOString())}
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
              />
            ) : (
              <div>
                <p className={`text-lg font-semibold ${expired ? 'text-red-400' : 'text-white'}`}>
                  {new Date(adbot.valid_until).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-400">
                  {expired ? 'Expired' : `Expires in ${Math.ceil((new Date(adbot.valid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days`}
                </p>
              </div>
            )}
          </div>

          {/* Plan Information */}
          {adbot.product && (
            <div className="rounded-xl p-6" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Plan Details
                </h2>
                <button
                  onClick={() => setShowChangePlanModal(true)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  title="Change plan"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Plan:</span>
                  <span className="text-white">{adbot.product.name}</span>
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
              </div>
            </div>
          )}
          
          {/* Post Link & Target Groups */}
          <div className="rounded-xl p-6" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <LinkIcon className="w-5 h-5" />
                Post & Groups
              </h2>
              {!editingPostLink && !editingTargetGroups && (
                <button
                  onClick={() => {
                    setEditingPostLink(true);
                    setEditingTargetGroups(true);
                  }}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <div className="space-y-4">
              {/* Post Link */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Post Link</label>
                {editingPostLink ? (
                  <div className="space-y-2">
                    <input
                      type="url"
                      value={newPostLink}
                      onChange={(e) => setNewPostLink(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                      placeholder="https://t.me/..."
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleUpdatePostLink}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 text-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingPostLink(false);
                          setNewPostLink(adbot.post_link || '');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <a
                      href={adbot.post_link || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 truncate flex-1"
                    >
                      {adbot.post_link || 'Not set'}
                    </a>
                    {adbot.post_link && (
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                )}
              </div>
              
              {/* Target Groups */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Target Groups</label>
                {editingTargetGroups ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={targetGroupInput}
                        onChange={(e) => setTargetGroupInput(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addTargetGroup();
                          }
                        }}
                        className="flex-1 px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                        placeholder="Enter group username or ID"
                      />
                      <button
                        onClick={addTargetGroup}
                        className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {newTargetGroups.map((group, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded bg-black/30">
                          <span className="text-white text-sm">{group}</span>
                          <button
                            onClick={() => removeTargetGroup(index)}
                            className="p-1 rounded hover:bg-red-500/20 text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleUpdateTargetGroups}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 text-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingTargetGroups(false);
                          setNewTargetGroups(adbot.target_groups || []);
                          setTargetGroupInput('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {adbot.target_groups && adbot.target_groups.length > 0 ? (
                      adbot.target_groups.map((group, index) => (
                        <div key={index} className="text-white text-sm p-2 rounded bg-black/30">
                          {group}
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 text-sm">No target groups set</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Quick Extend Validity */}
          {!editingValidity && (
            <div className="rounded-xl p-6" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <Plus className="w-5 h-5" />
                Quick Extend
              </h2>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleExtendValidity(7)}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors text-sm disabled:opacity-50"
                >
                  +7 Days
                </button>
                <button
                  onClick={() => handleExtendValidity(30)}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors text-sm disabled:opacity-50"
                >
                  +30 Days
                </button>
                <button
                  onClick={() => handleExtendValidity(90)}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors text-sm disabled:opacity-50"
                >
                  +90 Days
                </button>
              </div>
            </div>
          )}

          {/* Statistics */}
          <div className="rounded-xl p-6" style={{ backgroundColor: 'rgba(10, 15, 30, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5" />
              Statistics
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Messages Sent:</span>
                <span className="text-white">{adbot.messages_sent || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Groups Reached:</span>
                <span className="text-white">{adbot.groups_reached || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Sessions Assigned:</span>
                <span className="text-white">
                  {adbot.sessions && Array.isArray(adbot.sessions) ? adbot.sessions.length : 
                   (typeof adbot.sessions_assigned === 'number' ? adbot.sessions_assigned : 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Suspend Confirmation Modal */}
      {showSuspendConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-xl p-6 max-w-md w-full" style={{ backgroundColor: 'rgba(10, 15, 30, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <h3 className="text-xl font-semibold text-white mb-4">Suspend Adbot</h3>
            <p className="text-gray-400 mb-6">
              Are you sure you want to suspend this adbot? It will be stopped and the user won't be able to start it until you resume it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSuspend}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {saving ? 'Suspending...' : 'Suspend'}
              </button>
              <button
                onClick={() => setShowSuspendConfirm(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-xl p-6 max-w-md w-full" style={{ backgroundColor: 'rgba(10, 15, 30, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <h3 className="text-xl font-semibold text-red-400 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Delete Adbot
            </h3>
            <p className="text-gray-400 mb-2">
              <strong className="text-white">Warning:</strong> This action cannot be undone!
            </p>
            <p className="text-gray-400 mb-6">
              This will delete the adbot, unassign all sessions, and remove associated data. Are you absolutely sure?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {saving ? 'Deleting...' : 'Delete Forever'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Transfer Ownership Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-xl p-6 max-w-md w-full" style={{ backgroundColor: 'rgba(10, 15, 30, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5" />
                Transfer Ownership
              </h3>
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setTransferUserId('');
                  setTransferUserEmail('');
                }}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">User ID (Optional)</label>
                <input
                  type="text"
                  value={transferUserId}
                  onChange={(e) => setTransferUserId(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                  placeholder="Enter user ID"
                />
              </div>
              <div className="text-center text-gray-500 text-sm">OR</div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">User Email</label>
                <input
                  type="email"
                  value={transferUserEmail}
                  onChange={(e) => setTransferUserEmail(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                  placeholder="user@example.com"
                />
                <p className="text-xs text-gray-500 mt-1">User will be created if email doesn't exist</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleTransfer}
                  disabled={saving || (!transferUserId && !transferUserEmail)}
                  className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Transferring...' : 'Transfer'}
                </button>
                <button
                  onClick={() => {
                    setShowTransferModal(false);
                    setTransferUserId('');
                    setTransferUserEmail('');
                  }}
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Change Plan Modal */}
      {showChangePlanModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-xl p-6 max-w-md w-full" style={{ backgroundColor: 'rgba(10, 15, 30, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <Package className="w-5 h-5" />
                Change Plan
              </h3>
              <button
                onClick={() => {
                  setShowChangePlanModal(false);
                  setSelectedNewProductId('');
                }}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Current Plan</label>
                <div className="px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white">
                  {adbot.product?.name || 'N/A'}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Select New Plan</label>
                <select
                  value={selectedNewProductId}
                  onChange={(e) => setSelectedNewProductId(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select a plan</option>
                  {availableProducts
                    .filter(p => p.type === 'ADBOT_PLAN' && p.id !== adbot.product_id)
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.plan_type}) - ${product.price}
                      </option>
                    ))}
                </select>
              </div>
              {selectedNewProductId && (() => {
                const selectedProduct = availableProducts.find(p => p.id === selectedNewProductId);
                return selectedProduct ? (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm text-blue-300">
                      New plan: <strong>{selectedProduct.name}</strong><br />
                      Sessions: {selectedProduct.sessions_count} | Interval: {selectedProduct.posting_interval_minutes} min
                    </p>
                  </div>
                ) : null;
              })()}
              <div className="flex gap-3">
                <button
                  onClick={handleChangePlan}
                  disabled={saving || !selectedNewProductId}
                  className="flex-1 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Changing...' : 'Change Plan'}
                </button>
                <button
                  onClick={() => {
                    setShowChangePlanModal(false);
                    setSelectedNewProductId('');
                  }}
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Activity Logs Modal */}
      {showActivityLogs && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" style={{ backgroundColor: 'rgba(10, 15, 30, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <History className="w-5 h-5" />
                Activity Logs
              </h3>
              <button
                onClick={() => {
                  setShowActivityLogs(false);
                  setActivityLogs([]);
                }}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {loadingLogs ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            ) : activityLogs.length > 0 ? (
              <div className="space-y-2">
                {activityLogs.map((log, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg bg-black/30 border border-white/5"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-white font-medium">{log.action} - {log.entity_type}</p>
                        <p className="text-gray-400 text-xs font-mono">{log.id}</p>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    {log.details && (
                      <div className="mt-2 p-2 rounded bg-black/30">
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">No activity logs found</p>
            )}
          </div>
        </div>
      )}
      
      {/* Management Modal */}
      {showManagementModal && adbot && (
        <AdbotManagementModal
          adbot={adbot}
          onClose={() => setShowManagementModal(false)}
          onUpdate={fetchAdbot}
        />
      )}
    </div>
  );
}

