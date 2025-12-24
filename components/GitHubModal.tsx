/**
 * GitHub Modal
 *
 * Unified modal for GitHub operations:
 * - Import: Clone repositories from GitHub
 * - Push: Push current project to GitHub (new or existing repo)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Github, X, Search, Loader2, Check, AlertTriangle, Lock, Globe,
  Clock, RefreshCw, Download, FolderGit, ExternalLink, ChevronRight,
  Upload, Plus, Link2, AlertCircle
} from 'lucide-react';
import { githubApi } from '@/services/api/github';
import { settingsApi } from '@/services/api/settings';
import type { ProjectMeta } from '@/services/projectApi';

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  cloneUrl: string;
  private: boolean;
  updatedAt: string;
  defaultBranch: string;
  hasFluidFlowBackup: boolean;
}

interface OperationResult {
  success: boolean;
  project?: ProjectMeta;
  restored?: { metadata: boolean; context: boolean };
  repoUrl?: string;
  error?: string;
}

export type GitHubModalMode = 'import' | 'push';

interface GitHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: GitHubModalMode;
  // For import mode
  onImportComplete?: (project: ProjectMeta) => void;
  // For push mode
  projectId?: string;
  projectName?: string;
  hasExistingRemote?: boolean;
  existingRemoteUrl?: string;
  onPushComplete?: (repoUrl: string) => void;
}

type ModalStep = 'token' | 'repos' | 'newRepo' | 'processing' | 'result';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const GitHubModal: React.FC<GitHubModalProps> = ({
  isOpen,
  onClose,
  mode,
  onImportComplete,
  projectId,
  projectName,
  hasExistingRemote = false,
  existingRemoteUrl = '',
  onPushComplete,
}) => {
  const [step, setStep] = useState<ModalStep>('token');
  const [token, setToken] = useState('');
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenVerifying, setTokenVerifying] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [result, setResult] = useState<OperationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBackupOnly, setShowBackupOnly] = useState(false);

  // New repo form state
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  // Push options
  const [forcePush, setForcePush] = useState(false);
  const [pushMode, setPushMode] = useState<'new' | 'existing'>(hasExistingRemote ? 'existing' : 'new');
  const [includeContext, setIncludeContext] = useState(false); // Default false for safety

  // Initialize new repo name from project name
  useEffect(() => {
    if (mode === 'push' && projectName) {
      setNewRepoName(projectName.replace(/\s+/g, '-').toLowerCase());
    }
  }, [mode, projectName]);

  const loadRepos = useCallback(async (tokenToUse: string) => {
    setReposLoading(true);
    setError(null);
    try {
      const result = await githubApi.listRepos(tokenToUse);
      setRepos(result.repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setReposLoading(false);
    }
  }, []);

  const verifyAndProceed = useCallback(async (tokenToVerify: string) => {
    setTokenVerifying(true);
    setError(null);
    try {
      const verifyResult = await githubApi.verifyToken(tokenToVerify);
      if (verifyResult.valid) {
        await loadRepos(tokenToVerify);
        setStep('repos');
      } else {
        setError(verifyResult.error || 'Invalid token');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify token');
    } finally {
      setTokenVerifying(false);
      setTokenLoading(false);
    }
  }, [loadRepos]);

  // Load saved token on mount
  useEffect(() => {
    if (isOpen) {
      const loadSavedToken = async () => {
        setTokenLoading(true);
        try {
          const savedToken = await settingsApi.getBackupToken();
          if (savedToken.token) {
            setToken(savedToken.token);
            verifyAndProceed(savedToken.token);
          } else {
            setTokenLoading(false);
          }
        } catch {
          setTokenLoading(false);
        }
      };
      loadSavedToken();
    }
  }, [isOpen, verifyAndProceed]);

  const handleTokenSubmit = () => {
    if (!token.trim()) return;
    verifyAndProceed(token.trim());
  };

  // Import a repository
  const handleImport = async (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setStep('processing');
    setError(null);

    try {
      const importResult = await githubApi.importProject({
        url: repo.cloneUrl,
        token: repo.private ? token : undefined,
        branch: repo.hasFluidFlowBackup ? 'backup/auto' : repo.defaultBranch,
        name: repo.name,
      });

      setResult({
        success: true,
        project: importResult.project,
        restored: importResult.restored,
      });
      setStep('result');
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Import failed',
      });
      setStep('result');
    }
  };

  // Push to existing repository
  const handlePushToExisting = async (repo: GitHubRepo) => {
    if (!projectId) return;

    setSelectedRepo(repo);
    setStep('processing');
    setError(null);

    try {
      // Set remote first
      await githubApi.setRemote(projectId, repo.cloneUrl, 'origin');

      // Push with token for authentication
      await githubApi.push(projectId, { force: forcePush, token, includeContext });

      setResult({
        success: true,
        repoUrl: repo.url,
      });
      setStep('result');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Push failed';
      // Check if it's a diverged history error
      if (errorMsg.includes('rejected') || errorMsg.includes('diverged') || errorMsg.includes('non-fast-forward')) {
        setResult({
          success: false,
          error: `Push rejected: Remote has changes not in local. Enable "Force Push" to overwrite remote.`,
        });
      } else {
        setResult({
          success: false,
          error: errorMsg,
        });
      }
      setStep('result');
    }
  };

  // Create new repository and push
  const handleCreateAndPush = async () => {
    if (!projectId || !newRepoName.trim()) return;

    setStep('processing');
    setError(null);

    try {
      // Create repo
      const createResult = await githubApi.createRepo(projectId, token, {
        name: newRepoName.trim(),
        description: newRepoDescription.trim() || undefined,
        isPrivate,
      });

      // Push to the new repo with token for authentication
      await githubApi.push(projectId, { force: false, token, includeContext });

      setResult({
        success: true,
        repoUrl: createResult.repository.url,
      });
      setStep('result');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create repository';
      // Check if repo already exists
      if (errorMsg.includes('already exists') || errorMsg.includes('name already')) {
        setResult({
          success: false,
          error: `Repository "${newRepoName}" already exists. Choose a different name or push to existing repo.`,
        });
      } else {
        setResult({
          success: false,
          error: errorMsg,
        });
      }
      setStep('result');
    }
  };

  // Push to current remote
  const handlePushToCurrent = async () => {
    if (!projectId) return;

    setStep('processing');
    setError(null);

    try {
      await githubApi.push(projectId, { force: forcePush, token, includeContext });

      setResult({
        success: true,
        repoUrl: existingRemoteUrl.replace(/\.git$/, ''),
      });
      setStep('result');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Push failed';
      if (errorMsg.includes('rejected') || errorMsg.includes('diverged') || errorMsg.includes('non-fast-forward')) {
        setResult({
          success: false,
          error: `Push rejected: Remote has changes not in local. Enable "Force Push" to overwrite remote.`,
        });
      } else {
        setResult({
          success: false,
          error: errorMsg,
        });
      }
      setStep('result');
    }
  };

  const handleClose = useCallback(() => {
    setStep('token');
    setToken('');
    setRepos([]);
    setSearchQuery('');
    setSelectedRepo(null);
    setResult(null);
    setError(null);
    setShowBackupOnly(false);
    setNewRepoName('');
    setNewRepoDescription('');
    setIsPrivate(true);
    setForcePush(false);
    setPushMode('new');
    onClose();
  }, [onClose]);

  const handleComplete = () => {
    if (result?.success) {
      if (mode === 'import' && result.project && onImportComplete) {
        onImportComplete(result.project);
      } else if (mode === 'push' && result.repoUrl && onPushComplete) {
        onPushComplete(result.repoUrl);
      }
    }
    handleClose();
  };

  // Filter repos
  const filteredRepos = repos.filter(repo => {
    if (mode === 'import' && showBackupOnly && !repo.hasFluidFlowBackup) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      repo.name.toLowerCase().includes(query) ||
      repo.fullName.toLowerCase().includes(query) ||
      repo.description?.toLowerCase().includes(query)
    );
  });

  // Sort: FluidFlow backups first (for import), then by update time
  const sortedRepos = [...filteredRepos].sort((a, b) => {
    if (mode === 'import') {
      if (a.hasFluidFlowBackup && !b.hasFluidFlowBackup) return -1;
      if (!a.hasFluidFlowBackup && b.hasFluidFlowBackup) return 1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  if (!isOpen) return null;

  const isImport = mode === 'import';
  const isPush = mode === 'push';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-white/5 bg-slate-950 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isImport ? 'bg-slate-800' : 'bg-blue-500/20'}`}>
              {isImport ? (
                <Download className="w-5 h-5 text-white" />
              ) : (
                <Upload className="w-5 h-5 text-blue-400" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-white">
                {isImport ? 'Import from GitHub' : 'Push to GitHub'}
              </h3>
              <p className="text-xs text-slate-400">
                {step === 'token' && 'Enter your GitHub token to access repositories'}
                {step === 'repos' && (isImport ? 'Select a repository to import' : 'Select destination repository')}
                {step === 'newRepo' && 'Configure new repository'}
                {step === 'processing' && (isImport ? 'Importing project...' : 'Pushing to GitHub...')}
                {step === 'result' && (result?.success ? (isImport ? 'Import complete!' : 'Push complete!') : 'Operation failed')}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Token Input Step */}
          {step === 'token' && (
            <div className="p-6 space-y-4">
              {tokenLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                      GitHub Personal Access Token
                    </label>
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder-slate-600"
                      onKeyDown={(e) => e.key === 'Enter' && handleTokenSubmit()}
                      autoFocus
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Requires 'repo' scope for private repositories.{' '}
                      <a
                        href="https://github.com/settings/tokens/new?scopes=repo&description=FluidFlow"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        Create token <ExternalLink className="w-3 h-3 inline" />
                      </a>
                    </p>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  {isImport && (
                    <div className="bg-slate-800/50 rounded-lg p-4 border border-white/5">
                      <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                        <FolderGit className="w-4 h-4 text-emerald-400" />
                        FluidFlow Backup Detection
                      </h4>
                      <p className="text-xs text-slate-400">
                        Repositories with a <code className="px-1 py-0.5 bg-slate-700 rounded">backup/auto</code> branch
                        will be highlighted. These contain FluidFlow metadata that will be automatically restored.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Repository List Step */}
          {step === 'repos' && (
            <>
              {/* Push Mode Selector */}
              {isPush && (
                <div className="px-6 pt-4 pb-2 border-b border-white/5 flex-shrink-0">
                  <div className="flex p-1 bg-slate-950/50 rounded-lg border border-white/5">
                    <button
                      onClick={() => setPushMode('new')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        pushMode === 'new'
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                      New Repository
                    </button>
                    <button
                      onClick={() => setPushMode('existing')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                        pushMode === 'existing'
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Link2 className="w-4 h-4" />
                      Existing Repository
                    </button>
                  </div>

                  {/* Current Remote Info */}
                  {hasExistingRemote && pushMode === 'existing' && (
                    <div className="mt-3 flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-emerald-300 font-medium">Remote configured</p>
                        <p className="text-xs text-slate-400 truncate">{existingRemoteUrl}</p>
                      </div>
                      <button
                        onClick={handlePushToCurrent}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        Push Now
                      </button>
                    </div>
                  )}

                  {/* Force Push Option */}
                  {pushMode === 'existing' && (
                    <label className="mt-3 flex items-center gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg cursor-pointer hover:bg-amber-500/10 transition-colors">
                      <input
                        type="checkbox"
                        checked={forcePush}
                        onChange={(e) => setForcePush(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/50"
                      />
                      <div>
                        <span className="text-sm text-amber-300 font-medium">Force Push</span>
                        <p className="text-[10px] text-slate-500">
                          Overwrite remote history. Use if histories have diverged.
                        </p>
                      </div>
                    </label>
                  )}

                  {/* Include Context Option */}
                  <label className="mt-3 flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={includeContext}
                      onChange={(e) => setIncludeContext(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/50"
                    />
                    <div>
                      <span className="text-sm text-slate-300 font-medium">Include Conversation History</span>
                      <p className="text-[10px] text-slate-500">
                        Include AI chat history in .fluidflow/ folder. Useful for backup/restore.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* New Repo Form (for push mode) */}
              {isPush && pushMode === 'new' && (
                <div className="px-6 py-4 border-b border-white/5 space-y-4 flex-shrink-0">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                      Repository Name
                    </label>
                    <input
                      type="text"
                      value={newRepoName}
                      onChange={(e) => setNewRepoName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '-'))}
                      placeholder="my-awesome-app"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder-slate-600"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase block mb-1.5">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={newRepoDescription}
                      onChange={(e) => setNewRepoDescription(e.target.value)}
                      placeholder="A project created with FluidFlow"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder-slate-600"
                    />
                  </div>

                  {/* Private/Public Toggle */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setIsPrivate(true)}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                        isPrivate
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                          : 'bg-slate-800/50 border-white/5 text-slate-400 hover:border-white/10'
                      }`}
                    >
                      <Lock className="w-4 h-4" />
                      <span className="text-sm font-medium">Private</span>
                    </button>
                    <button
                      onClick={() => setIsPrivate(false)}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                        !isPrivate
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-800/50 border-white/5 text-slate-400 hover:border-white/10'
                      }`}
                    >
                      <Globe className="w-4 h-4" />
                      <span className="text-sm font-medium">Public</span>
                    </button>
                  </div>

                  {/* Include Context Option */}
                  <label className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={includeContext}
                      onChange={(e) => setIncludeContext(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/50"
                    />
                    <div>
                      <span className="text-sm text-slate-300 font-medium">Include Conversation History</span>
                      <p className="text-[10px] text-slate-500">
                        Include AI chat history in .fluidflow/ folder. {!isPrivate && <span className="text-amber-400">⚠ Public repo!</span>}
                      </p>
                    </div>
                  </label>

                  <button
                    onClick={handleCreateAndPush}
                    disabled={!newRepoName.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors"
                  >
                    <Github className="w-4 h-4" />
                    Create Repository & Push
                  </button>

                  <p className="text-center text-xs text-slate-500">
                    Or select an existing repository below
                  </p>
                </div>
              )}

              {/* Search and Filter Bar */}
              <div className="px-6 py-3 border-b border-white/5 flex items-center gap-3 flex-shrink-0">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search repositories..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>

                {isImport && (
                  <button
                    onClick={() => setShowBackupOnly(!showBackupOnly)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      showBackupOnly
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800/50 text-slate-400 border border-white/10 hover:bg-slate-800'
                    }`}
                  >
                    <FolderGit className="w-4 h-4" />
                    FluidFlow Only
                  </button>
                )}

                <button
                  onClick={() => loadRepos(token)}
                  disabled={reposLoading}
                  className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${reposLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Repository List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {reposLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <AlertTriangle className="w-12 h-12 mb-3 text-red-400 opacity-50" />
                    <p className="text-sm text-red-400">{error}</p>
                    <button
                      onClick={() => loadRepos(token)}
                      className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : sortedRepos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <Github className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-sm">
                      {searchQuery ? 'No repositories found' : 'No repositories available'}
                    </p>
                    {showBackupOnly && (
                      <p className="text-xs text-slate-500 mt-1">
                        Try disabling "FluidFlow Only" filter
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {sortedRepos.map((repo) => (
                      <button
                        key={repo.id}
                        onClick={() => isImport ? handleImport(repo) : handlePushToExisting(repo)}
                        className={`w-full group flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                          repo.hasFluidFlowBackup && isImport
                            ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/30'
                            : 'bg-slate-800/30 border-white/5 hover:bg-slate-800/60 hover:border-white/10'
                        }`}
                      >
                        {/* Icon */}
                        <div className={`p-2.5 rounded-xl ${
                          repo.hasFluidFlowBackup && isImport
                            ? 'bg-emerald-500/20'
                            : 'bg-slate-700/50 group-hover:bg-slate-700'
                        }`}>
                          {repo.hasFluidFlowBackup && isImport ? (
                            <FolderGit className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <Github className="w-5 h-5 text-slate-400" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-white truncate">
                              {repo.name}
                            </h3>
                            {repo.private ? (
                              <span title="Private"><Lock className="w-3.5 h-3.5 text-amber-400" /></span>
                            ) : (
                              <span title="Public"><Globe className="w-3.5 h-3.5 text-slate-500" /></span>
                            )}
                            {repo.hasFluidFlowBackup && isImport && (
                              <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded font-medium">
                                FluidFlow
                              </span>
                            )}
                          </div>
                          {repo.description && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              {repo.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-[10px] text-slate-500">
                              <Clock className="w-3 h-3" />
                              {formatDate(repo.updatedAt)}
                            </span>
                            <span className="text-[10px] text-slate-600">
                              {repo.fullName}
                            </span>
                          </div>
                        </div>

                        {/* Action indicator */}
                        <div className="flex items-center gap-2">
                          {isPush && (
                            <span className="text-xs text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              Push here
                            </span>
                          )}
                          <ChevronRight className="w-5 h-5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Processing Step */}
          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center">
                  {isImport ? (
                    <Download className="w-8 h-8 text-blue-400" />
                  ) : (
                    <Upload className="w-8 h-8 text-blue-400" />
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                </div>
              </div>
              <h4 className="mt-6 text-lg font-medium text-white">
                {isImport ? `Importing ${selectedRepo?.name || 'project'}` : 'Pushing to GitHub'}
              </h4>
              <p className="mt-2 text-sm text-slate-400">
                {isImport
                  ? selectedRepo?.hasFluidFlowBackup
                    ? 'Cloning repository and restoring FluidFlow metadata...'
                    : 'Cloning repository...'
                  : 'Creating repository and pushing files...'}
              </p>
            </div>
          )}

          {/* Result Step */}
          {step === 'result' && result && (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              {result.success ? (
                <>
                  <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center">
                    <Check className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h4 className="mt-6 text-lg font-medium text-white">
                    {isImport ? 'Import Successful!' : 'Push Successful!'}
                  </h4>
                  {isImport ? (
                    <p className="mt-2 text-sm text-slate-400">
                      Project "{result.project?.name}" has been imported.
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">
                      Your project has been pushed to GitHub.
                    </p>
                  )}

                  {/* Repo URL */}
                  {result.repoUrl && (
                    <a
                      href={result.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 flex items-center gap-2 text-blue-400 hover:text-blue-300 underline underline-offset-4"
                    >
                      View on GitHub <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}

                  {/* Restoration Status (import mode) */}
                  {isImport && result.restored && (
                    <div className="mt-6 w-full max-w-sm space-y-2">
                      <div className={`flex items-center gap-3 p-3 rounded-lg ${
                        result.restored.metadata
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : 'bg-slate-800/50 border border-white/5'
                      }`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          result.restored.metadata ? 'bg-emerald-500/20' : 'bg-slate-700'
                        }`}>
                          {result.restored.metadata ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <X className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-white">Project Metadata</p>
                          <p className="text-[10px] text-slate-500">
                            {result.restored.metadata ? 'Restored from backup' : 'Not found'}
                          </p>
                        </div>
                      </div>

                      <div className={`flex items-center gap-3 p-3 rounded-lg ${
                        result.restored.context
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : 'bg-slate-800/50 border border-white/5'
                      }`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          result.restored.context ? 'bg-emerald-500/20' : 'bg-slate-700'
                        }`}>
                          {result.restored.context ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <X className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-white">Conversation Context</p>
                          <p className="text-[10px] text-slate-500">
                            {result.restored.context ? 'Restored from backup' : 'Not found'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-400" />
                  </div>
                  <h4 className="mt-6 text-lg font-medium text-white">
                    {isImport ? 'Import Failed' : 'Push Failed'}
                  </h4>
                  <p className="mt-2 text-sm text-red-400 bg-red-950/50 p-3 rounded-lg border border-red-500/20 max-w-md text-center">
                    {result.error}
                  </p>
                  {result.error?.includes('Force Push') && (
                    <button
                      onClick={() => {
                        setForcePush(true);
                        setStep('repos');
                        setResult(null);
                      }}
                      className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Enable Force Push & Retry
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/50 border-t border-white/5 flex justify-between items-center flex-shrink-0">
          {step === 'repos' && (
            <button
              onClick={() => {
                setStep('token');
                setToken('');
              }}
              className="px-4 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg text-sm transition-colors"
            >
              Change Token
            </button>
          )}
          {step !== 'repos' && <div />}

          <div className="flex gap-3">
            {step === 'token' && !tokenLoading && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTokenSubmit}
                  disabled={!token.trim() || tokenVerifying}
                  className="px-4 py-2 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                  {tokenVerifying && <Loader2 className="w-4 h-4 animate-spin" />}
                  Continue
                </button>
              </>
            )}

            {step === 'repos' && (
              <button
                onClick={handleClose}
                className="px-4 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            )}

            {step === 'result' && (
              <button
                onClick={result?.success ? handleComplete : handleClose}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  result?.success
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}
              >
                {result?.success ? (isImport ? 'Open Project' : 'Done') : 'Close'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GitHubModal;
