import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen, ChevronUp, ChevronDown, Cloud, CloudOff, Plus,
  Clock, GitBranch, Check, Loader2, RefreshCw, X, Search, Trash2, Copy,
  AlertCircle, FolderPlus, MoreVertical, Save, FolderInput, AlertTriangle
} from 'lucide-react';
import type { ProjectMeta } from '@/services/projectApi';

interface GitStatus {
  initialized: boolean;
  branch?: string;
  clean?: boolean;
}

interface ProjectPanelProps {
  currentProject: ProjectMeta | null;
  projects: ProjectMeta[];
  isServerOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  isLoadingProjects: boolean;
  onCreateProject: (name?: string, description?: string) => Promise<ProjectMeta | null>;
  onOpenProject: (id: string) => Promise<boolean>;
  onDeleteProject: (id: string) => Promise<boolean>;
  onDuplicateProject: (id: string) => Promise<ProjectMeta | null>;
  onRefreshProjects: () => Promise<void>;
  onCloseProject: () => void;
  // Git props for status display
  gitStatus?: GitStatus | null;
  hasUncommittedChanges?: boolean;
  onOpenGitTab?: () => void;
  // Unsaved work handling
  hasUnsavedWork?: boolean;
  fileCount?: number;
  onSaveCurrentAsProject?: (name: string, description?: string) => Promise<ProjectMeta | null>;
  // Props for modal exclusivity
  shouldClose?: boolean;
  onClosed?: () => void;
  onOpened?: () => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const ProjectPanel: React.FC<ProjectPanelProps> = ({
  currentProject,
  projects,
  isServerOnline,
  isSyncing,
  lastSyncedAt,
  isLoadingProjects,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onDuplicateProject,
  onRefreshProjects,
  onCloseProject,
  gitStatus,
  hasUncommittedChanges,
  onOpenGitTab,
  hasUnsavedWork,
  fileCount = 0,
  onSaveCurrentAsProject,
  shouldClose,
  onClosed,
  onOpened
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Unsaved work modal state
  const [unsavedWorkModal, setUnsavedWorkModal] = useState<{
    isOpen: boolean;
    targetProjectId: string | null;
    targetProjectName?: string;
  }>({ isOpen: false, targetProjectId: null });
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsDescription, setSaveAsDescription] = useState('');

  // Handle modal exclusivity - close when shouldClose is true
  useEffect(() => {
    if (shouldClose && isOpen) {
      setIsOpen(false);
      onClosed?.();
    }
  }, [shouldClose, isOpen, onClosed]);

  // Filter projects
  const filteredProjects = projects.filter(project => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      project.name.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query)
    );
  });

  // Handle create project
  const handleCreate = async () => {
    if (!newProjectName.trim()) return;

    setActionLoading('create');
    try {
      await onCreateProject(newProjectName.trim(), newProjectDescription.trim() || undefined);
      setNewProjectName('');
      setNewProjectDescription('');
      setIsCreating(false);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle open project - check for unsaved work first
  const handleOpen = async (id: string) => {
    // If there's unsaved work and no current project, show the modal
    if (hasUnsavedWork && !currentProject) {
      const targetProject = projects.find(p => p.id === id);
      setUnsavedWorkModal({
        isOpen: true,
        targetProjectId: id,
        targetProjectName: targetProject?.name
      });
      return;
    }

    // Otherwise, open directly
    await doOpenProject(id);
  };

  // Actually open the project
  const doOpenProject = async (id: string) => {
    setActionLoading(id);
    try {
      await onOpenProject(id);
      setIsOpen(false);
      setUnsavedWorkModal({ isOpen: false, targetProjectId: null });
    } finally {
      setActionLoading(null);
    }
  };

  // Handle save current work as new project then open target
  const handleSaveAsNewThenOpen = async () => {
    if (!saveAsName.trim() || !onSaveCurrentAsProject) return;

    setActionLoading('save-as-new');
    try {
      await onSaveCurrentAsProject(saveAsName.trim(), saveAsDescription.trim() || undefined);
      setSaveAsName('');
      setSaveAsDescription('');

      // Now open the target project if one was selected
      if (unsavedWorkModal.targetProjectId) {
        await doOpenProject(unsavedWorkModal.targetProjectId);
      } else {
        setUnsavedWorkModal({ isOpen: false, targetProjectId: null });
        setIsOpen(false);
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Handle open anyway (discard unsaved work)
  const handleOpenAnyway = async () => {
    if (unsavedWorkModal.targetProjectId) {
      await doOpenProject(unsavedWorkModal.targetProjectId);
    }
  };

  // Handle delete project
  const handleDelete = async (id: string) => {
    setActionLoading(id);
    try {
      await onDeleteProject(id);
      setDeleteConfirmId(null);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle duplicate project
  const handleDuplicate = async (id: string) => {
    setActionLoading(id);
    try {
      await onDuplicateProject(id);
      setMenuOpenId(null);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="border-t border-white/5 pt-2 flex-none">
      {/* Main Project Button */}
      <button
        onClick={() => {
          const newOpenState = !isOpen;
          setIsOpen(newOpenState);
          if (newOpenState) {
            onOpened?.();
          }
        }}
        className="flex items-center justify-between w-full p-2 text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-white/5"
        aria-expanded={isOpen}
        aria-controls="project-panel"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <FolderOpen className="w-4 h-4" />
          <span className="truncate max-w-[120px]">
            {currentProject?.name || 'No Project'}
          </span>
          {/* Sync indicator */}
          {currentProject && (
            <span className="flex items-center">
              {isSyncing ? (
                <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
              ) : lastSyncedAt ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : null}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Server status */}
          {isServerOnline ? (
            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <CloudOff className="w-3.5 h-3.5 text-red-400" />
          )}
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Git Status Row - shown below project button when project is selected */}
      {currentProject && (
        <div className="flex items-center justify-between px-2 py-1.5">
          {/* Git Branch & Uncommitted Status */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenGitTab?.();
            }}
            className="flex items-center gap-2 text-xs hover:bg-white/5 rounded px-1.5 py-0.5 transition-colors"
          >
            <GitBranch className={`w-3.5 h-3.5 ${
              gitStatus?.initialized
                ? hasUncommittedChanges
                  ? 'text-amber-400'
                  : 'text-emerald-400'
                : 'text-slate-500'
            }`} />
            {gitStatus?.initialized ? (
              <span className={hasUncommittedChanges ? 'text-amber-400' : 'text-slate-400'}>
                {gitStatus.branch || 'main'}
              </span>
            ) : (
              <span className="text-slate-500">No git</span>
            )}
          </button>

          {/* Uncommitted Changes Indicator */}
          {hasUncommittedChanges && (
            <div
              className="flex items-center gap-1.5 px-1.5 py-0.5 bg-amber-500/10 rounded text-[10px] text-amber-400"
              title="Uncommitted changes - will survive F5 refresh"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>Uncommitted</span>
            </div>
          )}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            id="project-panel"
            className="w-full max-w-2xl bg-slate-950/98 backdrop-blur-xl rounded-2xl border border-white/10 animate-in zoom-in-95 duration-200 shadow-2xl overflow-hidden mx-4"
            style={{ maxHeight: 'calc(100vh - 100px)' }}
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <FolderOpen className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Projects</h2>
                <p className="text-xs text-slate-500">{projects.length} projects</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Server status badge */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${
                isServerOnline
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {isServerOnline ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
                {isServerOnline ? 'Online' : 'Offline'}
              </div>
              <button
                onClick={onRefreshProjects}
                disabled={isLoadingProjects}
                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                title="Refresh projects"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingProjects ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search and New Project */}
          <div className="flex items-center gap-2 p-3 border-b border-white/5">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-800/50 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
              />
            </div>
            <button
              onClick={() => setIsCreating(true)}
              disabled={!isServerOnline}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>

          {/* Create Project Form */}
          {isCreating && (
            <div className="p-3 border-b border-white/10 bg-slate-800/30">
              <div className="flex items-start gap-2">
                <FolderPlus className="w-4 h-4 text-emerald-400 mt-1.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Project name"
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  />
                  <input
                    type="text"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCreate}
                      disabled={!newProjectName.trim() || actionLoading === 'create'}
                      className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      {actionLoading === 'create' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setIsCreating(false);
                        setNewProjectName('');
                        setNewProjectDescription('');
                      }}
                      className="px-3 py-1 hover:bg-white/10 text-slate-400 rounded-lg text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Projects List */}
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {!isServerOnline ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <CloudOff className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">Server offline</p>
                <p className="text-[10px] text-slate-500 mt-1">Start backend on port 3200</p>
              </div>
            ) : isLoadingProjects ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <FolderOpen className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">{searchQuery ? 'No matches' : 'No projects'}</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {searchQuery ? 'Try different search' : 'Create your first project'}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    className={`group relative flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                      currentProject?.id === project.id
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-slate-800/30 border-transparent hover:bg-slate-800/60 hover:border-white/10'
                    }`}
                    onClick={() => handleOpen(project.id)}
                  >
                    {/* Icon */}
                    <div className={`p-1.5 rounded-lg ${
                      currentProject?.id === project.id
                        ? 'bg-blue-500/20'
                        : 'bg-slate-700/50'
                    }`}>
                      <FolderOpen className={`w-3.5 h-3.5 ${
                        currentProject?.id === project.id ? 'text-blue-400' : 'text-slate-400'
                      }`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-white truncate">
                          {project.name}
                        </span>
                        {currentProject?.id === project.id && (
                          <span className="px-1 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] rounded">
                            Active
                          </span>
                        )}
                        {project.gitInitialized && (
                          <GitBranch className="w-3 h-3 text-emerald-400" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDate(project.updatedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Loading */}
                    {actionLoading === project.id && (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    )}

                    {/* Actions Menu */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === project.id ? null : project.id);
                        }}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-all"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {menuOpenId === project.id && (
                        <div
                          className="absolute right-0 top-full mt-1 w-32 bg-slate-800 border border-white/10 rounded-lg shadow-xl overflow-hidden z-10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleDuplicate(project.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition-colors"
                          >
                            <Copy className="w-3 h-3" />
                            Duplicate
                          </button>
                          <button
                            onClick={() => {
                              setDeleteConfirmId(project.id);
                              setMenuOpenId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current Project Actions */}
          {currentProject && (
            <div className="p-3 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {isSyncing ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                    <span>Syncing...</span>
                  </>
                ) : lastSyncedAt ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Saved {formatDate(lastSyncedAt)}</span>
                  </>
                ) : (
                  <span>Not synced</span>
                )}
              </div>
              <button
                onClick={() => {
                  onCloseProject();
                  setIsOpen(false);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
              >
                <X className="w-3 h-3" />
                Close Project
              </button>
            </div>
          )}

          {/* Delete Confirmation */}
          {deleteConfirmId && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl">
              <div className="bg-slate-900 border border-white/10 rounded-xl p-4 max-w-xs mx-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-medium text-white">Delete Project?</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  This will permanently delete all files. Cannot be undone.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(deleteConfirmId)}
                    disabled={actionLoading === deleteConfirmId}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    {actionLoading === deleteConfirmId ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    Delete
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
          {/* Click outside to close */}
          <div className="absolute inset-0 -z-10" onClick={() => setIsOpen(false)} />
        </div>
      )}

      {/* Unsaved Work Modal */}
      {unsavedWorkModal.isOpen && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setUnsavedWorkModal({ isOpen: false, targetProjectId: null })}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden mx-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-white/10 bg-amber-500/5">
              <div className="p-2.5 bg-amber-500/20 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">Unsaved Work Detected</h3>
                <p className="text-sm text-slate-400">
                  {fileCount} file{fileCount !== 1 ? 's' : ''} generated without a project
                </p>
              </div>
              <button
                onClick={() => setUnsavedWorkModal({ isOpen: false, targetProjectId: null })}
                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300">
                You have generated code that isn't saved to any project.
                {unsavedWorkModal.targetProjectName && (
                  <span className="text-amber-400"> Opening "{unsavedWorkModal.targetProjectName}" will replace your current work.</span>
                )}
              </p>

              {/* Option 1: Save as New Project */}
              <div className="p-4 bg-slate-800/50 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Save className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-white">Save as New Project</span>
                </div>
                <input
                  type="text"
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  placeholder="Project name"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50"
                />
                <input
                  type="text"
                  value={saveAsDescription}
                  onChange={(e) => setSaveAsDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50"
                />
                <button
                  onClick={handleSaveAsNewThenOpen}
                  disabled={!saveAsName.trim() || actionLoading === 'save-as-new' || !onSaveCurrentAsProject}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {actionLoading === 'save-as-new' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save & {unsavedWorkModal.targetProjectId ? 'Continue' : 'Done'}
                </button>
              </div>

              {/* Option 2: Open Anyway */}
              {unsavedWorkModal.targetProjectId && (
                <button
                  onClick={handleOpenAnyway}
                  disabled={actionLoading === unsavedWorkModal.targetProjectId}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-800 border border-white/5 hover:border-red-500/30 rounded-xl text-sm transition-all group"
                >
                  <FolderInput className="w-4 h-4 text-slate-400 group-hover:text-red-400" />
                  <span className="text-slate-300 group-hover:text-red-300">
                    Open Anyway
                  </span>
                  <span className="text-xs text-slate-500 group-hover:text-red-400/70">
                    (lose current work)
                  </span>
                </button>
              )}

              {/* Info */}
              <div className="flex items-start gap-2 text-xs text-slate-500">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>Your generated code only exists in memory. Saving to a project will persist it to disk.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-4 border-t border-white/10 bg-slate-950/50">
              <button
                onClick={() => setUnsavedWorkModal({ isOpen: false, targetProjectId: null })}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
