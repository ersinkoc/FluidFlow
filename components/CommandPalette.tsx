import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search, FileCode, Hash, Command,
  FileText, CornerDownLeft, ArrowUp, ArrowDown,
  Settings, Trash2, Download, Github, Zap, Eye, Code2,
  Undo2, Redo2, Palette, Layers, Rocket, Link2, Cpu
} from 'lucide-react';
import { FileSystem } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
  activeFile: string;
  onFileSelect: (file: string) => void;
  onAction?: (action: string) => void;
}

interface SearchResult {
  type: 'file' | 'symbol' | 'content' | 'action';
  file?: string;
  line?: number;
  content: string;
  icon: React.ReactNode;
  preview?: string;
}

// Quick actions available in the palette
const QUICK_ACTIONS = [
  { id: 'undo', label: 'Undo (Ctrl+Z)', icon: <Undo2 className="w-4 h-4 text-orange-400" /> },
  { id: 'redo', label: 'Redo (Ctrl+Y)', icon: <Redo2 className="w-4 h-4 text-orange-400" /> },
  { id: 'ai-settings', label: 'AI Provider Settings', icon: <Cpu className="w-4 h-4 text-blue-400" /> },
  { id: 'snippets', label: 'Code Snippets (Ctrl+J)', icon: <Code2 className="w-4 h-4 text-yellow-400" /> },
  { id: 'tailwind', label: 'Tailwind Palette (Ctrl+T)', icon: <Palette className="w-4 h-4 text-cyan-400" /> },
  { id: 'component-tree', label: 'Component Tree (Ctrl+Shift+T)', icon: <Layers className="w-4 h-4 text-green-400" /> },
  { id: 'deploy', label: 'Deploy to Vercel/Netlify', icon: <Rocket className="w-4 h-4 text-purple-400" /> },
  { id: 'share', label: 'Share via URL', icon: <Link2 className="w-4 h-4 text-green-400" /> },
  { id: 'export-stackblitz', label: 'Export to StackBlitz', icon: <Zap className="w-4 h-4 text-blue-400" /> },
  { id: 'export-github', label: 'Push to GitHub', icon: <Github className="w-4 h-4 text-purple-400" /> },
  { id: 'export-zip', label: 'Download as ZIP', icon: <Download className="w-4 h-4 text-green-400" /> },
  { id: 'toggle-preview', label: 'Toggle Preview', icon: <Eye className="w-4 h-4 text-cyan-400" /> },
  { id: 'settings', label: 'Open Settings', icon: <Settings className="w-4 h-4 text-slate-400" /> },
  { id: 'reset', label: 'Reset Project', icon: <Trash2 className="w-4 h-4 text-red-400" /> },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  files,
  activeFile: _activeFile,
  onFileSelect,
  onAction
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<'files' | 'symbols' | 'content' | 'actions'>('files');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setMode('files');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Parse query for mode prefix
  useEffect(() => {
    if (query.startsWith('@')) {
      setMode('symbols');
    } else if (query.startsWith('#')) {
      setMode('content');
    } else if (query.startsWith('>')) {
      setMode('actions');
    } else {
      setMode('files');
    }
    setSelectedIndex(0);
  }, [query]);

  // Get file extension icon
  const getFileIcon = (filename: string) => {
    if (filename.endsWith('.tsx') || filename.endsWith('.jsx')) {
      return <FileCode className="w-4 h-4 text-blue-400" />;
    }
    if (filename.endsWith('.ts') || filename.endsWith('.js')) {
      return <FileCode className="w-4 h-4 text-yellow-400" />;
    }
    if (filename.endsWith('.css')) {
      return <FileText className="w-4 h-4 text-purple-400" />;
    }
    if (filename.endsWith('.json')) {
      return <FileText className="w-4 h-4 text-green-400" />;
    }
    return <FileText className="w-4 h-4 text-slate-400" />;
  };

  // Search results based on mode and query
  const results = useMemo((): SearchResult[] => {
    const searchQuery = query.replace(/^[@#>]/, '').toLowerCase().trim();
    const fileEntries = Object.entries(files);

    if (mode === 'actions') {
      return QUICK_ACTIONS
        .filter(action => action.label.toLowerCase().includes(searchQuery))
        .map(action => ({
          type: 'action' as const,
          content: action.label,
          icon: action.icon,
          file: action.id
        }));
    }

    if (mode === 'files' || !searchQuery) {
      // File search
      return fileEntries
        .filter(([path]) => path.toLowerCase().includes(searchQuery))
        .sort((a, b) => {
          // Prioritize src files
          const aIsSrc = a[0].startsWith('src/');
          const bIsSrc = b[0].startsWith('src/');
          if (aIsSrc && !bIsSrc) return -1;
          if (!aIsSrc && bIsSrc) return 1;
          return a[0].localeCompare(b[0]);
        })
        .slice(0, 15)
        .map(([path]) => ({
          type: 'file' as const,
          file: path,
          content: path.split('/').pop() || path,
          icon: getFileIcon(path),
          preview: path
        }));
    }

    if (mode === 'symbols') {
      // Symbol search (functions, components, classes)
      const symbolResults: SearchResult[] = [];
      const symbolPatterns = [
        /(?:export\s+)?(?:const|let|var|function)\s+([A-Z][a-zA-Z0-9]*)\s*[=:(<]/g, // Components/functions
        /(?:export\s+)?class\s+([A-Z][a-zA-Z0-9]*)/g, // Classes
        /(?:export\s+)?interface\s+([A-Z][a-zA-Z0-9]*)/g, // Interfaces
        /(?:export\s+)?type\s+([A-Z][a-zA-Z0-9]*)/g, // Types
      ];

      fileEntries.forEach(([path, content]) => {
        const lines = (content as string).split('\n');
        lines.forEach((line, lineNum) => {
          symbolPatterns.forEach(pattern => {
            const matches = [...line.matchAll(pattern)];
            matches.forEach(match => {
              if (match[1].toLowerCase().includes(searchQuery)) {
                symbolResults.push({
                  type: 'symbol',
                  file: path,
                  line: lineNum + 1,
                  content: match[1],
                  icon: <Hash className="w-4 h-4 text-purple-400" />,
                  preview: line.trim().slice(0, 60)
                });
              }
            });
          });
        });
      });

      return symbolResults.slice(0, 20);
    }

    if (mode === 'content') {
      // Content/text search
      const contentResults: SearchResult[] = [];

      fileEntries.forEach(([path, content]) => {
        const lines = (content as string).split('\n');
        lines.forEach((line, lineNum) => {
          if (line.toLowerCase().includes(searchQuery)) {
            contentResults.push({
              type: 'content',
              file: path,
              line: lineNum + 1,
              content: path.split('/').pop() || path,
              icon: getFileIcon(path),
              preview: line.trim().slice(0, 80)
            });
          }
        });
      });

      return contentResults.slice(0, 20);
    }

    return [];
  }, [query, files, mode]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'Tab': {
        e.preventDefault();
        // Cycle through modes
        const modes: typeof mode[] = ['files', 'symbols', 'content', 'actions'];
        const currentIdx = modes.indexOf(mode);
        const nextMode = modes[(currentIdx + 1) % modes.length];
        setMode(nextMode);
        setQuery(nextMode === 'files' ? '' : nextMode === 'symbols' ? '@' : nextMode === 'content' ? '#' : '>');
        break;
      }
    }
  }, [results, selectedIndex, mode, onClose]);

  // Handle selection
  const handleSelect = (result: SearchResult) => {
    if (result.type === 'action') {
      onAction?.(result.file || '');
      onClose();
    } else if (result.file) {
      onFileSelect(result.file);
      onClose();
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <Search className="w-5 h-5 text-slate-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files, symbols, or type > for commands..."
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-slate-500"
          />
          <div className="flex items-center gap-1 text-[10px] text-slate-600">
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">Tab</kbd>
            <span>to switch mode</span>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5 bg-slate-950/50">
          {[
            { key: 'files', label: 'Files', prefix: '' },
            { key: 'symbols', label: 'Symbols', prefix: '@' },
            { key: 'content', label: 'Content', prefix: '#' },
            { key: 'actions', label: 'Actions', prefix: '>' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setMode(tab.key as typeof mode);
                setQuery(tab.prefix);
                inputRef.current?.focus();
              }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                mode === tab.key
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
            >
              {tab.prefix && <span className="mr-1 opacity-50">{tab.prefix}</span>}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto custom-scrollbar">
          {results.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              {query ? 'No results found' : 'Start typing to search...'}
            </div>
          ) : (
            <div className="py-2">
              {results.map((result, index) => (
                <button
                  key={`${result.file}-${result.line}-${index}`}
                  data-index={index}
                  onClick={() => handleSelect(result)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                    index === selectedIndex
                      ? 'bg-blue-600/20 text-white'
                      : 'text-slate-400 hover:bg-white/5'
                  }`}
                >
                  {result.icon}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{result.content}</span>
                      {result.line && (
                        <span className="text-xs text-slate-600">:{result.line}</span>
                      )}
                    </div>
                    {result.preview && result.preview !== result.content && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {result.preview}
                      </p>
                    )}
                  </div>
                  {index === selectedIndex && (
                    <CornerDownLeft className="w-4 h-4 text-slate-600" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/5 bg-slate-950/50 text-[10px] text-slate-600">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ArrowUp className="w-3 h-3" />
              <ArrowDown className="w-3 h-3" />
              navigate
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" />
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-slate-800 rounded">esc</kbd>
              close
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            <span>Ctrl+P to open</span>
          </div>
        </div>
      </div>
    </div>
  );
};
