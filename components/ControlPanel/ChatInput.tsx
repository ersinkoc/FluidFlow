import React, { useState, useRef } from 'react';
import { Send, Mic, MicOff, Loader2, Wand2, Paperclip, Image, Palette, X, Maximize2, Sparkles } from 'lucide-react';
import { ChatAttachment, FileSystem } from '../../types';
import { PromptLibrary, PromptDropdown } from './PromptLibrary';
import { UploadCards } from './UploadCards';
import { ExpandedPromptModal } from './ExpandedPromptModal';
import { PromptImproverModal } from './PromptImproverModal';

interface ChatInputProps {
  onSend: (prompt: string, attachments: ChatAttachment[], fileContext?: string[]) => void;
  isGenerating: boolean;
  hasExistingApp: boolean;
  placeholder?: string;
  files?: FileSystem;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  isGenerating,
  hasExistingApp,
  placeholder,
  files = {}
}) => {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [showPromptDropdown, setShowPromptDropdown] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showExpandedModal, setShowExpandedModal] = useState(false);
  const [showImproverModal, setShowImproverModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const attachTypeRef = useRef<'sketch' | 'brand'>('sketch');

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
      setError('Please upload a sketch or enter a prompt');
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (hasExistingApp && !hasPrompt && attachments.length === 0) {
      setError('Please enter a prompt or attach an image');
      setTimeout(() => setError(null), 3000);
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

  // Speech Recognition
  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setError('Voice not supported in this browser');
        setTimeout(() => setError(null), 3000);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setPrompt(prev => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
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
      setError('Invalid file type. Use PNG, JPEG, or WebP.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      handleAttach(attachTypeRef.current, file, reader.result as string);
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
          disabled={isGenerating}
        />
      )}

      {/* Compact Attachments - Show when existing app has attachments */}
      {hasExistingApp && attachments.length > 0 && (
        <div className="flex gap-2 px-3 pt-3">
          {attachments.map((att) => (
            <div key={att.type} className="relative group">
              <img
                src={att.preview}
                alt={att.type}
                className="w-14 h-14 object-cover rounded-lg border border-white/10"
              />
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

      {/* Input area */}
      <div className="p-3">
        <div className="flex items-end gap-2">
          {/* Attach button - only show when existing app */}
          {hasExistingApp && (
            <div className="relative">
              <button
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className={`p-2 rounded-lg transition-colors ${
                  attachments.length > 0
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'hover:bg-white/5 text-slate-400 hover:text-white'
                }`}
                title="Attach image"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Attach menu */}
              {showAttachMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                    <button
                      onClick={() => openFileDialog('sketch')}
                      className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 text-sm text-slate-300 w-full"
                    >
                      <Image className="w-4 h-4 text-blue-400" />
                      <span className="flex-1 text-left">Sketch / Wireframe</span>
                      {sketchAttachment && <span className="text-[10px] text-green-400">✓</span>}
                    </button>
                    <button
                      onClick={() => openFileDialog('brand')}
                      className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 text-sm text-slate-300 w-full"
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
              className={`p-2 rounded-lg transition-colors ${
                showPromptDropdown
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'hover:bg-white/5 text-slate-400 hover:text-white'
              }`}
              title="Prompt Library"
            >
              <Wand2 className="w-5 h-5" />
            </button>

            <PromptDropdown
              isOpen={showPromptDropdown}
              onClose={() => setShowPromptDropdown(false)}
              onSelectPrompt={(p) => setPrompt(prev => prev ? `${prev}\n${p}` : p)}
              onOpenLibrary={() => setShowPromptLibrary(true)}
            />
          </div>

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || (hasExistingApp ? "Describe changes..." : "Describe your app (optional)...")}
              disabled={isGenerating}
              rows={1}
              className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-4 py-2.5 pr-20 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 resize-none disabled:opacity-50"
              style={{ minHeight: '42px', maxHeight: '120px' }}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                onClick={() => setShowExpandedModal(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Expand editor (Ctrl+Shift+E)"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={toggleListening}
                className={`p-1.5 rounded-lg transition-colors ${
                  isListening ? 'text-red-400 bg-red-500/20' : 'text-slate-400 hover:text-white'
                }`}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Improve button - only show when there's a prompt */}
          {prompt.trim().length > 0 && (
            <button
              onClick={() => setShowImproverModal(true)}
              disabled={isGenerating}
              className="p-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-400 transition-colors disabled:opacity-50"
              title="Improve prompt with AI"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={isGenerating || !canSend}
            className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors"
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
