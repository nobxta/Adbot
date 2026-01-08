'use client';

import { useState } from 'react';
import { X, Link2, FileText, Save, CheckCircle2, XCircle } from 'lucide-react';

interface EditAdvertisementProps {
  isOpen: boolean;
  onClose: () => void;
  currentPostLink?: string;
  currentCustomText?: string;
  onSave: (data: { postLink?: string; customText?: string; type: 'link' | 'text' }) => void;
}

export default function EditAdvertisement({
  isOpen,
  onClose,
  currentPostLink = '',
  currentCustomText = '',
  onSave,
}: EditAdvertisementProps) {
  const [adType, setAdType] = useState<'link' | 'text'>(currentPostLink ? 'link' : 'text');
  const [postLink, setPostLink] = useState(currentPostLink);
  const [customText, setCustomText] = useState(currentCustomText);
  const [validating, setValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const validatePostLink = async (link: string) => {
    if (!link.trim()) {
      setIsValid(null);
      return;
    }

    setValidating(true);
    try {
      const response = await fetch('/api/bot/validate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postLink: link }),
      });
      
      const data = await response.json();
      setIsValid(data.valid || false);
    } catch (err) {
      setIsValid(false);
    } finally {
      setValidating(false);
    }
  };

  const handlePostLinkChange = (value: string) => {
    setPostLink(value);
    setIsValid(null);
    
    const timeoutId = setTimeout(() => {
      if (value.trim()) {
        validatePostLink(value);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  };

  const handleSave = async () => {
    if (adType === 'link' && !postLink.trim()) {
      return;
    }
    if (adType === 'text' && !customText.trim()) {
      return;
    }
    if (adType === 'link' && isValid === false) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        postLink: adType === 'link' ? postLink : undefined,
        customText: adType === 'text' ? customText : undefined,
        type: adType,
      });
      onClose();
    } catch (err) {
      console.error('Error saving advertisement:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-2xl rounded-2xl p-8 animate-in fade-in zoom-in duration-300"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-300 hover:scale-110"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'rgba(255, 255, 255, 0.8)',
          }}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2" style={{ color: '#FFFFFF' }}>
            Edit Advertisement
          </h2>
          <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            Configure what your Adbot will post to groups
          </p>
        </div>

        {/* Type Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-3 tracking-wide" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
            Advertisement Type
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                setAdType('link');
                setIsValid(null);
              }}
              className={`p-4 rounded-xl text-left transition-all duration-300 relative overflow-hidden group ${
                adType === 'link' ? 'scale-105' : 'hover:scale-105'
              }`}
              style={{
                background: adType === 'link'
                  ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08))'
                  : 'rgba(0, 0, 0, 0.4)',
                border: adType === 'link'
                  ? '1px solid rgba(255, 255, 255, 0.2)'
                  : '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: adType === 'link'
                  ? '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  : 'none',
              }}
            >
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
                }}
              />
              <Link2 className="w-6 h-6 mb-3 relative z-10" style={{ color: '#FFFFFF' }} />
              <div className="font-semibold relative z-10" style={{ color: '#FFFFFF' }}>Post Link</div>
              <div className="text-xs mt-1 relative z-10" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                Use a Telegram post link
              </div>
            </button>

            <button
              onClick={() => {
                setAdType('text');
                setIsValid(null);
              }}
              className={`p-4 rounded-xl text-left transition-all duration-300 relative overflow-hidden group ${
                adType === 'text' ? 'scale-105' : 'hover:scale-105'
              }`}
              style={{
                background: adType === 'text'
                  ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08))'
                  : 'rgba(0, 0, 0, 0.4)',
                border: adType === 'text'
                  ? '1px solid rgba(255, 255, 255, 0.2)'
                  : '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: adType === 'text'
                  ? '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  : 'none',
              }}
            >
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
                }}
              />
              <FileText className="w-6 h-6 mb-3 relative z-10" style={{ color: '#FFFFFF' }} />
              <div className="font-semibold relative z-10" style={{ color: '#FFFFFF' }}>Custom Text</div>
              <div className="text-xs mt-1 relative z-10" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                Write your own message
              </div>
            </button>
          </div>
        </div>

        {/* Content Input */}
        {adType === 'link' ? (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-3 tracking-wide" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
              Post Link
            </label>
            <div className="relative">
              <input
                type="text"
                value={postLink}
                onChange={(e) => handlePostLinkChange(e.target.value)}
                placeholder="https://t.me/channel/123"
                className="w-full px-5 py-4 rounded-xl text-sm transition-all duration-300 focus:outline-none"
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: isValid === false
                    ? '1px solid rgba(239, 68, 68, 0.5)'
                    : isValid === true
                    ? '1px solid rgba(34, 197, 94, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  boxShadow: isValid !== null 
                    ? isValid 
                      ? '0 0 16px rgba(34, 197, 94, 0.2)' 
                      : '0 0 16px rgba(239, 68, 68, 0.2)'
                    : 'none',
                }}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                {validating ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isValid === true ? (
                  <CheckCircle2 className="w-5 h-5" style={{ color: '#22c55e' }} />
                ) : isValid === false ? (
                  <XCircle className="w-5 h-5" style={{ color: '#ef4444' }} />
                ) : null}
              </div>
            </div>
            {isValid !== null && (
              <p 
                className="text-xs mt-3 flex items-center gap-2"
                style={{ color: isValid ? '#22c55e' : '#ef4444' }}
              >
                {isValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Post link verified
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Invalid post link format
                  </>
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-3 tracking-wide" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
              Custom Text
            </label>
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Enter your advertisement text here..."
              rows={6}
              className="w-full px-5 py-4 rounded-xl text-sm transition-all duration-300 focus:outline-none resize-none"
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#FFFFFF',
              }}
            />
            <p className="text-xs mt-2" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              {customText.length} characters
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-105 active:scale-95"
            style={{
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.8)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (adType === 'link' && (!postLink.trim() || isValid === false)) || (adType === 'text' && !customText.trim())}
            className="flex-1 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative overflow-hidden group"
            style={{
              background: saving || (adType === 'link' && (!postLink.trim() || isValid === false)) || (adType === 'text' && !customText.trim())
                ? 'rgba(255, 255, 255, 0.05)'
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#FFFFFF',
              boxShadow: saving || (adType === 'link' && (!postLink.trim() || isValid === false)) || (adType === 'text' && !customText.trim())
                ? 'none'
                : '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
              }}
            />
            {saving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin relative z-10" />
                <span className="relative z-10">Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5 relative z-10" />
                <span className="relative z-10">Save Advertisement</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

