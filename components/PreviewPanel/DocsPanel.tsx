import React, { useState, useMemo } from 'react';
import { FileText, Plus, ChevronDown, Sparkles, Loader2 } from 'lucide-react';
import { FileSystem } from '../../types';
import { MarkdownPreview } from './MarkdownPreview';
import { getProviderManager } from '../../services/ai';
import { cleanGeneratedCode } from '../../utils/cleanCode';

interface DocsPanelProps {
  files: FileSystem;
  setFiles: (files: FileSystem) => void;
}

export const DocsPanel: React.FC<DocsPanelProps> = ({ files, setFiles }) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSelector, setShowSelector] = useState(false);

  // Find all .md files in the project
  const mdFiles = useMemo(() => {
    return Object.keys(files)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => {
        // README.md always first
        if (a === 'README.md') return -1;
        if (b === 'README.md') return 1;
        return a.localeCompare(b);
      });
  }, [files]);

  // Auto-select README.md or first .md file
  const activeFile = useMemo(() => {
    if (selectedFile && files[selectedFile]) return selectedFile;
    if (files['README.md']) return 'README.md';
    if (mdFiles.length > 0) return mdFiles[0];
    return null;
  }, [selectedFile, files, mdFiles]);

  const hasReadme = 'README.md' in files;

  // Get main app code for context
  const appCode = useMemo(() => {
    return files['src/App.tsx'] || files['App.tsx'] || '';
  }, [files]);

  // Generate README.md using ProviderManager
  const generateReadme = async () => {
    if (!appCode) return;
    setIsGenerating(true);

    try {
      const providerManager = getProviderManager();

      // Get file structure for context
      const fileList = Object.keys(files).join('\n');

      const response = await providerManager.generate({
        prompt: `Analyze the following React application and generate a professional README.md file.

## Project Files:
${fileList}

## Main Component Code:
${appCode}

Generate a comprehensive README.md that includes:
- Project title and description
- Features list
- Installation instructions
- Usage examples
- Technology stack
- Project structure overview

Use proper markdown formatting with headers, code blocks, and lists.`,
        systemInstruction: 'You are a technical documentation expert. Generate clear, professional README documentation for React projects. Output only the markdown content, no explanations.',
        debugCategory: 'other',
      });

      const docs = cleanGeneratedCode(response.text || '');
      setFiles({ ...files, 'README.md': docs });
      setSelectedFile('README.md');
    } catch (e) {
      console.error('README Generation Error', e);
    } finally {
      setIsGenerating(false);
    }
  };

  // Regenerate current markdown file
  const regenerateFile = async () => {
    if (!activeFile || activeFile !== 'README.md') return;
    await generateReadme();
  };

  // No markdown files and no app code
  if (mdFiles.length === 0 && !appCode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4 p-8">
        <div className="p-4 rounded-full bg-slate-500/10 border border-slate-500/20">
          <FileText className="w-10 h-10 text-slate-500" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-medium text-slate-300 mb-2">No Documentation</h3>
          <p className="text-sm text-slate-500 max-w-md">
            Generate an app first to create documentation.
          </p>
        </div>
      </div>
    );
  }

  // No README.md exists - show generate option
  if (!hasReadme && mdFiles.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4 p-8">
        <div className="p-4 rounded-full bg-orange-500/10 border border-orange-500/20">
          <FileText className="w-10 h-10 text-orange-400" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-medium text-slate-300 mb-2">No README.md Found</h3>
          <p className="text-sm text-slate-500 max-w-md mb-4">
            Generate a professional README for your project with AI.
          </p>
        </div>
        <button
          onClick={generateReadme}
          disabled={isGenerating}
          className="px-4 py-2 text-sm text-white bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate README
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#0d1117]">
      {/* File Selector Header */}
      <div className="flex-none flex items-center justify-between px-4 py-2 bg-[#0a0e16] border-b border-white/5">
        <div className="flex items-center gap-2">
          {/* File Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSelector(!showSelector)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm"
            >
              <FileText className="w-4 h-4 text-orange-400" />
              <span className="text-slate-300 font-medium">
                {activeFile || 'Select file'}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showSelector ? 'rotate-180' : ''}`} />
            </button>

            {showSelector && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowSelector(false)}
                />
                <div className="absolute top-full left-0 mt-1 w-64 max-h-60 overflow-y-auto bg-slate-900 border border-white/10 rounded-lg shadow-xl z-20">
                  {mdFiles.map(file => (
                    <button
                      key={file}
                      onClick={() => {
                        setSelectedFile(file);
                        setShowSelector(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        file === activeFile
                          ? 'bg-orange-500/20 text-orange-300'
                          : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <FileText className="w-4 h-4 text-orange-400/60" />
                      {file}
                      {file === 'README.md' && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">
                          Main
                        </span>
                      )}
                    </button>
                  ))}

                  {/* Generate README option if not exists */}
                  {!hasReadme && (
                    <button
                      onClick={() => {
                        setShowSelector(false);
                        generateReadme();
                      }}
                      disabled={isGenerating}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-orange-400 hover:bg-orange-500/10 border-t border-white/5 transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      Generate README.md
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">
            {mdFiles.length} file{mdFiles.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Generate README button (if not exists) */}
        {!hasReadme && (
          <button
            onClick={generateReadme}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Generate README
              </>
            )}
          </button>
        )}
      </div>

      {/* Content */}
      {activeFile && files[activeFile] ? (
        <div className="flex-1 min-h-0">
          <MarkdownPreview
            content={files[activeFile]}
            fileName={activeFile}
            onRegenerate={activeFile === 'README.md' ? regenerateFile : undefined}
            isGenerating={isGenerating}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          <p className="text-sm">Select a markdown file to view</p>
        </div>
      )}
    </div>
  );
};
