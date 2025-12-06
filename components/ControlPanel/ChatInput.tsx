import React, { useState, useRef, useCallback } from 'react';
import { Send, Image, Palette, X, Mic, MicOff, Loader2, Paperclip } from 'lucide-react';
import { ChatAttachment } from '../../types';

interface ChatInputProps {
  onSend: (prompt: string, attachments: ChatAttachment[]) => void;
  isGenerating: boolean;
  hasExistingApp: boolean;
  placeholder?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  isGenerating,
  hasExistingApp,
  placeholder
}) => {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const attachTypeRef = useRef<'sketch' | 'brand'>('sketch');

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (file.size > MAX_FILE_SIZE) {
      setError('File too large. Max 10MB.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Use PNG, JPEG, or WebP.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Check if already have this type
    const existingIndex = attachments.findIndex(a => a.type === attachTypeRef.current);

    const reader = new FileReader();
    reader.onloadend = () => {
      const newAttachment: ChatAttachment = {
        type: attachTypeRef.current,
        file,
        preview: reader.result as string
      };

      if (existingIndex >= 0) {
        setAttachments(prev => prev.map((a, i) => i === existingIndex ? newAttachment : a));
      } else {
        setAttachments(prev => [...prev, newAttachment]);
      }
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowAttachMenu(false);
  }, [attachments]);

  const removeAttachment = (type: 'sketch' | 'brand') => {
    setAttachments(prev => prev.filter(a => a.type !== type));
  };

  const handleSend = () => {
    // Need at least a prompt if existing app, or sketch if no app
    if (!hasExistingApp && attachments.length === 0) {
      setError('Please upload a sketch first');
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (hasExistingApp && !prompt.trim() && attachments.length === 0) {
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

  return (
    <div className="flex-shrink-0 border-t border-white/5 p-3 bg-slate-900/50">
      {/* Error message */}
      {error && (
        <div className="mb-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2">
          {attachments.map((att) => (
            <div key={att.type} className="relative group">
              <img
                src={att.preview}
                alt={att.type}
                className="w-14 h-14 object-cover rounded-lg border border-white/10"
              />
              <button
                onClick={() => removeAttachment(att.type)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-center py-0.5 rounded-b-lg">
                {att.type}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2">
        {/* Attach button */}
        <div className="relative">
          <button
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            title="Attach image"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Attach menu */}
          {showAttachMenu && (
            <div className="absolute bottom-full left-0 mb-2 bg-slate-800 border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
              <button
                onClick={() => openFileDialog('sketch')}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-sm text-slate-300 w-full"
              >
                <Image className="w-4 h-4 text-blue-400" />
                Sketch / Wireframe
              </button>
              <button
                onClick={() => openFileDialog('brand')}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-sm text-slate-300 w-full"
              >
                <Palette className="w-4 h-4 text-purple-400" />
                Brand Logo
              </button>
            </div>
          )}
        </div>

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || (hasExistingApp ? "Describe changes..." : "Describe your app...")}
            disabled={isGenerating}
            rows={1}
            className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 resize-none disabled:opacity-50"
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />
          <button
            onClick={toggleListening}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
              isListening ? 'text-red-400 bg-red-500/20' : 'text-slate-400 hover:text-white'
            }`}
            title={isListening ? 'Stop listening' : 'Voice input'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isGenerating || (!hasExistingApp && attachments.length === 0)}
          className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors"
        >
          {isGenerating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Hint text */}
      {!hasExistingApp && attachments.length === 0 && (
        <p className="text-[10px] text-slate-600 text-center mt-2">
          Upload a sketch to generate your first app
        </p>
      )}
    </div>
  );
};
