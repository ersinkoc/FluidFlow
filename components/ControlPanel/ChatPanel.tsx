import React, { useRef, useEffect } from 'react';
import { User, Bot, Image, Palette, RotateCcw, FileCode, Plus, Minus, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { ChatMessage, FileChange } from '../../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onRevert: (messageId: string) => void;
  onRetry: (messageId: string) => void;
  isGenerating: boolean;
  streamingStatus?: string;
  streamingChars?: number;
  streamingFiles?: string[];
  // AI History restore props
  aiHistoryCount?: number;
  onRestoreFromHistory?: () => void;
}

// HTML entity escaping to prevent XSS attacks
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

// Simple markdown renderer for explanations
const renderMarkdown = (text: string): React.ReactNode => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = '';
  let codeLanguage = '';

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
        codeLanguage = line.slice(3);
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
    // Bold and inline code - escape HTML first to prevent XSS
    else if (line.trim()) {
      const escaped = escapeHtml(line);
      const formatted = escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
        .replace(/`(.+?)`/g, '<code class="bg-slate-800 px-1 rounded text-blue-300">$1</code>');
      elements.push(
        <p key={idx} className="text-slate-300 text-sm my-1" dangerouslySetInnerHTML={{ __html: formatted }} />
      );
    } else {
      elements.push(<div key={idx} className="h-2" />);
    }
  });

  return <div className="space-y-0.5">{elements}</div>;
};

// File changes summary component
const FileChangesSummary: React.FC<{ changes: FileChange[] }> = ({ changes }) => {
  if (!changes || changes.length === 0) return null;

  const totalAdditions = changes.reduce((sum, c) => sum + c.additions, 0);
  const totalDeletions = changes.reduce((sum, c) => sum + c.deletions, 0);

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 font-medium">File Changes</span>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-green-400 flex items-center gap-0.5">
            <Plus className="w-3 h-3" />{totalAdditions}
          </span>
          <span className="text-red-400 flex items-center gap-0.5">
            <Minus className="w-3 h-3" />{totalDeletions}
          </span>
        </div>
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
        {changes.map((change, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-900/50">
            <div className="flex items-center gap-2 min-w-0">
              <FileCode className="w-3 h-3 text-slate-500 flex-shrink-0" />
              <span className={`truncate ${
                change.type === 'added' ? 'text-green-400' :
                change.type === 'deleted' ? 'text-red-400' : 'text-slate-300'
              }`}>
                {change.path}
              </span>
              {change.type === 'added' && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-400">NEW</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] flex-shrink-0">
              {change.additions > 0 && <span className="text-green-400">+{change.additions}</span>}
              {change.deletions > 0 && <span className="text-red-400">-{change.deletions}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  onRevert,
  onRetry,
  isGenerating,
  streamingStatus,
  streamingChars,
  streamingFiles,
  aiHistoryCount = 0,
  onRestoreFromHistory
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingStatus, streamingChars, streamingFiles]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-4">
        <Bot className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm text-center">Upload a sketch to start generating your app</p>

        {/* Restore from History button - shown when chat is empty but history exists */}
        {aiHistoryCount > 0 && onRestoreFromHistory && (
          <button
            onClick={onRestoreFromHistory}
            className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-xl text-sm font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Restore from History ({aiHistoryCount})
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
      {messages.map((message, index) => (
        <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
          {/* Avatar */}
          <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
            message.role === 'user'
              ? 'bg-blue-600/20 text-blue-400'
              : 'bg-purple-600/20 text-purple-400'
          }`}>
            {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
          </div>

          {/* Message Content */}
          <div className={`flex-1 min-w-0 ${message.role === 'user' ? 'text-right' : ''}`}>
            {/* User Message */}
            {message.role === 'user' && (
              <div className="inline-block max-w-full text-left">
                {/* Attachments */}
                {message.attachments && message.attachments.length > 0 && (
                  <div className="flex gap-2 mb-2 justify-end">
                    {message.attachments.map((att, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={att.preview}
                          alt={att.type}
                          className="w-16 h-16 object-cover rounded-lg border border-white/10"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-center py-0.5 rounded-b-lg flex items-center justify-center gap-1">
                          {att.type === 'sketch' ? <Image className="w-2.5 h-2.5" /> : <Palette className="w-2.5 h-2.5" />}
                          {att.type}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Prompt */}
                {message.prompt && (
                  <div className="bg-blue-600/20 border border-blue-500/20 rounded-xl rounded-tr-sm px-3 py-2 inline-block">
                    <p className="text-sm text-slate-200">{message.prompt}</p>
                  </div>
                )}
              </div>
            )}

            {/* Assistant Message */}
            {message.role === 'assistant' && (
              <div className="bg-slate-800/50 border border-white/5 rounded-xl rounded-tl-sm p-3">
                {/* Loading State */}
                {message.isGenerating && (
                  <div className="flex items-center gap-2 text-blue-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Generating...</span>
                  </div>
                )}

                {/* Error State */}
                {message.error && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">{message.error}</span>
                    </div>
                    {!isGenerating && (
                      <button
                        onClick={() => onRetry(message.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry
                      </button>
                    )}
                  </div>
                )}

                {/* Explanation */}
                {message.explanation && (
                  <div className="prose prose-invert prose-sm max-w-none">
                    {renderMarkdown(message.explanation)}
                  </div>
                )}

                {/* File Changes */}
                {message.fileChanges && <FileChangesSummary changes={message.fileChanges} />}

                {/* Revert Button */}
                {message.snapshotFiles && !message.isGenerating && index < messages.length - 1 && (
                  <button
                    onClick={() => onRevert(message.id)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Revert to this state
                  </button>
                )}
              </div>
            )}

            {/* Timestamp */}
            <div className={`text-[10px] text-slate-600 mt-1 ${message.role === 'user' ? 'text-right' : ''}`}>
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      ))}

      {/* Generating indicator at bottom with streaming status */}
      {isGenerating && messages[messages.length - 1]?.role === 'user' && (
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-purple-600/20 text-purple-400">
            <Bot className="w-4 h-4" />
          </div>
          <div className="bg-slate-800/50 border border-white/5 rounded-xl rounded-tl-sm p-3 flex-1">
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Generating your app...</span>
            </div>

            {/* Streaming Status */}
            {streamingStatus && (
              <div className="mt-2 space-y-2">
                <div className="text-xs text-slate-300 font-mono bg-slate-900/50 rounded-lg px-3 py-2 border border-white/5">
                  {streamingStatus}
                </div>

                {/* Progress bar */}
                {streamingChars && streamingChars > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
                        style={{
                          width: `${Math.min(100, (streamingChars / 50000) * 100)}%`,
                          animation: 'pulse 2s ease-in-out infinite'
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-600">
                      <span>{Math.round(streamingChars / 1024)}KB received</span>
                      <span className="animate-pulse">streaming...</span>
                    </div>
                  </div>
                )}

                {/* Streaming Files List */}
                {streamingFiles && streamingFiles.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-medium text-slate-400">File Changes Detected ({streamingFiles.length})</span>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                      {[...streamingFiles].reverse().map((file, idx) => (
                        <div
                          key={file}
                          className={`flex items-center gap-2 text-xs font-mono text-slate-300 px-2 py-1 rounded ${idx === 0 ? 'animate-in slide-in-from-top-2 duration-200 bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-900/50'}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                          {file}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
