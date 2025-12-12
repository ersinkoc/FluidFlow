import React, { useState } from 'react';
import { X, Rocket, Copy, Check, ExternalLink, Terminal, Github } from 'lucide-react';
import { FileSystem } from '../types';

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
}

export const DeployModal: React.FC<DeployModalProps> = ({ isOpen, onClose, files: _files }) => {
  const [activeTab, setActiveTab] = useState<'vercel' | 'netlify' | 'manual'>('vercel');
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // Generate package.json content
  const packageJson = JSON.stringify({
    name: "fluidflow-app",
    version: "1.0.0",
    private: true,
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview"
    },
    dependencies: {
      "react": "^18.2.0",
      "react-dom": "^18.2.0",
      "lucide-react": "^0.263.1"
    },
    devDependencies: {
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      "@vitejs/plugin-react": "^4.0.0",
      "autoprefixer": "^10.4.14",
      "postcss": "^8.4.24",
      "tailwindcss": "^3.3.0",
      "typescript": "^5.0.0",
      "vite": "^4.4.0"
    }
  }, null, 2);

  // Vercel CLI commands
  const vercelCommands = `# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (from project directory)
vercel

# Deploy to production
vercel --prod`;

  // Netlify CLI commands
  const netlifyCommands = `# Install Netlify CLI
npm i -g netlify-cli

# Login to Netlify
netlify login

# Build and deploy
npm run build
netlify deploy --prod --dir=dist`;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Rocket className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Deploy Your App</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5">
          {[
            { id: 'vercel', label: 'Vercel', icon: '▲' },
            { id: 'netlify', label: 'Netlify', icon: '◆' },
            { id: 'manual', label: 'Manual', icon: '⚡' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-white bg-white/5 border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {activeTab === 'vercel' && (
            <div className="space-y-4">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-400" />
                  Deploy with Vercel CLI
                </h3>
                <div className="relative">
                  <pre className="bg-slate-950 rounded p-3 text-xs text-slate-300 overflow-x-auto">
                    {vercelCommands}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(vercelCommands, 'vercel')}
                    className="absolute top-2 right-2 p-1.5 bg-slate-800 rounded hover:bg-slate-700 transition-colors"
                  >
                    {copied === 'vercel' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Github className="w-4 h-4 text-purple-400" />
                  Or Deploy via GitHub
                </h3>
                <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
                  <li>Push your project to GitHub</li>
                  <li>Go to <a href="https://vercel.com/new" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1">vercel.com/new <ExternalLink className="w-3 h-3" /></a></li>
                  <li>Import your repository</li>
                  <li>Vercel will auto-detect Vite and deploy</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'netlify' && (
            <div className="space-y-4">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-teal-400" />
                  Deploy with Netlify CLI
                </h3>
                <div className="relative">
                  <pre className="bg-slate-950 rounded p-3 text-xs text-slate-300 overflow-x-auto">
                    {netlifyCommands}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(netlifyCommands, 'netlify')}
                    className="absolute top-2 right-2 p-1.5 bg-slate-800 rounded hover:bg-slate-700 transition-colors"
                  >
                    {copied === 'netlify' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-2">Drag & Drop Deploy</h3>
                <p className="text-sm text-slate-400 mb-3">
                  You can also drag and drop your <code className="bg-slate-700 px-1 rounded">dist</code> folder directly to Netlify.
                </p>
                <a
                  href="https://app.netlify.com/drop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Open Netlify Drop
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="space-y-4">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-2">Required Files</h3>
                <p className="text-sm text-slate-400 mb-3">
                  Make sure your project includes these configuration files:
                </p>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1 font-mono">package.json</p>
                    <div className="relative">
                      <pre className="bg-slate-950 rounded p-2 text-[10px] text-slate-300 overflow-x-auto max-h-32">
                        {packageJson}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(packageJson, 'package')}
                        className="absolute top-1 right-1 p-1 bg-slate-800 rounded hover:bg-slate-700 transition-colors"
                      >
                        {copied === 'package' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-white mb-2">Build Commands</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Install</p>
                    <code className="block bg-slate-950 rounded px-2 py-1 text-xs text-slate-300">npm install</code>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Build</p>
                    <code className="block bg-slate-950 rounded px-2 py-1 text-xs text-slate-300">npm run build</code>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Output Dir</p>
                    <code className="block bg-slate-950 rounded px-2 py-1 text-xs text-slate-300">dist</code>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Framework</p>
                    <code className="block bg-slate-950 rounded px-2 py-1 text-xs text-slate-300">Vite + React</code>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/5 bg-slate-950/50">
          <p className="text-[10px] text-slate-600 text-center">
            First, export your project as ZIP or push to GitHub, then follow the deployment steps above.
          </p>
        </div>
      </div>
    </div>
  );
};
