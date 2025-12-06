import React, { useState, useMemo, useCallback } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { CommandPalette } from './components/CommandPalette';
import { SnippetsPanel } from './components/SnippetsPanel';
import { TailwindPalette } from './components/TailwindPalette';
import { ComponentTree } from './components/ComponentTree';
import { DeployModal } from './components/DeployModal';
import { ShareModal, loadProjectFromUrl } from './components/ShareModal';
import { useKeyboardShortcuts, KeyboardShortcut } from './hooks/useKeyboardShortcuts';
import { useVersionHistory } from './hooks/useVersionHistory';
import { diffLines } from 'diff';
import { Check, Split, FileCode, AlertCircle } from 'lucide-react';
import { FileSystem, TabType } from './types';

// Re-export types for backwards compatibility
export type { FileSystem } from './types';

interface DiffModalProps {
  originalFiles: FileSystem;
  newFiles: FileSystem;
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DiffModal: React.FC<DiffModalProps> = ({ originalFiles, newFiles, label, onConfirm, onCancel }) => {
  // Determine modified files
  const changedFiles = useMemo(() => {
     const changes: { file: string; added: number; removed: number }[] = [];
     const allKeys = new Set([...Object.keys(originalFiles), ...Object.keys(newFiles)]);

     allKeys.forEach(key => {
        if (originalFiles[key] !== newFiles[key]) {
           const oldLines = (originalFiles[key] || '').split('\n').length;
           const newLines = (newFiles[key] || '').split('\n').length;
           const isNew = !originalFiles[key];
           const isDeleted = !newFiles[key];
           changes.push({
              file: key,
              added: isNew ? newLines : Math.max(0, newLines - oldLines),
              removed: isDeleted ? oldLines : Math.max(0, oldLines - newLines)
           });
        }
     });
     return changes;
  }, [originalFiles, newFiles]);

  const [selectedFile, setSelectedFile] = useState<string>(changedFiles[0]?.file || '');

  // Calculate diff with line numbers
  const diffWithLineNumbers = useMemo(() => {
     if (!selectedFile) return [];
     const oldText = originalFiles[selectedFile] || '';
     const newText = newFiles[selectedFile] || '';
     const changes = diffLines(oldText, newText);

     const result: { type: 'added' | 'removed' | 'unchanged'; oldLine: number | null; newLine: number | null; content: string }[] = [];
     let oldLineNum = 1;
     let newLineNum = 1;

     changes.forEach(change => {
        const lines = change.value.split('\n');
        // Remove last empty line from split if the value ends with newline
        if (lines[lines.length - 1] === '') lines.pop();

        lines.forEach(line => {
           if (change.added) {
              result.push({ type: 'added', oldLine: null, newLine: newLineNum++, content: line });
           } else if (change.removed) {
              result.push({ type: 'removed', oldLine: oldLineNum++, newLine: null, content: line });
           } else {
              result.push({ type: 'unchanged', oldLine: oldLineNum++, newLine: newLineNum++, content: line });
           }
        });
     });

     return result;
  }, [selectedFile, originalFiles, newFiles]);

  // Stats for selected file
  const stats = useMemo(() => {
     const added = diffWithLineNumbers.filter(l => l.type === 'added').length;
     const removed = diffWithLineNumbers.filter(l => l.type === 'removed').length;
     return { added, removed };
  }, [diffWithLineNumbers]);

  return (
     <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-6xl h-[85vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-950">
               <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                     <Split className="w-5 h-5 text-blue-400" />
                     Review Changes
                  </h2>
                  <p className="text-sm text-slate-400">Action: <span className="text-blue-300">{label}</span></p>
               </div>
               <div className="flex items-center gap-3">
                  <button onClick={onCancel} className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium">
                     Cancel
                  </button>
                  <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 transition-all text-sm font-medium flex items-center gap-2">
                     <Check className="w-4 h-4" />
                     Confirm Changes
                  </button>
               </div>
            </div>

            <div className="flex-1 flex overflow-hidden min-h-0">
               {/* File List */}
               <div className="w-72 bg-slate-950/50 border-r border-white/5 flex flex-col">
                  <div className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-white/5">
                     Modified Files ({changedFiles.length})
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                     {changedFiles.map(({ file, added, removed }) => (
                        <button
                           key={file}
                           onClick={() => setSelectedFile(file)}
                           className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${selectedFile === file ? 'bg-blue-600/20 text-blue-300 border border-blue-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                        >
                           <FileCode className="w-4 h-4 opacity-70 flex-shrink-0" />
                           <span className="truncate flex-1">{file}</span>
                           <div className="flex items-center gap-1.5 text-[10px] font-mono flex-shrink-0">
                              {added > 0 && <span className="text-green-400">+{added}</span>}
                              {removed > 0 && <span className="text-red-400">-{removed}</span>}
                           </div>
                        </button>
                     ))}
                  </div>
               </div>

               {/* Diff View */}
               <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117]">
                  {selectedFile ? (
                     <>
                        {/* File Header */}
                        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-white/5">
                           <span className="text-xs font-mono text-slate-400">{selectedFile}</span>
                           <div className="flex items-center gap-3 text-xs font-mono">
                              <span className="text-green-400">+{stats.added} additions</span>
                              <span className="text-red-400">-{stats.removed} deletions</span>
                           </div>
                        </div>

                        {/* Diff Content */}
                        <div className="flex-1 overflow-auto custom-scrollbar">
                           <table className="w-full border-collapse font-mono text-xs">
                              <tbody>
                                 {diffWithLineNumbers.map((line, index) => (
                                    <tr
                                       key={index}
                                       className={`
                                          ${line.type === 'added' ? 'bg-green-500/10' : ''}
                                          ${line.type === 'removed' ? 'bg-red-500/10' : ''}
                                          hover:bg-white/[0.02]
                                       `}
                                    >
                                       {/* Old Line Number */}
                                       <td className="w-12 px-2 py-0.5 text-right select-none border-r border-white/5 text-slate-600 bg-slate-950/30">
                                          {line.oldLine ?? ''}
                                       </td>
                                       {/* New Line Number */}
                                       <td className="w-12 px-2 py-0.5 text-right select-none border-r border-white/5 text-slate-600 bg-slate-950/30">
                                          {line.newLine ?? ''}
                                       </td>
                                       {/* Change Indicator */}
                                       <td className={`w-6 px-1 py-0.5 text-center select-none font-bold
                                          ${line.type === 'added' ? 'text-green-400 bg-green-500/20' : ''}
                                          ${line.type === 'removed' ? 'text-red-400 bg-red-500/20' : ''}
                                          ${line.type === 'unchanged' ? 'text-slate-600' : ''}
                                       `}>
                                          {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ''}
                                       </td>
                                       {/* Code Content */}
                                       <td className={`px-3 py-0.5 whitespace-pre
                                          ${line.type === 'added' ? 'text-green-300' : ''}
                                          ${line.type === 'removed' ? 'text-red-300 line-through opacity-70' : ''}
                                          ${line.type === 'unchanged' ? 'text-slate-400' : ''}
                                       `}>
                                          {line.content || ' '}
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     </>
                  ) : (
                     <div className="h-full flex flex-col items-center justify-center text-slate-500">
                        <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                        <p>No changes detected or file selected</p>
                     </div>
                  )}
               </div>
            </div>
        </div>
     </div>
  );
};

export default function App() {
  const defaultFiles = {
    'package.json': JSON.stringify({
      name: "fluid-flow-project",
      version: "1.0.0",
      dependencies: {
        "react": "^18.2.0",
        "react-dom": "^18.2.0",
        "lucide-react": "^0.263.1",
        "tailwindcss": "^3.3.0"
      }
    }, null, 2)
  };

  const { files, setFiles, undo, redo, canUndo, canRedo, reset: resetFiles } = useVersionHistory(defaultFiles);
  const [activeFile, setActiveFile] = useState<string>('src/App.tsx');

  // Load project from URL if present
  React.useEffect(() => {
    const urlProject = loadProjectFromUrl();
    if (urlProject && Object.keys(urlProject).length > 0) {
      setFiles(urlProject);
      // Select first src file
      const firstSrc = Object.keys(urlProject).find(f => f.startsWith('src/'));
      if (firstSrc) setActiveFile(firstSrc);
    }
  }, []);

  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [activeTab, setActiveTab] = useState<TabType>('preview');

  // Command Palette State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSnippetsPanelOpen, setIsSnippetsPanelOpen] = useState(false);
  const [isTailwindPaletteOpen, setIsTailwindPaletteOpen] = useState(false);
  const [isComponentTreeOpen, setIsComponentTreeOpen] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Diff Review State
  const [pendingReview, setPendingReview] = useState<{
     label: string;
     newFiles: FileSystem;
  } | null>(null);

  const reviewChange = (label: string, newFiles: FileSystem) => {
     setPendingReview({ label, newFiles });
  };

  const confirmChange = () => {
     if (pendingReview) {
        setFiles(pendingReview.newFiles);

        // If the active file was deleted in the new state, reset it
        if (!pendingReview.newFiles[activeFile]) {
             const firstSrc = Object.keys(pendingReview.newFiles).find(f => f.startsWith('src/'));
             setActiveFile(firstSrc || 'package.json');
        }

        setPendingReview(null);
     }
  };

  const resetApp = () => {
    resetFiles(defaultFiles);
    setActiveFile('src/App.tsx');
    setSuggestions(null);
    setIsGenerating(false);
    setResetKey(prev => prev + 1);
  };

  // Command Palette actions
  const handleCommandAction = useCallback((action: string) => {
    switch (action) {
      case 'toggle-preview':
        setActiveTab((prev: TabType) => prev === 'preview' ? 'code' : 'preview');
        break;
      case 'reset':
        resetApp();
        break;
      case 'snippets':
        setIsSnippetsPanelOpen(true);
        break;
      case 'tailwind':
        setIsTailwindPaletteOpen(true);
        break;
      case 'component-tree':
        setIsComponentTreeOpen(true);
        break;
      case 'deploy':
        setIsDeployModalOpen(true);
        break;
      case 'share':
        setIsShareModalOpen(true);
        break;
      case 'undo':
        if (canUndo) undo();
        break;
      case 'redo':
        if (canRedo) redo();
        break;
      // Other actions handled by child components
    }
  }, [canUndo, canRedo, undo, redo]);

  // Keyboard shortcuts
  const shortcuts: KeyboardShortcut[] = useMemo(() => [
    {
      key: 'p',
      ctrl: true,
      action: () => setIsCommandPaletteOpen(true),
      description: 'Open Command Palette'
    },
    {
      key: 'k',
      ctrl: true,
      action: () => setIsCommandPaletteOpen(true),
      description: 'Open Command Palette'
    },
    {
      key: 'Escape',
      action: () => {
        if (isCommandPaletteOpen) setIsCommandPaletteOpen(false);
        else if (pendingReview) setPendingReview(null);
      },
      description: 'Close modal'
    },
    {
      key: '1',
      ctrl: true,
      action: () => setActiveTab('preview'),
      description: 'Switch to Preview'
    },
    {
      key: '2',
      ctrl: true,
      action: () => setActiveTab('code'),
      description: 'Switch to Code'
    },
    {
      key: 'j',
      ctrl: true,
      action: () => setIsSnippetsPanelOpen(true),
      description: 'Open Snippets'
    },
    {
      key: 't',
      ctrl: true,
      action: () => setIsTailwindPaletteOpen(true),
      description: 'Open Tailwind Palette'
    },
    {
      key: 't',
      ctrl: true,
      shift: true,
      action: () => setIsComponentTreeOpen(true),
      description: 'Open Component Tree'
    },
    {
      key: 'z',
      ctrl: true,
      action: () => { if (canUndo) undo(); },
      description: 'Undo'
    },
    {
      key: 'y',
      ctrl: true,
      action: () => { if (canRedo) redo(); },
      description: 'Redo'
    },
    {
      key: 'z',
      ctrl: true,
      shift: true,
      action: () => { if (canRedo) redo(); },
      description: 'Redo'
    },
  ], [isCommandPaletteOpen, pendingReview, canUndo, canRedo, undo, redo]);

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="flex flex-col min-h-screen h-screen max-h-screen w-full bg-[#020617] text-white overflow-hidden relative selection:bg-blue-500/30 selection:text-blue-50">
       {/* Background Ambient Effects */}
       <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
       <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
       <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-purple-600/5 rounded-full blur-[100px] pointer-events-none" />

       <main className="flex flex-col md:flex-row flex-1 min-h-0 w-full p-4 gap-4 z-10 overflow-hidden">
          <ControlPanel
            key={resetKey}
            resetApp={resetApp}
            files={files}
            setFiles={setFiles}
            activeFile={activeFile}
            setActiveFile={setActiveFile}
            setSuggestions={setSuggestions}
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            reviewChange={reviewChange}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
          <PreviewPanel
            files={files}
            setFiles={setFiles}
            activeFile={activeFile}
            setActiveFile={setActiveFile}
            suggestions={suggestions}
            setSuggestions={setSuggestions}
            isGenerating={isGenerating}
            reviewChange={reviewChange}
            selectedModel={selectedModel}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
       </main>

       {/* Diff Modal */}
       {pendingReview && (
          <DiffModal
             originalFiles={files}
             newFiles={pendingReview.newFiles}
             label={pendingReview.label}
             onConfirm={confirmChange}
             onCancel={() => setPendingReview(null)}
          />
       )}

       {/* Command Palette */}
       <CommandPalette
         isOpen={isCommandPaletteOpen}
         onClose={() => setIsCommandPaletteOpen(false)}
         files={files}
         activeFile={activeFile}
         onFileSelect={(file: string) => {
           setActiveFile(file);
           setActiveTab('code');
         }}
         onAction={handleCommandAction}
       />

       {/* Snippets Panel */}
       <SnippetsPanel
         isOpen={isSnippetsPanelOpen}
         onClose={() => setIsSnippetsPanelOpen(false)}
         onInsert={(code: string) => {
           // Insert code at the end of the active file
           if (activeFile && files[activeFile]) {
             const newContent = files[activeFile] + '\n\n' + code;
             setFiles({ ...files, [activeFile]: newContent });
             setActiveTab('code');
           }
         }}
       />

       {/* Tailwind Palette */}
       <TailwindPalette
         isOpen={isTailwindPaletteOpen}
         onClose={() => setIsTailwindPaletteOpen(false)}
         onInsert={(className: string) => {
           navigator.clipboard.writeText(className);
         }}
       />

       {/* Component Tree */}
       <ComponentTree
         isOpen={isComponentTreeOpen}
         onClose={() => setIsComponentTreeOpen(false)}
         files={files}
         onFileSelect={(file: string) => {
           setActiveFile(file);
           setActiveTab('code');
         }}
       />

       {/* Deploy Modal */}
       <DeployModal
         isOpen={isDeployModalOpen}
         onClose={() => setIsDeployModalOpen(false)}
         files={files}
       />

       {/* Share Modal */}
       <ShareModal
         isOpen={isShareModalOpen}
         onClose={() => setIsShareModalOpen(false)}
         files={files}
       />
    </div>
  );
}