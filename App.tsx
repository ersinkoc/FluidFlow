import React, { useState, useMemo } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { diffLines } from 'diff';
import { Check, Split, FileCode, AlertCircle } from 'lucide-react';

export type FileSystem = Record<string, string>;

export interface HistoryEntry {
  id: string;
  timestamp: number;
  label: string;
  files: FileSystem;
}

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
     const changes: string[] = [];
     const allKeys = new Set([...Object.keys(originalFiles), ...Object.keys(newFiles)]);
     
     allKeys.forEach(key => {
        if (originalFiles[key] !== newFiles[key]) {
           changes.push(key);
        }
     });
     return changes;
  }, [originalFiles, newFiles]);

  const [selectedFile, setSelectedFile] = useState<string>(changedFiles[0] || '');

  // Calculate diff for selected file
  const diff = useMemo(() => {
     if (!selectedFile) return [];
     const oldText = originalFiles[selectedFile] || '';
     const newText = newFiles[selectedFile] || '';
     return diffLines(oldText, newText);
  }, [selectedFile, originalFiles, newFiles]);

  return (
     <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-5xl h-[80vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
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

            <div className="flex-1 flex overflow-hidden">
               {/* File List */}
               <div className="w-64 bg-slate-950/50 border-r border-white/5 flex flex-col">
                  <div className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                     Modified Files ({changedFiles.length})
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                     {changedFiles.map(file => (
                        <button
                           key={file}
                           onClick={() => setSelectedFile(file)}
                           className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${selectedFile === file ? 'bg-blue-600/20 text-blue-300 border border-blue-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                        >
                           <FileCode className="w-4 h-4 opacity-70" />
                           <span className="truncate">{file}</span>
                        </button>
                     ))}
                  </div>
               </div>

               {/* Diff View */}
               <div className="flex-1 bg-[#0d1117] overflow-y-auto custom-scrollbar p-4 font-mono text-xs leading-relaxed">
                  {selectedFile ? (
                     <div className="flex flex-col">
                         {diff.map((part, index) => {
                            const color = part.added ? 'text-green-300 bg-green-900/20 border-l-2 border-green-500/50' : 
                                          part.removed ? 'text-red-400 bg-red-900/20 border-l-2 border-red-500/50 line-through opacity-70' : 
                                          'text-slate-400 border-l-2 border-transparent';
                            const prefix = part.added ? '+' : part.removed ? '-' : ' ';
                            
                            return (
                               <div key={index} className={`${color} px-2 whitespace-pre-wrap break-all w-full flex`}>
                                  <span className="select-none opacity-50 w-4 inline-block text-center mr-2">{prefix}</span>
                                  <span>{part.value}</span>
                               </div>
                            );
                         })}
                     </div>
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

  const [files, setFiles] = useState<FileSystem>(defaultFiles);
  const [activeFile, setActiveFile] = useState<string>('src/App.tsx');
  
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // History Management
  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      id: 'init',
      timestamp: Date.now(),
      label: 'Initial Project',
      files: defaultFiles
    }
  ]);

  // Diff Review State
  const [pendingReview, setPendingReview] = useState<{
     label: string;
     newFiles: FileSystem;
  } | null>(null);

  const addToHistory = (label: string, newFiles: FileSystem) => {
    setHistory(prev => [
      {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        label,
        files: { ...newFiles } // Deep copy
      },
      ...prev
    ]);
  };

  const restoreHistory = (entry: HistoryEntry) => {
    // Instead of immediate confirm, open Diff Modal
    reviewChange(`Revert to "${entry.label}"`, entry.files);
  };

  const reviewChange = (label: string, newFiles: FileSystem) => {
     setPendingReview({ label, newFiles });
  };

  const confirmChange = () => {
     if (pendingReview) {
        setFiles(pendingReview.newFiles);
        // Add to history only if it's NOT a revert action (reverts create a new history point usually, or we just jump back)
        // If it is a revert, we might want to log "Reverted to X".
        // The label passed into reviewChange usually describes the action.
        addToHistory(pendingReview.label, pendingReview.newFiles);
        
        // If the active file was deleted in the new state, reset it
        if (!pendingReview.newFiles[activeFile]) {
             const firstSrc = Object.keys(pendingReview.newFiles).find(f => f.startsWith('src/'));
             setActiveFile(firstSrc || 'package.json');
        }

        setPendingReview(null);
     }
  };

  const resetApp = () => {
    setFiles(defaultFiles);
    setActiveFile('src/App.tsx');
    setSuggestions(null);
    setIsGenerating(false);
    setHistory([{
      id: 'init',
      timestamp: Date.now(),
      label: 'Initial Project',
      files: defaultFiles
    }]);
    setResetKey(prev => prev + 1);
  };

  return (
    <div className="flex h-screen w-full bg-[#020617] text-white overflow-hidden relative selection:bg-blue-500/30 selection:text-blue-50">
       {/* Background Ambient Effects */}
       <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
       <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
       <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-purple-600/5 rounded-full blur-[100px] pointer-events-none" />

       <main className="flex flex-col md:flex-row w-full h-full p-4 gap-4 z-10">
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
            history={history}
            addToHistory={addToHistory}
            restoreHistory={restoreHistory}
            reviewChange={reviewChange}
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
    </div>
  );
}