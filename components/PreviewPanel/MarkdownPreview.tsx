import React, { useMemo } from 'react';
import { FileText, Eye, Code2, Copy, Check, RefreshCw } from 'lucide-react';
import DOMPurify from 'dompurify';

interface MarkdownPreviewProps {
  content: string;
  fileName: string;
  onRegenerate?: () => void;
  isGenerating?: boolean;
}

// HTML entity escaping
const escapeHtml = (text: string): string => {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, char => htmlEntities[char]);
};

// BUG-003/014/015 FIX: Comprehensive URL sanitization to prevent XSS
// Decodes URL-encoded characters and blocks all dangerous protocols
const sanitizeUrl = (url: string): string => {
  try {
    // First, decode URL-encoded characters to catch encoded attacks like %6a%61%76%61%73%63%72%69%70%74:
    let decoded = url;
    try {
      // Multiple decode passes to catch double-encoding attacks
      let prev = '';
      while (prev !== decoded) {
        prev = decoded;
        decoded = decodeURIComponent(decoded);
      }
    } catch {
      // If decoding fails, use original (might be malformed)
    }

    const trimmed = decoded.trim().toLowerCase();

    // Remove null bytes and control characters that could bypass checks
    // eslint-disable-next-line no-control-regex -- Intentionally filtering control chars for security
    const sanitized = trimmed.replace(/[\x00-\x1f\x7f]/g, '');

    // Block dangerous protocols - comprehensive list
    const dangerousProtocols = [
      'javascript:',
      'vbscript:',
      'data:text/html',
      'data:image/svg',      // SVG can contain <script> tags (catch svg+xml and svg;)
      'data:application/',   // Block application/* data URIs
      'data:text/xml',       // XML can contain scripts
      'file:',               // Block local file access
      'about:',              // Block about: URIs
    ];

    for (const protocol of dangerousProtocols) {
      if (sanitized.startsWith(protocol)) {
        return '#blocked-unsafe-url';
      }
    }

    // Additional check: ensure URL doesn't have suspicious patterns after protocol
    // This catches things like "java\x00script:" or "java\nscript:"
    if (/^\s*j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i.test(decoded)) {
      return '#blocked-unsafe-url';
    }

    return url;
  } catch {
    // If any error occurs, block the URL for safety
    return '#blocked-unsafe-url';
  }
};

// Simple markdown to HTML parser
// BUG-009 fix: Escape HTML first to prevent XSS, then apply markdown transformations
function parseMarkdown(markdown: string): string {
  // First, extract code blocks and replace with placeholders (they need special handling)
  const codeBlocks: string[] = [];
  let html = markdown.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escapeHtml(code.trim());
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre class="bg-slate-900 rounded-lg p-4 overflow-x-auto my-4 border border-white/10"><code class="text-sm font-mono text-slate-300">${escapedCode}</code></pre>`);
    return placeholder;
  });

  // Extract inline code and replace with placeholders
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const escapedCode = escapeHtml(code);
    const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(`<code class="bg-slate-800 px-1.5 py-0.5 rounded text-blue-300 text-sm font-mono">${escapedCode}</code>`);
    return placeholder;
  });

  // BUG-009 fix: Escape all remaining HTML to prevent XSS
  html = escapeHtml(html);

  // Restore code blocks and inline code (they were already escaped)
  codeBlocks.forEach((block, i) => {
    html = html.replace(`__CODE_BLOCK_${i}__`, block);
  });
  inlineCodes.forEach((code, i) => {
    html = html.replace(`__INLINE_CODE_${i}__`, code);
  });

  // Headers (content is now escaped)
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-white mt-6 mb-3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-white mt-8 mb-4 pb-2 border-b border-white/10">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-white mt-8 mb-4">$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="font-bold"><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em class="italic text-slate-300">$1</em>');
  html = html.replace(/_(.+?)_/g, '<em class="italic text-slate-300">$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del class="line-through text-slate-500">$1</del>');

  // Links - BUG-009 fix: sanitize URLs
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safeUrl = sanitizeUrl(url);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">${text}</a>`;
  });

  // Images - BUG-009 fix: sanitize URLs
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const safeUrl = sanitizeUrl(url);
    return `<img src="${safeUrl}" alt="${alt}" class="max-w-full rounded-lg my-4 border border-white/10" />`;
  });

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-blue-500 pl-4 py-1 my-4 bg-blue-500/5 text-slate-300 italic">$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="my-6 border-white/10" />');
  html = html.replace(/^\*\*\*$/gm, '<hr class="my-6 border-white/10" />');

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-4 text-slate-300 py-0.5 list-disc">$1</li>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-slate-300 py-0.5 list-decimal">$1</li>');

  // Wrap consecutive <li> items in <ul> or <ol>
  html = html.replace(/(<li class="ml-4 text-slate-300 py-0.5 list-disc">[\s\S]*?<\/li>)+/g, (match) => {
    return `<ul class="my-4 space-y-1">${match}</ul>`;
  });
  html = html.replace(/(<li class="ml-4 text-slate-300 py-0.5 list-decimal">[\s\S]*?<\/li>)+/g, (match) => {
    return `<ol class="my-4 space-y-1">${match}</ol>`;
  });

  // Task lists (note: [ ] becomes escaped as &amp;#91; etc, so we match the escaped version)
  html = html.replace(/^- \[x\] (.+)$/gm, '<div class="flex items-center gap-2 py-1"><input type="checkbox" checked disabled class="rounded" /><span class="text-slate-300">$1</span></div>');
  html = html.replace(/^- \[ \] (.+)$/gm, '<div class="flex items-center gap-2 py-1"><input type="checkbox" disabled class="rounded" /><span class="text-slate-300">$1</span></div>');

  // Paragraphs (wrap remaining text)
  html = html.split('\n\n').map(block => {
    if (block.trim() && !block.match(/^<[a-z]/)) {
      return `<p class="text-slate-300 my-3 leading-relaxed">${block}</p>`;
    }
    return block;
  }).join('\n');

  return html;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, fileName, onRegenerate, isGenerating = false }) => {
  const [showSource, setShowSource] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Parse markdown and sanitize with DOMPurify to prevent XSS
  const htmlContent = useMemo(() => {
    const parsed = parseMarkdown(content);
    return DOMPurify.sanitize(parsed, {
      ADD_TAGS: ['input'], // Allow checkbox inputs
      ADD_ATTR: ['target', 'rel', 'checked', 'disabled', 'type'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
    });
  }, [content]);

  const copyContent = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full w-full min-h-0 bg-[#0d1117]">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-4 py-2 bg-[#0a0e16] border-b border-white/5">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-slate-300">{fileName}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">
            Markdown
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-colors ${
                isGenerating
                  ? 'bg-orange-500/20 text-orange-400 cursor-not-allowed'
                  : 'bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Generating...' : 'Re-generate'}
            </button>
          )}
          <button
            onClick={() => setShowSource(!showSource)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-colors ${
              showSource
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            {showSource ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
            {showSource ? 'Preview' : 'Source'}
          </button>
          <button
            onClick={copyContent}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Content - scrollable area */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar relative">
        {isGenerating && (
          <div className="absolute inset-0 bg-[#0d1117]/90 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-orange-500/30 border-t-orange-500 rounded-full animate-spin"></div>
              <span className="text-sm font-medium text-orange-400">Generating README.md...</span>
            </div>
          </div>
        )}
        {showSource ? (
          <pre className="p-6 text-sm font-mono text-slate-300 whitespace-pre-wrap break-words">
            {content}
          </pre>
        ) : (
          <article
            className="prose prose-invert max-w-none p-6"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
      </div>
    </div>
  );
};
