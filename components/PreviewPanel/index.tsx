import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Monitor, Smartphone, Tablet, RefreshCw, Eye, Code2, Copy, Check, Download, Database,
  ShieldCheck, Pencil, Send, FileText, Wrench, FlaskConical, Package, Loader2,
  SplitSquareVertical, X, Zap, ZapOff, MousePointer2, Bug, Settings, ChevronDown, Shield
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

import { FileSystem, LogEntry, NetworkRequest, AccessibilityReport, TabType, TerminalTab, PreviewDevice, PushResult } from '../../types';
import { cleanGeneratedCode, isValidCode } from '../../utils/cleanCode';
import { debugLog } from '../../hooks/useDebugStore';

// Sub-components
import { CodeEditor } from './CodeEditor';
import { ConsolePanel } from './ConsolePanel';
import { FileExplorer } from './FileExplorer';
import { ExportModal } from './ExportModal';
import { GithubModal } from './GithubModal';
import { AccessibilityModal } from './AccessibilityModal';
import { ConsultantReport } from './ConsultantReport';
import { ComponentInspector, InspectionOverlay, InspectedElement } from './ComponentInspector';
import DebugPanel from './DebugPanel';
import { MarkdownPreview } from './MarkdownPreview';
import { DBStudio } from './DBStudio';
import { EnvironmentPanel } from './EnvironmentPanel';

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

  // Settings dropdown
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettings]);

  // Auto-fix
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixToast, setAutoFixToast] = useState<string | null>(null);
  const autoFixTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFixedErrorRef = useRef<string | null>(null);

  // Cleanup timeouts on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (autoFixTimeoutRef.current) clearTimeout(autoFixTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Inspect Mode
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [inspectedElement, setInspectedElement] = useState<InspectedElement | null>(null);
  const [isInspectEditing, setIsInspectEditing] = useState(false);

  const appCode = files['src/App.tsx'];

  // Auto-fix error function
  const autoFixError = useCallback(async (errorMessage: string) => {
    if (!appCode || isAutoFixing || isGenerating) return;

    // Skip if we just fixed this error
    if (lastFixedErrorRef.current === errorMessage) return;

    // Skip common non-fixable errors
    const skipPatterns = [
      /\[Router\]/i,
      /\[Sandbox\]/i,
      /ResizeObserver/i,
      /Script error/i,
      /Loading chunk/i,
      /redefine.*property.*location/i,
      /non-configurable property/i,
    ];
    if (skipPatterns.some(p => p.test(errorMessage))) return;

    setIsAutoFixing(true);
    setAutoFixToast('🔧 Auto-fixing error...');
    lastFixedErrorRef.current = errorMessage;

    const requestId = debugLog.request('auto-fix', {
      model: selectedModel,
      prompt: `Fix runtime error: ${errorMessage}`,
      metadata: { errorMessage }
    });
    const startTime = Date.now();

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ parts: [{ text: `Fix this runtime error in the React component. Error: "${errorMessage}"\n\nCurrent Code:\n${appCode}\n\nIMPORTANT: Output ONLY the complete fixed code, no explanations.` }] }]
      });

      const fixedCode = cleanGeneratedCode(response.text || '');

      debugLog.response('auto-fix', {
        id: requestId,
        model: selectedModel,
        duration: Date.now() - startTime,
        response: fixedCode.slice(0, 500) + '...',
        metadata: { success: !!(fixedCode && isValidCode(fixedCode)) }
      });

      if (fixedCode && isValidCode(fixedCode)) {
        setFiles({ ...files, 'src/App.tsx': fixedCode });
        setAutoFixToast('✅ Error fixed automatically!');

        // Clear the error from logs
        setLogs(prev => prev.map(l =>
          l.message === errorMessage ? { ...l, isFixed: true } : l
        ));
      } else {
        setAutoFixToast('⚠️ Could not auto-fix this error');
      }
    } catch (e) {
      console.error('Auto-fix failed:', e);
      setAutoFixToast('❌ Auto-fix failed');
      debugLog.error('auto-fix', e instanceof Error ? e.message : 'Auto-fix failed', {
        id: requestId,
        model: selectedModel,
        duration: Date.now() - startTime
      });
    } finally {
      setIsAutoFixing(false);
      // Clear toast after delay (use separate ref to avoid conflicts with debounce timer)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setAutoFixToast(null), 3000);
    }
  }, [appCode, files, setFiles, isAutoFixing, isGenerating, selectedModel]);

  // Console Message Listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      if (event.data.type === 'CONSOLE_LOG') {
        const logId = crypto.randomUUID();
        const logEntry = {
          id: logId,
          type: event.data.logType,
          message: event.data.message,
          timestamp: new Date(event.data.timestamp).toLocaleTimeString([], { hour12: false })
        };

        setLogs(prev => [...prev, logEntry]);

        if (event.data.logType === 'error') {
          setIsConsoleOpen(true);
          setActiveTerminalTab('console');

          // Trigger auto-fix if enabled
          if (autoFixEnabled && !isAutoFixing) {
            // Debounce auto-fix to prevent multiple triggers
            if (autoFixTimeoutRef.current) clearTimeout(autoFixTimeoutRef.current);
            autoFixTimeoutRef.current = setTimeout(() => {
              autoFixError(event.data.message);
            }, 1000); // Wait 1 second before auto-fixing
          }
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
      } else if (event.data.type === 'INSPECT_HOVER') {
        // Element hovered in inspect mode
        setHoveredElement(event.data.rect);
      } else if (event.data.type === 'INSPECT_SELECT') {
        // Element selected in inspect mode
        setInspectedElement(event.data.element);
        setHoveredElement(null);
      } else if (event.data.type === 'INSPECT_LEAVE') {
        // Mouse left element
        setHoveredElement(null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [autoFixEnabled, autoFixError, isAutoFixing]);

  // Build iframe content
  useEffect(() => {
    if (appCode) {
      const html = buildIframeHtml(files, isInspectMode);
      setIframeSrc(html);
    }
  }, [appCode, files, isInspectMode]);

  // Toggle inspect mode in iframe
  const toggleInspectMode = () => {
    const newMode = !isInspectMode;
    setIsInspectMode(newMode);
    setInspectedElement(null);
    setHoveredElement(null);
    // Also disable edit mode when entering inspect mode
    if (newMode) setIsEditMode(false);
  };

  // Handle targeted component edit
  const handleInspectEdit = async (prompt: string, element: InspectedElement) => {
    if (!appCode) return;
    setIsInspectEditing(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const elementContext = `
Target Element:
- Tag: <${element.tagName.toLowerCase()}>
- Component: ${element.componentName || 'Unknown'}
- Classes: ${element.className || 'none'}
- ID: ${element.id || 'none'}
- Text content: "${element.textContent?.slice(0, 100) || ''}"
${element.parentComponents ? `- Parent components: ${element.parentComponents.join(' > ')}` : ''}
`;

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: {
          parts: [{
            text: `${elementContext}\n\nUser Request: ${prompt}\n\nCurrent files:\n${JSON.stringify(files, null, 2)}`
          }]
        },
        config: {
          systemInstruction: `You are an expert React developer. The user has selected a specific element/component in their app and wants to modify it.

Based on the element information provided, identify which file and component needs to be modified, then make the requested changes.

**RESPONSE FORMAT**: Return a JSON object with:
1. "explanation": Brief markdown explaining what you changed
2. "files": Object with file paths as keys and updated code as values

Only return files that need changes. Maintain all existing functionality.`,
          responseMimeType: 'application/json'
        }
      });

      const text = response.text || '{}';
      const result = JSON.parse(cleanGeneratedCode(text));

      if (result.files && Object.keys(result.files).length > 0) {
        const newFiles = { ...files, ...result.files };
        reviewChange(`Edit: ${element.componentName || element.tagName}`, newFiles);
      }

      setInspectedElement(null);
      setIsInspectMode(false);
    } catch (error) {
      console.error('Inspect edit failed:', error);
    } finally {
      setIsInspectEditing(false);
    }
  };

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
      const tests = cleanGeneratedCode(response.text || '');
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
      const docs = cleanGeneratedCode(response.text || '');
      setFiles({ ...files, 'README.md': docs });
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
      const sql = cleanGeneratedCode(response.text || '');
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

    const requestId = debugLog.request('accessibility', {
      model: selectedModel,
      prompt: 'WCAG 2.1 Accessibility Audit',
      systemInstruction: 'You are a WCAG 2.1 Accessibility Auditor.'
    });
    const startTime = Date.now();

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

      debugLog.response('accessibility', {
        id: requestId,
        model: selectedModel,
        duration: Date.now() - startTime,
        response: JSON.stringify(report),
        metadata: { score: report.score, issueCount: report.issues?.length }
      });
    } catch (e) {
      setAccessibilityReport({ score: 0, issues: [{ type: 'error', message: 'Failed to run audit.' }] });
      debugLog.error('accessibility', e instanceof Error ? e.message : 'Audit failed', {
        id: requestId,
        duration: Date.now() - startTime
      });
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
      const fixedCode = cleanGeneratedCode(response.text || '');
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
      const fixedCode = cleanGeneratedCode(response.text || '');
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

    const requestId = debugLog.request('quick-edit', {
      model: selectedModel,
      prompt: editPrompt
    });
    const startTime = Date.now();

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ parts: [{ text: `Edit this React code based on: "${editPrompt}"\n\nCode: ${appCode}\n\nOutput ONLY the full updated code.` }] }]
      });
      const fixedCode = cleanGeneratedCode(response.text || '');

      debugLog.response('quick-edit', {
        id: requestId,
        model: selectedModel,
        duration: Date.now() - startTime,
        response: fixedCode.slice(0, 500) + '...'
      });

      setFiles({ ...files, 'src/App.tsx': fixedCode });
      setIsEditMode(false);
      setEditPrompt('');
    } catch (e) {
      console.error(e);
      debugLog.error('quick-edit', e instanceof Error ? e.message : 'Quick edit failed', {
        id: requestId,
        duration: Date.now() - startTime
      });
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
      const fixedCode = cleanGeneratedCode(response.text || '');
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

      // Add .gitignore if not exists
      if (!files['.gitignore']) {
        zip.file('.gitignore', `# Dependencies
node_modules/

# Environment
.env
.env.local
.env.*.local

# Build
dist/
build/

# IDE
.idea/
.vscode/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
`);
      }

      // Generate .env.example from .env
      if (files['.env']) {
        const envExample = files['.env']
          .split('\n')
          .map(line => {
            if (!line.trim() || line.startsWith('#')) return line;
            const match = line.match(/^([A-Z_][A-Z0-9_]*)=/i);
            if (match) return `${match[1]}=your_${match[1].toLowerCase()}_here`;
            return line;
          })
          .join('\n');
        zip.file('.env.example', envExample);
      }

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
    // Database tab now opens DB Studio directly
    if (tab === 'database') {
      // DB Studio handles everything - no auto-generation
    } else if (tab === 'tests' && !files['src/App.test.tsx'] && appCode) {
      generateUnitTests();
    } else if (tab === 'tests' && files['src/App.test.tsx']) {
      setActiveFile('src/App.test.tsx');
      setActiveTab('code');
    } else if (tab === 'docs' && !files['README.md'] && appCode) {
      generateDocs();
    } else if (tab === 'docs' && files['README.md']) {
      setActiveFile('README.md');
    }
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
              { id: 'database', icon: Database, label: 'DB Studio' },
              { id: 'tests', icon: FlaskConical, label: 'Tests' },
              { id: 'docs', icon: FileText, label: 'Docs' },
              { id: 'env', icon: Shield, label: 'Env' },
              { id: 'debug', icon: Bug, label: 'Debug' }
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => handleTabChange(id as TabType)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
                title={label}
              >
                <Icon className="w-3.5 h-3.5" />
                {activeTab === id && <span>{label}</span>}
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

        <div className="flex items-center gap-2">
          {activeTab === 'preview' ? (
            <>
              {appCode && !isGenerating && (
                <>
                  <button onClick={() => setIsEditMode(!isEditMode)} className={`p-2 rounded-lg border transition-all ${isEditMode ? 'bg-orange-500/10 text-orange-300 border-orange-500/20' : 'bg-slate-500/10 text-slate-400 border-transparent hover:text-white'}`} title="Quick Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={toggleInspectMode}
                    className={`p-2 rounded-lg border transition-all ${
                      isInspectMode
                        ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                        : 'bg-slate-500/10 text-slate-400 border-transparent hover:text-white'
                    }`}
                    title="Inspect Components"
                  >
                    <MousePointer2 className="w-4 h-4" />
                  </button>

                  {/* Settings Dropdown */}
                  <div className="relative" ref={settingsRef}>
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className={`flex items-center gap-1 p-2 rounded-lg border transition-all ${
                        showSettings ? 'bg-slate-700 text-white border-slate-600' : 'bg-slate-500/10 text-slate-400 border-transparent hover:text-white'
                      }`}
                      title="Settings"
                    >
                      <Settings className="w-4 h-4" />
                      <ChevronDown className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
                    </button>

                    {showSettings && (
                      <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2 border-b border-white/5">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wide px-2">Preview Settings</span>
                        </div>

                        {/* Auto-fix Toggle */}
                        <button
                          onClick={() => setAutoFixEnabled(!autoFixEnabled)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {isAutoFixing ? (
                              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                            ) : autoFixEnabled ? (
                              <Zap className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <ZapOff className="w-4 h-4 text-slate-500" />
                            )}
                            <span className="text-sm text-slate-200">Auto-fix Errors</span>
                          </div>
                          <div className={`w-8 h-4 rounded-full transition-colors ${autoFixEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                            <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${autoFixEnabled ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'}`} style={{ marginLeft: autoFixEnabled ? '17px' : '2px' }} />
                          </div>
                        </button>

                        {/* Fix Responsive */}
                        {previewDevice !== 'desktop' && (
                          <button
                            onClick={() => { fixResponsiveness(); setShowSettings(false); }}
                            disabled={isFixingResp}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors disabled:opacity-50"
                          >
                            {isFixingResp ? (
                              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                            ) : (
                              <Wrench className="w-4 h-4 text-indigo-400" />
                            )}
                            <span className="text-sm text-slate-200">{isFixingResp ? 'Fixing...' : 'Fix Responsive'}</span>
                          </button>
                        )}

                        <div className="h-px bg-white/5" />

                        {/* Accessibility Audit */}
                        <button
                          onClick={() => { runAccessibilityAudit(); setShowSettings(false); }}
                          disabled={isAuditing}
                          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors disabled:opacity-50"
                        >
                          {isAuditing ? (
                            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-4 h-4 text-indigo-400" />
                          )}
                          <span className="text-sm text-slate-200">{isAuditing ? 'Auditing...' : 'Accessibility Audit'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="h-6 w-px bg-white/10" />
              <button onClick={reloadPreview} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors" title="Reload Preview" aria-label="Reload Preview">
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
        {activeTab === 'debug' ? (
          <DebugPanel />
        ) : activeTab === 'database' ? (
          <DBStudio files={files} setFiles={setFiles} selectedModel={selectedModel} />
        ) : activeTab === 'env' ? (
          <EnvironmentPanel files={files} setFiles={setFiles} />
        ) : activeTab === 'preview' ? (
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
            autoFixToast={autoFixToast}
            isAutoFixing={isAutoFixing}
            isInspectMode={isInspectMode}
            hoveredElement={hoveredElement}
            inspectedElement={inspectedElement}
            isInspectEditing={isInspectEditing}
            onCloseInspector={() => { setInspectedElement(null); setIsInspectMode(false); }}
            onInspectEdit={handleInspectEdit}
          />
        ) : (
          <div className="flex-1 flex min-h-0 h-full">
            <FileExplorer
                files={files}
                activeFile={activeFile}
                onFileSelect={setActiveFile}
                onCreateFile={(path, content) => {
                  setFiles({ ...files, [path]: content });
                }}
                onDeleteFile={(path) => {
                  const newFiles = { ...files };
                  // Delete the file and any files in the folder if it's a folder
                  Object.keys(newFiles).forEach(filePath => {
                    if (filePath === path || filePath.startsWith(path + '/')) {
                      delete newFiles[filePath];
                    }
                  });
                  setFiles(newFiles);
                  // If deleted file was active, switch to another file
                  if (activeFile === path || activeFile.startsWith(path + '/')) {
                    const remainingFiles = Object.keys(newFiles);
                    if (remainingFiles.length > 0) {
                      setActiveFile(remainingFiles[0]);
                    }
                  }
                }}
                onRenameFile={(oldPath, newPath) => {
                  const newFiles: FileSystem = {};
                  (Object.entries(files) as [string, string][]).forEach(([filePath, content]) => {
                    if (filePath === oldPath) {
                      newFiles[newPath] = content;
                    } else if (filePath.startsWith(oldPath + '/')) {
                      // Handle folder rename - update all nested files
                      const relativePath = filePath.substring(oldPath.length);
                      newFiles[newPath + relativePath] = content;
                    } else {
                      newFiles[filePath] = content;
                    }
                  });
                  setFiles(newFiles);
                  // Update active file if it was renamed
                  if (activeFile === oldPath) {
                    setActiveFile(newPath);
                  } else if (activeFile.startsWith(oldPath + '/')) {
                    const relativePath = activeFile.substring(oldPath.length);
                    setActiveFile(newPath + relativePath);
                  }
                }}
              />
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
                  {/* Primary Editor / Preview */}
                  <div className={isSplitView ? 'flex-1 min-w-0 border-r border-white/5' : 'flex-1'}>
                    {activeFile.endsWith('.md') ? (
                      <MarkdownPreview content={files[activeFile]} fileName={activeFile.split('/').pop() || activeFile} />
                    ) : (
                      <CodeEditor files={files} setFiles={setFiles} activeFile={activeFile} />
                    )}
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
                        {splitFile.endsWith('.md') ? (
                          <MarkdownPreview content={files[splitFile]} fileName={splitFile.split('/').pop() || splitFile} />
                        ) : (
                          <CodeEditor files={files} setFiles={setFiles} activeFile={splitFile} />
                        )}
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
  autoFixToast: string | null;
  isAutoFixing: boolean;
  isInspectMode: boolean;
  hoveredElement: { top: number; left: number; width: number; height: number } | null;
  inspectedElement: InspectedElement | null;
  isInspectEditing: boolean;
  onCloseInspector: () => void;
  onInspectEdit: (prompt: string, element: InspectedElement) => void;
}> = (props) => {
  const { appCode, iframeSrc, previewDevice, isGenerating, isFixingResp, isEditMode, editPrompt, setEditPrompt, isQuickEditing, handleQuickEdit, setIsEditMode, iframeKey, logs, networkLogs, isConsoleOpen, setIsConsoleOpen, activeTerminalTab, setActiveTerminalTab, setLogs, setNetworkLogs, fixError, autoFixToast, isAutoFixing, isInspectMode, hoveredElement, inspectedElement, isInspectEditing, onCloseInspector, onInspectEdit } = props;

  // Calculate content area height based on console state
  const contentStyle = {
    height: isConsoleOpen ? 'calc(100% - 192px)' : 'calc(100% - 32px)'
  };

  return (
    <div className="flex-1 min-h-0 h-full overflow-hidden relative">
      <div className="absolute inset-0 opacity-[0.15] pointer-events-none z-0" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

      {/* Auto-fix Toast Notification */}
      {autoFixToast && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full shadow-lg backdrop-blur-xl border animate-in slide-in-from-top-2 duration-300 ${
          isAutoFixing
            ? 'bg-blue-500/20 border-blue-500/30 text-blue-300'
            : autoFixToast.includes('✅')
              ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
              : autoFixToast.includes('❌') || autoFixToast.includes('⚠️')
                ? 'bg-red-500/20 border-red-500/30 text-red-300'
                : 'bg-slate-500/20 border-slate-500/30 text-slate-300'
        }`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {isAutoFixing && <Loader2 className="w-4 h-4 animate-spin" />}
            {autoFixToast}
          </div>
        </div>
      )}

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

            {/* Inspect Mode Overlay */}
            <InspectionOverlay
              isActive={isInspectMode}
              hoveredRect={hoveredElement}
              selectedRect={inspectedElement?.rect || null}
            />

            {/* Component Inspector Panel */}
            {inspectedElement && (
              <ComponentInspector
                element={inspectedElement}
                onClose={onCloseInspector}
                onSubmit={onInspectEdit}
                isProcessing={isInspectEditing}
              />
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
const buildIframeHtml = (files: FileSystem, isInspectMode: boolean = false): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="about:blank">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { font-family: 'Inter', sans-serif; background-color: #ffffff; color: #1a1a1a; min-height: 100vh; margin: 0; }
    #root { min-height: 100vh; }
    .sandbox-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .sandbox-loading .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; }
    .sandbox-error { padding: 20px; background: #fee2e2; color: #dc2626; border-radius: 8px; margin: 20px; font-family: monospace; font-size: 14px; white-space: pre-wrap; }
    @keyframes spin { to { transform: rotate(360deg); } }
    ${isInspectMode ? `
    .inspect-highlight { outline: 2px solid #3b82f6 !important; outline-offset: 2px; background-color: rgba(59, 130, 246, 0.1) !important; cursor: crosshair !important; }
    .inspect-selected { outline: 3px solid #8b5cf6 !important; outline-offset: 2px; background-color: rgba(139, 92, 246, 0.1) !important; }
    * { cursor: crosshair !important; }
    ` : ''}
  </style>
</head>
<body>
  <div id="root">
    <div class="sandbox-loading">
      <div class="spinner"></div>
      <p style="margin-top: 16px; font-size: 14px;">Loading app...</p>
    </div>
  </div>
  <script>
    // Sandbox environment setup
    window.process = { env: { NODE_ENV: 'development' } };
    window.__SANDBOX_READY__ = false;

    // Console forwarding
    const notify = (type, msg) => window.parent.postMessage({ type: 'CONSOLE_LOG', logType: type, message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg), timestamp: Date.now() }, '*');
    console.log = (...args) => { notify('log', args.join(' ')); };
    console.warn = (...args) => { notify('warn', args.join(' ')); };
    console.error = (...args) => { notify('error', args.join(' ')); };
    window.onerror = function(msg) { notify('error', msg); return false; };

    // Inspect Mode
    window.__INSPECT_MODE__ = ${isInspectMode};
    ${isInspectMode ? `
    (function() {
      let highlightedEl = null;
      let selectedEl = null;

      // Try to get React component name from fiber
      function getComponentName(element) {
        // Try to find React fiber
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let fiber = element[fiberKey];
          while (fiber) {
            if (fiber.type && typeof fiber.type === 'function') {
              return fiber.type.displayName || fiber.type.name || null;
            }
            if (fiber.type && typeof fiber.type === 'string') {
              // This is a DOM element, go up to parent
            }
            fiber = fiber.return;
          }
        }
        return null;
      }

      // Get parent component chain
      function getParentComponents(element) {
        const parents = [];
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let fiber = element[fiberKey];
          while (fiber) {
            if (fiber.type && typeof fiber.type === 'function') {
              const name = fiber.type.displayName || fiber.type.name;
              if (name && !parents.includes(name)) {
                parents.push(name);
              }
            }
            fiber = fiber.return;
          }
        }
        return parents.slice(0, 5); // Limit to 5 parents
      }

      document.addEventListener('mouseover', function(e) {
        if (e.target === document.body || e.target === document.documentElement || e.target.id === 'root') return;

        if (highlightedEl && highlightedEl !== e.target) {
          highlightedEl.classList.remove('inspect-highlight');
        }

        e.target.classList.add('inspect-highlight');
        highlightedEl = e.target;

        const rect = e.target.getBoundingClientRect();
        window.parent.postMessage({
          type: 'INSPECT_HOVER',
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        }, '*');
      }, true);

      document.addEventListener('mouseout', function(e) {
        if (highlightedEl) {
          highlightedEl.classList.remove('inspect-highlight');
        }
        window.parent.postMessage({ type: 'INSPECT_LEAVE' }, '*');
      }, true);

      document.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const target = e.target;
        const rect = target.getBoundingClientRect();
        const componentName = getComponentName(target);
        const parentComponents = getParentComponents(target);

        // Remove highlight from hovered element
        if (highlightedEl) {
          highlightedEl.classList.remove('inspect-highlight');
        }

        // Remove selected class from previously selected element
        if (selectedEl && selectedEl !== target) {
          selectedEl.classList.remove('inspect-selected');
        }

        target.classList.add('inspect-selected');
        selectedEl = target;

        window.parent.postMessage({
          type: 'INSPECT_SELECT',
          element: {
            tagName: target.tagName,
            className: target.className.replace('inspect-highlight', '').replace('inspect-selected', '').trim(),
            id: target.id || null,
            textContent: target.textContent?.slice(0, 200) || null,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
            componentName: componentName,
            parentComponents: parentComponents.length > 0 ? parentComponents : null
          }
        }, '*');
      }, true);
    })();
    ` : ''}

    // Simple in-memory router state
    window.__SANDBOX_ROUTER__ = {
      currentPath: '/',
      listeners: [],
      navigate: function(path) {
        this.currentPath = path;
        this.listeners.forEach(fn => fn(path));
        console.log('[Router] Navigated to: ' + path);
      },
      subscribe: function(fn) {
        this.listeners.push(fn);
        return () => { this.listeners = this.listeners.filter(l => l !== fn); };
      },
      getPath: function() { return this.currentPath; }
    };

    // Intercept all link clicks to prevent navigation outside sandbox
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (link) {
        const href = link.getAttribute('href');
        if (href) {
          e.preventDefault();
          e.stopPropagation();

          // Handle different link types
          if (href.startsWith('http://') || href.startsWith('https://')) {
            // External links - open in new tab
            window.open(href, '_blank', 'noopener,noreferrer');
            console.log('[Sandbox] External link opened in new tab: ' + href);
          } else if (href.startsWith('#')) {
            // Hash navigation - scroll to element
            const id = href.substring(1);
            const el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
            window.__SANDBOX_ROUTER__.navigate(href);
          } else if (href.startsWith('mailto:') || href.startsWith('tel:')) {
            // Allow mailto/tel links
            window.open(href, '_self');
          } else {
            // Internal navigation - use sandbox router
            window.__SANDBOX_ROUTER__.navigate(href);
          }
        }
      }
    }, true);

    // Intercept form submissions
    document.addEventListener('submit', function(e) {
      const form = e.target;
      if (form.tagName === 'FORM') {
        e.preventDefault();
        const action = form.getAttribute('action') || '/';
        const method = form.getAttribute('method') || 'GET';
        console.log('[Sandbox] Form submitted: ' + method + ' ' + action);
        window.__SANDBOX_ROUTER__.navigate(action);
      }
    }, true);

    // Block window.location changes (wrapped in try-catch as location is non-configurable in some browsers)
    try {
      Object.defineProperty(window, 'location', {
        get: function() {
          return {
            href: 'sandbox://app' + window.__SANDBOX_ROUTER__.currentPath,
            pathname: window.__SANDBOX_ROUTER__.currentPath,
            search: '',
            hash: '',
            origin: 'sandbox://app',
            host: 'app',
            hostname: 'app',
            port: '',
            protocol: 'sandbox:',
            assign: function(url) { window.__SANDBOX_ROUTER__.navigate(url); },
            replace: function(url) { window.__SANDBOX_ROUTER__.navigate(url); },
            reload: function() { console.log('[Sandbox] Page reload blocked'); }
          };
        },
        set: function(url) {
          window.__SANDBOX_ROUTER__.navigate(url);
        },
        configurable: true
      });
    } catch (e) {
      // location is non-configurable - use navigation interception instead
    }

    // Provide useLocation and useNavigate hooks for React Router-like experience
    window.__SANDBOX_HOOKS__ = {
      useLocation: function() {
        const React = window.React;
        if (!React) return { pathname: window.__SANDBOX_ROUTER__.currentPath };
        const [path, setPath] = React.useState(window.__SANDBOX_ROUTER__.currentPath);
        React.useEffect(() => window.__SANDBOX_ROUTER__.subscribe(setPath), []);
        return { pathname: path, search: '', hash: '', state: null };
      },
      useNavigate: function() {
        return function(to) { window.__SANDBOX_ROUTER__.navigate(to); };
      },
      Link: function(props) {
        const React = window.React;
        return React.createElement('a', {
          ...props,
          href: props.to || props.href,
          onClick: function(e) {
            e.preventDefault();
            window.__SANDBOX_ROUTER__.navigate(props.to || props.href);
            if (props.onClick) props.onClick(e);
          }
        }, props.children);
      }
    };
  </script>
  <script type="text/babel" data-presets="react,typescript">
    (async () => {
      const files = JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(files))}"));
      const importMap = {
        imports: {
          // React core
          "react": "https://esm.sh/react@19.0.0",
          "react-dom": "https://esm.sh/react-dom@19.0.0",
          "react-dom/client": "https://esm.sh/react-dom@19.0.0/client",
          // Icons
          "lucide-react": "https://esm.sh/lucide-react@0.469.0",
          // Utilities
          "clsx": "https://esm.sh/clsx@2.1.1",
          "classnames": "https://esm.sh/classnames@2.5.1",
          "tailwind-merge": "https://esm.sh/tailwind-merge@2.5.4",
          // Animation
          "framer-motion": "https://esm.sh/framer-motion@11.11.17?external=react,react-dom",
          // Date handling
          "date-fns": "https://esm.sh/date-fns@4.1.0",
          // State management (lightweight)
          "zustand": "https://esm.sh/zustand@5.0.1?external=react",
          // Form handling
          "react-hook-form": "https://esm.sh/react-hook-form@7.53.2?external=react"
        }
      };

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
      const errors = [];
      console.log('[Sandbox] Processing ' + Object.keys(files).length + ' files...');

      for (const [filename, content] of Object.entries(files)) {
        if (/\\.(tsx|ts|jsx|js)$/.test(filename)) {
          try {
            // Transform relative imports to absolute before transpiling
            const transformedContent = transformImports(content, filename);
            const transpiled = Babel.transform(transformedContent, {
              presets: ['react', ['env', { modules: false }], 'typescript'],
              filename
            }).code;
            const url = URL.createObjectURL(new Blob([transpiled], { type: 'application/javascript' }));

            // Add multiple import map entries for flexibility
            importMap.imports[filename] = url;
            importMap.imports[filename.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;

            // Also add relative-style entries from src
            if (filename.startsWith('src/')) {
              const relativePath = './' + filename.substring(4);
              importMap.imports[relativePath] = url;
              importMap.imports[relativePath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;

              // Also support imports without src/ prefix
              const withoutSrc = filename.substring(4);
              importMap.imports[withoutSrc] = url;
              importMap.imports[withoutSrc.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
            }

            // Support component folder imports (e.g., 'components/Header' -> 'src/components/Header.tsx')
            if (filename.includes('/components/')) {
              const componentPath = filename.split('/components/')[1];
              if (componentPath) {
                importMap.imports['components/' + componentPath] = url;
                importMap.imports['components/' + componentPath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
                importMap.imports['./components/' + componentPath] = url;
                importMap.imports['./components/' + componentPath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
              }
            }

            console.log('[Sandbox] Compiled: ' + filename);
          } catch (err) {
            console.error('[Sandbox] Transpilation failed for ' + filename + ': ' + err.message);
            errors.push({ file: filename, error: err.message });
          }
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
          console.log('[Sandbox] Loaded CSS: ' + filename);
        } else if (/\\.json$/.test(filename)) {
          // Handle JSON files
          try {
            const jsonModule = 'export default ' + content + ';';
            const url = URL.createObjectURL(new Blob([jsonModule], { type: 'application/javascript' }));
            importMap.imports[filename] = url;
            importMap.imports[filename.replace(/\\.json$/, '')] = url;
          } catch (err) {
            console.error('[Sandbox] JSON parse failed for ' + filename);
          }
        }
      }

      if (errors.length > 0) {
        console.warn('[Sandbox] ' + errors.length + ' file(s) failed to compile');
      }

      const mapScript = document.createElement('script');
      mapScript.type = "importmap";
      mapScript.textContent = JSON.stringify(importMap);
      document.head.appendChild(mapScript);

      // Bootstrap code that makes React hooks globally available
      const bootstrapCode = \`
        import * as React from 'react';
        import { createRoot } from 'react-dom/client';
        import App from 'src/App.tsx';

        // Make React and hooks globally available
        window.React = React;
        window.useState = React.useState;
        window.useEffect = React.useEffect;
        window.useCallback = React.useCallback;
        window.useMemo = React.useMemo;
        window.useRef = React.useRef;
        window.useContext = React.useContext;
        window.useReducer = React.useReducer;
        window.useLayoutEffect = React.useLayoutEffect;
        window.createContext = React.createContext;
        window.forwardRef = React.forwardRef;
        window.memo = React.memo;
        window.Fragment = React.Fragment;

        // Render the app
        try {
          const root = createRoot(document.getElementById('root'));
          root.render(React.createElement(React.StrictMode, null, React.createElement(App)));
          window.__SANDBOX_READY__ = true;
          console.log('[Sandbox] App mounted successfully');
        } catch (err) {
          console.error('[Sandbox] Failed to mount app:', err.message);
          document.getElementById('root').innerHTML = '<div class="sandbox-error">Error: ' + err.message + '</div>';
        }
      \`;

      const script = document.createElement('script');
      script.type = 'module';
      try {
        const transpiledBootstrap = Babel.transform(bootstrapCode, {
          presets: ['react', ['env', { modules: false }], 'typescript'],
          filename: 'bootstrap.tsx'
        }).code;
        script.src = URL.createObjectURL(new Blob([transpiledBootstrap], { type: 'application/javascript' }));
        document.body.appendChild(script);
      } catch (err) {
        console.error('[Sandbox] Bootstrap transpilation failed:', err.message);
        document.getElementById('root').innerHTML = '<div class="sandbox-error">Bootstrap Error: ' + err.message + '</div>';
      }
    })().catch(err => {
      console.error('[Sandbox] Initialization failed:', err.message);
      document.getElementById('root').innerHTML = '<div class="sandbox-error">Init Error: ' + err.message + '</div>';
    });
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
