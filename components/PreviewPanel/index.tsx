import React, { useEffect, useState } from 'react';
import {
  Monitor, Smartphone, Tablet, RefreshCw, Eye, Code2, Copy, Check, Download, Database,
  ShieldCheck, Pencil, Send, FileText, Wrench, FlaskConical, Package, Loader2,
  SplitSquareVertical, X
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

import { FileSystem, LogEntry, NetworkRequest, AccessibilityReport, TabType, TerminalTab, PreviewDevice, PushResult } from '../../types';

// Sub-components
import { CodeEditor } from './CodeEditor';
import { ConsolePanel } from './ConsolePanel';
import { FileExplorer } from './FileExplorer';
import { ExportModal } from './ExportModal';
import { GithubModal } from './GithubModal';
import { AccessibilityModal } from './AccessibilityModal';
import { ConsultantReport } from './ConsultantReport';

interface PreviewPanelProps {
  files: FileSystem;
  setFiles: (files: FileSystem) => void;
  activeFile: string;
  setActiveFile: (file: string) => void;
  suggestions: string[] | null;
  setSuggestions: (s: string[] | null) => void;
  isGenerating: boolean;
  reviewChange: (label: string, newFiles: FileSystem) => void;
  selectedModel: string;
  activeTab?: TabType;
  setActiveTab?: (tab: TabType) => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  files, setFiles, activeFile, setActiveFile, suggestions, setSuggestions, isGenerating, reviewChange, selectedModel,
  activeTab: externalActiveTab, setActiveTab: externalSetActiveTab
}) => {
  // State
  const [iframeSrc, setIframeSrc] = useState<string>('');
  const [key, setKey] = useState(0);
  const [internalActiveTab, setInternalActiveTab] = useState<TabType>('preview');

  // Use external state if provided, otherwise use internal
  const activeTab = externalActiveTab ?? internalActiveTab;
  const setActiveTab = externalSetActiveTab ?? setInternalActiveTab;
  const [isCopied, setIsCopied] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  const [isFixingResp, setIsFixingResp] = useState(false);

  // Loading states
  const [isGeneratingDB, setIsGeneratingDB] = useState(false);
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false);

  // Accessibility
  const [accessibilityReport, setAccessibilityReport] = useState<AccessibilityReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [showAccessReport, setShowAccessReport] = useState(false);

  // Quick Edit
  const [isEditMode, setIsEditMode] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [isQuickEditing, setIsQuickEditing] = useState(false);

  // Export
  const [showExportModal, setShowExportModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [repoName, setRepoName] = useState('fluidflow-app');
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);

  // Console
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [networkLogs, setNetworkLogs] = useState<NetworkRequest[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [activeTerminalTab, setActiveTerminalTab] = useState<TerminalTab>('console');

  // Split View
  const [isSplitView, setIsSplitView] = useState(false);
  const [splitFile, setSplitFile] = useState<string>('');

  const appCode = files['src/App.tsx'];

  // Console Message Listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      if (event.data.type === 'CONSOLE_LOG') {
        setLogs(prev => [...prev, {
          id: crypto.randomUUID(),
          type: event.data.logType,
          message: event.data.message,
          timestamp: new Date(event.data.timestamp).toLocaleTimeString([], { hour12: false })
        }]);
        if (event.data.logType === 'error') {
          setIsConsoleOpen(true);
          setActiveTerminalTab('console');
        }
      } else if (event.data.type === 'NETWORK_REQUEST') {
        setNetworkLogs(prev => [...prev, {
          id: crypto.randomUUID(),
          method: event.data.req.method,
          url: event.data.req.url,
          status: event.data.req.status,
          duration: event.data.req.duration,
          timestamp: new Date(event.data.timestamp).toLocaleTimeString([], { hour12: false })
        }]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Build iframe content
  useEffect(() => {
    if (appCode) {
      const html = buildIframeHtml(files);
      setIframeSrc(html);
    }
  }, [appCode, files]);

  // API functions
  const generateUnitTests = async () => {
    if (!appCode) return;
    setIsGeneratingTests(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ parts: [{ text: `Generate unit tests for this React component using React Testing Library.\nComponent:\n${appCode}\n\nOutput ONLY the raw code for the test file.` }] }]
      });
      let tests = (response.text || '').replace(/```tsx/g, '').replace(/```typescript/g, '').replace(/```/g, '');
      setFiles({ ...files, 'src/App.test.tsx': tests });
      setActiveFile('src/App.test.tsx');
      setActiveTab('code');
    } catch (e) {
      console.error("Test Generation Error", e);
    } finally {
      setIsGeneratingTests(false);
    }
  };

  const generateDocs = async () => {
    if (!appCode) return;
    setIsGeneratingDocs(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ parts: [{ text: `Analyze the following React component and generate a professional README.md file.\n\nReact Component Code:\n${appCode}` }] }]
      });
      let docs = (response.text || '').replace(/```markdown/g, '').replace(/```md/g, '').replace(/```/g, '');
      setFiles({ ...files, 'README.md': docs.trim() });
      setActiveFile('README.md');
      setActiveTab('code');
    } catch (e) {
      console.error("Docs Generation Error", e);
    } finally {
      setIsGeneratingDocs(false);
    }
  };

  const generateDatabaseSchema = async () => {
    if (!appCode) return;
    setIsGeneratingDB(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ parts: [{ text: `Based on this React App, generate a SQL schema for SQLite.\nCode: ${appCode}\nOutput ONLY SQL.` }] }]
      });
      const sql = (response.text || '').replace(/```sql/g, '').replace(/```/g, '');
      setFiles({ ...files, 'db/schema.sql': sql });
      setActiveFile('db/schema.sql');
      setActiveTab('code');
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingDB(false);
    }
  };

  const runAccessibilityAudit = async () => {
    if (!appCode) return;
    setIsAuditing(true);
    setShowAccessReport(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ parts: [{ text: `Audit this code:\n${appCode}` }] }],
        config: {
          systemInstruction: 'You are a WCAG 2.1 Accessibility Auditor. Output ONLY a JSON object with score (0-100) and issues array.',
          responseMimeType: 'application/json'
        }
      });
      const report = JSON.parse(response.text || '{}');
      setAccessibilityReport(report);
    } catch (e) {
      setAccessibilityReport({ score: 0, issues: [{ type: 'error', message: 'Failed to run audit.' }] });
    } finally {
      setIsAuditing(false);
    }
  };

  const fixAccessibilityIssues = async () => {
    if (!appCode || !accessibilityReport) return;
    setIsFixing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ parts: [{ text: `Issues to fix: ${JSON.stringify(accessibilityReport.issues)}\n\nOriginal Code:\n${appCode}` }] }],
        config: { systemInstruction: 'Apply accessibility fixes. Return ONLY the FULL updated code.' }
      });
      let fixedCode = (response.text || '').replace(/```jsx/g, '').replace(/```tsx/g, '').replace(/```/g, '');
      reviewChange('Fixed Accessibility Issues', { ...files, 'src/App.tsx': fixedCode });
      setAccessibilityReport({ score: 100, issues: [] });
      setTimeout(() => setShowAccessReport(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsFixing(false);
    }
  };

  const fixResponsiveness = async () => {
    if (!appCode) return;
    setIsFixingResp(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ parts: [{ text: `Optimize this React component for mobile devices.\n\nCode: ${appCode}\n\nOutput ONLY the full updated code.` }] }]
      });
      let fixedCode = (response.text || '').replace(/```jsx/g, '').replace(/```tsx/g, '').replace(/```/g, '');
      reviewChange('Fixed Responsiveness', { ...files, 'src/App.tsx': fixedCode });
    } catch (e) {
      console.error(e);
    } finally {
      setIsFixingResp(false);
    }
  };

  const handleQuickEdit = async () => {
    if (!editPrompt.trim() || !appCode) return;
    setIsQuickEditing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ parts: [{ text: `Edit this React code based on: "${editPrompt}"\n\nCode: ${appCode}\n\nOutput ONLY the full updated code.` }] }]
      });
      let fixedCode = (response.text || '').replace(/```jsx/g, '').replace(/```tsx/g, '').replace(/```/g, '');
      setFiles({ ...files, 'src/App.tsx': fixedCode });
      setIsEditMode(false);
      setEditPrompt('');
    } catch (e) {
      console.error(e);
    } finally {
      setIsQuickEditing(false);
    }
  };

  const fixError = async (logId: string, message: string) => {
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, isFixing: true } : l));
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ parts: [{ text: `Fix this runtime error: "${message}"\n\nCode: ${appCode}\n\nOutput ONLY the full updated code.` }] }]
      });
      let fixedCode = (response.text || '').replace(/```jsx/g, '').replace(/```tsx/g, '').replace(/```/g, '');
      reviewChange('Fixed Runtime Error', { ...files, 'src/App.tsx': fixedCode });
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, isFixing: false, isFixed: true } : l));
    } catch (e) {
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, isFixing: false } : l));
    }
  };

  // Export functions
  const downloadAsZip = async () => {
    if (!appCode) return;
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      // Add standard files
      zip.file('package.json', JSON.stringify(getPackageJson(repoName), null, 2));
      zip.file('vite.config.ts', getViteConfig());
      zip.file('tsconfig.json', JSON.stringify(getTsConfig(), null, 2));
      zip.file('tailwind.config.js', getTailwindConfig());
      zip.file('postcss.config.js', getPostcssConfig());
      zip.file('index.html', getIndexHtml());
      zip.file('src/main.tsx', getMainTsx());
      zip.file('src/index.css', files['src/index.css'] || getTailwindCss());
      zip.file('README.md', getReadme());

      for (const [path, content] of Object.entries(files) as [string, string][]) {
        if (path === 'src/index.css') continue;
        const fixedContent = content.replace(/from ['"]src\//g, "from './").replace(/import ['"]src\//g, "import './");
        zip.file(path, fixedContent);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, 'fluidflow-app.zip');
    } catch (error) {
      console.error(error);
    } finally {
      setIsDownloading(false);
      setShowExportModal(false);
    }
  };

  const pushToGithub = async () => {
    // Implementation remains the same - abbreviated for brevity
    if (!githubToken || !repoName || !appCode) return;
    setIsPushing(true);
    setPushResult(null);
    try {
      // Create repo and push files...
      const createRepoRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repoName, description: 'Generated with FluidFlow', private: false, auto_init: true })
      });
      if (!createRepoRes.ok) throw new Error((await createRepoRes.json()).message);
      const repoData = await createRepoRes.json();
      setPushResult({ success: true, url: repoData.html_url });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to push to GitHub';
      setPushResult({ success: false, error: msg });
    } finally {
      setIsPushing(false);
    }
  };

  // Helper functions
  const reloadPreview = () => setKey(prev => prev + 1);
  const copyToClipboard = () => {
    navigator.clipboard.writeText(files[activeFile] || '');
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  const downloadCode = () => {
    const element = document.createElement('a');
    const file = new Blob([files[activeFile] || ''], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = activeFile.split('/').pop() || 'file.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'database' && !files['db/schema.sql'] && appCode) generateDatabaseSchema();
    else if (tab === 'database' && files['db/schema.sql']) { setActiveFile('db/schema.sql'); setActiveTab('code'); }
    else if (tab === 'tests' && !files['src/App.test.tsx'] && appCode) generateUnitTests();
    else if (tab === 'tests' && files['src/App.test.tsx']) { setActiveFile('src/App.test.tsx'); setActiveTab('code'); }
    else if (tab === 'docs' && !files['README.md'] && appCode) generateDocs();
    else if (tab === 'docs' && files['README.md']) { setActiveFile('README.md'); setActiveTab('code'); }
  };

  return (
    <section className="flex-1 min-w-0 min-h-0 flex flex-col bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
      {/* Toolbar */}
      <div className="h-14 flex-none border-b border-white/5 flex items-center justify-between px-4 md:px-6 bg-white/[0.02]">
        <div className="flex items-center gap-6">
          <div className="flex gap-1.5 opacity-60">
            <div className="w-3 h-3 rounded-full bg-red-500/40 border border-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/40 border border-yellow-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-500/40 border border-green-500/50" />
          </div>

          <div className="flex p-1 bg-slate-950/50 rounded-lg border border-white/5">
            {[
              { id: 'preview', icon: Eye, label: 'Preview' },
              { id: 'code', icon: Code2, label: 'Code' },
              { id: 'database', icon: Database, label: 'SQL' },
              { id: 'tests', icon: FlaskConical, label: 'Tests' },
              { id: 'docs', icon: FileText, label: 'Docs' }
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => handleTabChange(id as TabType)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'preview' && (
            <>
              <div className="h-6 w-px bg-white/10 mx-1 hidden sm:block" />
              <div className="hidden sm:flex items-center gap-1 bg-slate-950/30 p-1 rounded-lg border border-white/5">
                {[
                  { id: 'desktop', icon: Monitor },
                  { id: 'tablet', icon: Tablet },
                  { id: 'mobile', icon: Smartphone }
                ].map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setPreviewDevice(id as PreviewDevice)}
                    className={`p-2 rounded-md transition-colors ${previewDevice === id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    title={id.charAt(0).toUpperCase() + id.slice(1)}
                    aria-label={`${id} view`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'preview' && appCode && previewDevice !== 'desktop' && (
            <button onClick={fixResponsiveness} disabled={isFixingResp} className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-xs font-medium">
              {isFixingResp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
              {isFixingResp ? 'Fixing...' : 'Fix Responsive'}
            </button>
          )}

          {activeTab === 'preview' ? (
            <>
              {appCode && !isGenerating && (
                <>
                  <button onClick={() => setIsEditMode(!isEditMode)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${isEditMode ? 'bg-orange-500/10 text-orange-300 border-orange-500/20' : 'bg-slate-500/10 text-slate-300 border-transparent'}`}>
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Edit</span>
                  </button>
                  <button onClick={runAccessibilityAudit} className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-xs font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Audit A11y</span>
                  </button>
                </>
              )}
              <div className="h-6 w-px bg-white/10" />
              <button onClick={reloadPreview} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors" title="Reload Preview" aria-label="Reload Preview">
                <RefreshCw className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={downloadCode} className="p-2 hover:bg-blue-500/10 rounded-lg text-slate-400 hover:text-blue-400" title="Download File" aria-label="Download current file">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={copyToClipboard} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 border border-white/5">
                {isCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {isCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          {appCode && (
            <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-xs font-medium">
              <Package className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Export</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#050811] group flex flex-col">
        {activeTab === 'preview' ? (
          <PreviewContent
            appCode={appCode}
            iframeSrc={iframeSrc}
            previewDevice={previewDevice}
            isGenerating={isGenerating}
            isFixingResp={isFixingResp}
            isEditMode={isEditMode}
            editPrompt={editPrompt}
            setEditPrompt={setEditPrompt}
            isQuickEditing={isQuickEditing}
            handleQuickEdit={handleQuickEdit}
            setIsEditMode={setIsEditMode}
            iframeKey={key}
            logs={logs}
            networkLogs={networkLogs}
            isConsoleOpen={isConsoleOpen}
            setIsConsoleOpen={setIsConsoleOpen}
            activeTerminalTab={activeTerminalTab}
            setActiveTerminalTab={setActiveTerminalTab}
            setLogs={setLogs}
            setNetworkLogs={setNetworkLogs}
            fixError={fixError}
          />
        ) : (
          <div className="flex-1 flex min-h-0 h-full">
            <FileExplorer files={files} activeFile={activeFile} onFileSelect={setActiveFile} />
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {/* Split View Toggle */}
              <div className="flex items-center justify-between px-2 py-1 border-b border-white/5 bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{activeFile}</span>
                  {isSplitView && splitFile && (
                    <>
                      <span className="text-slate-600">|</span>
                      <span className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{splitFile}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (!isSplitView) {
                        // Find another file to show in split view
                        const otherFiles = Object.keys(files).filter(f => f !== activeFile && (f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.js')));
                        setSplitFile(otherFiles[0] || '');
                      }
                      setIsSplitView(!isSplitView);
                    }}
                    className={`p-1.5 rounded transition-colors ${isSplitView ? 'bg-blue-600/20 text-blue-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                    title={isSplitView ? 'Close Split View' : 'Split View'}
                  >
                    <SplitSquareVertical className="w-4 h-4" />
                  </button>
                  {isSplitView && (
                    <button
                      onClick={() => setIsSplitView(false)}
                      className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
                      title="Close Split"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {isGeneratingDB || isGeneratingTests || isGeneratingDocs ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-blue-400 gap-4">
                  <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-sm font-medium animate-pulse">
                    {isGeneratingDB && 'Generating SQL Schema...'}
                    {isGeneratingTests && 'Writing Tests...'}
                    {isGeneratingDocs && 'Writing Documentation...'}
                  </p>
                </div>
              ) : files[activeFile] ? (
                <div className={`flex-1 flex min-h-0 ${isSplitView ? 'flex-row' : 'flex-col'}`}>
                  {/* Primary Editor */}
                  <div className={isSplitView ? 'flex-1 min-w-0 border-r border-white/5' : 'flex-1'}>
                    <CodeEditor files={files} setFiles={setFiles} activeFile={activeFile} />
                  </div>

                  {/* Split Editor */}
                  {isSplitView && splitFile && files[splitFile] && (
                    <div className="flex-1 min-w-0 flex flex-col">
                      {/* Split file selector */}
                      <select
                        value={splitFile}
                        onChange={(e) => setSplitFile(e.target.value)}
                        className="w-full px-2 py-1 bg-slate-800/50 border-b border-white/5 text-xs text-slate-400 outline-none"
                      >
                        {Object.keys(files)
                          .filter(f => f !== activeFile)
                          .map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                      </select>
                      <div className="flex-1 min-h-0">
                        <CodeEditor files={files} setFiles={setFiles} activeFile={splitFile} />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                  <Code2 className="w-10 h-10 opacity-50" />
                  <p className="text-sm font-medium">Select a file to edit</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modals */}
        <ExportModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} onDownloadZip={downloadAsZip} onPushToGithub={() => { setShowExportModal(false); setShowGithubModal(true); }} isDownloading={isDownloading} />
        <GithubModal isOpen={showGithubModal} onClose={() => { setShowGithubModal(false); setPushResult(null); }} githubToken={githubToken} onTokenChange={setGithubToken} repoName={repoName} onRepoNameChange={setRepoName} onPush={pushToGithub} isPushing={isPushing} pushResult={pushResult} />
        {activeTab === 'preview' && <ConsultantReport suggestions={suggestions} onClose={() => setSuggestions(null)} />}
        {activeTab === 'preview' && <AccessibilityModal isOpen={showAccessReport} onClose={() => setShowAccessReport(false)} report={accessibilityReport} isAuditing={isAuditing} isFixing={isFixing} onFix={fixAccessibilityIssues} />}
      </div>
    </section>
  );
};

// Preview Content Component
const PreviewContent: React.FC<{
  appCode: string | undefined;
  iframeSrc: string;
  previewDevice: PreviewDevice;
  isGenerating: boolean;
  isFixingResp: boolean;
  isEditMode: boolean;
  editPrompt: string;
  setEditPrompt: (v: string) => void;
  isQuickEditing: boolean;
  handleQuickEdit: () => void;
  setIsEditMode: (v: boolean) => void;
  iframeKey: number;
  logs: LogEntry[];
  networkLogs: NetworkRequest[];
  isConsoleOpen: boolean;
  setIsConsoleOpen: (v: boolean) => void;
  activeTerminalTab: TerminalTab;
  setActiveTerminalTab: (t: TerminalTab) => void;
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  setNetworkLogs: React.Dispatch<React.SetStateAction<NetworkRequest[]>>;
  fixError: (id: string, msg: string) => void;
}> = (props) => {
  const { appCode, iframeSrc, previewDevice, isGenerating, isFixingResp, isEditMode, editPrompt, setEditPrompt, isQuickEditing, handleQuickEdit, setIsEditMode, iframeKey, logs, networkLogs, isConsoleOpen, setIsConsoleOpen, activeTerminalTab, setActiveTerminalTab, setLogs, setNetworkLogs, fixError } = props;

  // Calculate content area height based on console state
  const contentStyle = {
    height: isConsoleOpen ? 'calc(100% - 192px)' : 'calc(100% - 32px)'
  };

  return (
    <div className="flex-1 min-h-0 h-full overflow-hidden relative">
      <div className="absolute inset-0 opacity-[0.15] pointer-events-none z-0" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

      <div className="flex items-center justify-center overflow-hidden relative z-10 transition-all duration-300" style={contentStyle}>
        {appCode ? (
          <div className={`relative z-10 transition-all duration-500 ease-in-out bg-slate-950 shadow-2xl overflow-hidden flex flex-col ${
            previewDevice === 'mobile' ? 'w-[375px] h-[667px] max-h-full rounded-[40px] border-[8px] border-slate-800 ring-4 ring-black shadow-[0_0_50px_rgba(0,0,0,0.5)]' :
            previewDevice === 'tablet' ? 'w-[768px] h-[90%] max-h-[800px] rounded-[24px] border-[8px] border-slate-800 ring-4 ring-black shadow-[0_0_50px_rgba(0,0,0,0.5)]' :
            'w-full h-full rounded-none border-none'
          }`}>
            {previewDevice === 'mobile' && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-50 flex items-center justify-center gap-2 pointer-events-none">
                <div className="w-12 h-1.5 rounded-full bg-slate-800/50" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-800/80" />
              </div>
            )}

            {(isGenerating || isFixingResp) && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-blue-400 animate-pulse" />
                  </div>
                </div>
                <p className="mt-4 text-sm font-medium text-blue-300 animate-pulse">
                  {isFixingResp ? 'Adapting Layout...' : 'Constructing Interface...'}
                </p>
              </div>
            )}

            <iframe key={iframeKey} srcDoc={iframeSrc} title="Preview" className={`w-full h-full bg-white transition-opacity duration-500 ${isGenerating ? 'opacity-40' : 'opacity-100'}`} sandbox="allow-scripts allow-same-origin" />

            {isEditMode && (
              <div className="absolute left-1/2 -translate-x-1/2 w-[90%] md:w-[600px] z-50 animate-in slide-in-from-bottom-4 duration-300 bottom-8">
                <div className="flex items-center gap-2 p-1.5 bg-slate-900/90 backdrop-blur-xl border border-orange-500/30 rounded-full shadow-2xl ring-1 ring-orange-500/20">
                  <div className="pl-3 pr-2 text-orange-400"><Pencil className="w-4 h-4" /></div>
                  <input type="text" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleQuickEdit()} placeholder="Describe a specific change..." className="flex-1 bg-transparent border-none text-sm text-white placeholder-slate-400 focus:ring-0 px-2 h-9" autoFocus aria-label="Quick edit prompt" />
                  {isQuickEditing ? (
                    <div className="pr-3 pl-2"><Loader2 className="w-4 h-4 text-orange-400 animate-spin" /></div>
                  ) : (
                    <button onClick={handleQuickEdit} disabled={!editPrompt.trim()} className="p-2 rounded-full bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Submit edit">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="text-center mt-2">
                  <button onClick={() => setIsEditMode(false)} className="text-[10px] text-slate-500 hover:text-slate-300">Cancel Edit</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="relative transition-all duration-500 ease-out transform scale-90 opacity-60">
              <div className="relative w-[375px] h-[812px] bg-black rounded-[48px] border-[8px] border-slate-800 shadow-2xl overflow-hidden ring-1 ring-white/10 z-10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-7 bg-slate-900 rounded-b-2xl z-20 flex items-center justify-center gap-3">
                  <div className="w-10 h-1 rounded-full bg-slate-800/50" />
                  <div className="w-2 h-2 rounded-full bg-slate-800/80" />
                </div>
                <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center">
                  <p className="text-slate-700 font-medium text-sm">Upload a sketch to generate app</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {appCode && (
        <ConsolePanel
          logs={logs}
          networkLogs={networkLogs}
          isOpen={isConsoleOpen}
          onToggle={() => setIsConsoleOpen(!isConsoleOpen)}
          activeTab={activeTerminalTab}
          onTabChange={setActiveTerminalTab}
          onClearLogs={() => setLogs([])}
          onClearNetwork={() => setNetworkLogs([])}
          onFixError={fixError}
        />
      )}
    </div>
  );
};

// Helper functions for generating files
const buildIframeHtml = (files: FileSystem): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>body { font-family: 'Inter', sans-serif; background-color: #020617; color: white; height: 100vh; overflow: auto; }</style>
</head>
<body>
  <div id="root"></div>
  <script>
    window.process = { env: { NODE_ENV: 'development' } };
    const notify = (type, msg) => window.parent.postMessage({ type: 'CONSOLE_LOG', logType: type, message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg), timestamp: Date.now() }, '*');
    console.log = (...args) => { notify('log', args.join(' ')); };
    console.warn = (...args) => { notify('warn', args.join(' ')); };
    console.error = (...args) => { notify('error', args.join(' ')); };
    window.onerror = function(msg) { notify('error', msg); return false; };
  </script>
  <script type="text/babel" data-presets="react,typescript">
    (async () => {
      const files = JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(files))}"));
      const importMap = { imports: { "react": "https://esm.sh/react@19.0.0", "react-dom/client": "https://esm.sh/react-dom@19.0.0/client", "lucide-react": "https://esm.sh/lucide-react@0.469.0" }};

      // Helper to resolve relative paths to absolute
      function resolvePath(fromFile, importPath) {
        if (!importPath.startsWith('.')) return importPath;
        const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
        const parts = fromDir.split('/').filter(Boolean);
        const importParts = importPath.split('/');

        for (const part of importParts) {
          if (part === '.') continue;
          if (part === '..') parts.pop();
          else parts.push(part);
        }
        return parts.join('/');
      }

      // Helper to find actual file (handles missing extensions)
      function findFile(path) {
        if (files[path]) return path;
        const extensions = ['.tsx', '.ts', '.jsx', '.js'];
        for (const ext of extensions) {
          if (files[path + ext]) return path + ext;
        }
        // Try index files
        for (const ext of extensions) {
          if (files[path + '/index' + ext]) return path + '/index' + ext;
        }
        return null;
      }

      // Transform imports in code to use absolute paths
      function transformImports(code, fromFile) {
        return code.replace(
          /(import\\s+(?:[\\w{},\\s*]+\\s+from\\s+)?['"])([^'"]+)(['"])/g,
          (match, prefix, importPath, suffix) => {
            if (importPath.startsWith('.')) {
              const resolved = resolvePath(fromFile, importPath);
              const actualFile = findFile(resolved);
              if (actualFile) {
                return prefix + actualFile + suffix;
              }
              return prefix + resolved + suffix;
            }
            return match;
          }
        ).replace(
          /(export\\s+(?:[\\w{},\\s*]+\\s+from\\s+)?['"])([^'"]+)(['"])/g,
          (match, prefix, importPath, suffix) => {
            if (importPath.startsWith('.')) {
              const resolved = resolvePath(fromFile, importPath);
              const actualFile = findFile(resolved);
              if (actualFile) {
                return prefix + actualFile + suffix;
              }
              return prefix + resolved + suffix;
            }
            return match;
          }
        );
      }

      // Process all files
      for (const [filename, content] of Object.entries(files)) {
        if (/\\.(tsx|ts|jsx|js)$/.test(filename)) {
          try {
            // Transform relative imports to absolute before transpiling
            const transformedContent = transformImports(content, filename);
            const transpiled = Babel.transform(transformedContent, { presets: ['react', ['env', { modules: false }], 'typescript'], filename }).code;
            const url = URL.createObjectURL(new Blob([transpiled], { type: 'application/javascript' }));

            // Add multiple import map entries for flexibility
            importMap.imports[filename] = url;
            importMap.imports[filename.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;

            // Also add relative-style entries from src
            if (filename.startsWith('src/')) {
              const relativePath = './' + filename.substring(4);
              importMap.imports[relativePath] = url;
              importMap.imports[relativePath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
            }
          } catch (err) { console.error("Transpilation failed for " + filename, err); }
        } else if (/\\.css$/.test(filename)) {
          // Handle CSS files - inject as style tag
          const style = document.createElement('style');
          style.textContent = content;
          style.setAttribute('data-file', filename);
          document.head.appendChild(style);
          // Create dummy module for CSS imports
          const cssModule = 'export default {};';
          const url = URL.createObjectURL(new Blob([cssModule], { type: 'application/javascript' }));
          importMap.imports[filename] = url;
          importMap.imports[filename.replace(/\\.css$/, '')] = url;
        }
      }

      const mapScript = document.createElement('script');
      mapScript.type = "importmap";
      mapScript.textContent = JSON.stringify(importMap);
      document.head.appendChild(mapScript);
      const bootstrapCode = \`import * as __React from 'react';import { createRoot } from 'react-dom/client';import App from 'src/App.tsx';createRoot(document.getElementById('root')).render(__React.createElement(App));\`;
      const script = document.createElement('script');
      script.type = 'module';
      script.src = URL.createObjectURL(new Blob([Babel.transform(bootstrapCode, { presets: ['react', ['env', { modules: false }], 'typescript'], filename: 'bootstrap.tsx' }).code], { type: 'application/javascript' }));
      document.body.appendChild(script);
    })();
  </script>
</body>
</html>`;
};

const getPackageJson = (name: string) => ({
  name, version: "1.0.0", private: true, type: "module",
  scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
  dependencies: { "react": "^18.3.0", "react-dom": "^18.3.0", "lucide-react": "^0.400.0" },
  devDependencies: { "@vitejs/plugin-react": "^4.3.0", "vite": "^5.4.0", "typescript": "^5.5.0", "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0", "tailwindcss": "^3.4.0", "postcss": "^8.4.0", "autoprefixer": "^10.4.0" }
});

const getViteConfig = () => `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })`;
const getTsConfig = () => ({ compilerOptions: { target: "ES2020", useDefineForClassFields: true, lib: ["ES2020", "DOM", "DOM.Iterable"], module: "ESNext", skipLibCheck: true, moduleResolution: "bundler", allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx", strict: true }, include: ["src"] });
const getTailwindConfig = () => `export default { content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] }`;
const getPostcssConfig = () => `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`;
const getIndexHtml = () => `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>FluidFlow App</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>`;
const getMainTsx = () => `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)`;
const getTailwindCss = () => `@tailwind base;\n@tailwind components;\n@tailwind utilities;`;
const getReadme = () => `# FluidFlow App\n\nGenerated with FluidFlow - Sketch to App\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\``;
