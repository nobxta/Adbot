'use client';

import { useEffect, useState } from 'react';
import { Database, Upload, AlertTriangle, CheckCircle, XCircle, Key, Archive, FileText } from 'lucide-react';

interface StockOverview {
  sessions: {
    total: number;
    unused: number;
    assigned: number;
    banned: number;
  };
  api_pairs: {
    total: number;
    available: number;
    used: number;
    usage: Array<{
      pair_index: number;
      api_id: string;
      sessions_used: number;
      capacity: number;
    }>;
  };
}

export default function StockPage() {
  const [overview, setOverview] = useState<StockOverview | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Session upload states
  const [uploadingSession, setUploadingSession] = useState(false);
  const [sessionFile, setSessionFile] = useState<File | null>(null);
  const [sessionUploadStatus, setSessionUploadStatus] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  
  // Bulk session upload states
  const [uploadingBulkSessions, setUploadingBulkSessions] = useState(false);
  const [bulkSessionFile, setBulkSessionFile] = useState<File | null>(null);
  const [bulkSessionUploadStatus, setBulkSessionUploadStatus] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  
  // API pair upload states
  const [uploadingApiPair, setUploadingApiPair] = useState(false);
  const [apiPairId, setApiPairId] = useState('');
  const [apiPairHash, setApiPairHash] = useState('');
  const [apiPairUploadStatus, setApiPairUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Bulk API pair upload states
  const [uploadingBulkApiPairs, setUploadingBulkApiPairs] = useState(false);
  const [bulkApiPairFile, setBulkApiPairFile] = useState<File | null>(null);
  const [bulkApiPairText, setBulkApiPairText] = useState('');
  const [bulkApiPairUploadStatus, setBulkApiPairUploadStatus] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  
  // Unified upload tab state
  const [uploadTab, setUploadTab] = useState<'session-single' | 'session-bulk' | 'api-manual' | 'api-bulk'>('session-single');

  useEffect(() => {
    fetchStockOverview();
    
    // Listen for refresh events from other pages (e.g., after adbot creation)
    const handleRefresh = () => {
      console.log('[Stock] Refresh event received, updating overview...');
      fetchStockOverview();
    };
    
    window.addEventListener('stockRefresh', handleRefresh);
    
    // Also refresh periodically (every 30 seconds) to catch updates
    const interval = setInterval(() => {
      fetchStockOverview();
    }, 30000);
    
    return () => {
      window.removeEventListener('stockRefresh', handleRefresh);
      clearInterval(interval);
    };
  }, []);

  const fetchStockOverview = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setLoading(false);
        return;
      }

      // Add cache-busting timestamp
      const timestamp = Date.now();
      const response = await fetch(`/api/admin/stock/overview?t=${timestamp}`, {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Cache-Control': 'no-cache',
        },
        cache: 'no-store',
      });

      // Handle authentication errors - show helpful message
      if (response.status === 401 || response.status === 403) {
        console.warn('Authentication failed when fetching stock overview');
        const errorData = await response.json().catch(() => ({ error: 'Token expired' }));
        
        // Show user-friendly error
        if (errorData.error?.includes('expired') || errorData.error?.includes('exp')) {
          alert('Your session has expired. Please refresh the page or log out and log in again.');
        }
        
        setLoading(false);
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch stock overview');

      const result = await response.json();
      if (result.success) {
        console.log('Stock overview updated:', {
          total: result.data.sessions.total,
          unused: result.data.sessions.unused,
          assigned: result.data.sessions.assigned,
          banned: result.data.sessions.banned,
        });
        setOverview(result.data);
      }
    } catch (error) {
      console.error('Error fetching stock overview:', error);
    } finally {
      setLoading(false);
    }
  };

  // Store multiple selected files
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Unified session upload (handles both single file, multiple files, and zip)
  const handleSessionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setSelectedFiles(files);
      setSessionFile(null);
      setBulkSessionFile(null);
      setSessionUploadStatus(null);
      setBulkSessionUploadStatus(null);
    }
  };

  const handleSessionUpload = async () => {
    // Use selected files if available, otherwise fall back to single file states
    const filesToUpload = selectedFiles.length > 0 ? selectedFiles : (sessionFile ? [sessionFile] : bulkSessionFile ? [bulkSessionFile] : []);
    
    if (filesToUpload.length === 0) {
      alert('Please select one or more files');
      return;
    }

    setUploadingSession(true);
    setUploadingBulkSessions(true);
    setSessionUploadStatus(null);
    setBulkSessionUploadStatus(null);

    try {
      const token = localStorage.getItem('accessToken');
      
      if (!token || !token.trim()) {
        alert('You are not logged in. Please log in and try again.');
        return;
      }

      const trimmedToken = token.trim();
      let totalUploaded = 0;
      let totalErrors = 0;
      const errors: string[] = [];

      // Process each file
      for (const file of filesToUpload) {
        try {
          const isZip = file.name.endsWith('.zip');
          const formData = new FormData();
          formData.append('file', file);

          // Use bulk-upload endpoint for zip, regular upload for .session files
          const endpoint = isZip ? '/api/admin/stock/bulk-upload' : '/api/admin/stock/upload';
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${trimmedToken}`,
            },
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to upload file');
          }

          const result = await response.json();
          
          if (isZip) {
            const extractedCount = result.data?.counts?.extracted || 0;
            totalUploaded += extractedCount;
          } else {
            totalUploaded += 1;
          }
        } catch (error) {
          totalErrors++;
          errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Upload failed'}`);
        }
      }

      // Show combined status
      let message = `Successfully uploaded ${totalUploaded} session(s)`;
      if (totalErrors > 0) {
        message += `\n${totalErrors} file(s) failed:\n${errors.slice(0, 5).join('\n')}`;
        if (errors.length > 5) {
          message += `\n... and ${errors.length - 5} more`;
        }
      }

      const statusType = totalErrors === 0 ? 'success' : totalUploaded > 0 ? 'warning' : 'error';
      setSessionUploadStatus({
        type: statusType,
        message: message,
      });
      setBulkSessionUploadStatus({
        type: statusType,
        message: message,
      });

      // Clear file inputs
      setSelectedFiles([]);
      setSessionFile(null);
      setBulkSessionFile(null);
      const fileInput = document.getElementById('session-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // Refresh overview (physical files are source of truth)
      console.log('Refreshing stock overview after session upload...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await fetchStockOverview();
      console.log('Stock overview refreshed');
    } catch (error) {
      setSessionUploadStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to upload files',
      });
      setBulkSessionUploadStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to upload files',
      });
    } finally {
      setUploadingSession(false);
      setUploadingBulkSessions(false);
    }
  };

  // Single API pair upload
  const handleApiPairUpload = async () => {
    if (!apiPairId || !apiPairHash) {
      alert('API ID and API Hash are required');
      return;
    }

    setUploadingApiPair(true);
    setApiPairUploadStatus(null);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/api-pairs/add', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_id: apiPairId,
          api_hash: apiPairHash,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.error || error.detail || 'Failed to add API pair';
        
        // Check if it's a duplicate (409) - show as error but with clear message
        if (response.status === 409) {
          setApiPairUploadStatus({
            type: 'error',
            message: `Duplicate: ${errorMessage}`,
          });
          return; // Don't clear fields or refresh on duplicate
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('API pair add response:', result);
      
      // Backend response is wrapped in data field
      const message = result.data?.message || result.message || 'API pair added successfully';
      const addedPair = result.data?.pair;
      
      setApiPairUploadStatus({
        type: 'success',
        message: addedPair ? `${message} (ID: ${addedPair.api_id})` : message,
      });

      // Clear input fields
      setApiPairId('');
      setApiPairHash('');
      
      // Refresh the overview to show the new pair
      // Add a small delay to ensure backend file write has completed
      console.log('Refreshing stock overview...');
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchStockOverview();
      console.log('Stock overview refreshed');
    } catch (error) {
      setApiPairUploadStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to add API pair',
      });
    } finally {
      setUploadingApiPair(false);
    }
  };

  // Bulk API pair upload
  const handleBulkApiPairFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBulkApiPairFile(e.target.files[0]);
      setBulkApiPairUploadStatus(null);
    }
  };

  const handleBulkApiPairUpload = async () => {
    if (!bulkApiPairFile && !bulkApiPairText.trim()) {
      alert('Please select a file or enter API pairs manually');
      return;
    }

    setUploadingBulkApiPairs(true);
    setBulkApiPairUploadStatus(null);

    try {
      const token = localStorage.getItem('accessToken');
      const formData = new FormData();
      
      if (bulkApiPairFile) {
        formData.append('file', bulkApiPairFile);
      } else if (bulkApiPairText.trim()) {
        // Create a blob from text input
        const blob = new Blob([bulkApiPairText], { type: 'text/plain' });
        const file = new File([blob], 'api_pairs.txt', { type: 'text/plain' });
        formData.append('file', file);
      }

      const response = await fetch('/api/admin/api-pairs/bulk-upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload API pairs');
      }

      const result = await response.json();
      
      // Build detailed message with errors if any
      let message = result.message || `Successfully uploaded ${result.data?.success || 0} API pairs`;
      let statusType: 'success' | 'error' | 'warning' = 'success';
      
      if (result.data?.failed > 0) {
        if (result.data?.success > 0) {
          statusType = 'warning'; // Partial success
        } else {
          statusType = 'error'; // Complete failure
        }
        
        if (result.data?.errors && result.data.errors.length > 0) {
          message += `\n\nFailed pairs:\n${result.data.errors.slice(0, 10).join('\n')}`;
          if (result.data.errors.length > 10) {
            message += `\n... and ${result.data.errors.length - 10} more`;
          }
        }
      }
      
      setBulkApiPairUploadStatus({
        type: statusType,
        message: message,
      });

      setBulkApiPairFile(null);
      setBulkApiPairText('');
      const fileInput = document.getElementById('bulk-api-pair-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      await fetchStockOverview();
    } catch (error) {
      setBulkApiPairUploadStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to upload API pairs',
      });
    } finally {
      setUploadingBulkApiPairs(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const lowSessionStock = overview && overview.sessions.unused < 10;
  const noSessionsLeft = overview && overview.sessions.unused === 0;
  const lowApiPairStock = overview && overview.api_pairs.available < 2;
  const noApiPairsLeft = overview && overview.api_pairs.available === 0;
  const allApiPairsInUse = overview && overview.api_pairs.available === 0 && overview.api_pairs.total > 0;
  const maxSessionsCapacity = overview ? overview.api_pairs.total * 7 : 0;
  const availableSessionsCapacity = overview ? overview.api_pairs.available * 7 : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Database className="w-8 h-8" />
          Stock Management
        </h1>
        <p className="text-gray-400">Manage sessions and API pairs. Each API pair can handle up to 7 sessions.</p>
      </div>

      {/* Stock Overview - Sessions */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Sessions Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: 'rgba(10, 15, 30, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-400">Total Sessions</h3>
              <Database className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-3xl font-bold text-white">{overview?.sessions.total || 0}</p>
          </div>

          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: 'rgba(10, 15, 30, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-400">Available (Unused)</h3>
              <CheckCircle className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-3xl font-bold text-white">{overview?.sessions.unused || 0}</p>
          </div>

          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: 'rgba(10, 15, 30, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-400">Assigned</h3>
              <Database className="w-5 h-5 text-yellow-500" />
            </div>
            <p className="text-3xl font-bold text-white">{overview?.sessions.assigned || 0}</p>
          </div>

          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: 'rgba(10, 15, 30, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-400">Banned</h3>
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-3xl font-bold text-white">{overview?.sessions.banned || 0}</p>
          </div>
        </div>
      </div>

      {/* Stock Overview - API Pairs (Compact) */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">API Pairs Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            className="rounded-xl p-4"
            style={{
              backgroundColor: 'rgba(10, 15, 30, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-gray-400">Total</h3>
              <Key className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-white">{overview?.api_pairs.total || 0}</p>
            <p className="text-xs text-gray-500 mt-1">Max: {maxSessionsCapacity} sessions</p>
          </div>

          <div
            className="rounded-xl p-4"
            style={{
              backgroundColor: 'rgba(10, 15, 30, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-gray-400">Available</h3>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-white">{overview?.api_pairs.available || 0}</p>
            <p className="text-xs text-gray-500 mt-1">Can handle: {availableSessionsCapacity} sessions</p>
          </div>

          <div
            className="rounded-xl p-4"
            style={{
              backgroundColor: 'rgba(10, 15, 30, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-gray-400">Used</h3>
              <Database className="w-4 h-4 text-yellow-500" />
            </div>
            <p className="text-2xl font-bold text-white">{overview?.api_pairs.used || 0}</p>
            <p className="text-xs text-gray-500 mt-1">7 sessions per pair</p>
          </div>
        </div>
      </div>

      {/* Low Stock Warnings */}
      {noSessionsLeft && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
          }}
        >
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div>
            <p className="text-red-400 font-medium">⚠️ No Sessions Available</p>
            <p className="text-sm text-red-300">
              All sessions are in use. Please upload more sessions to the unused folder.
            </p>
          </div>
        </div>
      )}

      {lowSessionStock && !noSessionsLeft && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div>
            <p className="text-red-400 font-medium">Low Session Stock Warning</p>
            <p className="text-sm text-red-300">
              Only {overview?.sessions.unused} unused sessions remaining. Please upload more sessions.
            </p>
          </div>
        </div>
      )}

      {allApiPairsInUse && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
          }}
        >
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div>
            <p className="text-red-400 font-medium">⚠️ All API Pairs In Use</p>
            <p className="text-sm text-red-300">
              All {overview?.api_pairs.total} API pairs are currently in use. Upload more API pairs to handle additional sessions.
            </p>
          </div>
        </div>
      )}

      {lowApiPairStock && !allApiPairsInUse && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div>
            <p className="text-red-400 font-medium">Low API Pair Stock Warning</p>
            <p className="text-sm text-red-300">
              Only {overview?.api_pairs.available} available API pairs remaining. Please upload more API pairs.
            </p>
          </div>
        </div>
      )}

      {/* Unified Upload Section */}
      <div
        className="rounded-xl p-6"
        style={{
          backgroundColor: 'rgba(10, 15, 30, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload
        </h2>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 border-b border-white/10">
          <button
            onClick={() => setUploadTab('session-single')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              uploadTab === 'session-single' || uploadTab === 'session-bulk'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Sessions
          </button>
          <button
            onClick={() => setUploadTab('api-manual')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              uploadTab === 'api-manual'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            API Pair (Manual)
          </button>
          <button
            onClick={() => setUploadTab('api-bulk')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              uploadTab === 'api-bulk'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            API Pairs (Bulk)
          </button>
        </div>

        {/* Tab Content */}
        <div className="space-y-4">
          {/* Session Upload Tab (Unified - Single or Zip) */}
          {(uploadTab === 'session-single' || uploadTab === 'session-bulk') && (
            <>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Select .session file(s) or .zip file(s) (multiple selection allowed)
              </label>
              <input
                id="session-file-input"
                type="file"
                accept=".session,.zip"
                multiple
                onChange={handleSessionFileChange}
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-500 file:text-white hover:file:bg-blue-600"
              />
              <p className="text-xs text-gray-500 mt-2">
                Upload one or more .session files or .zip files. You can select multiple files at once. All will be saved to the unused folder.
              </p>
            </div>

            {selectedFiles.length > 0 && (
              <div className="p-3 rounded-lg bg-black/30 space-y-2">
                <p className="text-sm text-white font-medium">
                  Selected {selectedFiles.length} file(s):
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="text-xs text-gray-300 flex items-center justify-between">
                      <span className="font-mono truncate flex-1">{file.name}</span>
                      <span className="text-gray-500 ml-2">
                        {(file.size / 1024).toFixed(2)} KB
                        {file.name.endsWith('.zip') && ' (Zip)'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 pt-2">
                  Total size: {(selectedFiles.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(2)} KB
                </p>
              </div>
            )}

            {(sessionUploadStatus || bulkSessionUploadStatus) && (
              <div
                className={`p-3 rounded-lg ${
                  (sessionUploadStatus || bulkSessionUploadStatus)?.type === 'success'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                <div className="flex items-start gap-2">
                  {(sessionUploadStatus || bulkSessionUploadStatus)?.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  )}
                  <p className="text-xs whitespace-pre-wrap">{(sessionUploadStatus || bulkSessionUploadStatus)?.message}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleSessionUpload}
              disabled={selectedFiles.length === 0 && !sessionFile && !bulkSessionFile || uploadingSession || uploadingBulkSessions}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
                color: '#FFFFFF',
              }}
            >
              {(uploadingSession || uploadingBulkSessions) ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Uploading {selectedFiles.length > 0 ? `${selectedFiles.length} file(s)...` : '...'}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload {selectedFiles.length > 0 ? `${selectedFiles.length} File(s)` : 'Session(s)'}
                </>
              )}
            </button>
            </>
          )}

          {/* API Pair Manual Upload Tab */}
          {uploadTab === 'api-manual' && (
            <>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                API ID
              </label>
              <input
                type="text"
                value={apiPairId}
                onChange={(e) => setApiPairId(e.target.value)}
                placeholder="Enter API ID (numeric)"
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                API Hash
              </label>
              <input
                type="text"
                value={apiPairHash}
                onChange={(e) => setApiPairHash(e.target.value)}
                placeholder="Enter API Hash (hexadecimal)"
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500"
              />
            </div>

            {apiPairUploadStatus && (
              <div
                className={`p-3 rounded-lg ${
                  apiPairUploadStatus.type === 'success'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                <div className="flex items-start gap-2">
                  {apiPairUploadStatus.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  )}
                  <p className="text-xs whitespace-pre-wrap">{apiPairUploadStatus.message}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleApiPairUpload}
              disabled={!apiPairId || !apiPairHash || uploadingApiPair}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #9333EA, #A855F7)',
                color: '#FFFFFF',
              }}
            >
              {uploadingApiPair ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  Add API Pair
                </>
              )}
            </button>
            </>
          )}

          {/* API Pair Bulk Upload Tab */}
          {uploadTab === 'api-bulk' && (
            <>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Select file (.txt, .json, .csv) or enter manually
              </label>
              <input
                id="bulk-api-pair-file-input"
                type="file"
                accept=".json,.csv,.txt"
                onChange={handleBulkApiPairFileChange}
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-500 file:text-white hover:file:bg-purple-600"
              />
              <p className="text-xs text-gray-500 mt-2 mb-3">
                Supported formats: JSON array, CSV (api_id,api_hash), or plain text (one pair per line: api_id api_hash)
              </p>
              
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Or paste API pairs manually:
              </label>
              <textarea
                value={bulkApiPairText}
                onChange={(e) => setBulkApiPairText(e.target.value)}
                placeholder="Paste API pairs here...&#10;Format examples:&#10;12345678 abcdef1234567890&#10;or&#10;12345678,abcdef1234567890&#10;or&#10;[{&quot;api_id&quot;: &quot;12345678&quot;, &quot;api_hash&quot;: &quot;abcdef1234567890&quot;}]"
                rows={6}
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 font-mono text-xs"
              />
            </div>

            {bulkApiPairFile && (
              <div className="p-3 rounded-lg bg-black/30">
                <p className="text-sm text-white">
                  Selected: <span className="font-mono">{bulkApiPairFile.name}</span>
                </p>
                <p className="text-xs text-gray-400">Size: {(bulkApiPairFile.size / 1024).toFixed(2)} KB</p>
              </div>
            )}

            {bulkApiPairUploadStatus && (
              <div
                className={`p-3 rounded-lg ${
                  bulkApiPairUploadStatus.type === 'success'
                    ? 'bg-green-500/20 text-green-400'
                    : bulkApiPairUploadStatus.type === 'warning'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                <div className="flex items-start gap-2">
                  {bulkApiPairUploadStatus.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  ) : bulkApiPairUploadStatus.type === 'warning' ? (
                    <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  )}
                  <p className="text-xs whitespace-pre-wrap">{bulkApiPairUploadStatus.message}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleBulkApiPairUpload}
              disabled={(!bulkApiPairFile && !bulkApiPairText.trim()) || uploadingBulkApiPairs}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #9333EA, #A855F7)',
                color: '#FFFFFF',
              }}
            >
              {uploadingBulkApiPairs ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Upload API Pairs
                </>
              )}
            </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
