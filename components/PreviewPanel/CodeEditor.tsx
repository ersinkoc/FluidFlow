import React, { useCallback, useState, useEffect, useRef } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { FileCode, Check, Circle, BookOpen } from 'lucide-react';
import { FileSystem } from '../../types';
import { useEditorSettings } from '../../hooks/useEditorSettings';
import { useCodeContextMenu } from '../ContextMenu';
import { SnippetLibraryModal } from '../SnippetLibraryModal';

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

export const CodeEditor: React.FC<CodeEditorProps> = ({ files, setFiles, activeFile, originalFiles }) => {
  const content = files[activeFile] || '';
  const language = getLanguage(activeFile);
  const [isSaved, setIsSaved] = useState(true);
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { settings: editorSettings } = useEditorSettings();

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
    };
  }, []);

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

  // Handle Ctrl+S save
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Add Ctrl+S save action
    editor.addAction({
      id: 'save-file',
      label: 'Save File',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        setIsSaved(true);
        setShowSaveIndicator(true);
        setTimeout(() => setShowSaveIndicator(false), 1500);
      }
    });
  };

  if (!files[activeFile]) {
    return null;
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* File Tab Bar */}
      <div className="flex-none bg-[#0a0e16] border-b border-white/5 px-2 flex items-center justify-between h-9">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0d1117] rounded-t border-t border-l border-r border-white/10">
          <FileCode className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-medium text-slate-300">{activeFile}</span>
          {!isSaved && (
            <span title="Unsaved changes">
              <Circle className="w-2 h-2 fill-orange-400 text-orange-400" />
            </span>
          )}
          {isModified && isSaved && (
            <span className="text-[9px] px-1 py-0.5 bg-amber-500/20 text-amber-400 rounded">modified</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showSaveIndicator && (
            <div className="flex items-center gap-1 text-emerald-400 animate-in fade-in duration-200">
              <Check className="w-3 h-3" />
              <span className="text-[10px]">Saved</span>
            </div>
          )}
          <span className="text-[10px] text-slate-600 font-mono pr-2">
            {content.split('\n').length} lines
          </span>
          <button
            onClick={() => setShowSnippetLibrary(true)}
            className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 hover:text-blue-400 transition-colors"
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
            fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
            <div className="w-full h-full flex items-center justify-center bg-[#0d1117]">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
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
};
