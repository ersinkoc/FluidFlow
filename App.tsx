import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { safeJsonParse } from './utils/safeJson';
import { ControlPanel, ControlPanelRef } from './components/ControlPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { CommandPalette } from './components/CommandPalette';
import { SnippetsPanel } from './components/SnippetsPanel';
import { TailwindPalette } from './components/TailwindPalette';
import { ComponentTree } from './components/ComponentTree';
import { DeployModal } from './components/DeployModal';
import { ShareModal, loadProjectFromUrl } from './components/ShareModal';
import { AISettingsModal } from './components/AISettingsModal';
import { MegaSettingsModal } from './components/MegaSettingsModal';
import { HistoryPanel } from './components/HistoryPanel';
import { ProjectManager } from './components/ProjectManager';
import { SyncConfirmationDialog } from './components/SyncConfirmationDialog';
import { CreditsModal } from './components/CreditsModal';
import { CodeMapModal } from './components/ControlPanel/CodeMapModal';
// Keyboard shortcuts disabled due to browser conflicts
// import { useKeyboardShortcuts, KeyboardShortcut } from './hooks/useKeyboardShortcuts';
import { useVersionHistory } from './hooks/useVersionHistory';
import { useProject } from './hooks/useProject';
import { diffLines } from 'diff';
import { Check, Split, FileCode, AlertCircle, Undo2, Redo2, History, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { FileSystem, TabType } from './types';
import { InspectedElement, EditScope } from './components/PreviewPanel/ComponentInspector';
import { gitApi, projectApi } from './services/projectApi';
import { getContextManager } from './services/conversationContext';

// Re-export types for backwards compatibility
export type { FileSystem } from './types';

// ============ IndexedDB WIP Storage ============
// Work In Progress is saved locally to survive page refreshes
// Files only sync to backend on COMMIT (git-centric approach)

const WIP_DB_NAME = 'fluidflow-wip';
const WIP_DB_VERSION = 1;

interface WIPData {
  id: string;
  files: FileSystem;
  activeFile: string;
  activeTab: string;
  savedAt: number;
}

function openWIPDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WIP_DB_NAME, WIP_DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('wip')) {
        db.createObjectStore('wip', { keyPath: 'id' });
      }
    };
  });
}

async function getWIP(projectId: string): Promise<WIPData | null> {
  try {
    const db = await openWIPDatabase();
    const tx = db.transaction('wip', 'readonly');
    const store = tx.objectStore('wip');

    return new Promise((resolve, reject) => {
      const request = store.get(projectId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch {
    return null;
  }
}

async function clearWIP(projectId: string): Promise<void> {
  try {
    const db = await openWIPDatabase();
    const tx = db.transaction('wip', 'readwrite');
    const store = tx.objectStore('wip');
    await store.delete(projectId);
  } catch (err) {
    console.warn('[WIP] Failed to clear:', err);
  }
}

// ============ End IndexedDB WIP Storage ============

// Files/folders to ignore in virtual file system display
const IGNORED_PATTERNS = ['.git', '.git/', 'node_modules', 'node_modules/'];
const isIgnoredPath = (filePath: string): boolean => {
  return IGNORED_PATTERNS.some(pattern =>
    filePath === pattern ||
    filePath.startsWith(pattern) ||
    filePath.startsWith('.git/') ||
    filePath.includes('/.git/') ||
    filePath.includes('/node_modules/')
  );
};

interface DiffModalProps {
  originalFiles: FileSystem;
  newFiles: FileSystem;
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DiffModal: React.FC<DiffModalProps> = ({ originalFiles, newFiles, label, onConfirm, onCancel }) => {
  // Determine modified files (excluding .git and node_modules)
  const changedFiles = useMemo(() => {
     const changes: { file: string; added: number; removed: number }[] = [];
     const allKeys = new Set([...Object.keys(originalFiles), ...Object.keys(newFiles)]);

     allKeys.forEach(key => {
        // Skip ignored paths like .git, node_modules
        if (isIgnoredPath(key)) return;

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
                     {changedFiles.map(({ file, added: _added, removed }) => (
                        <button
                           key={file}
                           onClick={() => setSelectedFile(file)}
                           className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${selectedFile === file ? 'bg-blue-600/20 text-blue-300 border border-blue-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                        >
                           <FileCode className="w-4 h-4 opacity-70 flex-shrink-0" />
                           <span className="truncate flex-1">{file}</span>
                           <div className="flex items-center gap-1.5 text-[10px] font-mono flex-shrink-0">
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
                                          ${line.type === 'removed' ? 'bg-red-500/10' : ''}
                                          ${line.type === 'added' ? 'bg-green-500/10' : ''}
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
                                          ${line.type === 'removed' ? 'text-red-400 bg-red-500/20' : ''}
                                          ${line.type === 'added' ? 'text-green-400 bg-green-500/20' : ''}
                                          ${line.type === 'unchanged' ? 'text-slate-600' : ''}
                                       `}>
                                          {line.type === 'removed' ? '-' : ''}
                                          {line.type === 'added' ? '+' : ''}
                                       </td>
                                       {/* Code Content */}
                                       <td className={`px-3 py-0.5 whitespace-pre
                                          ${line.type === 'removed' ? 'text-red-300 opacity-70' : ''}
                                          ${line.type === 'added' ? 'text-green-300' : ''}
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
  const defaultFiles: FileSystem = {
    'package.json': JSON.stringify({
      name: "fluidflow-app",
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview"
      },
      dependencies: {
        "react": "^18.3.0",
        "react-dom": "^18.3.0",
        "lucide-react": "^0.400.0"
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.3.0",
        "vite": "^5.4.0",
        "typescript": "^5.5.0",
        "@types/react": "^18.3.0",
        "@types/react-dom": "^18.3.0",
        "@types/node": "^20.0.0",
        "tailwindcss": "^3.4.0",
        "postcss": "^8.4.0",
        "autoprefixer": "^10.4.0"
      }
    }, null, 2),
    'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'src': path.resolve(__dirname, './src')
    }
  }
})`,
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
        baseUrl: ".",
        paths: {
          "@/*": ["src/*"],
          "src/*": ["src/*"]
        }
      },
      include: ["src"]
    }, null, 2),
    'tailwind.config.js': `export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: []
}`,
    'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}`,
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FluidFlow App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`,
    'src/main.tsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)`,
    'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;`,
    'src/App.tsx': `export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">Welcome to FluidFlow</h1>
        <p className="text-slate-400">Upload a sketch to get started</p>
      </div>
    </div>
  )
}`
  };

  // Backend project management
  const project = useProject();

  // Local version history (undo/redo) - works independently of backend
  const {
    files, setFiles, undo, redo, canUndo, canRedo, reset: resetFiles,
    history, currentIndex, goToIndex, saveSnapshot, historyLength,
    exportHistory, restoreHistory
  } = useVersionHistory(project.currentProject ? project.files : defaultFiles);

  const [activeFile, setActiveFile] = useState<string>('src/App.tsx');
  const activeFileRef = useRef(activeFile);
  const [activeTab, setActiveTab] = useState<TabType>('preview');

  // Keep activeFileRef updated to avoid stale closure in handleDiscardChanges
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  // Track if we've synced files from backend on initial load
  const hasInitializedFromBackend = useRef(false);
  const lastProjectIdRef = useRef<string | null>(null);
  // Guard against rapid project switching race conditions
  const isSwitchingProjectRef = useRef(false);

  // CRITICAL: When project is restored from backend, check WIP first, then reset version history
  // WIP (uncommitted changes) survives page refresh via IndexedDB
  useEffect(() => {
    const currentId = project.currentProject?.id ?? null;

    // Reset flag when project changes (including switching between projects)
    if (currentId !== lastProjectIdRef.current) {
      hasInitializedFromBackend.current = false;
      lastProjectIdRef.current = currentId;
    }

    // Only sync from backend if:
    // 1. Project is initialized
    // 2. We have a current project
    // 3. We haven't already synced for this project
    if (project.isInitialized && project.currentProject && !hasInitializedFromBackend.current) {
      hasInitializedFromBackend.current = true;

      // Check for WIP (uncommitted changes) in IndexedDB first
      const restoreWithWIP = async () => {
        try {
          const wip = await getWIP(project.currentProject!.id);

          // Store last committed files for comparison
          lastCommittedFilesRef.current = JSON.stringify(project.files);

          if (wip && wip.files && Object.keys(wip.files).length > 0) {
            // WIP exists - restore uncommitted changes
            console.log('[App] Restoring WIP from IndexedDB:', Object.keys(wip.files).length, 'files');
            resetFiles(wip.files);
            setHasUncommittedChanges(true); // Mark as having uncommitted changes

            // Restore UI state from WIP
            if (wip.activeFile && wip.files[wip.activeFile]) {
              setActiveFile(wip.activeFile);
            }
            if (wip.activeTab) {
              setActiveTab(wip.activeTab as TabType);
            }
          } else {
            // No WIP - use backend files (last committed state)
            const backendFileCount = Object.keys(project.files).length;
            if (backendFileCount > 0) {
              console.log('[App] Initializing from backend (no WIP):', backendFileCount, 'files');
              resetFiles(project.files);
            }
            setHasUncommittedChanges(false);
          }
        } catch (err) {
          console.warn('[App] Failed to check WIP, falling back to backend:', err);
          const backendFileCount = Object.keys(project.files).length;
          if (backendFileCount > 0) {
            resetFiles(project.files);
          }
          lastCommittedFilesRef.current = JSON.stringify(project.files);
          setHasUncommittedChanges(false);
        }
      };

      restoreWithWIP();
    }
  }, [project.isInitialized, project.currentProject?.id, project.files]);

  // GIT-CENTRIC SYNC: Files only sync to backend on COMMIT
  // No auto-sync - prevents race conditions and data loss
  // WIP (Work In Progress) is saved to IndexedDB for page refresh survival

  // Save WIP to IndexedDB when files change & track uncommitted changes
  useEffect(() => {
    if (!project.currentProject || !hasInitializedFromBackend.current) return;

    const fileCount = Object.keys(files).length;
    if (fileCount === 0) return;

    // Check if files have changed from last committed state
    const currentFilesJson = JSON.stringify(files);
    const hasChanges = lastCommittedFilesRef.current !== '' &&
                       currentFilesJson !== lastCommittedFilesRef.current;
    setHasUncommittedChanges(hasChanges);

    // Save WIP to IndexedDB (async, non-blocking)
    const saveWIP = async () => {
      try {
        const db = await openWIPDatabase();
        const tx = db.transaction('wip', 'readwrite');
        const store = tx.objectStore('wip');
        await store.put({
          id: project.currentProject!.id,
          files,
          activeFile,
          activeTab,
          savedAt: Date.now()
        });
        console.log('[App] WIP saved to IndexedDB');
      } catch (err) {
        console.warn('[App] Failed to save WIP:', err);
      }
    };

    // Debounce WIP saves
    const timeout = setTimeout(saveWIP, 1000);
    return () => clearTimeout(timeout);
  }, [files, activeFile, activeTab, project.currentProject?.id]);

  // Auto-save context (version history, UI state) on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (project.currentProject) {
        const { history: historyToSave, currentIndex: indexToSave } = exportHistory();
        // Use navigator.sendBeacon for reliable save on page unload
        const data = JSON.stringify({
          history: historyToSave,
          currentIndex: indexToSave,
          activeFile,
          activeTab,
        });
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3200/api';
        navigator.sendBeacon(
          `${apiBase}/projects/${project.currentProject.id}/context`,
          new Blob([data], { type: 'application/json' })
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [project.currentProject?.id, activeFile, activeTab, exportHistory]);

  // Periodic auto-save of context (every 30 seconds if there are changes)
  useEffect(() => {
    if (!project.currentProject) return;

    const interval = setInterval(async () => {
      const { history: historyToSave, currentIndex: indexToSave } = exportHistory();
      if (historyToSave.length > 1) { // Only save if there's actual history
        await project.saveContext({
          history: historyToSave,
          currentIndex: indexToSave,
          activeFile,
          activeTab,
        });
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [project.currentProject?.id, activeFile, activeTab, exportHistory, project.saveContext]);

  // Load project from URL if present (for shared projects)
  useEffect(() => {
    const urlProject = loadProjectFromUrl();
    if (urlProject && Object.keys(urlProject).length > 0) {
      setFiles(urlProject);
      // Select first src file
      const firstSrc = Object.keys(urlProject).find(f => f.startsWith('src/'));
      if (firstSrc) setActiveFile(firstSrc);
    }
  }, []);

  // Check if first visit and show credits
  useEffect(() => {
    const hasVisited = localStorage.getItem('fluidflow-visited');
    if (!hasVisited) {
      // Mark as visited
      localStorage.setItem('fluidflow-visited', 'true');
      // Show credits modal after a short delay
      setTimeout(() => {
        setIsCreditsModalOpen(true);
      }, 1000);
    }
  }, []);

  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [selectedModel, setSelectedModel] = useState('models/gemini-2.5-flash');
  const selectedModelRef = useRef(selectedModel);

  // Keep ref updated to avoid stale closure in handleModelChange
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  // Handle model/provider change - also clears conversation context
  // Uses ref to avoid recreating callback when model changes (prevents unnecessary re-renders)
  const handleModelChange = useCallback((newModel: string) => {
    if (newModel !== selectedModelRef.current) {
      setSelectedModel(newModel);
      // Clear the main chat context when model changes
      const contextManager = getContextManager();
      contextManager.clearContext('main-chat');
      console.log('[App] Model changed, context cleared:', newModel);
    }
  }, []);

  // Track uncommitted changes (WIP)
  const [hasUncommittedChanges, setHasUncommittedChanges] = useState(false);
  const lastCommittedFilesRef = useRef<string>('');

  // Calculate local changes for display in GitPanel
  const localChanges = useMemo(() => {
    if (!hasUncommittedChanges || !lastCommittedFilesRef.current) return [];

    try {
      const committedFiles = safeJsonParse(lastCommittedFilesRef.current, {} as FileSystem);
      const changes: { path: string; status: 'added' | 'modified' | 'deleted' }[] = [];

      // Check for added or modified files
      Object.keys(files).forEach(path => {
        if (isIgnoredPath(path)) return;
        if (!committedFiles[path]) {
          changes.push({ path, status: 'added' });
        } else if (committedFiles[path] !== files[path]) {
          changes.push({ path, status: 'modified' });
        }
      });

      // Check for deleted files
      Object.keys(committedFiles).forEach(path => {
        if (isIgnoredPath(path)) return;
        if (!files[path]) {
          changes.push({ path, status: 'deleted' });
        }
      });

      return changes;
    } catch {
      return [];
    }
  }, [files, hasUncommittedChanges]);

  // Command Palette State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSnippetsPanelOpen, setIsSnippetsPanelOpen] = useState(false);
  const [isTailwindPaletteOpen, setIsTailwindPaletteOpen] = useState(false);
  const [isComponentTreeOpen, setIsComponentTreeOpen] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);
  const [isMegaSettingsOpen, setIsMegaSettingsOpen] = useState(false);
  const [megaSettingsInitialCategory, _setMegaSettingsInitialCategory] = useState<'ai-providers' | 'context-manager' | 'tech-stack' | 'projects' | 'editor' | 'appearance' | 'debug' | 'shortcuts' | 'advanced'>('ai-providers');
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);
  
  const [isCodeMapModalOpen, setIsCodeMapModalOpen] = useState(false);

  // ControlPanel ref for inspect edit handler
  const controlPanelRef = useRef<ControlPanelRef>(null);

  // Handler for inspect edit from PreviewPanel
  const handleInspectEdit = useCallback(async (prompt: string, element: InspectedElement, scope: EditScope) => {
    if (controlPanelRef.current) {
      await controlPanelRef.current.handleInspectEdit(prompt, element, scope);
    }
  }, []);

  // Diff Review State
  const [pendingReview, setPendingReview] = useState<{
     label: string;
     newFiles: FileSystem;
  } | null>(null);
  const [autoAcceptChanges, setAutoAcceptChanges] = useState(false);

  const reviewChange = (label: string, newFiles: FileSystem) => {
     if (autoAcceptChanges) {
        // Auto-accept: apply changes directly without showing modal
        setFiles(newFiles);

        // If the active file was deleted in the new state, reset it
        if (!newFiles[activeFile]) {
           const firstSrc = Object.keys(newFiles).find(f => f.startsWith('src/'));
           setActiveFile(firstSrc || 'package.json');
        }
     } else {
        // Show review modal
        setPendingReview({ label, newFiles });
     }
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
      case 'ai-settings':
        setIsAISettingsOpen(true);
        break;
      case 'settings':
        setIsMegaSettingsOpen(true);
        break;
      case 'undo':
        if (canUndo) undo();
        break;
      case 'redo':
        if (canRedo) redo();
        break;
      case 'history':
        setIsHistoryPanelOpen(true);
        break;
      case 'projects':
        setIsProjectManagerOpen(true);
        break;
      case 'git':
        setActiveTab('git');
        break;
      case 'save-project':
        project.syncFiles();
        break;
      // Other actions handled by child components
    }
  }, [canUndo, canRedo, undo, redo, project]);

  // Keyboard shortcuts - DISABLED due to browser conflicts
  // Commenting out the useMemo to avoid unnecessary computation since shortcuts aren't used
  // const shortcuts: KeyboardShortcut[] = useMemo(() => [...], [deps]);
  // useKeyboardShortcuts(shortcuts);

  // Discard all uncommitted changes and restore from last commit
  // Uses activeFileRef to avoid stale closure issues during async operation
  const handleDiscardChanges = useCallback(async () => {
    if (!project.currentProject) return;

    try {
      // Get last committed state
      if (lastCommittedFilesRef.current) {
        const committedFiles = safeJsonParse(lastCommittedFilesRef.current, {} as FileSystem);

        // Restore files to last committed state
        resetFiles(committedFiles);

        // Clear WIP from IndexedDB
        await clearWIP(project.currentProject.id);

        // Reset uncommitted changes flag
        setHasUncommittedChanges(false);

        // Reset active file if it was deleted (use ref to get current value)
        if (!committedFiles[activeFileRef.current]) {
          const firstSrc = Object.keys(committedFiles).find(f => f.startsWith('src/'));
          setActiveFile(firstSrc || 'package.json');
        }

        console.log('[App] Discarded changes, restored from last commit');
      }
    } catch (err) {
      console.error('[App] Failed to discard changes:', err);
    }
  }, [project.currentProject, resetFiles]);

  // Revert to a specific commit
  const handleRevertToCommit = useCallback(async (commitHash: string): Promise<boolean> => {
    if (!project.currentProject) return false;

    try {
      // 1. Checkout to the commit on backend
      await gitApi.checkout(project.currentProject.id, commitHash);

      // 2. Reload files from backend (they've been reverted on disk)
      const result = await projectApi.get(project.currentProject.id);
      if (result.files) {
        resetFiles(result.files);

        // Update last committed files ref
        lastCommittedFilesRef.current = JSON.stringify(result.files);
      }

      // 3. Clear WIP
      await clearWIP(project.currentProject.id);
      setHasUncommittedChanges(false);

      // 4. Refresh git status
      await project.refreshGitStatus();

      // 5. Reset active file if needed
      if (result.files && !result.files[activeFile]) {
        const firstSrc = Object.keys(result.files).find(f => f.startsWith('src/'));
        setActiveFile(firstSrc || 'package.json');
      }

      console.log('[App] Reverted to commit:', commitHash);
      return true;
    } catch (err) {
      console.error('[App] Failed to revert to commit:', err);
      return false;
    }
  }, [project.currentProject, activeFile, resetFiles, project.refreshGitStatus]);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#020617] text-white overflow-hidden selection:bg-blue-500/30 selection:text-blue-50">
       {/* Background Ambient Effects */}
       <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
       <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
       <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-purple-600/5 rounded-full blur-[100px] pointer-events-none" />

       <main className="flex flex-col md:flex-row flex-1 min-h-0 w-full p-4 gap-4 z-10 overflow-hidden">
          <ControlPanel
            ref={controlPanelRef}
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
            onModelChange={handleModelChange}
            onOpenAISettings={() => setIsAISettingsOpen(true)}
            onOpenMegaSettings={() => setIsMegaSettingsOpen(true)}
            onOpenCodeMap={() => setIsCodeMapModalOpen(true)}
            autoAcceptChanges={autoAcceptChanges}
            onAutoAcceptChangesChange={setAutoAcceptChanges}
            // Project props
            currentProject={project.currentProject}
            projects={project.projects}
            isServerOnline={project.isServerOnline}
            isSyncing={project.isSyncing}
            lastSyncedAt={project.lastSyncedAt}
            isLoadingProjects={project.isLoadingProjects}
            // Git status props
            gitStatus={project.gitStatus}
            hasUncommittedChanges={hasUncommittedChanges}
            onOpenGitTab={() => setActiveTab('git')}
            // History Timeline checkpoint
            onSaveCheckpoint={saveSnapshot}
            onCreateProject={async (name, description) => {
              return await project.createProject(name, description, files);
            }}
            onOpenProject={async (id) => {
              // Guard against rapid project switching race conditions
              if (isSwitchingProjectRef.current) {
                console.log('[App] Project switch already in progress, ignoring');
                return false;
              }
              isSwitchingProjectRef.current = true;

              try {
                // 1. Save current project's full context before switching
                if (project.currentProject) {
                  const { history: historyToSave, currentIndex: indexToSave } = exportHistory();
                  await project.saveContext({
                    history: historyToSave,
                    currentIndex: indexToSave,
                    activeFile,
                    activeTab,
                  });
                }

                // 2. Open new project - this returns files directly!
                const result = await project.openProject(id);

              if (result.success) {
                // 3. Check for WIP (uncommitted changes) in IndexedDB
                const wip = await getWIP(id);
                let currentFiles = result.files;
                let restoredFromWIP = false;

                if (wip && wip.files && Object.keys(wip.files).length > 0) {
                  // WIP exists - use WIP files (uncommitted changes)
                  console.log('[App] Restoring WIP from IndexedDB:', Object.keys(wip.files).length, 'files');
                  currentFiles = wip.files;
                  resetFiles(wip.files);
                  restoredFromWIP = true;

                  // Restore WIP UI state
                  if (wip.activeFile && wip.files[wip.activeFile]) {
                    setActiveFile(wip.activeFile);
                  }
                  if (wip.activeTab) {
                    setActiveTab(wip.activeTab as TabType);
                  }
                } else if (result.context?.history && result.context.history.length > 0) {
                  // No WIP, restore from saved history
                  restoreHistory(result.context.history, result.context.currentIndex);
                  const currentHistoryEntry = result.context.history[result.context.currentIndex];
                  if (currentHistoryEntry?.files) {
                    currentFiles = currentHistoryEntry.files;
                  }
                } else {
                  // No WIP, no history - use backend files
                  resetFiles(result.files);
                }

                // 4. Restore UI context (if not restored from WIP)
                if (!restoredFromWIP) {
                  if (result.context?.activeFile && currentFiles[result.context.activeFile]) {
                    setActiveFile(result.context.activeFile);
                  } else {
                    const firstSrc = Object.keys(currentFiles).find(f => f.startsWith('src/'));
                    setActiveFile(firstSrc || 'package.json');
                  }

                  if (result.context?.activeTab) {
                    setActiveTab(result.context.activeTab as TabType);
                  }
                }

                // 5. Reset other transient state
                setSuggestions(null);
                setPendingReview(null);

                console.log('[App] Switched to project with', Object.keys(currentFiles).length, 'files', restoredFromWIP ? '(from WIP)' : '(from backend)');
              }
              return result.success;
              } finally {
                isSwitchingProjectRef.current = false;
              }
            }}
            onDeleteProject={project.deleteProject}
            onDuplicateProject={project.duplicateProject}
            onRefreshProjects={project.refreshProjects}
            onCloseProject={project.closeProject}
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
            onInspectEdit={handleInspectEdit}
            // Git props
            projectId={project.currentProject?.id}
            gitStatus={project.gitStatus}
            onInitGit={async (force?: boolean) => {
              // Pass current working files to initGit
              const success = await project.initGit(force, files);
              if (success && project.currentProject) {
                // Clear WIP after successful git init (first commit is made)
                await clearWIP(project.currentProject.id);
                // Update last committed state
                lastCommittedFilesRef.current = JSON.stringify(files);
                setHasUncommittedChanges(false);
                console.log('[App] WIP cleared after git init');
              }
              return success;
            }}
            onCommit={async (message: string) => {
              // Pass current working files to commit (not stale state.files)
              const success = await project.commit(message, files);
              if (success && project.currentProject) {
                // Clear WIP after successful commit
                await clearWIP(project.currentProject.id);
                // Update last committed state
                lastCommittedFilesRef.current = JSON.stringify(files);
                setHasUncommittedChanges(false);
                console.log('[App] WIP cleared after commit');
              }
              return success;
            }}
            onRefreshGitStatus={project.refreshGitStatus}
            // Local changes (WIP)
            hasUncommittedChanges={hasUncommittedChanges}
            localChanges={localChanges}
            onDiscardChanges={handleDiscardChanges}
            onRevertToCommit={handleRevertToCommit}
            onSendErrorToChat={(error) => controlPanelRef.current?.sendErrorToChat(error)}
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

       {/* Sync Confirmation Dialog */}
       {project.pendingSyncConfirmation && (
          <SyncConfirmationDialog
             confirmation={project.pendingSyncConfirmation}
             onConfirm={project.confirmPendingSync}
             onCancel={project.cancelPendingSync}
             isLoading={project.isSyncing}
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

       {/* AI Settings Modal */}
       <AISettingsModal
         isOpen={isAISettingsOpen}
         onClose={() => setIsAISettingsOpen(false)}
         onProviderChange={(providerId, modelId) => handleModelChange(modelId)}
       />

       {/* Mega Settings Modal */}
       <MegaSettingsModal
         isOpen={isMegaSettingsOpen}
         onClose={() => setIsMegaSettingsOpen(false)}
         initialCategory={megaSettingsInitialCategory}
         onProviderChange={(providerId, modelId) => handleModelChange(modelId)}
       />

       {/* Floating History Toolbar */}
       <div className={`fixed bottom-6 z-50 flex items-center gap-1 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl p-1 shadow-2xl transition-all duration-300 ${isHistoryPanelOpen ? 'right-[21rem]' : 'right-6'}`}>
         {/* Undo */}
         <button
           onClick={undo}
           disabled={!canUndo}
           className={`p-2 rounded-lg transition-all ${
             canUndo
               ? 'hover:bg-white/10 text-white'
               : 'text-slate-600 cursor-not-allowed'
           }`}
           title="Undo (Ctrl+Z)"
         >
           <Undo2 className="w-4 h-4" />
         </button>

         {/* Position Indicator */}
         <button
           onClick={() => setIsHistoryPanelOpen(!isHistoryPanelOpen)}
           className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors group"
           title="History Timeline (Ctrl+Shift+H)"
         >
           <ChevronLeft
             className={`w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 transition-colors ${!canUndo ? 'opacity-30' : ''}`}
           />
           <span className="text-xs font-mono text-slate-400 group-hover:text-white transition-colors min-w-[3rem] text-center">
             {currentIndex + 1} / {historyLength}
           </span>
           <ChevronRight
             className={`w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 transition-colors ${!canRedo ? 'opacity-30' : ''}`}
           />
         </button>

         {/* Redo */}
         <button
           onClick={redo}
           disabled={!canRedo}
           className={`p-2 rounded-lg transition-all ${
             canRedo
               ? 'hover:bg-white/10 text-white'
               : 'text-slate-600 cursor-not-allowed'
           }`}
           title="Redo (Ctrl+Y)"
         >
           <Redo2 className="w-4 h-4" />
         </button>

         <div className="w-px h-5 bg-white/10" />

         {/* History Panel Toggle */}
         <button
           onClick={() => setIsHistoryPanelOpen(!isHistoryPanelOpen)}
           className={`p-2 rounded-lg transition-all ${
             isHistoryPanelOpen
               ? 'bg-blue-500/20 text-blue-400'
               : 'hover:bg-white/10 text-slate-400 hover:text-white'
           }`}
           title="History Timeline (Ctrl+Shift+H)"
         >
           <History className="w-4 h-4" />
         </button>

         <div className="w-px h-5 bg-white/10" />

         {/* Credits */}
         <button
           onClick={() => setIsCreditsModalOpen(true)}
           className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
           title="About FluidFlow"
         >
           <Info className="w-4 h-4" />
         </button>
       </div>

       {/* History Panel */}
       <HistoryPanel
         isOpen={isHistoryPanelOpen}
         onClose={() => setIsHistoryPanelOpen(false)}
         history={history}
         currentIndex={currentIndex}
         onGoToIndex={goToIndex}
         onSaveSnapshot={saveSnapshot}
       />

       {/* Project Manager */}
       <ProjectManager
         isOpen={isProjectManagerOpen}
         onClose={() => setIsProjectManagerOpen(false)}
         projects={project.projects}
         currentProjectId={project.currentProject?.id}
         isLoading={project.isLoadingProjects}
         isServerOnline={project.isServerOnline}
         onCreateProject={async (name, description) => {
           const newProject = await project.createProject(name, description, files);
           if (newProject) {
             setIsProjectManagerOpen(false);
           }
         }}
         onOpenProject={async (id) => {
           // Guard against rapid project switching race conditions
           if (isSwitchingProjectRef.current) {
             console.log('[App] Project switch already in progress, ignoring');
             return;
           }
           isSwitchingProjectRef.current = true;

           try {
             // 1. Save current project's full context before switching
             if (project.currentProject) {
               const { history: historyToSave, currentIndex: indexToSave } = exportHistory();
               await project.saveContext({
                 history: historyToSave,
                 currentIndex: indexToSave,
                 activeFile,
                 activeTab,
               });
             }

             // 2. Open new project
             const result = await project.openProject(id);

             if (result.success) {
               // 3. Check if we have saved history to restore
               let currentFiles = result.files;
               if (result.context?.history && result.context.history.length > 0) {
                 // Restore full version history from backend
                 restoreHistory(result.context.history, result.context.currentIndex);
                 // Get files from the current history entry
                 const currentHistoryEntry = result.context.history[result.context.currentIndex];
                 if (currentHistoryEntry?.files) {
                   currentFiles = currentHistoryEntry.files;
                 }
               } else {
                 // No saved history, reset to initial state
                 resetFiles(result.files);
               }

               // 4. Restore UI context
               if (result.context?.activeFile && currentFiles[result.context.activeFile]) {
                 setActiveFile(result.context.activeFile);
               } else {
                 const firstSrc = Object.keys(currentFiles).find(f => f.startsWith('src/'));
                 setActiveFile(firstSrc || 'package.json');
               }

               if (result.context?.activeTab) {
                 setActiveTab(result.context.activeTab as TabType);
               }

               // 5. Reset transient state
               setSuggestions(null);
               setPendingReview(null);
               setIsProjectManagerOpen(false);
             }
           } finally {
             isSwitchingProjectRef.current = false;
           }
         }}
         onDeleteProject={async (id: string) => { await project.deleteProject(id); }}
         onDuplicateProject={async (id: string) => { await project.duplicateProject(id); }}
         onRefresh={project.refreshProjects}
       />

       {/* Credits Modal */}
       <CreditsModal
         isOpen={isCreditsModalOpen}
         onClose={() => setIsCreditsModalOpen(false)}
         showOnFirstLaunch={true}
       />

       {/* CodeMap Modal */}
       <CodeMapModal
         isOpen={isCodeMapModalOpen}
         onClose={() => setIsCodeMapModalOpen(false)}
         files={files}
       />

    </div>
  );
}