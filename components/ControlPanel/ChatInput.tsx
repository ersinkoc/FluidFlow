import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Mic, MicOff, Loader2, Wand2, Paperclip, Image, Palette, X, Maximize2, Sparkles, Brain, Clock } from 'lucide-react';
import { ChatAttachment, FileSystem } from '../../types';
import { PromptLibrary, PromptDropdown } from './PromptLibrary';
import { UploadCards } from './UploadCards';
import { ExpandedPromptModal } from './ExpandedPromptModal';
import { PromptImproverModal } from './PromptImproverModal';
import { QuickLevelToggle } from './PromptLevelModal';
import { usePromptLevel } from './hooks';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useToast } from '../Toast/ToastContext';

interface ChatInputProps {
  onSend: (prompt: string, attachments: ChatAttachment[], fileContext?: string[]) => void;
  isGenerating: boolean;
  hasExistingApp: boolean;
  placeholder?: string;
  files?: FileSystem;
  onOpenPromptEngineer?: () => void;
  onOpenHistory?: () => void;
  externalPrompt?: string; // For auto-filling from continuation
  historyPrompt?: string; // For auto-filling from prompt history
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  isGenerating,
  hasExistingApp,
  placeholder,
  files = {},
  onOpenPromptEngineer,
  onOpenHistory,
  externalPrompt,
  historyPrompt
}) => {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showPromptDropdown, setShowPromptDropdown] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showExpandedModal, setShowExpandedModal] = useState(false);
  const [showImproverModal, setShowImproverModal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [defaultLevel, setDefaultLevel] = usePromptLevel();
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

  // Speech recognition hook
  const handleSpeechTranscript = useCallback((text: string) => {
    setPrompt(prev => prev + (prev ? ' ' : '') + text);
  }, []);
  const { isListening, toggleListening, error: speechError } = useSpeechRecognition(handleSpeechTranscript);

  // Combine local and speech errors
  const error = localError || speechError;

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
    // Ctrl+Shift+E to expand
    if (e.key === 'e' && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      setShowExpandedModal(true);
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
    <div className="flex-shrink-0 border-t border-white/5 bg-slate-900/50">
      {/* Error message */}
      {error && (
        <div className="mx-3 mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
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
                  className="w-14 h-14 object-cover rounded-lg border border-white/10"
                />
              ) : (
                <div className="w-14 h-14 bg-slate-800 rounded-lg border border-white/10 flex items-center justify-center">
                  {att.type === 'sketch' ? <Image className="w-6 h-6 text-blue-400" /> : <Palette className="w-6 h-6 text-purple-400" />}
                </div>
              )}
              <button
                onClick={() => handleRemove(att.type)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-center py-0.5 rounded-b-lg flex items-center justify-center gap-1">
                {att.type === 'sketch' ? <Image className="w-2.5 h-2.5" /> : <Palette className="w-2.5 h-2.5" />}
                {att.type}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top toolbar - move icons here */}
      <div className="px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          {/* Attach button - only show when existing app */}
          {hasExistingApp && (
            <div className="relative">
              <button
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className={`p-1.5 rounded-md transition-colors ${
                  attachments.length > 0
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'hover:bg-white/5 text-slate-400 hover:text-white'
                }`}
                title="Attach image"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Attach menu */}
              {showAttachMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                  <div className="absolute top-full left-0 mt-1 w-48 bg-slate-800 border border-white/10 rounded-lg shadow-lg overflow-hidden z-50">
                    <button
                      onClick={() => openFileDialog('sketch')}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-sm text-slate-300 w-full"
                    >
                      <Image className="w-4 h-4 text-blue-400" />
                      <span className="flex-1 text-left">Sketch / Wireframe</span>
                      {sketchAttachment && <span className="text-[10px] text-green-400">✓</span>}
                    </button>
                    <button
                      onClick={() => openFileDialog('brand')}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-sm text-slate-300 w-full"
                    >
                      <Palette className="w-4 h-4 text-purple-400" />
                      <span className="flex-1 text-left">Brand Logo</span>
                      {brandAttachment && <span className="text-[10px] text-green-400">✓</span>}
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
              className={`p-1.5 rounded-md transition-colors ${
                showPromptDropdown
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'hover:bg-white/5 text-slate-400 hover:text-white'
              }`}
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

          {/* Prompt History button */}
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
              title="Prompt History"
            >
              <Clock className="w-4 h-4" />
            </button>
          )}

          {/* Prompt Level Toggle */}
          <QuickLevelToggle value={defaultLevel} onChange={setDefaultLevel} size="sm" />

          {/* AI Prompt Engineer button */}
          {onOpenPromptEngineer && (
            <button
              onClick={onOpenPromptEngineer}
              className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
              title="AI Prompt Engineer (Create from scratch)"
            >
              <Brain className="w-4 h-4" />
            </button>
          )}

          {/* Improve button - always visible */}
          <button
            onClick={() => setShowImproverModal(true)}
            disabled={isGenerating || !prompt.trim()}
            className={`p-1.5 rounded-md transition-colors ${
              prompt.trim()
                ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                : 'text-slate-600 cursor-not-allowed'
            } disabled:opacity-50`}
            title="Improve prompt with AI (Enhance existing)"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Voice and expand buttons */}
          <button
            onClick={() => setShowExpandedModal(true)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Expand editor (Ctrl+Shift+E)"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={toggleListening}
            className={`p-1.5 rounded-md transition-colors ${
              isListening ? 'text-red-400 bg-red-500/20' : 'text-slate-400 hover:text-white'
            }`}
            title={isListening ? 'Stop listening' : 'Voice input'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
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
              className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-4 py-3 pr-16 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 resize-none disabled:opacity-50"
              style={{ minHeight: '60px', maxHeight: '200px' }}
            />
            {/* Character count for very long prompts */}
            {prompt.length > 500 && (
              <div className="absolute bottom-2 right-2 text-[10px] text-slate-500">
                {prompt.length}
              </div>
            )}
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={isGenerating || !canSend}
            className="p-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors h-fit"
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
              <p className="text-[10px] text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                Ready to generate {sketchAttachment ? '(with sketch)' : '(text only)'}
              </p>
            ) : (
              <p className="text-[10px] text-slate-500">
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
};
