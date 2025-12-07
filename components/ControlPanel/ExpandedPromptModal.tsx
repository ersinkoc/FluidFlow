import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Send,
  Mic,
  MicOff,
  Loader2,
  Wand2,
  Image,
  Palette,
  FileCode,
  ChevronDown,
  ChevronRight,
  Trash2,
  Sparkles,
  Minimize2,
  BookOpen,
  Zap,
  Search,
  Smartphone,
  LayoutGrid,
  Accessibility,
  FileText,
  Wrench
} from 'lucide-react';
import { ChatAttachment, FileSystem } from '../../types';
import { promptLibrary, quickPrompts, PromptItem } from '../../data/promptLibrary';
import { PromptImproverModal } from './PromptImproverModal';

interface ExpandedPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (prompt: string, attachments: ChatAttachment[], fileContext?: string[]) => void;
  isGenerating: boolean;
  hasExistingApp: boolean;
  files: FileSystem;
  initialPrompt?: string;
  initialAttachments?: ChatAttachment[];
}

// Quick prompt suggestions
const QUICK_PROMPTS = [
  { label: 'Add dark mode', prompt: 'Add a dark/light mode toggle with system preference detection' },
  { label: 'Responsive', prompt: 'Make the layout fully responsive for mobile, tablet, and desktop' },
  { label: 'Add animations', prompt: 'Add smooth animations and transitions to improve UX' },
  { label: 'Add loading states', prompt: 'Add loading states and skeleton screens for async operations' },
  { label: 'Improve accessibility', prompt: 'Improve accessibility with proper ARIA labels and keyboard navigation' },
  { label: 'Add form validation', prompt: 'Add client-side form validation with error messages' },
];

// Icon map for prompt library
const iconMap: Record<string, React.FC<{ className?: string }>> = {
  Palette,
  Smartphone,
  Sparkles,
  Zap,
  LayoutGrid,
  Accessibility,
  FileText,
  Wrench,
};

export const ExpandedPromptModal: React.FC<ExpandedPromptModalProps> = ({
  isOpen,
  onClose,
  onSend,
  isGenerating,
  hasExistingApp,
  files,
  initialPrompt = '',
  initialAttachments = []
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [attachments, setAttachments] = useState<ChatAttachment[]>(initialAttachments);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [showImproverModal, setShowImproverModal] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prompt library state
  const [activeCategory, setActiveCategory] = useState<string>(promptLibrary[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const attachTypeRef = useRef<'sketch' | 'brand'>('sketch');

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      textareaRef.current.setSelectionRange(prompt.length, prompt.length);
    }
  }, [isOpen]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 300) + 'px';
    }
  }, [prompt]);

  // Sync initial values
  useEffect(() => {
    setPrompt(initialPrompt);
    setAttachments(initialAttachments);
  }, [initialPrompt, initialAttachments]);

  if (!isOpen) return null;

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

    // Build prompt with file context
    let finalPrompt = prompt.trim();
    if (selectedFiles.length > 0) {
      const contextParts = selectedFiles.map(f => `### ${f}\n\`\`\`\n${files[f] || ''}\n\`\`\``);
      finalPrompt = `${finalPrompt}\n\n---\n**Referenced Files:**\n${contextParts.join('\n\n')}`;
    }

    onSend(finalPrompt, attachments, selectedFiles);
    setPrompt('');
    setAttachments([]);
    setSelectedFiles([]);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      onClose();
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
        setError('Voice not supported');
        setTimeout(() => setError(null), 3000);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

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
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type');
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

  const toggleFileSelection = (filePath: string) => {
    setSelectedFiles(prev =>
      prev.includes(filePath)
        ? prev.filter(f => f !== filePath)
        : [...prev, filePath]
    );
  };

  // Get source files for context selection
  const sourceFiles = Object.keys(files).filter(f =>
    f.startsWith('src/') && (f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css'))
  ).sort();

  const sketchAttachment = attachments.find(a => a.type === 'sketch');
  const brandAttachment = attachments.find(a => a.type === 'brand');
  const canSend = hasExistingApp
    ? (prompt.trim() || attachments.length > 0)
    : (!!sketchAttachment || prompt.trim().length > 0);

  // Prompt library helpers
  const activePrompts = promptLibrary.find(c => c.id === activeCategory)?.prompts || [];
  const filteredPrompts = searchQuery
    ? promptLibrary.flatMap(cat =>
        cat.prompts.filter(p =>
          p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.prompt.toLowerCase().includes(searchQuery.toLowerCase())
        ).map(p => ({ ...p, category: cat.name }))
      )
    : activePrompts;

  const handleSelectPrompt = (selectedPrompt: string) => {
    setPrompt(prev => prev ? `${prev}\n${selectedPrompt}` : selectedPrompt);
    setShowPromptLibrary(false);
    setSearchQuery('');
    textareaRef.current?.focus();
  };

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
        <div
          className="w-[90vw] max-w-7xl h-[85vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto animate-in zoom-in-95 fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl">
                <Sparkles className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="font-semibold text-white">
                  {hasExistingApp ? 'Describe Changes' : 'Describe Your App'}
                </h2>
                <p className="text-xs text-slate-500">Ctrl+Enter to send • Escape to close</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>

          {/* Main Content with optional Prompt Library Panel */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Prompt Editor */}
            <div className={`flex-1 flex flex-col overflow-hidden transition-all ${showPromptLibrary ? 'w-1/2' : 'w-full'}`}>
              {/* Content */}
              <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Quick Prompts */}
            {hasExistingApp && (
              <div>
                <div className="text-xs text-slate-500 mb-2 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5" />
                  Quick Actions
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((qp, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(prev => prev ? `${prev}\n${qp.prompt}` : qp.prompt)}
                      className="px-3 py-1.5 text-xs bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-lg border border-white/5 transition-colors"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Main Textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasExistingApp
                  ? "Describe the changes you want to make...\n\nBe specific about components, styling, or functionality."
                  : "Describe your app in detail...\n\nInclude features, layout, color scheme, and any specific requirements."
                }
                disabled={isGenerating}
                className="w-full min-h-[200px] bg-slate-800/50 border border-white/10 rounded-xl p-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 resize-none disabled:opacity-50"
              />

              {/* Character count */}
              <div className="absolute bottom-3 right-3 text-xs text-slate-600">
                {prompt.length} chars
              </div>
            </div>

            {/* Attachments */}
            <div className="flex flex-wrap gap-4">
              {/* Sketch */}
              <div
                onClick={() => !sketchAttachment && openFileDialog('sketch')}
                className={`relative flex-1 min-w-[150px] p-4 rounded-xl border-2 border-dashed transition-all ${
                  sketchAttachment
                    ? 'border-blue-500/50 bg-blue-500/10'
                    : 'border-white/10 hover:border-white/30 cursor-pointer'
                }`}
              >
                {sketchAttachment ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={sketchAttachment.preview}
                      alt="Sketch"
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {sketchAttachment.file.name}
                      </p>
                      <p className="text-xs text-slate-500">Sketch / Wireframe</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove('sketch'); }}
                      className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Image className="w-8 h-8 text-blue-400" />
                    <div>
                      <p className="text-sm text-slate-300">Add Sketch</p>
                      <p className="text-xs text-slate-500">Wireframe or mockup</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Brand */}
              <div
                onClick={() => !brandAttachment && openFileDialog('brand')}
                className={`relative flex-1 min-w-[150px] p-4 rounded-xl border-2 border-dashed transition-all ${
                  brandAttachment
                    ? 'border-purple-500/50 bg-purple-500/10'
                    : 'border-white/10 hover:border-white/30 cursor-pointer'
                }`}
              >
                {brandAttachment ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={brandAttachment.preview}
                      alt="Brand"
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {brandAttachment.file.name}
                      </p>
                      <p className="text-xs text-slate-500">Brand Logo</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove('brand'); }}
                      className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Palette className="w-8 h-8 text-purple-400" />
                    <div>
                      <p className="text-sm text-slate-300">Add Brand</p>
                      <p className="text-xs text-slate-500">Logo for colors</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* File Context Selector - Only for existing app */}
            {hasExistingApp && sourceFiles.length > 0 && (
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowFileSelector(!showFileSelector)}
                  className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-slate-300">Include File Context</span>
                    {selectedFiles.length > 0 && (
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                        {selectedFiles.length} selected
                      </span>
                    )}
                  </div>
                  {showFileSelector ? (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  )}
                </button>

                {showFileSelector && (
                  <div className="border-t border-white/10 p-3 max-h-48 overflow-y-auto">
                    <p className="text-xs text-slate-500 mb-2">
                      Select files to include as reference context
                    </p>
                    <div className="space-y-1">
                      {sourceFiles.map(file => (
                        <label
                          key={file}
                          className="flex items-center gap-2 p-2 hover:bg-white/5 rounded-lg cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedFiles.includes(file)}
                            onChange={() => toggleFileSelection(file)}
                            className="rounded border-white/20 bg-slate-800 text-blue-500 focus:ring-blue-500/50"
                          />
                          <FileCode className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-sm text-slate-300 truncate">{file}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
              </div>

              {/* Footer for left panel */}
              <div className="flex items-center justify-between p-4 border-t border-white/10 bg-slate-900/50">
                <div className="flex items-center gap-2">
                  {/* Voice */}
                  <button
                    onClick={toggleListening}
                    className={`p-2.5 rounded-lg transition-colors ${
                      isListening
                        ? 'bg-red-500/20 text-red-400'
                        : 'hover:bg-white/10 text-slate-400 hover:text-white'
                    }`}
                    title={isListening ? 'Stop listening' : 'Voice input'}
                  >
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  {/* Prompt Library Toggle */}
                  <button
                    onClick={() => setShowPromptLibrary(!showPromptLibrary)}
                    className={`p-2.5 rounded-lg transition-colors ${
                      showPromptLibrary
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'hover:bg-white/10 text-slate-400 hover:text-white'
                    }`}
                    title={showPromptLibrary ? 'Hide Prompt Library' : 'Show Prompt Library'}
                  >
                    <BookOpen className="w-5 h-5" />
                  </button>

                  {/* Improve Prompt Button */}
                  {prompt.trim().length > 0 && (
                    <button
                      onClick={() => setShowImproverModal(true)}
                      disabled={isGenerating}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-400 text-sm transition-colors disabled:opacity-50"
                      title="Improve prompt with AI"
                    >
                      <Sparkles className="w-4 h-4" />
                      Improve
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={isGenerating || !canSend}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition-colors"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Generate
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Prompt Library Panel */}
            {showPromptLibrary && (
              <div className="w-1/2 border-l border-white/10 flex flex-col bg-slate-950/50 animate-in slide-in-from-right-5 duration-200">
                {/* Library Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-purple-400" />
                    <span className="font-medium text-sm">Prompt Library</span>
                  </div>
                  <button
                    onClick={() => setShowPromptLibrary(false)}
                    className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Search */}
                <div className="px-4 py-2 border-b border-white/10">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search prompts..."
                      className="w-full pl-9 pr-4 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-purple-500/50"
                    />
                  </div>
                </div>

                <div className="flex flex-1 min-h-0 overflow-hidden">
                  {/* Categories Sidebar */}
                  {!searchQuery && (
                    <div className="w-40 border-r border-white/5 overflow-y-auto custom-scrollbar p-2 flex-shrink-0">
                      {promptLibrary.map(category => {
                        const Icon = iconMap[category.icon] || Sparkles;
                        return (
                          <button
                            key={category.id}
                            onClick={() => setActiveCategory(category.id)}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all text-xs ${
                              activeCategory === category.id
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{category.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Prompts List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                    {searchQuery && (
                      <p className="text-xs text-slate-500 mb-2">
                        Found {filteredPrompts.length} prompts
                      </p>
                    )}

                    <div className="space-y-1.5">
                      {filteredPrompts.map((promptItem: PromptItem & { category?: string }) => (
                        <button
                          key={promptItem.id}
                          onClick={() => handleSelectPrompt(promptItem.prompt)}
                          className="w-full group flex items-start gap-2 p-2.5 rounded-lg bg-slate-800/30 hover:bg-slate-800/60 border border-white/5 hover:border-purple-500/30 transition-all text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-white group-hover:text-purple-300 transition-colors">
                                {promptItem.label}
                              </span>
                              {promptItem.category && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-700 text-slate-400">
                                  {promptItem.category}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{promptItem.prompt}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-purple-400 transition-colors flex-shrink-0 mt-0.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick Prompts Footer */}
                <div className="px-3 py-2 border-t border-white/5 bg-slate-950/50">
                  <p className="text-[10px] text-slate-600 mb-1.5">Quick Actions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPrompts.slice(0, 4).map(qp => (
                      <button
                        key={qp.id}
                        onClick={() => handleSelectPrompt(qp.prompt)}
                        className="px-2 py-1 text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-white/5 hover:border-purple-500/30 transition-all"
                      >
                        {qp.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileSelect}
        className="hidden"
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
    </>
  );

  // Use portal to render outside of parent DOM hierarchy
  return createPortal(modalContent, document.body);
};
