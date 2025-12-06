import React, { useMemo } from 'react';
import { FileText, Eye, Code2, Copy, Check } from 'lucide-react';

interface MarkdownPreviewProps {
  content: string;
  fileName: string;
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

// Simple markdown to HTML parser
function parseMarkdown(markdown: string): string {
  let html = markdown;

  // Code blocks (must be done first)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escapeHtml(code.trim());
    return `<pre class="bg-slate-900 rounded-lg p-4 overflow-x-auto my-4 border border-white/10"><code class="text-sm font-mono text-slate-300">${escapedCode}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-800 px-1.5 py-0.5 rounded text-blue-300 text-sm font-mono">$1</code>');

  // Headers
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

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded-lg my-4 border border-white/10" />');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-blue-500 pl-4 py-1 my-4 bg-blue-500/5 text-slate-300 italic">$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="my-6 border-white/10" />');
  html = html.replace(/^\*\*\*$/gm, '<hr class="my-6 border-white/10" />');

  // Unordered lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 text-slate-300 py-0.5 list-disc">$1</li>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-slate-300 py-0.5 list-decimal">$1</li>');

  // Wrap consecutive <li> items in <ul> or <ol>
  html = html.replace(/(<li class="ml-4 text-slate-300 py-0.5 list-disc">[\s\S]*?<\/li>)+/g, (match) => {
    return `<ul class="my-4 space-y-1">${match}</ul>`;
  });
  html = html.replace(/(<li class="ml-4 text-slate-300 py-0.5 list-decimal">[\s\S]*?<\/li>)+/g, (match) => {
    return `<ol class="my-4 space-y-1">${match}</ol>`;
  });

  // Task lists
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

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, fileName }) => {
  const [showSource, setShowSource] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const htmlContent = useMemo(() => parseMarkdown(content), [content]);

  const copyContent = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0d1117] overflow-hidden">
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
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
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
