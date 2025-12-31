import React, { useState, useRef, useEffect, memo } from 'react';
import { Send, Loader2, Wand2, Paperclip, Image, Palette, X, Maximize2, Sparkles, Brain, Clock, FileText } from 'lucide-react';
import { ChatAttachment, FileSystem } from '../../types';
import { PromptLibrary, PromptDropdown } from './PromptLibrary';
import { PromptTemplateSelector } from './PromptTemplateSelector';
import { UploadCards } from './UploadCards';
import { ExpandedPromptModal } from './ExpandedPromptModal';
import { PromptImproverModal } from './PromptImproverModal';
import { useToast } from '../Toast/ToastContext';

interface ChatInputProps {
  onSend: (prompt: string, attachments: ChatAttachment[], fileContext?: string[]) => void;
  isGenerating: boolean;
  hasExistingApp: boolean;
  placeholder?: string;
  files?: FileSystem;
  onOpenPromptEngineer?: () => void;
  onOpenHistory?: () => void;
  onOpenTemplateSettings?: () => void;
  externalPrompt?: string; // For auto-filling from continuation
  historyPrompt?: string; // For auto-filling from prompt history
}

export const ChatInput = memo(function ChatInput({
  onSend,
  isGenerating,
  hasExistingApp,
  placeholder,
  files = {},
  onOpenPromptEngineer,
  onOpenHistory,
  onOpenTemplateSettings,
  externalPrompt,
  historyPrompt
}: ChatInputProps) {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showPromptDropdown, setShowPromptDropdown] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showExpandedModal, setShowExpandedModal] = useState(false);
  const [showImproverModal, setShowImproverModal] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { error: showError } = useToast();

  // BUG-028 FIX: Track last applied external prompt to avoid dependency loop
  const lastExternalPromptRef = useRef<string | undefined>(undefined);
  const lastHistoryPromptRef = useRef<string | undefined>(undefined);

  // Handle external prompt from continuation
  // BUG-028 FIX: Only depend on externalPrompt, use ref to avoid circular dependency
  useEffect(() => {
    if (externalPrompt && externalPrompt !== lastExternalPromptRef.current) {
      lastExternalPromptRef.current = externalPrompt;
      setPrompt(externalPrompt);
    }
  }, [externalPrompt]);

  // Handle history prompt selection
  useEffect(() => {
    if (historyPrompt && historyPrompt !== lastHistoryPromptRef.current) {
      lastHistoryPromptRef.current = historyPrompt;
      setPrompt(historyPrompt);
    }
  }, [historyPrompt]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachTypeRef = useRef<'sketch' | 'brand'>('sketch');

  const error = localError;

  const handleAttach = (type: 'sketch' | 'brand', file: File, preview: string) => {
    const newAttachment: ChatAttachment = { type, file, preview };
    setAttachments(prev => {
      const existing = prev.findIndex(a => a.type === type);
      if (existing >= 0) {
        return prev.map((a, i) => i === existing ? newAttachment : a);
      }
      return [...prev, newAttachment];
    });
  };

  const handleRemove = (type: 'sketch' | 'brand') => {
    setAttachments(prev => prev.filter(a => a.type !== type));
  };

  const handleSend = () => {
    // Need at least a sketch OR a prompt
    const hasSketch = attachments.find(a => a.type === 'sketch');
    const hasPrompt = prompt.trim().length > 0;

    if (!hasExistingApp && !hasSketch && !hasPrompt) {
      setLocalError('Please upload a sketch or enter a prompt');
      setTimeout(() => setLocalError(null), 3000);
      return;
    }

    if (hasExistingApp && !hasPrompt && attachments.length === 0) {
      setLocalError('Please enter a prompt or attach an image');
      setTimeout(() => setLocalError(null), 3000);
      return;
    }

    onSend(prompt.trim(), attachments);
    setPrompt('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openFileDialog = (type: 'sketch' | 'brand') => {
    attachTypeRef.current = type;
    fileInputRef.current?.click();
    setShowAttachMenu(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setLocalError('Invalid file type. Use PNG, JPEG, or WebP.');
      setTimeout(() => setLocalError(null), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Only attach if we got a valid result (not empty string)
      if (result && result.trim().length > 0) {
        handleAttach(attachTypeRef.current, file, result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const sketchAttachment = attachments.find(a => a.type === 'sketch');
  const brandAttachment = attachments.find(a => a.type === 'brand');
  // Can send if: (existing app + prompt/attachment) OR (new app + sketch OR prompt)
  const canSend = hasExistingApp
    ? (prompt.trim() || attachments.length > 0)
    : (!!sketchAttachment || prompt.trim().length > 0);

  return (
    <div className="flex-shrink-0" style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-surface)' }}>
      {/* Error message */}
      {error && (
        <div className="mx-3 mt-3 p-2 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)' }}>
          {error}
        </div>
      )}

      {/* Upload Cards - Show when no existing app */}
      {!hasExistingApp && (
        <UploadCards
          attachments={attachments}
          onAttach={handleAttach}
          onRemove={handleRemove}
          onError={showError}
          disabled={isGenerating}
        />
      )}

      {/* Compact Attachments - Show when existing app has attachments */}
      {hasExistingApp && attachments.length > 0 && (
        <div className="flex gap-2 px-3 pt-3">
          {attachments.map((att) => (
            <div key={att.type} className="relative group">
              {att.preview && att.preview.trim() ? (
                <img
                  src={att.preview}
                  alt={att.type}
                  className="w-14 h-14 object-cover rounded-lg"
                  style={{ border: '1px solid var(--theme-border)' }}
                />
              ) : (
                <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
                  {att.type === 'sketch' ? <Image className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} /> : <Palette className="w-6 h-6" style={{ color: 'var(--theme-ai-accent)' }} />}
                </div>
              )}
              <button
                onClick={() => handleRemove(att.type)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: 'var(--color-error)', color: 'white' }}
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 text-[8px] text-center py-0.5 rounded-b-lg flex items-center justify-center gap-1" style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-secondary)' }}>
                {att.type === 'sketch' ? <Image className="w-2.5 h-2.5" /> : <Palette className="w-2.5 h-2.5" />}
                {att.type}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top toolbar - move icons here */}
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--theme-border)' }}>
        <div className="flex items-center gap-2">
          {/* Attach button - only show when existing app */}
          {hasExistingApp && (
            <div className="relative">
              <button
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className="p-1.5 rounded-md transition-colors"
                style={{
                  backgroundColor: attachments.length > 0 ? 'var(--theme-accent-subtle)' : undefined,
                  color: attachments.length > 0 ? 'var(--theme-accent)' : 'var(--theme-text-muted)'
                }}
                title="Attach image"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Attach menu */}
              {showAttachMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                  <div className="absolute top-full left-0 mt-1 w-48 rounded-lg shadow-lg overflow-hidden z-50" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
                    <button
                      onClick={() => openFileDialog('sketch')}
                      className="flex items-center gap-2 px-3 py-2 text-sm w-full"
                      style={{ color: 'var(--theme-text-secondary)' }}
                    >
                      <Image className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
                      <span className="flex-1 text-left">Sketch / Wireframe</span>
                      {sketchAttachment && <span className="text-[10px]" style={{ color: 'var(--color-success)' }}>✓</span>}
                    </button>
                    <button
                      onClick={() => openFileDialog('brand')}
                      className="flex items-center gap-2 px-3 py-2 text-sm w-full"
                      style={{ color: 'var(--theme-text-secondary)' }}
                    >
                      <Palette className="w-4 h-4" style={{ color: 'var(--theme-ai-accent)' }} />
                      <span className="flex-1 text-left">Brand Logo</span>
                      {brandAttachment && <span className="text-[10px]" style={{ color: 'var(--color-success)' }}>✓</span>}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Prompt Library button */}
          <div className="relative">
            <button
              onClick={() => setShowPromptDropdown(!showPromptDropdown)}
              className="p-1.5 rounded-md transition-colors"
              style={{
                backgroundColor: showPromptDropdown ? 'var(--theme-ai-accent-subtle)' : undefined,
                color: showPromptDropdown ? 'var(--theme-ai-accent)' : 'var(--theme-text-muted)'
              }}
              title="Prompt Library"
            >
              <Wand2 className="w-4 h-4" />
            </button>

            <PromptDropdown
              isOpen={showPromptDropdown}
              onClose={() => setShowPromptDropdown(false)}
              onSelectPrompt={(p) => setPrompt(prev => prev ? `${prev}\n${p}` : p)}
              onOpenLibrary={() => setShowPromptLibrary(true)}
            />
          </div>

          {/* Saved Templates button */}
          <div className="relative">
            <button
              onClick={() => setShowTemplateSelector(!showTemplateSelector)}
              className="p-1.5 rounded-md transition-colors"
              style={{
                backgroundColor: showTemplateSelector ? 'var(--theme-accent-subtle)' : undefined,
                color: showTemplateSelector ? 'var(--theme-accent)' : 'var(--theme-text-muted)'
              }}
              title="Saved Templates"
            >
              <FileText className="w-4 h-4" />
            </button>

            <PromptTemplateSelector
              isOpen={showTemplateSelector}
              onClose={() => setShowTemplateSelector(false)}
              onSelectPrompt={(p) => setPrompt(prev => prev ? `${prev}\n${p}` : p)}
              onOpenSettings={onOpenTemplateSettings}
            />
          </div>

          {/* Prompt History button */}
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
              title="Prompt History"
            >
              <Clock className="w-4 h-4" />
            </button>
          )}

          {/* AI Prompt Engineer button */}
          {onOpenPromptEngineer && (
            <button
              onClick={onOpenPromptEngineer}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
              title="AI Prompt Engineer (Create from scratch)"
            >
              <Brain className="w-4 h-4" />
            </button>
          )}

          {/* Improve button - always visible */}
          <button
            onClick={() => setShowImproverModal(true)}
            disabled={isGenerating || !prompt.trim()}
            className="p-1.5 rounded-md transition-colors disabled:opacity-50"
            style={{
              backgroundColor: prompt.trim() ? 'var(--theme-ai-accent-subtle)' : undefined,
              color: prompt.trim() ? 'var(--theme-ai-accent)' : 'var(--theme-text-muted)',
              cursor: prompt.trim() ? 'pointer' : 'not-allowed'
            }}
            title="Improve prompt with AI (Enhance existing)"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Expand button */}
          <button
            onClick={() => setShowExpandedModal(true)}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Expand editor"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Input area */}
      <div className="p-3">
        <div className="flex items-center gap-2">
          {/* Text input - now much wider */}
          <div className="flex-1 relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || (hasExistingApp ? "Describe changes or ask questions..." : "Describe your app or paste a prompt...")}
              disabled={isGenerating}
              rows={2}
              className="w-full rounded-xl px-4 py-3 pr-16 text-sm focus:outline-none resize-none disabled:opacity-50"
              style={{
                backgroundColor: 'var(--theme-input-bg)',
                border: '1px solid var(--theme-input-border)',
                color: 'var(--theme-text-primary)',
                minHeight: '60px',
                maxHeight: '200px'
              }}
            />
            {/* Character count for very long prompts */}
            {prompt.length > 500 && (
              <div className="absolute bottom-2 right-2 text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                {prompt.length}
              </div>
            )}
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={isGenerating || !canSend}
            className="p-3 rounded-xl transition-colors h-fit disabled:opacity-50"
            style={{
              backgroundColor: canSend && !isGenerating ? 'var(--theme-accent)' : 'var(--theme-surface)',
              color: canSend && !isGenerating ? 'white' : 'var(--theme-text-muted)'
            }}
          >
            {isGenerating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Status hint */}
        {!hasExistingApp && (
          <div className="mt-2 flex items-center justify-center gap-2">
            {canSend ? (
              <p className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
                Ready to generate {sketchAttachment ? '(with sketch)' : '(text only)'}
              </p>
            ) : (
              <p className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                Upload a sketch or describe your app
              </p>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Prompt Library Modal */}
      <PromptLibrary
        isOpen={showPromptLibrary}
        onClose={() => setShowPromptLibrary(false)}
        onSelectPrompt={(p) => setPrompt(prev => prev ? `${prev}\n${p}` : p)}
      />

      {/* Expanded Prompt Modal */}
      <ExpandedPromptModal
        isOpen={showExpandedModal}
        onClose={() => setShowExpandedModal(false)}
        onSend={(modalPrompt, modalAttachments, fileContext) => {
          onSend(modalPrompt, modalAttachments, fileContext);
          setPrompt('');
          setAttachments([]);
        }}
        isGenerating={isGenerating}
        hasExistingApp={hasExistingApp}
        files={files}
        initialPrompt={prompt}
        initialAttachments={attachments}
      />

      {/* Prompt Improver Modal */}
      <PromptImproverModal
        isOpen={showImproverModal}
        onClose={() => setShowImproverModal(false)}
        originalPrompt={prompt}
        files={files}
        hasExistingApp={hasExistingApp}
        onAccept={(improvedPrompt) => {
          setPrompt(improvedPrompt);
          setShowImproverModal(false);
        }}
      />
    </div>
  );
});
