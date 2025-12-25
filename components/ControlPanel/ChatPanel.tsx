import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { User, Bot, Image, Palette, RotateCcw, FileCode, Plus, Minus, Loader2, AlertCircle, RefreshCw, Zap, Clock, Layers, Bookmark, Bug } from 'lucide-react';
import DOMPurify from 'dompurify';
import { ChatMessage, FileChange, FileSystem } from '../../types';
import { TextExpandModal } from './TextExpandModal';
import { ChatTimeline } from './ChatTimeline';
import { useChatContextMenu } from '../ContextMenu';
import { useUI } from '../../contexts/UIContext';

// Truncation limits
const TRUNCATE_PROMPT_LENGTH = 200;
const TRUNCATE_EXPLANATION_LENGTH = 500;

interface ChatPanelProps {
  messages: ChatMessage[];
  onRevert: (messageId: string) => void;
  onRetry: (messageId: string) => void;
  isGenerating: boolean;
  streamingStatus?: string;
  streamingChars?: number;
  streamingFiles?: string[];
  // AI History restore props
  onSaveCheckpoint?: () => void; // Simple callback - parent handles the full checkpoint creation
  aiHistoryCount?: number;
  onRestoreFromHistory?: () => void;
  // Truncation retry props
  truncatedContent?: {
    rawResponse: string;
    prompt: string;
    systemInstruction: string;
    partialFiles?: {
      [filePath: string]: {
        content: string;
        isComplete: boolean;
      };
    };
    attempt: number;
  } | null;
  onTruncationRetry?: () => void;
  // Batch generation props
  onBatchGeneration?: (files: string[], prompt: string, systemInstruction: string) => void;
  // External prompt prop for auto-fill
  onSetExternalPrompt?: (prompt: string) => void;
  // Smart continuation props
  continuationState?: {
    isActive: boolean;
    generationMeta: {
      totalFilesPlanned: number;
      completedFiles: string[];
      remainingFiles: string[];
      currentBatch: number;
      totalBatches: number;
    };
  } | null;
  onContinueGeneration?: () => void;
  // File plan props (detected from stream)
  filePlan?: {
    create: string[];
    delete: string[];
    total: number;
    completed: string[];
    sizes?: Record<string, number>;
  } | null;
  // File progress (for progress bars during streaming)
  fileProgress?: Map<string, {
    path: string;
    action: 'create' | 'update' | 'delete';
    expectedLines: number;
    receivedChars: number;
    progress: number;
    status: 'pending' | 'streaming' | 'complete';
  }>;
  // Time travel prop
  onTimeTravel?: (files: FileSystem | null) => void;
}

// Extract filename from full path
const getFileName = (path: string): string => {
  const parts = path.split('/');
  return parts[parts.length - 1];
};

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
  let _codeLanguage = '';

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
        _codeLanguage = line.slice(3);
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
    // Bold and inline code - escape HTML first, then sanitize with DOMPurify
    else if (line.trim()) {
      const escaped = escapeHtml(line);
      const formatted = escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
        .replace(/`(.+?)`/g, '<code class="bg-slate-800 px-1 rounded text-blue-300">$1</code>');
      // DOMPurify sanitizes HTML to prevent XSS attacks
      const sanitized = DOMPurify.sanitize(formatted, {
        ALLOWED_TAGS: ['strong', 'code'],
        ALLOWED_ATTR: ['class']
      });
      elements.push(
        <p key={idx} className="text-slate-300 text-sm my-1" dangerouslySetInnerHTML={{ __html: sanitized }} />
      );
    } else {
      elements.push(<div key={idx} className="h-2" />);
    }
  });

  return <div className="space-y-0.5">{elements}</div>;
};

// File changes summary component - memoized to prevent re-renders during streaming
const FileChangesSummary = memo(function FileChangesSummary({ changes }: { changes: FileChange[] }) {
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
              <span
                className={`truncate ${
                  change.type === 'added' ? 'text-green-400' :
                  change.type === 'deleted' ? 'text-red-400' : 'text-slate-300'
                }`}
                title={change.path}
              >
                {getFileName(change.path)}
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
});

// Props for individual message item
interface MessageItemProps {
  message: ChatMessage;
  index: number;
  totalMessages: number;
  isGenerating: boolean;
  autoContinueCountdown: number;
  onRevert: (messageId: string) => void;
  onRetry: (messageId: string) => void;
  onSetExternalPrompt?: (prompt: string) => void;
}

// Custom equality function for MessageItem memo
function messageItemAreEqual(prev: MessageItemProps, next: MessageItemProps): boolean {
  // Always re-render if message object changed
  if (prev.message !== next.message) return false;

  // Always re-render if this is the last message and generating state changed
  const wasLastMessage = prev.index === prev.totalMessages - 1;
  const isLastMessage = next.index === next.totalMessages - 1;
  if (wasLastMessage !== isLastMessage) return false;
  if (isLastMessage && prev.isGenerating !== next.isGenerating) return false;

  // Re-render if countdown changed (only affects last message with continuation)
  if (isLastMessage && prev.message.continuation && prev.autoContinueCountdown !== next.autoContinueCountdown) {
    return false;
  }

  // Check if position relative to last message changed (affects revert button visibility)
  if ((prev.index < prev.totalMessages - 1) !== (next.index < next.totalMessages - 1)) return false;

  return true;
}

// Truncation helpers
const shouldTruncate = (text: string | undefined, limit: number): boolean => {
  return text !== undefined && text.length > limit;
};

const getTruncatedText = (text: string, limit: number): string => {
  if (text.length <= limit) return text;
  return text.substring(0, limit) + '...';
};

// Memoized individual message component - prevents re-renders during streaming
const MessageItem = memo(function MessageItem({
  message,
  index,
  totalMessages,
  isGenerating,
  autoContinueCountdown,
  onRevert,
  onRetry,
  onSetExternalPrompt,
}: MessageItemProps) {
  // Modal state for expanded text
  const [expandedModal, setExpandedModal] = useState<{
    type: 'prompt' | 'explanation';
    content: string;
    title: string;
  } | null>(null);

  // Context menu for chat messages
  const handleContextMenu = useChatContextMenu(
    message.id,
    message.prompt || message.explanation || '',
    message.role === 'assistant' && onRetry ? () => onRetry(message.id) : undefined,
    message.snapshotFiles ? () => onRevert(message.id) : undefined
  );

  return (
    <>
    {/* Text expand modal */}
    {expandedModal && (
      <TextExpandModal
        isOpen={true}
        onClose={() => setExpandedModal(null)}
        title={expandedModal.title}
        content={expandedModal.content}
        type={expandedModal.type}
      />
    )}
    <div
      className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
      onContextMenu={handleContextMenu}
    >
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
                    {att.preview && att.preview.trim() ? (
                      <img
                        src={att.preview}
                        alt={att.type}
                        className="w-16 h-16 object-cover rounded-lg border border-white/10"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-slate-800 rounded-lg border border-white/10 flex items-center justify-center">
                        {att.type === 'sketch' ? <Image className="w-6 h-6 text-blue-400" /> : <Palette className="w-6 h-6 text-purple-400" />}
                      </div>
                    )}
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
              <div className="bg-blue-600/20 border border-blue-500/20 rounded-xl rounded-tr-sm px-3 py-2 inline-block max-w-full">
                <p className="text-sm text-slate-200 break-words whitespace-pre-wrap">
                  {shouldTruncate(message.prompt, TRUNCATE_PROMPT_LENGTH) ? (
                    <>
                      {getTruncatedText(message.prompt, TRUNCATE_PROMPT_LENGTH)}
                      <button
                        onClick={() => setExpandedModal({
                          type: 'prompt',
                          content: message.prompt || '',
                          title: 'Full Prompt'
                        })}
                        className="ml-1 text-blue-400 hover:text-blue-300 text-xs font-medium"
                      >
                        show more
                      </button>
                    </>
                  ) : message.prompt}
                </p>
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
                {shouldTruncate(message.explanation, TRUNCATE_EXPLANATION_LENGTH) ? (
                  <>
                    {renderMarkdown(getTruncatedText(message.explanation, TRUNCATE_EXPLANATION_LENGTH))}
                    <button
                      onClick={() => setExpandedModal({
                        type: 'explanation',
                        content: message.explanation || '',
                        title: 'Full Explanation'
                      })}
                      className="text-blue-400 hover:text-blue-300 text-xs font-medium mt-2 block"
                    >
                      Read more...
                    </button>
                  </>
                ) : renderMarkdown(message.explanation)}
              </div>
            )}

            {/* Token Usage */}
            {message.tokenUsage && (
              <div className="mt-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Token Usage
                  </h4>
                  {message.generationTime && (
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="w-3 h-3" />
                      {(message.generationTime / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-slate-500">Input</span>
                    <span className="text-blue-400 font-medium">{message.tokenUsage.inputTokens.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500">Output</span>
                    <span className="text-green-400 font-medium">{message.tokenUsage.outputTokens.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500">Total</span>
                    <span className="text-purple-400 font-medium">{message.tokenUsage.totalTokens.toLocaleString()}</span>
                  </div>
                </div>
                {message.model && message.provider && (
                  <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between">
                    <span className="text-xs text-slate-500">Model</span>
                    <span className="text-xs text-slate-400">{message.provider} • {message.model}</span>
                  </div>
                )}
              </div>
            )}

            {/* File Changes */}
            {message.fileChanges && <FileChangesSummary changes={message.fileChanges} />}

            {/* Continuation Prompt */}
            {message.continuation && !message.isGenerating && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <div className="p-1.5 bg-green-500/20 rounded-lg flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-green-300 mb-2">
                        Batch {message.continuation.currentBatch} of {message.continuation.totalBatches} complete.
                        {message.continuation.remainingFiles.length} files remaining.
                      </p>
                      <button
                        onClick={() => {
                          if (onSetExternalPrompt && message.continuation) {
                            onSetExternalPrompt(message.continuation.prompt);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs rounded-md transition-colors w-full justify-center"
                      >
                        <Clock className="w-3 h-3" />
                        {autoContinueCountdown > 0 && index === totalMessages - 1 ? (
                          `Auto-continue in ${autoContinueCountdown}s`
                        ) : (
                          'Continue to Next Batch'
                        )}
                      </button>
                      <details className="mt-2">
                        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                          View remaining files
                        </summary>
                        <div className="mt-1 space-y-1">
                          {message.continuation.remainingFiles.map((file) => (
                            <div key={`remaining-${file}`} className="text-xs font-mono text-slate-500 pl-2">
                              {file}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Revert Button */}
            {message.snapshotFiles && !message.isGenerating && index < totalMessages - 1 && (
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
    </>
  );
}, messageItemAreEqual);

export const ChatPanel = memo(function ChatPanel({
  messages,
  onRevert,
  onRetry,
  isGenerating,
  streamingStatus,
  streamingChars,
  streamingFiles,
  aiHistoryCount = 0,
  onRestoreFromHistory,
  truncatedContent,
  onTruncationRetry,
  onBatchGeneration: _onBatchGeneration,
  onSetExternalPrompt,
  continuationState,
  onContinueGeneration,
  filePlan,
  fileProgress,
  onSaveCheckpoint,
  onTimeTravel
}: ChatPanelProps) {
  const ui = useUI();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoContinueCountdown, setAutoContinueCountdown] = useState<number>(0);
  const [viewingSnapshotIndex, setViewingSnapshotIndex] = useState<number | null>(null);
  const wasAtBottomRef = useRef(true);
  const lastMessageCountRef = useRef(0);

  // Handle time travel navigation
  const handleTimeTravel = useCallback((messageIndex: number | null) => {
    setViewingSnapshotIndex(messageIndex);
    if (onTimeTravel) {
      if (messageIndex !== null) {
        const message = messages[messageIndex];
        if (message.snapshotFiles) {
          onTimeTravel(message.snapshotFiles);
        }
      } else {
        onTimeTravel(null); // Return to current state
      }
    }
  }, [messages, onTimeTravel]);

  // Track if user is near bottom of chat (within 100px)
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
    }
  }, []);

  // Auto-scroll to bottom only when:
  // 1. New messages are added, OR
  // 2. User was already at bottom (during streaming)
  useEffect(() => {
    if (scrollRef.current) {
      const hasNewMessages = messages.length > lastMessageCountRef.current;
      lastMessageCountRef.current = messages.length;

      // Always scroll on new messages, or during streaming if user was at bottom
      if (hasNewMessages || (wasAtBottomRef.current && isGenerating)) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [messages, streamingChars, isGenerating]);

  // Auto-continue to next batch after 10 seconds
  useEffect(() => {
    // Find the last message with continuation data
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.continuation && !isGenerating && onSetExternalPrompt) {
      // Start countdown at 10
      setAutoContinueCountdown(10);

      const countdownInterval = setInterval(() => {
        setAutoContinueCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      const autoContinueTimer = setTimeout(() => {
        clearInterval(countdownInterval);
        setAutoContinueCountdown(0);
        onSetExternalPrompt(lastMessage.continuation.prompt);
      }, 10000); // 10 seconds

      return () => {
        clearTimeout(autoContinueTimer);
        clearInterval(countdownInterval);
      };
    } else {
      setAutoContinueCountdown(0);
    }
  }, [messages, isGenerating, onSetExternalPrompt]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-4 min-h-0">
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
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Chat Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-slate-300">History</h3>
          <span className="text-xs text-slate-500">({messages.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Time Travel Navigation */}
          {onTimeTravel && (
            <ChatTimeline
              messages={messages}
              currentViewIndex={viewingSnapshotIndex}
              onNavigate={handleTimeTravel}
            />
          )}
          {onSaveCheckpoint && (
            <button
              onClick={onSaveCheckpoint}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
              title="Save current state as checkpoint"
            >
              <Bookmark className="w-3.5 h-3.5" />
              Checkpoint
            </button>
          )}
        </div>
      </div>
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-3 space-y-4">
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          index={index}
          totalMessages={messages.length}
          isGenerating={isGenerating}
          autoContinueCountdown={autoContinueCountdown}
          onRevert={onRevert}
          onRetry={onRetry}
          onSetExternalPrompt={onSetExternalPrompt}
        />
      ))}

      {/* Generating indicator at bottom with streaming status */}
      {isGenerating && messages[messages.length - 1]?.role === 'user' && (
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-purple-600/20 text-purple-400">
            <Bot className="w-4 h-4" />
          </div>
          <div className="bg-slate-800/50 border border-white/5 rounded-xl rounded-tl-sm p-3 flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-blue-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">Generating your app...</span>
              </div>
              <button
                onClick={() => ui.setActiveTab('debug')}
                className="p-1.5 rounded-md text-slate-500 hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                title="View Debug Logs"
              >
                <Bug className="w-3.5 h-3.5" />
              </button>
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

                {/* Smart Continuation Progress */}
                {continuationState && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <Layers className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-blue-300">
                              Multi-batch Generation
                            </span>
                            <span className="text-xs text-blue-400">
                              Batch {continuationState.generationMeta.currentBatch}/{continuationState.generationMeta.totalBatches}
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="h-2 bg-slate-900 rounded-full overflow-hidden mb-2">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                              style={{
                                width: `${(continuationState.generationMeta.completedFiles.length / continuationState.generationMeta.totalFilesPlanned) * 100}%`
                              }}
                            />
                          </div>

                          <div className="flex justify-between text-[10px] text-slate-400 mb-2">
                            <span>
                              {continuationState.generationMeta.completedFiles.length} of {continuationState.generationMeta.totalFilesPlanned} files
                            </span>
                            <span>
                              {continuationState.generationMeta.remainingFiles.length} remaining
                            </span>
                          </div>

                          {/* Continue button when paused */}
                          {!continuationState.isActive && !isGenerating && onContinueGeneration && (
                            <button
                              onClick={onContinueGeneration}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-md transition-colors w-full justify-center"
                            >
                              <Zap className="w-3 h-3" />
                              Continue Generation ({continuationState.generationMeta.remainingFiles.length} files)
                            </button>
                          )}

                          {/* Active indicator */}
                          {continuationState.isActive && (
                            <div className="flex items-center gap-2 text-[10px] text-blue-400">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Auto-continuing...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Truncation Retry Button */}
                {truncatedContent && onTruncationRetry && !isGenerating && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-orange-300 mb-2">
                            Generation was truncated. {truncatedContent.partialFiles ? Object.keys(truncatedContent.partialFiles).length + ' files need recovery.' : ''}
                          </p>
                          <button
                            onClick={onTruncationRetry}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs rounded-md transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Retry Generation (attempt {truncatedContent.attempt}/3)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* File Plan Progress (when plan is detected) */}
                {filePlan && filePlan.create.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-xs font-medium text-slate-400">File Generation Plan</span>
                      </div>
                      <span className="text-xs text-blue-400">
                        {filePlan.completed.length}/{filePlan.total} complete
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${(filePlan.completed.length / filePlan.total) * 100}%` }}
                      />
                    </div>

                    <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                      {/* Files to create */}
                      {filePlan.create.map((file) => {
                        const progress = fileProgress?.get(file);
                        // Use fileProgress.status for actual completion (content fully received)
                        // NOT filePlan.completed which just means file path was detected
                        const isCompleted = progress?.status === 'complete';
                        const isCurrentlyStreaming = streamingFiles?.includes(file) || progress?.status === 'streaming';
                        const progressPercent = progress?.progress ?? 0;
                        const isStreaming = progress?.status === 'streaming' || (isCurrentlyStreaming && !isCompleted);

                        return (
                          <div
                            key={file}
                            className={`text-xs font-mono rounded transition-all overflow-hidden ${
                              isCompleted
                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                                : isStreaming
                                ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300'
                                : 'bg-slate-900/50 text-slate-500 border border-transparent'
                            }`}
                            title={`${file}${progress ? ` - ${progressPercent}%` : ''}`}
                          >
                            <div className="flex items-center gap-2 px-2 py-1">
                              {isCompleted ? (
                                <span className="w-4 h-4 flex items-center justify-center text-emerald-400">✓</span>
                              ) : isStreaming ? (
                                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 text-slate-600" />
                              )}
                              <span className="truncate flex-1">{getFileName(file)}</span>
                              {isStreaming && progressPercent > 0 && (
                                <span className="text-[10px] text-blue-400 tabular-nums">{progressPercent}%</span>
                              )}
                            </div>
                            {/* Per-file progress bar */}
                            {isStreaming && !isCompleted && (
                              <div className="h-0.5 bg-slate-800">
                                <div
                                  className="h-full bg-linear-to-r from-blue-500 to-cyan-400 transition-all duration-500 ease-out"
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Files to delete */}
                      {filePlan.delete.length > 0 && (
                        <>
                          <div className="text-[10px] text-slate-500 mt-2 mb-1">Files to delete:</div>
                          {filePlan.delete.map((file) => (
                            <div
                              key={`del-${file}`}
                              className="flex items-center gap-2 text-xs font-mono px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400"
                              title={file}
                            >
                              <span className="w-4 h-4 flex items-center justify-center">🗑️</span>
                              <span className="truncate line-through">{getFileName(file)}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Fallback: Streaming Files List (when no plan detected) */}
                {!filePlan && streamingFiles && streamingFiles.length > 0 && (
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
                          title={file}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                          {getFileName(file)}
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
    </div>
  );
});

export default ChatPanel;
