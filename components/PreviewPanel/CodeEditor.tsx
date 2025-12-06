import React, { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { FileCode } from 'lucide-react';
import { FileSystem } from '../../types';

interface CodeEditorProps {
  files: FileSystem;
  setFiles: (files: FileSystem) => void;
  activeFile: string;
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

export const CodeEditor: React.FC<CodeEditorProps> = ({ files, setFiles, activeFile }) => {
  const content = files[activeFile] || '';
  const language = getLanguage(activeFile);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        setFiles({ ...files, [activeFile]: value });
      }
    },
    [files, activeFile, setFiles]
  );

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
        </div>
        <span className="text-[10px] text-slate-600 font-mono pr-2">
          {content.split('\n').length} lines
        </span>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={language}
          value={content}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            fontSize: 12,
            fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            tabSize: 2,
            wordWrap: 'off',
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
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true
          }}
          loading={
            <div className="w-full h-full flex items-center justify-center bg-[#0d1117]">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          }
        />
      </div>
    </div>
  );
};
