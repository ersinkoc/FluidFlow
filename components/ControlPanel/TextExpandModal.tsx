/**
 * TextExpandModal - Modal for viewing full prompt/explanation text
 *
 * Features:
 * - Copy button with feedback
 * - Markdown rendering for explanations
 * - Portal to body for proper z-index
 * - ESC to close
 *
 * Security: Uses DOMPurify to sanitize all HTML content before rendering
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check } from 'lucide-react';
import DOMPurify from 'dompurify';

interface TextExpandModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  type: 'prompt' | 'explanation';
}

// Simple markdown renderer (same as ChatPanel)
const renderMarkdown = (text: string): React.ReactNode => {
  const escapeHtml = (str: string): string => {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, char => htmlEntities[char]);
  };

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = '';

  lines.forEach((line, idx) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${idx}`} className="bg-slate-950 rounded-lg p-3 my-2 overflow-x-auto text-xs">
            <code className="text-slate-300">{codeContent.trim()}</code>
          </pre>
        );
        codeContent = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      return;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h4 key={idx} className="text-sm font-semibold text-slate-200 mt-3 mb-1">{line.slice(4)}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={idx} className="text-base font-semibold text-slate-100 mt-4 mb-2">{line.slice(3)}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={idx} className="text-lg font-bold text-white mt-4 mb-2">{line.slice(2)}</h2>);
    }
    // Lists
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={idx} className="text-slate-300 text-sm ml-4 list-disc">{line.slice(2)}</li>
      );
    }
    // Bold and inline code - SECURITY: Content is escaped first, then sanitized with DOMPurify
    else if (line.trim()) {
      const escaped = escapeHtml(line);
      const formatted = escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
        .replace(/`(.+?)`/g, '<code class="bg-slate-800 px-1 rounded text-blue-300">$1</code>');
      // DOMPurify sanitizes to prevent XSS - only allows safe tags/attrs
      const sanitized = DOMPurify.sanitize(formatted, {
        ALLOWED_TAGS: ['strong', 'code'],
        ALLOWED_ATTR: ['class']
      });
      elements.push(
        <p key={idx} className="text-slate-300 text-sm my-1">
          <span dangerouslySetInnerHTML={{ __html: sanitized }} />
        </p>
      );
    } else {
      elements.push(<div key={idx} className="h-2" />);
    }
  });

  return <div className="space-y-0.5">{elements}</div>;
};

export const TextExpandModal: React.FC<TextExpandModalProps> = ({
  isOpen,
  onClose,
  title,
  content,
  type
}) => {
  const [copied, setCopied] = useState(false);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-4">
        <div className="w-full max-w-2xl max-h-[80vh] bg-slate-900 border border-white/10 rounded-xl shadow-2xl flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
            <h3 className="text-sm font-medium text-white">{title}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-green-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 min-h-0">
            {type === 'explanation' ? (
              <div className="prose prose-invert prose-sm max-w-none">
                {renderMarkdown(content)}
              </div>
            ) : (
              <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{content}</p>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default TextExpandModal;
