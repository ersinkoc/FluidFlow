import React, { useState, useMemo } from 'react';
import { X, Upload, FileCode, AlertTriangle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { FileSystem } from '@/types';
import { generateCodeMap, generateContextForPrompt } from '../utils/codemap';

interface SyncPayload {
  displayMessage: string;  // Short summary for chat UI
  llmMessage: string;      // Full content for LLM
  fileCount: number;
  tokenEstimate: number;
  batchIndex: number;
  totalBatches: number;
}

interface CodebaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
  onSync: (payload: SyncPayload) => Promise<void>;
}

// Estimate tokens (roughly 4 chars = 1 token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Format file size
function formatSize(chars: number): string {
  if (chars < 1000) return `${chars} chars`;
  if (chars < 1000000) return `${(chars / 1000).toFixed(1)}K chars`;
  return `${(chars / 1000000).toFixed(2)}M chars`;
}

// Max tokens per batch (leave room for response)
const MAX_TOKENS_PER_BATCH = 80000; // ~320K chars, safe for most models

export const CodebaseSyncModal: React.FC<CodebaseSyncModalProps> = ({
  isOpen,
  onClose,
  files,
  onSync
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', 'src/components']));
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set(Object.keys(files)));

  // Calculate file stats
  const fileStats = useMemo(() => {
    const stats = Object.entries(files).map(([path, content]) => ({
      path,
      chars: content.length,
      tokens: estimateTokens(content),
      lines: content.split('\n').length
    }));

    const totalChars = stats.reduce((sum, f) => sum + f.chars, 0);
    const totalTokens = stats.reduce((sum, f) => sum + f.tokens, 0);

    return { files: stats, totalChars, totalTokens };
  }, [files]);

  // Calculate selected stats
  const selectedStats = useMemo(() => {
    const selected = fileStats.files.filter(f => selectedFiles.has(f.path));
    return {
      count: selected.length,
      chars: selected.reduce((sum, f) => sum + f.chars, 0),
      tokens: selected.reduce((sum, f) => sum + f.tokens, 0)
    };
  }, [fileStats, selectedFiles]);

  // Calculate batches needed
  const batches = useMemo(() => {
    const selected = fileStats.files
      .filter(f => selectedFiles.has(f.path))
      .sort((a, b) => a.path.localeCompare(b.path));

    const result: typeof selected[] = [];
    let currentBatch: typeof selected = [];
    let currentTokens = 0;

    for (const file of selected) {
      if (currentTokens + file.tokens > MAX_TOKENS_PER_BATCH && currentBatch.length > 0) {
        result.push(currentBatch);
        currentBatch = [];
        currentTokens = 0;
      }
      currentBatch.push(file);
      currentTokens += file.tokens;
    }

    if (currentBatch.length > 0) {
      result.push(currentBatch);
    }

    return result;
  }, [fileStats, selectedFiles]);

  // Build folder structure
  const folderStructure = useMemo(() => {
    const structure: Record<string, string[]> = { '': [] };

    fileStats.files.forEach(f => {
      const parts = f.path.split('/');
      if (parts.length === 1) {
        structure[''].push(f.path);
      } else {
        const folder = parts.slice(0, -1).join('/');
        if (!structure[folder]) structure[folder] = [];
        structure[folder].push(f.path);

        // Create parent folders
        let _parent = '';
        for (let i = 0; i < parts.length - 1; i++) {
          const current = parts.slice(0, i + 1).join('/');
          if (!structure[current]) structure[current] = [];
          _parent = current;
        }
      }
    });

    return structure;
  }, [fileStats]);

  // Toggle folder
  const toggleFolder = (folder: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  // Toggle file selection
  const toggleFile = (path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Toggle all files in folder
  const toggleFolder_selection = (folder: string, select: boolean) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      fileStats.files.forEach(f => {
        if (f.path.startsWith(folder + '/') || (folder === '' && !f.path.includes('/'))) {
          if (select) next.add(f.path);
          else next.delete(f.path);
        }
      });
      return next;
    });
  };

  // Handle sync
  const handleSync = async () => {
    setIsSyncing(true);
    setCurrentBatch(0);

    // Generate codemap for project structure understanding
    const codemapContext = generateContextForPrompt(files);
    const codemap = generateCodeMap(files);
    const codemapJson = JSON.stringify({
      files: codemap.files.map(f => ({
        path: f.path,
        type: f.type,
        exports: f.exports,
        components: f.components.map(c => c.name),
        functions: f.functions
      })),
      componentTree: codemap.componentTree
    }, null, 2);

    try {
      for (let i = 0; i < batches.length; i++) {
        setCurrentBatch(i + 1);
        const batch = batches[i];
        const batchTokens = batch.reduce((s, f) => s + f.tokens, 0);

        // Build FULL content for LLM (with file contents)
        const filesContent = batch
          .map(f => `### ${f.path}\n\`\`\`${f.path.split('.').pop()}\n${files[f.path]}\n\`\`\``)
          .join('\n\n');

        const batchInfo = batches.length > 1 ? ` (Batch ${i + 1}/${batches.length})` : '';

        // SHORT display message for chat UI (no file contents)
        const displayMessage = `🔄 **Codebase Sync${batchInfo}**\n\n` +
          `Synced ${batch.length} files (~${batchTokens.toLocaleString()} tokens):\n` +
          batch.map(f => `- \`${f.path}\` (${f.lines} lines)`).join('\n');

        // Include codemap only in the first batch
        const codemapSection = i === 0 ? `
## Project Structure Analysis (CodeMap)

${codemapContext}

### CodeMap JSON
\`\`\`json
${codemapJson}
\`\`\`

` : '';

        // FULL message for LLM (with file contents)
        const llmMessage = `🔄 **CODEBASE SYNC${batchInfo}**

This message contains the current project files. Use these as the reference for all future requests.
${batches.length > 1 ? `\n⚠️ This is batch ${i + 1}/${batches.length}.` : ''}
${codemapSection}
## Current Project Files (${batch.length} files, ~${batchTokens.toLocaleString()} tokens)

${filesContent}

---
${batches.length === 1 || i === batches.length - 1
  ? '✅ **Sync complete.** The files above represent the current state of the project.'
  : `⏳ **Batch ${i + 1}/${batches.length} sent.** More files coming...`}`;

        await onSync({
          displayMessage,
          llmMessage,
          fileCount: batch.length,
          tokenEstimate: batchTokens,
          batchIndex: i,
          totalBatches: batches.length
        });

        // Small delay between batches
        if (i < batches.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      onClose();
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
      setCurrentBatch(0);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Upload className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Sync Codebase to AI</h2>
              <p className="text-sm text-white/60">Send current files to AI context</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-white/40" />
            <span className="text-white/60">Selected:</span>
            <span className="text-white font-medium">{selectedStats.count} files</span>
          </div>
          <div className="text-white/40">•</div>
          <div className="text-white/60">
            ~<span className="text-white font-medium">{selectedStats.tokens.toLocaleString()}</span> tokens
          </div>
          <div className="text-white/40">•</div>
          <div className="text-white/60">
            <span className="text-white font-medium">{formatSize(selectedStats.chars)}</span>
          </div>
          {batches.length > 1 && (
            <>
              <div className="text-white/40">•</div>
              <div className="flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{batches.length} batches needed</span>
              </div>
            </>
          )}
        </div>

        {/* File List */}
        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-1">
            {/* Root files */}
            {folderStructure['']?.map(path => {
              const file = fileStats.files.find(f => f.path === path)!;
              return (
                <label
                  key={path}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(path)}
                    onChange={() => toggleFile(path)}
                    className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
                  />
                  <FileCode className="w-4 h-4 text-white/40" />
                  <span className="flex-1 text-sm text-white/80 truncate">{path}</span>
                  <span className="text-xs text-white/40">{file.lines} lines</span>
                </label>
              );
            })}

            {/* Folders */}
            {Object.keys(folderStructure)
              .filter(f => f !== '' && !f.includes('/'))
              .sort()
              .map(folder => (
                <FolderItem
                  key={folder}
                  folder={folder}
                  folderStructure={folderStructure}
                  fileStats={fileStats}
                  selectedFiles={selectedFiles}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                  toggleFile={toggleFile}
                  toggleFolderSelection={toggleFolder_selection}
                  depth={0}
                />
              ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedFiles(new Set(Object.keys(files)))}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Select All
            </button>
            <span className="text-white/20">•</span>
            <button
              onClick={() => setSelectedFiles(new Set())}
              className="text-sm text-white/60 hover:text-white/80"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSync}
              disabled={isSyncing || selectedStats.count === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 disabled:text-white/40 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Syncing {currentBatch}/{batches.length}...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Sync {batches.length > 1 ? `(${batches.length} batches)` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Recursive folder component
interface FolderItemProps {
  folder: string;
  folderStructure: Record<string, string[]>;
  fileStats: { files: { path: string; chars: number; tokens: number; lines: number }[] };
  selectedFiles: Set<string>;
  expandedFolders: Set<string>;
  toggleFolder: (folder: string) => void;
  toggleFile: (path: string) => void;
  toggleFolderSelection: (folder: string, select: boolean) => void;
  depth: number;
}

const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  folderStructure,
  fileStats,
  selectedFiles,
  expandedFolders,
  toggleFolder,
  toggleFile,
  toggleFolderSelection,
  depth
}) => {
  const isExpanded = expandedFolders.has(folder);
  const folderName = folder.split('/').pop() || folder;

  // Get files in this folder
  const filesInFolder = folderStructure[folder] || [];

  // Get subfolders
  const subfolders = Object.keys(folderStructure)
    .filter(f => {
      const parent = f.split('/').slice(0, -1).join('/');
      return parent === folder;
    })
    .sort();

  // Count selected files in folder (recursive)
  const allFilesInFolder = fileStats.files.filter(f => f.path.startsWith(folder + '/'));
  const selectedCount = allFilesInFolder.filter(f => selectedFiles.has(f.path)).length;
  const isPartial = selectedCount > 0 && selectedCount < allFilesInFolder.length;
  const isAllSelected = selectedCount === allFilesInFolder.length && allFilesInFolder.length > 0;

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-white/5">
        <button onClick={() => toggleFolder(folder)} className="p-0.5">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronRight className="w-4 h-4 text-white/40" />
          )}
        </button>
        <input
          type="checkbox"
          checked={isAllSelected}
          ref={el => {
            if (el) el.indeterminate = isPartial;
          }}
          onChange={() => toggleFolderSelection(folder, !isAllSelected)}
          className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
        />
        <span className="text-sm text-amber-400/80 font-medium">{folderName}/</span>
        <span className="text-xs text-white/40 ml-auto">{allFilesInFolder.length} files</span>
      </div>

      {isExpanded && (
        <div className="ml-4">
          {/* Files in folder */}
          {filesInFolder.map(path => {
            const file = fileStats.files.find(f => f.path === path)!;
            return (
              <label
                key={path}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer ml-4"
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(path)}
                  onChange={() => toggleFile(path)}
                  className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
                />
                <FileCode className="w-4 h-4 text-white/40" />
                <span className="flex-1 text-sm text-white/80 truncate">{path.split('/').pop()}</span>
                <span className="text-xs text-white/40">{file.lines} lines</span>
              </label>
            );
          })}

          {/* Subfolders */}
          {subfolders.map(subfolder => (
            <FolderItem
              key={subfolder}
              folder={subfolder}
              folderStructure={folderStructure}
              fileStats={fileStats}
              selectedFiles={selectedFiles}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              toggleFile={toggleFile}
              toggleFolderSelection={toggleFolderSelection}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CodebaseSyncModal;
