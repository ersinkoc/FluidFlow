import React, { useCallback, useState, useEffect, useRef, memo } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { FileCode, Check, Circle, BookOpen } from 'lucide-react';
import { FileSystem } from '../../types';
import { useEditorSettings } from '../../hooks/useEditorSettings';
import { useCodeContextMenu } from '../ContextMenu';
import { SnippetLibraryModal } from '../SnippetLibraryModal';
import { useStatusBarCursor } from '../../contexts/StatusBarContext';

interface CodeEditorProps {
  files: FileSystem;
  setFiles: (files: FileSystem) => void;
  activeFile: string;
  originalFiles?: FileSystem; // For tracking unsaved changes
}

// Map file extensions to Monaco language IDs
const getLanguage = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'tsx': 'typescript',
    'ts': 'typescript',
    'jsx': 'javascript',
    'js': 'javascript',
    'json': 'json',
    'css': 'css',
    'html': 'html',
    'md': 'markdown',
    'sql': 'sql'
  };
  return languageMap[ext] || 'plaintext';
};

export const CodeEditor = memo(function CodeEditor({ files, setFiles, activeFile, originalFiles }: CodeEditorProps) {
  const content = files[activeFile] || '';
  const language = getLanguage(activeFile);
  const [isSaved, setIsSaved] = useState(true);
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { settings: editorSettings } = useEditorSettings();
  const { setCursorPosition } = useStatusBarCursor();

  // Snippet library modal state
  const [showSnippetLibrary, setShowSnippetLibrary] = useState(false);

  // Handle snippet insertion - insert at cursor position
  const handleInsertSnippet = useCallback((code: string) => {
    if (editorRef.current) {
      const position = editorRef.current.getPosition();
      if (position) {
        editorRef.current.trigger('keyboard', 'type', { text: code });
      }
    }
  }, []);

  // Code editor context menu
  const handleFormatCode = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  }, []);

  const handleContextMenu = useCodeContextMenu(
    content,
    handleFormatCode
  );

  // Track if file has been modified
  const isModified = originalFiles ? files[activeFile] !== originalFiles[activeFile] : false;

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Clear cursor position when unmounting
      setCursorPosition(null);
    };
  }, [setCursorPosition]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        setFiles({ ...files, [activeFile]: value });
        setIsSaved(false);

        // Auto-save after 1 second of no typing
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          setIsSaved(true);
          setShowSaveIndicator(true);
          setTimeout(() => setShowSaveIndicator(false), 1500);
        }, 1000);
      }
    },
    [files, activeFile, setFiles]
  );

  // Disable TypeScript/JavaScript validation before mount
  const handleEditorWillMount: BeforeMount = (monaco) => {
    // Disable all TypeScript diagnostics (red squiggles)
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true
    });
  };

  const handleEditorMount: OnMount = (editor, _monaco) => {
    editorRef.current = editor;

    // Track cursor position for StatusBar
    const updateCursorPosition = () => {
      const position = editor.getPosition();
      if (position) {
        setCursorPosition({ line: position.lineNumber, column: position.column });
      }
    };

    // Initial cursor position
    updateCursorPosition();

    // Listen for cursor position changes
    editor.onDidChangeCursorPosition(updateCursorPosition);
  };

  if (!files[activeFile]) {
    return null;
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* File Tab Bar */}
      <div className="flex-none px-2 flex items-center justify-between h-9" style={{ backgroundColor: 'var(--theme-surface-dark)', borderBottom: '1px solid var(--theme-border-light)' }}>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-t" style={{ backgroundColor: 'var(--theme-surface)', borderTop: '1px solid var(--theme-border-light)', borderLeft: '1px solid var(--theme-border-light)', borderRight: '1px solid var(--theme-border-light)' }}>
          <FileCode className="w-3.5 h-3.5" style={{ color: 'var(--theme-accent)' }} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--theme-text-secondary)' }}>{activeFile}</span>
          {!isSaved && (
            <span title="Unsaved changes">
              <Circle className="w-2 h-2" style={{ fill: 'var(--color-warning)', color: 'var(--color-warning)' }} />
            </span>
          )}
          {isModified && isSaved && (
            <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>modified</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showSaveIndicator && (
            <div className="flex items-center gap-1 animate-in fade-in duration-200" style={{ color: 'var(--color-success)' }}>
              <Check className="w-3 h-3" />
              <span className="text-[10px]">Saved</span>
            </div>
          )}
          <span className="text-[10px] font-mono pr-2" style={{ color: 'var(--theme-text-dim)' }}>
            {content.split('\n').length} lines
          </span>
          <button
            onClick={() => setShowSnippetLibrary(true)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Snippet Library"
          >
            <BookOpen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0" onContextMenu={handleContextMenu}>
        <Editor
          height="100%"
          language={language}
          value={content}
          onChange={handleEditorChange}
          beforeMount={handleEditorWillMount}
          onMount={handleEditorMount}
          theme={editorSettings.theme}
          options={{
            fontSize: editorSettings.fontSize,
            fontFamily: '"JetBrains Mono", Menlo, Monaco, Consolas, monospace',
            fontLigatures: true,
            minimap: { enabled: editorSettings.minimap },
            scrollBeyondLastLine: false,
            lineNumbers: editorSettings.lineNumbers,
            renderLineHighlight: 'line',
            tabSize: editorSettings.tabSize,
            wordWrap: editorSettings.wordWrap,
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8
            },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            contextmenu: true,
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 4,
            glyphMargin: false,
            renderWhitespace: 'none',
            cursorBlinking: editorSettings.cursorBlinking,
            cursorStyle: editorSettings.cursorStyle,
            cursorSmoothCaretAnimation: editorSettings.smoothScrolling ? 'on' : 'off',
            smoothScrolling: editorSettings.smoothScrolling,
            bracketPairColorization: { enabled: editorSettings.bracketPairColorization },
            formatOnPaste: editorSettings.formatOnPaste
          }}
          loading={
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--theme-surface)' }}>
              <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid var(--theme-accent-subtle)', borderTopColor: 'var(--theme-accent)' }} />
            </div>
          }
        />
      </div>

      {/* Snippet Library Modal */}
      <SnippetLibraryModal
        isOpen={showSnippetLibrary}
        onClose={() => setShowSnippetLibrary(false)}
        onInsertSnippet={handleInsertSnippet}
      />
    </div>
  );
});
