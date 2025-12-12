import React, { useState, useEffect } from 'react';
import { X, Link2, Copy, Check, Twitter, Linkedin, Mail, Loader2 } from 'lucide-react';
import { FileSystem } from '../types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
}

// UTF-8 safe base64 encoding (replaces deprecated escape/unescape)
function utf8ToBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

// Simple compression using LZ-based encoding
function compressString(str: string): string {
  try {
    // Convert to base64 and URL-safe encode
    const base64 = utf8ToBase64(str);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

function decompressString(compressed: string): string {
  try {
    // Restore base64 and decode
    let base64 = compressed.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return base64ToUtf8(base64);
  } catch {
    return '';
  }
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, files }) => {
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      generateShareUrl();
    }
  }, [isOpen, files]);

  const generateShareUrl = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      // Compress files to JSON
      const filesJson = JSON.stringify(files);

      // Check size limit (URLs have practical limits ~2000 chars for most browsers)
      if (filesJson.length > 50000) {
        setError('Project too large to share via URL. Please use GitHub export instead.');
        setShareUrl('');
        return;
      }

      const compressed = compressString(filesJson);
      const baseUrl = window.location.origin + window.location.pathname;
      const url = `${baseUrl}?project=${compressed}`;

      if (url.length > 8000) {
        setError('Project too large for URL sharing. Consider using GitHub export.');
        setShareUrl('');
      } else {
        setShareUrl(url);
      }
    } catch (_err) {
      setError('Failed to generate share URL');
      setShareUrl('');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareVia = (platform: 'twitter' | 'linkedin' | 'email') => {
    const text = 'Check out this React app I built with FluidFlow!';
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(text);

    const urls = {
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      email: `mailto:?subject=${encodeURIComponent('Check out my FluidFlow app')}&body=${encodedText}%0A%0A${encodedUrl}`,
    };

    window.open(urls[platform], '_blank');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Link2 className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-white">Share Project</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {isGenerating ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              <span className="ml-2 text-slate-400">Generating share link...</span>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm text-red-400">{error}</p>
              <p className="text-xs text-slate-500 mt-2">
                Tip: Use "Push to GitHub" for larger projects.
              </p>
            </div>
          ) : (
            <>
              {/* Share URL */}
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Share Link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="flex-1 px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-slate-300 outline-none"
                  />
                  <button
                    onClick={copyToClipboard}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${
                      copied
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-600 mt-1.5">
                  Anyone with this link can view and edit a copy of your project.
                </p>
              </div>

              {/* Social Share */}
              <div>
                <label className="text-xs text-slate-500 mb-2 block">Share via</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => shareVia('twitter')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition-colors"
                  >
                    <Twitter className="w-4 h-4 text-blue-400" />
                    Twitter
                  </button>
                  <button
                    onClick={() => shareVia('linkedin')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition-colors"
                  >
                    <Linkedin className="w-4 h-4 text-blue-500" />
                    LinkedIn
                  </button>
                  <button
                    onClick={() => shareVia('email')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition-colors"
                  >
                    <Mail className="w-4 h-4 text-slate-400" />
                    Email
                  </button>
                </div>
              </div>

              {/* Project Stats */}
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Files included:</span>
                  <span className="text-slate-300">{Object.keys(files).length}</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-slate-500">URL length:</span>
                  <span className={shareUrl.length > 2000 ? 'text-yellow-400' : 'text-green-400'}>
                    {shareUrl.length.toLocaleString()} chars
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/5 bg-slate-950/50">
          <p className="text-[10px] text-slate-600 text-center">
            Project data is encoded in the URL. No server storage required.
          </p>
        </div>
      </div>
    </div>
  );
};

// Export helper to load project from URL
export function loadProjectFromUrl(): FileSystem | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const projectData = params.get('project');

    if (projectData) {
      const decompressed = decompressString(projectData);
      if (decompressed) {
        const files = JSON.parse(decompressed);
        // Clean up URL after loading
        window.history.replaceState({}, '', window.location.pathname);
        return files;
      }
    }
  } catch (err) {
    console.error('Failed to load project from URL:', err);
  }
  return null;
}
