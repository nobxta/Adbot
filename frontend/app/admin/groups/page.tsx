'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Users,
  Save,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Upload,
  Plus,
  Trash2,
} from 'lucide-react';

interface GroupFile {
  plan_type: 'STARTER' | 'ENTERPRISE';
  groups: string[];
  count: number;
  file_path: string;
  file_exists: boolean;
  file_size: number;
}

interface LineError {
  lineNumber: number;
  content: string;
  error: string;
}

export default function GroupsPage() {
  const [starterGroups, setStarterGroups] = useState<GroupFile | null>(null);
  const [enterpriseGroups, setEnterpriseGroups] = useState<GroupFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'STARTER' | 'ENTERPRISE'>('STARTER');
  
  // Editor states
  const [editorContent, setEditorContent] = useState<string>('');
  const [lineErrors, setLineErrors] = useState<LineError[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    // Load groups into editor when tab changes or data loads
    const currentGroups = activeTab === 'STARTER' ? starterGroups : enterpriseGroups;
    if (currentGroups && !hasChanges) {
      const content = currentGroups.groups.join('\n');
      setEditorContent(content);
      setLineErrors([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, starterGroups, enterpriseGroups]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      
      const [starterRes, enterpriseRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/admin/groups/list?plan_type=STARTER`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }),
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/admin/groups/list?plan_type=ENTERPRISE`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }),
      ]);

      if (starterRes.ok) {
        const starterData = await starterRes.json();
        setStarterGroups(starterData);
        if (activeTab === 'STARTER' && !hasChanges) {
          setEditorContent(starterData.groups.join('\n'));
        }
      }

      if (enterpriseRes.ok) {
        const enterpriseData = await enterpriseRes.json();
        setEnterpriseGroups(enterpriseData);
        if (activeTab === 'ENTERPRISE' && !hasChanges) {
          setEditorContent(enterpriseData.groups.join('\n'));
        }
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleContentChange = (value: string) => {
    setEditorContent(value);
    setHasChanges(true);
  };

  // Auto-validate on content change (debounced)
  useEffect(() => {
    if (!editorContent) {
      setLineErrors([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      const lines = editorContent.split('\n');
      const errors: LineError[] = [];

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
          return;
        }

        // Validate format: Must be -100xxxxx (Telegram supergroup ID)
        let isValid = false;
        let error = '';

        if (!trimmed.startsWith('-100')) {
          error = 'Must start with -100 (e.g., -1001234567890)';
        } else {
          // Check that after -100, there are only digits
          const numericPart = trimmed.substring(4); // Everything after -100
          if (!numericPart || !numericPart.match(/^\d+$/)) {
            error = 'Must be -100 followed by digits only (e.g., -1001234567890)';
          } else if (trimmed.length < 7) {
            error = 'Too short, must be at least -100xxx';
          } else {
            isValid = true;
          }
        }

        if (!isValid) {
          errors.push({
            lineNumber: index + 1,
            content: trimmed,
            error,
          });
        }
      });

      setLineErrors(errors);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [editorContent]);

  const handleSave = async () => {
    if (lineErrors.length > 0) {
      alert(`Please fix ${lineErrors.length} error(s) before saving. Check the red highlighted lines.`);
      return;
    }

    const groups = editorContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    if (groups.length === 0) {
      // Allow saving empty file
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/admin/groups/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan_type: activeTab,
          groups,
          action: 'replace',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`✅ Success! ${data.count} groups saved. Changes will apply at the next cycle completion.`);
        setHasChanges(false);
        await fetchGroups();
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.detail || 'Failed to save groups'}`);
      }
    } catch (error) {
      console.error('Error saving groups:', error);
      alert('❌ Failed to save groups');
    } finally {
      setSaving(false);
    }
  };

  const handleAddLine = () => {
    setEditorContent(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + '\n');
    setHasChanges(true);
    if (textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
        const lines = editorContent.split('\n').length;
        textareaRef.current?.setSelectionRange(
          textareaRef.current.value.length,
          textareaRef.current.value.length
        );
      }, 0);
    }
  };

  const handleClear = () => {
    if (confirm('Are you sure you want to clear all groups?')) {
      setEditorContent('');
      setLineErrors([]);
      setHasChanges(true);
    }
  };

  const handleExport = () => {
    if (!editorContent.trim()) {
      alert('No groups to export');
      return;
    }

    const blob = new Blob([editorContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab.toLowerCase()}_groups.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          setEditorContent(content);
          setHasChanges(true);
          // Validation will happen automatically via useEffect
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const getLineNumber = (lineIndex: number) => {
    return lineIndex + 1;
  };

  const getLineError = (lineIndex: number) => {
    return lineErrors.find(e => e.lineNumber === lineIndex + 1);
  };

  const currentGroups = activeTab === 'STARTER' ? starterGroups : enterpriseGroups;
  const totalLines = editorContent.split('\n').length;
  
  // Calculate valid/invalid counts
  const lines = editorContent.split('\n');
  const emptyOrCommentLines = lines.filter(line => !line.trim() || line.trim().startsWith('#')).length;
  const validGroups = totalLines > 0 ? totalLines - lineErrors.length - emptyOrCommentLines : 0;
  const invalidGroups = lineErrors.length;

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
            <Users className="w-8 h-8" />
            Group Management
          </h1>
          <p className="text-gray-400">
            Edit group lists like a notepad. One group ID per line. Changes apply at cycle completion.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleImport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              color: '#60A5FA',
            }}
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              color: '#60A5FA',
            }}
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => {
            setActiveTab('STARTER');
            setHasChanges(false);
          }}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'STARTER'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          STARTER Plan
        </button>
        <button
          onClick={() => {
            setActiveTab('ENTERPRISE');
            setHasChanges(false);
          }}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'ENTERPRISE'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          ENTERPRISE Plan
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-300">
              Valid: <span className="font-semibold text-white">{validGroups}</span>
            </span>
          </div>
          {invalidGroups > 0 && (
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-sm text-red-400">
                Errors: <span className="font-semibold">{invalidGroups}</span>
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              Total Lines: <span className="font-semibold text-white">{totalLines}</span>
            </span>
          </div>
          {hasChanges && (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-yellow-400">Unsaved changes</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAddLine}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              color: '#60A5FA',
            }}
          >
            <Plus className="w-4 h-4" />
            Add Line
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: '#F87171',
            }}
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
          <button
            onClick={fetchGroups}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              color: '#60A5FA',
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
        </div>
      </div>

      {/* Notepad Editor */}
      <div className="relative">
        <div
          className="rounded-xl overflow-hidden"
          style={{
            backgroundColor: 'rgba(10, 15, 30, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          {/* Line Numbers + Editor Container */}
          <div className="flex" style={{ fontFamily: 'monospace' }}>
            {/* Line Numbers */}
            <div
              className="px-4 py-4 text-right select-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                minWidth: '60px',
                color: '#6B7280',
                fontSize: '14px',
                lineHeight: '1.5',
              }}
            >
              {editorContent.split('\n').map((_, index) => {
                const error = getLineError(index);
                return (
                  <div
                    key={index}
                    className={`${error ? 'text-red-400' : ''}`}
                    style={{ height: '24px' }}
                  >
                    {index + 1}
                  </div>
                );
              })}
            </div>

            {/* Editor */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={editorContent}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="Enter Telegram supergroup IDs, one per line:&#10;-1001234567890&#10;-1009876543210&#10;-1001112223334&#10;&#10;Format: Must start with -100&#10;Lines starting with # are comments"
                className="w-full px-4 py-4 bg-transparent text-white border-0 resize-none focus:outline-none"
                style={{
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  minHeight: '500px',
                }}
                spellCheck={false}
              />
              
              {/* Error Overlay - Highlight invalid lines */}
              {lineErrors.length > 0 && (
                <div
                  className="absolute top-0 left-0 right-0 pointer-events-none"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    lineHeight: '1.5',
                  }}
                >
                  {editorContent.split('\n').map((line, index) => {
                    const error = getLineError(index);
                    if (!error) return null;
                    return (
                      <div
                        key={index}
                        className="px-4"
                        style={{
                          height: '24px',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          borderLeft: '3px solid #EF4444',
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error Messages */}
        {lineErrors.length > 0 && (
          <div className="mt-4 p-4 rounded-lg bg-red-900/20 border border-red-500/30">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-5 h-5 text-red-400" />
              <h3 className="font-semibold text-red-400">Format Errors ({lineErrors.length})</h3>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {lineErrors.map((error, idx) => (
                <div key={idx} className="text-sm">
                  <span className="text-red-300 font-mono">Line {error.lineNumber}:</span>
                  <span className="text-red-200 ml-2">{error.content || '(empty)'}</span>
                  <span className="text-red-400 ml-2">→ {error.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-400">
            {currentGroups && (
              <>
                File: <code className="text-blue-400">{currentGroups.file_path}</code>
                {' • '}
                Size: {(currentGroups.file_size / 1024).toFixed(2)} KB
              </>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || invalidGroups > 0}
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: invalidGroups > 0
                ? 'rgba(239, 68, 68, 0.3)'
                : 'linear-gradient(135deg, #4F6BFF, #6A7CFF)',
              color: '#FFFFFF',
            }}
          >
            {saving ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Groups ({validGroups} groups)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Info Box */}
      <div
        className="rounded-xl p-4"
        style={{
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
        }}
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5" />
          <div className="text-sm text-gray-300">
            <strong className="text-white">Format:</strong> One Telegram supergroup ID per line (must start with <code className="text-blue-400">-100</code>, e.g., <code className="text-blue-400">-1001234567890</code>). 
            Lines starting with <code className="text-blue-400">#</code> are comments. 
            Empty lines are ignored. Changes apply at the next cycle completion.
          </div>
        </div>
      </div>
    </div>
  );
}
