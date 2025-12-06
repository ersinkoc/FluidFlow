import React, { useEffect, useState, useRef } from 'react';
import { Monitor, Smartphone, Tablet, RefreshCw, Terminal, Eye, Code2, Copy, Check, Briefcase, X, Loader2, Download, Database, ShieldCheck, Sparkles, AlertTriangle, FlaskConical, FileCode, Pencil, Send, FileText, Wrench, ChevronUp, ChevronDown, Trash2, Wifi, Folder, FileJson, File as FileIcon, ChevronRight, Github, ExternalLink, Package } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FileSystem } from '../App';

interface PreviewPanelProps {
    files: FileSystem;
    setFiles: (files: FileSystem) => void;
    activeFile: string;
    setActiveFile: (file: string) => void;
    suggestions: string[] | null;
    setSuggestions: (s: string[] | null) => void;
    isGenerating: boolean;
    reviewChange: (label: string, newFiles: FileSystem) => void;
}

interface AccessibilityIssue {
    type: 'error' | 'warning';
    message: string;
}

interface AccessibilityReport {
    score: number;
    issues: AccessibilityIssue[];
}

interface LogEntry {
    type: 'log' | 'warn' | 'error';
    message: string;
    timestamp: string;
    isFixing?: boolean;
    isFixed?: boolean;
}

interface NetworkRequest {
    id: string;
    method: string;
    url: string;
    status: number | string;
    duration: number;
    timestamp: string;
}

export const PreviewPanel = ({ files, setFiles, activeFile, setActiveFile, suggestions, setSuggestions, isGenerating, reviewChange }: PreviewPanelProps) => {
    const [iframeSrc, setIframeSrc] = useState<string>('');
    const [key, setKey] = useState(0); // To force iframe reload
    const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'database' | 'tests' | 'docs'>('preview');
    const [isCopied, setIsCopied] = useState(false);

    // Device Preview State
    const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
    const [isFixingResp, setIsFixingResp] = useState(false);

    // Loading States
    const [isGeneratingDB, setIsGeneratingDB] = useState(false);
    const [isGeneratingTests, setIsGeneratingTests] = useState(false);
    const [isGeneratingDocs, setIsGeneratingDocs] = useState(false);

    // Accessibility State
    const [accessibilityReport, setAccessibilityReport] = useState<AccessibilityReport | null>(null);
    const [isAuditing, setIsAuditing] = useState(false);
    const [isFixing, setIsFixing] = useState(false);
    const [showAccessReport, setShowAccessReport] = useState(false);


    // Quick Edit State
    const [isEditMode, setIsEditMode] = useState(false);
    const [editPrompt, setEditPrompt] = useState('');
    const [isQuickEditing, setIsQuickEditing] = useState(false);

    // Export State
    const [showExportModal, setShowExportModal] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showGithubModal, setShowGithubModal] = useState(false);
    const [githubToken, setGithubToken] = useState('');
    const [repoName, setRepoName] = useState('fluidflow-app');
    const [isPushing, setIsPushing] = useState(false);
    const [pushResult, setPushResult] = useState<{ success: boolean; url?: string; error?: string } | null>(null);

    // Console/Terminal State
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [networkLogs, setNetworkLogs] = useState<NetworkRequest[]>([]);
    const [isConsoleOpen, setIsConsoleOpen] = useState(false);
    const [activeTerminalTab, setActiveTerminalTab] = useState<'console' | 'network'>('console');
    const consoleEndRef = useRef<HTMLDivElement>(null);

    // Derived check for if App exists
    const appCode = files['src/App.tsx'];


    // Console Message Listener
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (!event.data) return;

            if (event.data.type === 'CONSOLE_LOG') {
                setLogs(prev => [...prev, {
                    type: event.data.logType,
                    message: event.data.message,
                    timestamp: new Date(event.data.timestamp).toLocaleTimeString([], { hour12: false })
                }]);
                // Auto-open console on error
                if (event.data.logType === 'error') {
                    setIsConsoleOpen(true);
                    setActiveTerminalTab('console');
                }
            } else if (event.data.type === 'NETWORK_REQUEST') {
                setNetworkLogs(prev => [...prev, {
                    id: Math.random().toString(36).substr(2, 9),
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

    // Auto-scroll console
    useEffect(() => {
        if (isConsoleOpen && activeTerminalTab === 'console' && consoleEndRef.current) {
            consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isConsoleOpen, activeTerminalTab]);

    useEffect(() => {
        if (appCode) {
            const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
          <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
          <style>
            body { font-family: 'Inter', sans-serif; background-color: #020617; color: white; height: 100vh; overflow: auto; }
            ::-webkit-scrollbar { width: 6px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
            ${files['src/index.css'] || ''}
          </style>
        </head>
        <body>
          <div id="root"></div>
          
          <script>
             window.process = { env: { NODE_ENV: 'development' } };
             const notify = (type, msg) => {
                window.parent.postMessage({ 
                    type: 'CONSOLE_LOG', 
                    logType: type, 
                    message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg), 
                    timestamp: Date.now() 
                }, '*');
             };
             const originalLog = console.log;
             console.log = (...args) => {
                if (args[0] && typeof args[0] === 'string' && args[0].includes('You are using the in-browser Babel transformer')) return;
                notify('log', args.join(' '));
                originalLog(...args);
             };
             const originalWarn = console.warn;
             console.warn = (...args) => {
                if (args[0] && typeof args[0] === 'string' && args[0].includes('You are using the in-browser Babel transformer')) return;
                notify('warn', args.join(' '));
                originalWarn(...args);
             };
             const originalError = console.error;
             console.error = (...args) => {
                notify('error', args.join(' '));
                originalError(...args);
             };
             window.onerror = function(msg, url, line, col, error) {
                notify('error', msg);
                return false;
             };
          </script>

          <script type="text/babel" data-presets="react,typescript">
            (async () => {
              const files = JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(files))}"));
              
              for (const [path, content] of Object.entries(files)) {
                if (path.endsWith('.css')) {
                  const style = document.createElement('style');
                  style.textContent = content;
                  document.head.appendChild(style);
                }
              }

              Babel.registerPlugin('resolve-imports', {
                visitor: {
                  ImportDeclaration(path, state) {
                    const source = path.node.source.value;
                    if (!source.startsWith('.') && !source.startsWith('/')) return;
                    const currentFile = state.file.opts.filename;
                    const currentDir = currentFile.substring(0, currentFile.lastIndexOf('/'));
                    let resolved = source;
                    if (source.startsWith('./')) {
                        resolved = currentDir + source.substring(1);
                    } else if (source.startsWith('../')) {
                        const parts = currentDir.split('/');
                        parts.pop();
                        resolved = parts.join('/') + source.substring(2);
                    }
                    path.node.source.value = resolved;
                  }
                }
              });

              const importMap = { 
                imports: { 
                  "react": "https://esm.sh/react@19.0.0",
                  "react-dom/client": "https://esm.sh/react-dom@19.0.0/client",
                  "lucide-react": "https://esm.sh/lucide-react@0.469.0"
                } 
              };
              
              for (const [filename, content] of Object.entries(files)) {
                if (/\.(tsx|ts|jsx|js)$/.test(filename)) {
                   try {
                     const transpiled = Babel.transform(content, {
                        presets: ['react', ['env', { modules: false }], 'typescript'],
                        plugins: ['resolve-imports'],
                        filename: filename
                     }).code;
                     const blob = new Blob([transpiled], { type: 'application/javascript' });
                     const url = URL.createObjectURL(blob);
                     importMap.imports[filename] = url;
                     const noExt = filename.replace(/\.(tsx|ts|jsx|js)$/, '');
                     importMap.imports[noExt] = url;
                   } catch (err) {
                     console.error("Transpilation failed for " + filename, err);
                   }
                }
              }

              const mapScript = document.createElement('script');
              mapScript.type = "importmap";
              mapScript.textContent = JSON.stringify(importMap);
              document.head.appendChild(mapScript);

              const entryFile = files['src/App.tsx'] ? 'src/App.tsx' : Object.keys(files).find(f => f.endsWith('App.tsx'));
              if (entryFile) {
                  const bootstrapCode = \`
                    import * as __React from 'react';
                    import { createRoot } from 'react-dom/client';
                    import * as LucideReact from 'lucide-react';
                    import App from '\${entryFile}';
                    window.Lucide = LucideReact;
                    try {
                        const root = createRoot(document.getElementById('root'));
                        root.render(__React.createElement(App));
                    } catch (err) {
                        console.error("Runtime Error:", err);
                        document.body.innerHTML += '<div style="color:red; padding:20px; background: #220000;">Runtime Error: ' + err.message + '</div>';
                    }
                  \`;
                  const bootstrapBlob = new Blob([Babel.transform(bootstrapCode, {
                      presets: ['react', ['env', { modules: false }], 'typescript'],
                      filename: 'bootstrap.tsx'
                  }).code], { type: 'application/javascript' });
                  const script = document.createElement('script');
                  script.type = 'module';
                  script.src = URL.createObjectURL(bootstrapBlob);
                  document.body.appendChild(script);
              } else {
                  document.body.innerHTML = '<div style="color:#888; padding:20px;">No Entry Point (src/App.tsx) found.</div>';
              }
            })();
          </script>
        </body>
        </html>
      `;
            setIframeSrc(html);
        }
    }, [appCode, files]);

    const generateUnitTests = async () => {
        if (!appCode) return;
        setIsGeneratingTests(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Generate unit tests for this React component using React Testing Library.
                Component:
                    ${appCode}
                
                Output ONLY the raw code for the test file(App.test.tsx).No markdown.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }]
            });

            let tests = response.text || "";
            tests = tests.replace(/```tsx/g, '').replace(/```typescript/g, '').replace(/```/g, '');

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
            const prompt = `Analyze the following React component and generate a professional 'README.md' file.

                Structure:
            1. Project Title(Invent a creative name based on the app's functionality).
          2. Short Description.
          3. Features List(Bulleted list of detected UI features).
          4. Tech Stack(React, Tailwind CSS, Lucide Icons).
          5. Getting Started(Standard 'npm install', 'npm run dev').
          6. Project Structure(Mock file tree).
          
          Output raw Markdown.Do not include backticks around the whole file.
          
          React Component Code:
                ${appCode}`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }]
            });

            let docs = response.text || "";
            docs = docs.replace(/```markdown/g, '').replace(/```md/g, '').replace(/```/g, '');

            setFiles({ ...files, 'README.md': docs.trim() });
            setActiveFile('README.md');
            setActiveTab('code');

        } catch (e) {
            console.error("Docs Generation Error", e);
        } finally {
            setIsGeneratingDocs(false);
        }
    };

    const runAccessibilityAudit = async () => {
        if (!appCode) return;
        setIsAuditing(true);
        setShowAccessReport(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const systemInstruction = `You are a WCAG 2.1 Accessibility Auditor. Analyze the provided React code.
        Check for:
        1. Missing 'alt' attributes on images.
        2. Buttons missing 'aria-label' if they are icon-only.
        3. Color contrast issues (e.g. gray text on gray background).
        4. Missing labels for form inputs.

        Output ONLY a JSON object with this structure:
        {
           "score": number (0-100),
           "issues": [
              { "type": "error" | "warning", "message": "Short description of issue" }
           ]
        }
        Do not include markdown.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: `Audit this code:\n${appCode}` }] }],
                config: {
                    systemInstruction: systemInstruction,
                    responseMimeType: "application/json"
                }
            });

            const text = response.text || "{}";
            const report = JSON.parse(text);
            setAccessibilityReport(report);

        } catch (e) {
            console.error("Audit failed", e);
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
            const systemInstruction = `You are an expert React Developer.
         Apply fixes to the code based on the provided accessibility issues.
         - Add 'alt' tags to images (infer context).
         - Add 'aria-label' to icon buttons.
         - Fix color contrast (e.g. change text-gray-400 to text-gray-600).
         
         Return ONLY the FULL updated React component code. No markdown.`;

            const prompt = `
         Issues to fix: ${JSON.stringify(accessibilityReport.issues)}
         
         Original Code:
         ${appCode}
         `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }],
                config: { systemInstruction }
            });

            let fixedCode = response.text || "";
            fixedCode = fixedCode.replace(/```jsx/g, '').replace(/```tsx/g, '').replace(/```/g, '');

            const newFiles = { ...files, 'src/App.tsx': fixedCode };
            reviewChange("Fixed Accessibility Issues", newFiles);

            setAccessibilityReport({ score: 100, issues: [] });
            setTimeout(() => setShowAccessReport(false), 2000);

        } catch (e) {
            console.error("Fix failed", e);
        } finally {
            setIsFixing(false);
        }
    };

    const generateDatabaseSchema = async () => {
        if (!appCode) return;
        setIsGeneratingDB(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Based on this React App, generate a SQL schema (CREATE TABLE statements) for a SQLite database that would support this app's data.
             Code: ${appCode}
             Output ONLY SQL.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }]
            });
            const sql = response.text?.replace(/```sql/g, '').replace(/```/g, '') || "";
            setFiles({ ...files, 'db/schema.sql': sql });
            setActiveFile('db/schema.sql');
            setActiveTab('code');
        } catch (e) {
            console.error(e);
        } finally {
            setIsGeneratingDB(false);
        }
    };

    const fixResponsiveness = async () => {
        if (!appCode) return;
        setIsFixingResp(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Optimize this React component for mobile devices. 
             - Ensure it looks perfect on small screens (w-full, flex-col, etc).
             - Adjust padding and font sizes.
             
             Code: ${appCode}
             
             Output ONLY the full updated code.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }]
            });
            let fixedCode = response.text || "";
            fixedCode = fixedCode.replace(/```jsx/g, '').replace(/```tsx/g, '').replace(/```/g, '');

            reviewChange("Fixed Responsiveness", { ...files, 'src/App.tsx': fixedCode });
        } catch (e) {
            console.error(e);
        } finally {
            setIsFixingResp(false);
        }
    };

    const reloadPreview = () => {
        setKey(prev => prev + 1);
    };

    const downloadCode = () => {
        const element = document.createElement("a");
        const file = new Blob([files[activeFile] || ""], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = activeFile.split('/').pop() || "file.txt";
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(files[activeFile] || "");
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    // Download project as ZIP
    const downloadAsZip = async () => {
        if (!appCode) return;
        setIsDownloading(true);

        try {
            const zip = new JSZip();

            // Add package.json
            const packageJson = {
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
                    "tailwindcss": "^3.4.0",
                    "postcss": "^8.4.0",
                    "autoprefixer": "^10.4.0"
                }
            };
            zip.file("package.json", JSON.stringify(packageJson, null, 2));

            // Add vite.config.ts
            const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})`;
            zip.file("vite.config.ts", viteConfig);

            // Add tsconfig.json
            const tsConfig = {
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
                    strict: true
                },
                include: ["src"]
            };
            zip.file("tsconfig.json", JSON.stringify(tsConfig, null, 2));

            // Add tailwind.config.js
            const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
}`;
            zip.file("tailwind.config.js", tailwindConfig);

            // Add postcss.config.js
            zip.file("postcss.config.js", `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`);

            // Add index.html
            const indexHtml = `<!DOCTYPE html>
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
</html>`;
            zip.file("index.html", indexHtml);

            // Add src/main.tsx
            const mainTsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;
            zip.file("src/main.tsx", mainTsx);

            // Add src/index.css with Tailwind
            const indexCss = files['src/index.css'] || `@tailwind base;
@tailwind components;
@tailwind utilities;`;
            zip.file("src/index.css", indexCss);

            // Add all project files
            for (const [path, content] of Object.entries(files)) {
                if (path === 'src/index.css') continue; // Already added
                // Fix imports for standard project structure
                let fixedContent = content;
                // Convert absolute imports to relative
                fixedContent = fixedContent.replace(/from ['"]src\//g, "from './");
                fixedContent = fixedContent.replace(/import ['"]src\//g, "import './");
                zip.file(path, fixedContent);
            }

            // Add README
            const readme = `# FluidFlow App

Generated with [FluidFlow](https://github.com/fluidflow) - Sketch to App

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Tech Stack
- React 18
- TypeScript
- Tailwind CSS
- Vite
- Lucide Icons
`;
            zip.file("README.md", readme);

            // Generate and download
            const blob = await zip.generateAsync({ type: "blob" });
            saveAs(blob, "fluidflow-app.zip");

        } catch (error) {
            console.error("Download failed:", error);
            alert("Failed to create ZIP file");
        } finally {
            setIsDownloading(false);
            setShowExportModal(false);
        }
    };

    // Push to GitHub
    const pushToGithub = async () => {
        if (!githubToken || !repoName || !appCode) return;
        setIsPushing(true);
        setPushResult(null);

        try {
            // Create repository
            const createRepoRes = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: repoName,
                    description: 'Generated with FluidFlow - Sketch to App',
                    private: false,
                    auto_init: true
                })
            });

            if (!createRepoRes.ok) {
                const err = await createRepoRes.json();
                throw new Error(err.message || 'Failed to create repository');
            }

            const repoData = await createRepoRes.json();
            const owner = repoData.owner.login;

            // Wait for repo initialization
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get default branch ref
            const refRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/ref/heads/main`, {
                headers: { 'Authorization': `token ${githubToken}` }
            });
            const refData = await refRes.json();
            const baseSha = refData.object.sha;

            // Create blobs for all files
            const fileEntries: { path: string; content: string }[] = [];

            // Add package.json
            const packageJson = {
                name: repoName,
                version: "1.0.0",
                private: true,
                type: "module",
                scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
                dependencies: { "react": "^18.3.0", "react-dom": "^18.3.0", "lucide-react": "^0.400.0" },
                devDependencies: {
                    "@vitejs/plugin-react": "^4.3.0", "vite": "^5.4.0", "typescript": "^5.5.0",
                    "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0",
                    "tailwindcss": "^3.4.0", "postcss": "^8.4.0", "autoprefixer": "^10.4.0"
                }
            };
            fileEntries.push({ path: "package.json", content: JSON.stringify(packageJson, null, 2) });

            // Add config files
            fileEntries.push({ path: "vite.config.ts", content: `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })` });
            fileEntries.push({ path: "index.html", content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${repoName}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>` });
            fileEntries.push({ path: "src/main.tsx", content: `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)` });
            fileEntries.push({ path: "src/index.css", content: files['src/index.css'] || '@tailwind base;\n@tailwind components;\n@tailwind utilities;' });
            fileEntries.push({ path: "tailwind.config.js", content: `export default { content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] }` });

            // Add project files
            for (const [path, content] of Object.entries(files)) {
                if (path === 'src/index.css') continue;
                let fixedContent = content.replace(/from ['"]src\//g, "from './").replace(/import ['"]src\//g, "import './");
                fileEntries.push({ path, content: fixedContent });
            }

            // Create blobs
            const blobs = await Promise.all(fileEntries.map(async (file) => {
                const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/blobs`, {
                    method: 'POST',
                    headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: file.content, encoding: 'utf-8' })
                });
                const blobData = await blobRes.json();
                return { path: file.path, sha: blobData.sha, mode: '100644', type: 'blob' };
            }));

            // Create tree
            const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees`, {
                method: 'POST',
                headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ base_tree: baseSha, tree: blobs })
            });
            const treeData = await treeRes.json();

            // Create commit
            const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/commits`, {
                method: 'POST',
                headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: '🚀 Initial commit - Generated with FluidFlow',
                    tree: treeData.sha,
                    parents: [baseSha]
                })
            });
            const commitData = await commitRes.json();

            // Update ref
            await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/main`, {
                method: 'PATCH',
                headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ sha: commitData.sha })
            });

            setPushResult({ success: true, url: repoData.html_url });

        } catch (error: any) {
            console.error("GitHub push failed:", error);
            setPushResult({ success: false, error: error.message || 'Failed to push to GitHub' });
        } finally {
            setIsPushing(false);
        }
    };

    const handleQuickEdit = async () => {
        if (!editPrompt.trim() || !appCode) return;
        setIsQuickEditing(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Edit this React code based on the user's request.
             Request: "${editPrompt}"
             
             Code: ${appCode}
             
             Output ONLY the full updated code.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }]
            });
            let fixedCode = response.text || "";
            fixedCode = fixedCode.replace(/```jsx/g, '').replace(/```tsx/g, '').replace(/```/g, '');

            setFiles({ ...files, 'src/App.tsx': fixedCode });
            setIsEditMode(false);
            setEditPrompt('');
        } catch (e) {
            console.error(e);
        } finally {
            setIsQuickEditing(false);
        }
    };

    const fixError = async (index: number, message: string) => {
        const newLogs = [...logs];
        if (newLogs[index]) {
            newLogs[index].isFixing = true;
            setLogs(newLogs);
        }

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Fix this runtime error in the React code.
             Error: "${message}"
             
             Code: ${appCode}
             
             Output ONLY the full updated code.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: prompt }] }]
            });
            let fixedCode = response.text || "";
            fixedCode = fixedCode.replace(/```jsx/g, '').replace(/```tsx/g, '').replace(/```/g, '');

            reviewChange("Fixed Runtime Error", { ...files, 'src/App.tsx': fixedCode });

            // Update log to fixed
            setLogs(prev => prev.map((l, i) => i === index ? { ...l, isFixing: false, isFixed: true } : l));

        } catch (e) {
            console.error(e);
            setLogs(prev => prev.map((l, i) => i === index ? { ...l, isFixing: false } : l));
        }
    };

    const handleTabChange = (tab: 'preview' | 'code' | 'database' | 'tests' | 'docs') => {
        setActiveTab(tab);
        if (tab === 'database') {
            if (!files['db/schema.sql'] && appCode) {
                generateDatabaseSchema();
            } else if (files['db/schema.sql']) {
                setActiveFile('db/schema.sql');
                setActiveTab('code');
            }
        }
        if (tab === 'tests') {
            if (!files['src/App.test.tsx'] && appCode) {
                generateUnitTests();
            } else if (files['src/App.test.tsx']) {
                setActiveFile('src/App.test.tsx');
                setActiveTab('code');
            }
        }
        if (tab === 'docs') {
            if (!files['README.md'] && appCode) {
                generateDocs();
            } else if (files['README.md']) {
                setActiveFile('README.md');
                setActiveTab('code');
            }
        }
        // If switching to code tab normally, maintain current file selection
    };

    return (
        <section className="w-full md:w-[70%] h-full flex flex-col bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl relative transition-all duration-300">
            {/* Toolbar */}
            <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-white/[0.02]">
                <div className="flex items-center gap-6">
                    {/* Window Controls Decoration */}
                    <div className="flex gap-1.5 opacity-60">
                        <div className="w-3 h-3 rounded-full bg-red-500/40 border border-red-500/50" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/40 border border-yellow-500/50" />
                        <div className="w-3 h-3 rounded-full bg-green-500/40 border border-green-500/50" />
                    </div>

                    {/* View Toggles (Tabs) */}
                    <div className="flex p-1 bg-slate-950/50 rounded-lg border border-white/5">
                        <button
                            onClick={() => handleTabChange('preview')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'preview' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                        >
                            <Eye className="w-3.5 h-3.5" />
                            Preview
                        </button>
                        <button
                            onClick={() => handleTabChange('code')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'code' ? 'bg-blue-600/20 text-blue-200 border border-blue-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                        >
                            <Code2 className="w-3.5 h-3.5" />
                            Code
                        </button>
                        <button
                            onClick={() => handleTabChange('database')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'database' || files['db/schema.sql'] && activeFile === 'db/schema.sql' ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                        >
                            <Database className="w-3.5 h-3.5" />
                            SQL
                        </button>
                        <button
                            onClick={() => handleTabChange('tests')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'tests' || files['src/App.test.tsx'] && activeFile === 'src/App.test.tsx' ? 'bg-pink-600/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                        >
                            <FlaskConical className="w-3.5 h-3.5" />
                            Tests
                        </button>
                        <button
                            onClick={() => handleTabChange('docs')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'docs' || files['README.md'] && activeFile === 'README.md' ? 'bg-orange-600/20 text-orange-200 border border-orange-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                        >
                            <FileText className="w-3.5 h-3.5" />
                            Docs
                        </button>
                    </div>

                    {activeTab === 'preview' && (
                        <div className="h-6 w-px bg-white/10 mx-1 hidden sm:block" />
                    )}

                    {/* Device Toggles (Only in Preview) */}
                    {activeTab === 'preview' && (
                        <div className="hidden sm:flex items-center gap-1 bg-slate-950/30 p-1 rounded-lg border border-white/5 animate-in fade-in slide-in-from-left-2 duration-300">
                            <button
                                onClick={() => setPreviewDevice('desktop')}
                                className={`p-2 rounded-md transition-colors ${previewDevice === 'desktop' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                title="Desktop"
                            >
                                <Monitor className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPreviewDevice('tablet')}
                                className={`p-2 rounded-md transition-colors ${previewDevice === 'tablet' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                title="Tablet"
                            >
                                <Tablet className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPreviewDevice('mobile')}
                                className={`p-2 rounded-md transition-colors ${previewDevice === 'mobile' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                title="Mobile"
                            >
                                <Smartphone className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Right Side Tools */}
                <div className="flex items-center gap-3">
                    {/* Fix Responsiveness (Mobile/Tablet Only) */}
                    {activeTab === 'preview' && appCode && previewDevice !== 'desktop' && (
                        <button
                            onClick={fixResponsiveness}
                            disabled={isFixingResp}
                            className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 transition-all text-xs font-medium animate-in fade-in zoom-in"
                            title="Auto-fix layout for mobile/tablet"
                        >
                            {isFixingResp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                            <span className="whitespace-nowrap">{isFixingResp ? 'Fixing...' : 'Fix Responsive'}</span>
                        </button>
                    )}

                    {activeTab === 'preview' ? (
                        <>
                            {/* Quick Edit Toggle */}
                            {appCode && !isGenerating && (
                                <button
                                    onClick={() => setIsEditMode(!isEditMode)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium ${isEditMode ? 'bg-orange-500/10 text-orange-300 border-orange-500/20' : 'bg-slate-500/10 hover:bg-slate-500/20 text-slate-300 border-transparent hover:border-slate-500/20'}`}
                                    title="Click to Edit (Quick Mode)"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                    <span className="hidden lg:inline">Edit</span>
                                </button>
                            )}

                            {/* Audit Button */}
                            {appCode && !isGenerating && (
                                <button
                                    onClick={runAccessibilityAudit}
                                    className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 transition-all text-xs font-medium"
                                    title="Run WCAG 2.1 Audit"
                                >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span className="hidden lg:inline">Audit A11y</span>
                                </button>
                            )}

                            <div className="h-6 w-px bg-white/10" />

                            <button onClick={reloadPreview} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors" title="Reload Preview">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={downloadCode}
                                className="p-2 hover:bg-blue-500/10 rounded-lg text-slate-400 hover:text-blue-400 transition-colors border border-transparent hover:border-blue-500/20"
                                title="Download File"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                            <button
                                onClick={copyToClipboard}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition-colors border border-white/5"
                            >
                                {isCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                {isCopied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                    )}

                    {/* Export Button */}
                    {appCode && (
                        <button
                            onClick={() => setShowExportModal(true)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition-all text-xs font-medium"
                            title="Export Project"
                        >
                            <Package className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">Export</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden bg-[#050811] group flex flex-col items-center justify-center">
                {activeTab === 'preview' ? (
                    <>
                        {/* Grid Background */}
                        <div className="absolute inset-0 opacity-[0.15] pointer-events-none"
                            style={{
                                backgroundImage: `
                                linear-gradient(rgba(148, 163, 184, 0.1) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(148, 163, 184, 0.1) 1px, transparent 1px)
                            `,
                                backgroundSize: '20px 20px'
                            }}
                        />

                        {appCode ? (
                            <div className={`
                         relative z-10 transition-all duration-500 ease-in-out bg-slate-950 shadow-2xl overflow-hidden flex flex-col
                         ${previewDevice === 'mobile'
                                    ? 'w-[375px] h-[812px] rounded-[40px] border-[8px] border-slate-800 ring-4 ring-black shadow-[0_0_50px_rgba(0,0,0,0.5)]'
                                    : previewDevice === 'tablet'
                                        ? 'w-[768px] h-[1024px] max-h-[90%] rounded-[24px] border-[8px] border-slate-800 ring-4 ring-black shadow-[0_0_50px_rgba(0,0,0,0.5)]'
                                        : 'w-full h-full rounded-none border-none'
                                }
                     `}>
                                {/* Dynamic Notch for Mobile */}
                                {previewDevice === 'mobile' && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-50 flex items-center justify-center gap-2 pointer-events-none">
                                        <div className="w-12 h-1.5 rounded-full bg-slate-800/50" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-800/80" />
                                    </div>
                                )}

                                {/* Loading Overlay within Preview */}
                                {(isGenerating || isFixingResp) && (
                                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
                                        <div className="relative">
                                            <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Loader2 className="w-6 h-6 text-blue-400 animate-pulse" />
                                            </div>
                                        </div>
                                        <p className="mt-4 text-sm font-medium text-blue-300 animate-pulse">
                                            {isFixingResp ? 'Adapting Layout...' : 'Constructing Interface...'}
                                        </p>
                                    </div>
                                )}

                                <iframe
                                    key={key}
                                    srcDoc={iframeSrc}
                                    title="Preview"
                                    className={`w-full h-full bg-white transition-opacity duration-500 ${isGenerating ? 'opacity-40' : 'opacity-100'}`}
                                    sandbox="allow-scripts allow-same-origin"
                                />

                                {/* Quick Edit Overlay Bar */}
                                {isEditMode && (
                                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] md:w-[600px] z-50 animate-in slide-in-from-bottom-4 duration-300">
                                        <div className="flex items-center gap-2 p-1.5 bg-slate-900/90 backdrop-blur-xl border border-orange-500/30 rounded-full shadow-2xl ring-1 ring-orange-500/20">
                                            <div className="pl-3 pr-2 text-orange-400">
                                                <Pencil className="w-4 h-4" />
                                            </div>
                                            <input
                                                type="text"
                                                value={editPrompt}
                                                onChange={(e) => setEditPrompt(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleQuickEdit()}
                                                placeholder="Describe a specific change (e.g. 'Make the header blue')..."
                                                className="flex-1 bg-transparent border-none text-sm text-white placeholder-slate-400 focus:ring-0 px-2 h-9"
                                                autoFocus
                                            />
                                            {isQuickEditing ? (
                                                <div className="pr-3 pl-2">
                                                    <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={handleQuickEdit}
                                                    disabled={!editPrompt.trim()}
                                                    className="p-2 rounded-full bg-orange-600 text-white hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
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
                            /* Empty State */
                            <div className="w-full h-full flex items-center justify-center">
                                <div className="relative transition-all duration-500 ease-out transform scale-90 opacity-60">
                                    <div className="relative w-[375px] h-[812px] bg-black rounded-[48px] border-[8px] border-slate-800 shadow-2xl overflow-hidden ring-1 ring-white/10 z-10">
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-7 bg-slate-900 rounded-b-2xl z-20 flex items-center justify-center gap-3">
                                            <div className="w-10 h-1 rounded-full bg-slate-800/50"></div>
                                            <div className="w-2 h-2 rounded-full bg-slate-800/80"></div>
                                        </div>
                                        <div className="w-full h-full bg-slate-950 flex flex-col relative overflow-hidden items-center justify-center">
                                            <Terminal className="w-12 h-12 text-slate-800 mb-4" />
                                            <p className="text-slate-700 font-medium text-sm">Upload a sketch to generate app</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Collapsible Console/Terminal Panel */}
                        {appCode && (
                            <div className={`absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-white/10 transition-all duration-300 flex flex-col z-[60] shadow-2xl ${isConsoleOpen ? 'h-64' : 'h-8'}`}>
                                {/* Console Header */}
                                <div
                                    onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                                    className="h-8 bg-slate-950 hover:bg-slate-900 cursor-pointer flex items-center justify-between px-4 border-b border-white/5 select-none transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                                            <Terminal className="w-3 h-3 text-blue-400" />
                                            <span className="font-semibold text-slate-300">DevTools</span>
                                        </div>

                                        {isConsoleOpen && (
                                            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-white/5" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => setActiveTerminalTab('console')}
                                                    className={`px-3 py-0.5 rounded text-[10px] font-medium transition-colors ${activeTerminalTab === 'console' ? 'bg-blue-600/20 text-blue-300' : 'text-slate-500 hover:text-slate-300'}`}
                                                >
                                                    Console {logs.length > 0 && `(${logs.length})`}
                                                </button>
                                                <button
                                                    onClick={() => setActiveTerminalTab('network')}
                                                    className={`px-3 py-0.5 rounded text-[10px] font-medium transition-colors ${activeTerminalTab === 'network' ? 'bg-emerald-600/20 text-emerald-300' : 'text-slate-500 hover:text-slate-300'}`}
                                                >
                                                    Network {networkLogs.length > 0 && `(${networkLogs.length})`}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {isConsoleOpen && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); activeTerminalTab === 'console' ? setLogs([]) : setNetworkLogs([]); }}
                                                className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                                                title="Clear"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        )}
                                        <div className="text-slate-500">
                                            {isConsoleOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                                        </div>
                                    </div>
                                </div>

                                {/* Panel Content */}
                                {isConsoleOpen && (
                                    <div className="flex-1 overflow-y-auto font-mono text-[11px] custom-scrollbar bg-[#0d1117]">
                                        {activeTerminalTab === 'console' ? (
                                            // CONSOLE VIEW
                                            <div className="p-3 space-y-1.5">
                                                {logs.length === 0 ? (
                                                    <div className="h-full flex flex-col items-center justify-center text-slate-600 italic py-10">
                                                        <Terminal className="w-5 h-5 mb-2 opacity-50" />
                                                        <span>Console is clear</span>
                                                    </div>
                                                ) : (
                                                    logs.map((log, i) => (
                                                        <div key={i} className={`flex gap-3 border-b border-white/[0.03] pb-2 last:border-0 items-start group ${log.type === 'error' ? 'bg-red-500/5 -mx-3 px-3 py-1' : ''
                                                            }`}>
                                                            <span className={`flex-none opacity-40 select-none min-w-[50px] pt-0.5 ${log.type === 'error' ? 'text-red-300' : 'text-slate-500'}`}>{log.timestamp}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <span className={`break-all whitespace-pre-wrap ${log.type === 'error' ? 'text-red-300 font-semibold' :
                                                                    log.type === 'warn' ? 'text-yellow-400' :
                                                                        'text-slate-300'
                                                                    }`}>{log.message}</span>

                                                                {/* Auto-Fix Button for Errors */}
                                                                {log.type === 'error' && (
                                                                    <div className="mt-2 flex items-center gap-2">
                                                                        {log.isFixed ? (
                                                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-400 text-[10px] font-medium border border-green-500/30">
                                                                                <Check className="w-3 h-3" />
                                                                                Fixed
                                                                            </span>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() => fixError(i, log.message)}
                                                                                disabled={log.isFixing}
                                                                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-red-200 border border-red-500/20 transition-all text-[10px] font-medium"
                                                                            >
                                                                                {log.isFixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                                                                {log.isFixing ? 'Fixing with AI...' : 'Fix with AI'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                                <div ref={consoleEndRef} />
                                            </div>
                                        ) : (
                                            // NETWORK VIEW
                                            <div className="min-w-full inline-block align-middle">
                                                {networkLogs.length === 0 ? (
                                                    <div className="h-full flex flex-col items-center justify-center text-slate-600 italic py-10">
                                                        <Wifi className="w-5 h-5 mb-2 opacity-50" />
                                                        <span>No network requests recorded</span>
                                                    </div>
                                                ) : (
                                                    <table className="min-w-full">
                                                        <thead className="bg-slate-900 sticky top-0 z-10 text-slate-400">
                                                            <tr>
                                                                <th scope="col" className="px-3 py-2 text-left font-medium w-20">Status</th>
                                                                <th scope="col" className="px-3 py-2 text-left font-medium w-20">Method</th>
                                                                <th scope="col" className="px-3 py-2 text-left font-medium">Name</th>
                                                                <th scope="col" className="px-3 py-2 text-right font-medium w-24">Time</th>
                                                                <th scope="col" className="px-3 py-2 text-right font-medium w-24">Timestamp</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white/5">
                                                            {networkLogs.map((req) => (
                                                                <tr key={req.id} className="hover:bg-white/[0.02] transition-colors">
                                                                    <td className="px-3 py-1.5 whitespace-nowrap">
                                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${req.status === 200 || req.status === 201 ? 'bg-green-500/10 text-green-400' :
                                                                            req.status === 'ERR' ? 'bg-red-500/10 text-red-400' :
                                                                                'bg-yellow-500/10 text-yellow-400'
                                                                            }`}>
                                                                            {req.status}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-300 font-bold">{req.method}</td>
                                                                    <td className="px-3 py-1.5 text-slate-400 truncate max-w-xs" title={req.url}>{req.url}</td>
                                                                    <td className="px-3 py-1.5 whitespace-nowrap text-right text-slate-500">{Math.round(req.duration)}ms</td>
                                                                    <td className="px-3 py-1.5 whitespace-nowrap text-right text-slate-600 text-[10px]">{req.timestamp}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    /* Editor View with File Manager */
                    <div className="absolute inset-0 flex">
                        {/* File Manager Sidebar */}
                        <div className="w-56 bg-[#0a0e16] border-r border-white/5 flex flex-col overflow-hidden">
                            <div className="p-3 border-b border-white/5">
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Explorer</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                                {/* Organize files by folder */}
                                {(() => {
                                    const srcFiles = Object.keys(files).filter(f => f.startsWith('src/') && !f.includes('.test.'));
                                    const testFiles = Object.keys(files).filter(f => f.includes('.test.'));
                                    const dbFiles = Object.keys(files).filter(f => f.startsWith('db/'));
                                    const rootFiles = Object.keys(files).filter(f => !f.includes('/'));

                                    const getFileIcon = (fileName: string) => {
                                        if (fileName.endsWith('.tsx') || fileName.endsWith('.ts')) return <FileCode className="w-3.5 h-3.5 text-blue-400" />;
                                        if (fileName.endsWith('.json')) return <FileJson className="w-3.5 h-3.5 text-yellow-400" />;
                                        if (fileName.endsWith('.css')) return <FileIcon className="w-3.5 h-3.5 text-pink-400" />;
                                        if (fileName.endsWith('.sql')) return <Database className="w-3.5 h-3.5 text-emerald-400" />;
                                        if (fileName.endsWith('.md')) return <FileText className="w-3.5 h-3.5 text-orange-400" />;
                                        return <FileIcon className="w-3.5 h-3.5 text-slate-400" />;
                                    };

                                    return (
                                        <>
                                            {/* src folder */}
                                            {srcFiles.length > 0 && (
                                                <div className="mb-1">
                                                    <div className="flex items-center gap-1.5 px-2 py-1 text-slate-400">
                                                        <ChevronDown className="w-3 h-3" />
                                                        <Folder className="w-3.5 h-3.5 text-blue-400/70" />
                                                        <span className="text-[11px] font-medium">src</span>
                                                    </div>
                                                    <div className="ml-3 border-l border-white/5 pl-2">
                                                        {srcFiles.map(file => (
                                                            <button
                                                                key={file}
                                                                onClick={() => setActiveFile(file)}
                                                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-all ${activeFile === file ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                                                            >
                                                                {getFileIcon(file)}
                                                                <span className="text-[11px] truncate">{file.replace('src/', '')}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* tests */}
                                            {testFiles.length > 0 && (
                                                <div className="mb-1">
                                                    <div className="flex items-center gap-1.5 px-2 py-1 text-slate-400">
                                                        <ChevronDown className="w-3 h-3" />
                                                        <FlaskConical className="w-3.5 h-3.5 text-pink-400/70" />
                                                        <span className="text-[11px] font-medium">tests</span>
                                                    </div>
                                                    <div className="ml-3 border-l border-white/5 pl-2">
                                                        {testFiles.map(file => (
                                                            <button
                                                                key={file}
                                                                onClick={() => setActiveFile(file)}
                                                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-all ${activeFile === file ? 'bg-pink-600/20 text-pink-200' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                                                            >
                                                                <FlaskConical className="w-3.5 h-3.5 text-pink-400" />
                                                                <span className="text-[11px] truncate">{file.replace('src/', '')}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* db folder */}
                                            {dbFiles.length > 0 && (
                                                <div className="mb-1">
                                                    <div className="flex items-center gap-1.5 px-2 py-1 text-slate-400">
                                                        <ChevronDown className="w-3 h-3" />
                                                        <Database className="w-3.5 h-3.5 text-emerald-400/70" />
                                                        <span className="text-[11px] font-medium">db</span>
                                                    </div>
                                                    <div className="ml-3 border-l border-white/5 pl-2">
                                                        {dbFiles.map(file => (
                                                            <button
                                                                key={file}
                                                                onClick={() => setActiveFile(file)}
                                                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-all ${activeFile === file ? 'bg-emerald-600/20 text-emerald-200' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                                                            >
                                                                {getFileIcon(file)}
                                                                <span className="text-[11px] truncate">{file.replace('db/', '')}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Root files */}
                                            {rootFiles.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-white/5">
                                                    {rootFiles.map(file => (
                                                        <button
                                                            key={file}
                                                            onClick={() => setActiveFile(file)}
                                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-all ${activeFile === file ? 'bg-slate-700/50 text-slate-200' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                                                        >
                                                            {getFileIcon(file)}
                                                            <span className="text-[11px] truncate">{file}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Editor Area */}
                        <div className="flex-1 flex flex-col">
                            {isGeneratingDB || isGeneratingTests || isGeneratingDocs ? (
                                <div className="w-full h-full flex flex-col items-center justify-center text-blue-400 gap-4">
                                    <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                    <p className="text-sm font-medium animate-pulse">
                                        {isGeneratingDB && "Generating SQL Schema..."}
                                        {isGeneratingTests && "Writing Tests..."}
                                        {isGeneratingDocs && "Writing Documentation..."}
                                    </p>
                                </div>
                            ) : files[activeFile] ? (
                                <>
                                    {/* File Tab Bar */}
                                    <div className="flex-none bg-[#0a0e16] border-b border-white/5 px-2 flex items-center h-9">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0d1117] rounded-t border-t border-l border-r border-white/10">
                                            <FileCode className="w-3.5 h-3.5 text-blue-400" />
                                            <span className="text-[11px] font-medium text-slate-300">{activeFile}</span>
                                        </div>
                                    </div>
                                    <textarea
                                        value={files[activeFile] || ""}
                                        onChange={(e) => setFiles({ ...files, [activeFile]: e.target.value })}
                                        className="w-full flex-1 bg-[#0d1117] text-sm font-mono text-slate-300 p-4 focus:outline-none resize-none leading-relaxed"
                                        spellCheck={false}
                                        style={{
                                            fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                            tabSize: 2
                                        }}
                                    />
                                </>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                                    <Code2 className="w-10 h-10 opacity-50" />
                                    <p className="text-sm font-medium">Select a file to edit</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Export Modal */}
                {showExportModal && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
                        <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-5 border-b border-white/5 bg-slate-950 flex items-center justify-between">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <Package className="w-5 h-5 text-emerald-400" />
                                    Export Project
                                </h3>
                                <button onClick={() => setShowExportModal(false)} className="text-slate-500 hover:text-white transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <p className="text-sm text-slate-400">Export your generated project as a complete, ready-to-run application.</p>

                                {/* Download ZIP Option */}
                                <button
                                    onClick={downloadAsZip}
                                    disabled={isDownloading}
                                    className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/5 transition-all group"
                                >
                                    <div className="p-3 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
                                        <Download className="w-6 h-6" />
                                    </div>
                                    <div className="text-left flex-1">
                                        <p className="font-semibold text-white">Download as ZIP</p>
                                        <p className="text-xs text-slate-500">Complete project with Vite, Tailwind, TypeScript</p>
                                    </div>
                                    {isDownloading && <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />}
                                </button>

                                {/* Push to GitHub Option */}
                                <button
                                    onClick={() => { setShowExportModal(false); setShowGithubModal(true); }}
                                    className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/5 transition-all group"
                                >
                                    <div className="p-3 rounded-lg bg-slate-700 text-white group-hover:scale-110 transition-transform">
                                        <Github className="w-6 h-6" />
                                    </div>
                                    <div className="text-left flex-1">
                                        <p className="font-semibold text-white">Push to GitHub</p>
                                        <p className="text-xs text-slate-500">Create a new repository with your code</p>
                                    </div>
                                </button>
                            </div>

                            <div className="p-4 bg-slate-950/50 border-t border-white/5 text-center">
                                <p className="text-[10px] text-slate-600">Project includes: package.json, vite.config, tsconfig, tailwind.config</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* GitHub Push Modal */}
                {showGithubModal && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
                        <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-5 border-b border-white/5 bg-slate-950 flex items-center justify-between">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <Github className="w-5 h-5" />
                                    Push to GitHub
                                </h3>
                                <button onClick={() => { setShowGithubModal(false); setPushResult(null); }} className="text-slate-500 hover:text-white transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                {!pushResult ? (
                                    <>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">GitHub Token (PAT)</label>
                                            <input
                                                type="password"
                                                value={githubToken}
                                                onChange={e => setGithubToken(e.target.value)}
                                                placeholder="ghp_xxxxxxxxxxxx"
                                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder-slate-600"
                                            />
                                            <p className="text-[10px] text-slate-500 mt-1">Requires 'repo' scope. <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Create token</a></p>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">Repository Name</label>
                                            <input
                                                type="text"
                                                value={repoName}
                                                onChange={e => setRepoName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '-'))}
                                                placeholder="my-awesome-app"
                                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder-slate-600"
                                            />
                                        </div>
                                    </>
                                ) : pushResult.success ? (
                                    <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                                        <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 mb-2">
                                            <Check className="w-6 h-6" />
                                        </div>
                                        <h4 className="text-lg font-bold text-white">Repository Created!</h4>
                                        <a
                                            href={pushResult.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 underline underline-offset-4"
                                        >
                                            View on GitHub <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                                        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-400 mb-2">
                                            <AlertTriangle className="w-6 h-6" />
                                        </div>
                                        <h4 className="text-lg font-bold text-white">Push Failed</h4>
                                        <p className="text-sm text-red-300 bg-red-950/50 p-3 rounded border border-red-500/20 font-mono">{pushResult.error}</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 bg-slate-950/50 border-t border-white/5 flex justify-end gap-3">
                                {!pushResult ? (
                                    <>
                                        <button onClick={() => setShowGithubModal(false)} className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium">Cancel</button>
                                        <button
                                            onClick={pushToGithub}
                                            disabled={isPushing || !githubToken || !repoName}
                                            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-900 hover:bg-white font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                                        >
                                            {isPushing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            {isPushing ? 'Pushing...' : 'Create & Push'}
                                        </button>
                                    </>
                                ) : (
                                    <button onClick={() => { setShowGithubModal(false); setPushResult(null); }} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors text-sm font-medium">Close</button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Consultant Mode Overlay */}
                {suggestions && activeTab === 'preview' && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="w-full max-w-lg bg-slate-900 border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80%] animate-in slide-in-from-bottom-4 duration-300">
                            <div className="p-5 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-300">
                                        <Briefcase className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-indigo-100">Consultant Report</h3>
                                        <p className="text-xs text-indigo-400">UX & Logic Analysis</p>
                                    </div>
                                </div>
                                <button onClick={() => setSuggestions(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                    <X className="w-4 h-4 text-slate-400" />
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto custom-scrollbar">
                                <ul className="space-y-3">
                                    {suggestions.map((suggestion, idx) => (
                                        <li key={idx} className="flex gap-3 text-sm text-slate-300 bg-white/5 p-3 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                                            <span className="flex-none w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-bold border border-indigo-500/30">
                                                {idx + 1}
                                            </span>
                                            <span className="leading-relaxed">{suggestion}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="p-4 bg-slate-950/50 border-t border-white/5 text-center">
                                <button
                                    onClick={() => setSuggestions(null)}
                                    className="text-xs text-slate-500 hover:text-indigo-300 transition-colors"
                                >
                                    Dismiss Report
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Accessibility Audit Overlay */}
                {showAccessReport && activeTab === 'preview' && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="w-full max-w-lg bg-slate-900 border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80%] animate-in slide-in-from-bottom-4 duration-300">
                            {/* Header */}
                            <div className="p-5 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-transparent">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-purple-500/20 rounded-lg text-purple-300">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-purple-100">Accessibility Audit</h3>
                                        <p className="text-xs text-purple-400">WCAG 2.1 Compliance</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowAccessReport(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                    <X className="w-4 h-4 text-slate-400" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                                {isAuditing ? (
                                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                                        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                                        <p className="text-sm text-purple-300">Scanning for violations...</p>
                                    </div>
                                ) : accessibilityReport ? (
                                    <>
                                        {/* Score Card */}
                                        <div className="flex items-center gap-6 p-4 rounded-xl bg-white/5 border border-white/5">
                                            <div className="relative w-20 h-20 flex items-center justify-center">
                                                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                                    <path className="text-slate-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                                    <path className={`${accessibilityReport.score > 80 ? 'text-green-500' : accessibilityReport.score > 50 ? 'text-yellow-500' : 'text-red-500'} transition-all duration-1000 ease-out`} strokeDasharray={`${accessibilityReport.score}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                                </svg>
                                                <span className="absolute text-xl font-bold text-white">{accessibilityReport.score}</span>
                                            </div>
                                            <div>
                                                <h4 className="font-medium text-slate-200">Overall Score</h4>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {accessibilityReport.score === 100
                                                        ? "Great job! No obvious accessibility issues found."
                                                        : `Found ${accessibilityReport.issues.length} issues that need attention.`}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Issues List */}
                                        {accessibilityReport.issues.length > 0 && (
                                            <ul className="space-y-3">
                                                {accessibilityReport.issues.map((issue, idx) => (
                                                    <li key={idx} className="flex gap-3 text-sm text-slate-300 bg-slate-950/30 p-3 rounded-lg border border-white/5">
                                                        <AlertTriangle className={`w-5 h-5 flex-none ${issue.type === 'error' ? 'text-red-400' : 'text-yellow-400'}`} />
                                                        <span className="leading-relaxed">{issue.message}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-center text-slate-500 py-4">Could not load report.</div>
                                )}
                            </div>

                            {/* Footer Actions */}
                            <div className="p-4 bg-slate-950/50 border-t border-white/5 flex gap-3">
                                <button
                                    onClick={() => setShowAccessReport(false)}
                                    className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
                                >
                                    Close
                                </button>
                                {accessibilityReport && accessibilityReport.issues.length > 0 && (
                                    <button
                                        onClick={fixAccessibilityIssues}
                                        disabled={isFixing}
                                        className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20 transition-all text-sm font-medium flex items-center justify-center gap-2"
                                    >
                                        {isFixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                        {isFixing ? 'Applying Fixes...' : 'Fix Automatically'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}