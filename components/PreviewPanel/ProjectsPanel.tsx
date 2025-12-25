/**
 * Projects Panel
 *
 * Embedded project management panel for the PreviewPanel tabs.
 * Provides project listing, creation, import from GitHub, push to GitHub, and project switching.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FolderOpen, Plus, Trash2, Copy, Clock, GitBranch, RefreshCw,
  Search, MoreVertical, Check, AlertCircle, FolderPlus, Loader2, Github,
  FolderGit, Upload, Pencil, X, Package, Sparkles
} from 'lucide-react';
import type { ProjectMeta } from '@/services/projectApi';
import { projectApi } from '@/services/projectApi';
import { githubApi } from '@/services/api/github';
import { useAppContext } from '@/contexts/AppContext';
import { GitHubModal, type GitHubModalMode } from '../GitHubModal';
import { ConfirmModal } from '../shared/BaseModal';

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

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const ProjectsPanel: React.FC = () => {
  const { currentProject, openProject } = useAppContext();

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit project state
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // GitHub modal state
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [gitHubModalMode, setGitHubModalMode] = useState<GitHubModalMode>('import');
  const [pushProjectId, setPushProjectId] = useState<string | null>(null);
  const [pushProjectName, setPushProjectName] = useState<string>('');
  const [hasExistingRemote, setHasExistingRemote] = useState(false);
  const [existingRemoteUrl, setExistingRemoteUrl] = useState('');

  // Bulk node_modules cleanup state
  const [isCleaningAll, setIsCleaningAll] = useState(false);

  // Load projects
  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const projectList = await projectApi.list();
      setProjects(projectList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Filter projects
  const filteredProjects = projects.filter(project => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      project.name.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query)
    );
  });

  // Calculate node_modules summary
  const nodeModulesSummary = useMemo(() => {
    const projectsWithNodeModules = projects.filter(
      p => p.hasNodeModules && p.nodeModulesSize && p.nodeModulesSize > 0
    );
    const totalSize = projectsWithNodeModules.reduce(
      (sum, p) => sum + (p.nodeModulesSize || 0),
      0
    );
    return {
      count: projectsWithNodeModules.length,
      totalSize,
      projects: projectsWithNodeModules,
    };
  }, [projects]);

  // Handle create project
  const handleCreate = async () => {
    if (!newProjectName.trim()) return;

    setActionLoading('create');
    try {
      const newProject = await projectApi.create({
        name: newProjectName.trim(),
        description: newProjectDescription.trim() || undefined,
      });
      // Add to list (Project has id, name, etc.)
      setProjects(prev => [{
        id: newProject.id,
        name: newProject.name,
        description: newProject.description,
        createdAt: newProject.createdAt,
        updatedAt: newProject.updatedAt,
        gitInitialized: newProject.gitInitialized,
      }, ...prev]);
      setNewProjectName('');
      setNewProjectDescription('');
      setIsCreating(false);
      // Auto-open the new project
      if (openProject) {
        await openProject(newProject.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle open project
  const handleOpen = async (id: string) => {
    if (id === currentProject?.id) return;
    setActionLoading(id);
    try {
      if (openProject) {
        await openProject(id);
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Handle delete project
  const handleDelete = async (id: string) => {
    setActionLoading(id);
    try {
      await projectApi.delete(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle duplicate project
  const handleDuplicate = async (id: string) => {
    setActionLoading(id);
    try {
      const duplicatedProject = await projectApi.duplicate(id);
      setProjects(prev => [duplicatedProject, ...prev]);
      setMenuOpenId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate project');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle clean node_modules
  const handleCleanNodeModules = async (id: string) => {
    setActionLoading(id);
    setMenuOpenId(null);
    try {
      const result = await projectApi.cleanNodeModules(id);
      // Update local state to reflect node_modules removal
      setProjects(prev => prev.map(p =>
        p.id === id
          ? { ...p, hasNodeModules: false, nodeModulesSize: 0 }
          : p
      ));
      // Show success message via error state (temporary)
      setError(`Cleaned ${result.freedMB} MB from node_modules`);
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clean node_modules');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle clean ALL node_modules
  const handleCleanAllNodeModules = async () => {
    if (nodeModulesSummary.count === 0) return;

    setIsCleaningAll(true);
    let totalFreed = 0;
    let cleaned = 0;

    try {
      for (const project of nodeModulesSummary.projects) {
        try {
          const result = await projectApi.cleanNodeModules(project.id);
          totalFreed += result.freedMB;
          cleaned++;
          // Update local state for each cleaned project
          setProjects(prev => prev.map(p =>
            p.id === project.id
              ? { ...p, hasNodeModules: false, nodeModulesSize: 0 }
              : p
          ));
        } catch {
          // Continue with next project even if one fails
        }
      }

      setError(`Cleaned ${cleaned} project(s), freed ${totalFreed.toFixed(1)} MB`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsCleaningAll(false);
    }
  };

  // Start editing a project
  const handleStartEdit = (project: ProjectMeta) => {
    setEditingProjectId(project.id);
    setEditName(project.name);
    setEditDescription(project.description || '');
    setMenuOpenId(null);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingProjectId(null);
    setEditName('');
    setEditDescription('');
  };

  // Save edited project
  const handleSaveEdit = async () => {
    if (!editingProjectId || !editName.trim()) return;

    setActionLoading(editingProjectId);
    try {
      await projectApi.update(editingProjectId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      // Update local state
      setProjects(prev => prev.map(p =>
        p.id === editingProjectId
          ? { ...p, name: editName.trim(), description: editDescription.trim() || undefined }
          : p
      ));
      setEditingProjectId(null);
      setEditName('');
      setEditDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setActionLoading(null);
    }
  };

  // Open GitHub modal for import
  const handleOpenImport = () => {
    setGitHubModalMode('import');
    setPushProjectId(null);
    setPushProjectName('');
    setHasExistingRemote(false);
    setExistingRemoteUrl('');
    setShowGitHubModal(true);
  };

  // Open GitHub modal for push
  const handleOpenPush = async (projectId: string, projectName: string) => {
    setGitHubModalMode('push');
    setPushProjectId(projectId);
    setPushProjectName(projectName);
    setMenuOpenId(null);

    // Load remote info
    try {
      const result = await githubApi.getRemotes(projectId);
      if (result.initialized && result.remotes.length > 0) {
        const origin = result.remotes.find(r => r.name === 'origin');
        if (origin) {
          setHasExistingRemote(true);
          setExistingRemoteUrl(origin.push || origin.fetch || '');
        } else {
          setHasExistingRemote(false);
          setExistingRemoteUrl('');
        }
      } else {
        setHasExistingRemote(false);
        setExistingRemoteUrl('');
      }
    } catch {
      setHasExistingRemote(false);
      setExistingRemoteUrl('');
    }

    setShowGitHubModal(true);
  };

  // Handle GitHub import complete
  const handleGitHubImportComplete = (project: ProjectMeta) => {
    setShowGitHubModal(false);
    setProjects(prev => [project, ...prev]);
    if (openProject) {
      openProject(project.id);
    }
  };

  // Handle GitHub push complete
  const handleGitHubPushComplete = () => {
    setShowGitHubModal(false);
    // Refresh projects to update any metadata changes
    loadProjects();
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClick = () => setMenuOpenId(null);
    if (menuOpenId) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuOpenId]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-900/50">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-white/5 bg-slate-900/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Projects</h2>
            <span className="text-xs text-slate-500">({projects.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadProjects}
              disabled={isLoading}
              className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            {/* Push current project to GitHub */}
            {currentProject && (
              <button
                onClick={() => handleOpenPush(currentProject.id, currentProject.name)}
                className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs font-medium transition-colors border border-blue-500/30"
                title="Push current project to GitHub"
              >
                <Upload className="w-3.5 h-3.5" />
                Push
              </button>
            )}
            <button
              onClick={handleOpenImport}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors border border-white/10"
              title="Import from GitHub"
            >
              <Github className="w-3.5 h-3.5" />
              Import
            </button>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-9 pr-4 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
      </div>

      {/* node_modules Summary Banner */}
      {nodeModulesSummary.count > 0 && (
        <div className="flex-none px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-amber-300">
                <span className="font-medium">{nodeModulesSummary.count}</span> project{nodeModulesSummary.count > 1 ? 's' : ''} with node_modules
              </span>
              <span className="text-xs text-amber-500">
                ({formatSize(nodeModulesSummary.totalSize)} total)
              </span>
            </div>
            <button
              onClick={handleCleanAllNodeModules}
              disabled={isCleaningAll}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 disabled:bg-amber-500/10 text-amber-400 rounded-lg text-xs font-medium transition-colors"
            >
              {isCleaningAll ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Clean All
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error / Success Message */}
      {error && (
        <div className={`flex-none px-4 py-2 border-b ${error.includes('Cleaned') ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
          <div className={`flex items-center gap-2 text-xs ${error.includes('Cleaned') ? 'text-emerald-400' : 'text-red-400'}`}>
            {error.includes('Cleaned') ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {error}
            <button onClick={() => setError(null)} className={`ml-auto ${error.includes('Cleaned') ? 'hover:text-emerald-300' : 'hover:text-red-300'}`}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create Project Form */}
      {isCreating && (
        <div className="flex-none px-4 py-3 border-b border-white/10 bg-slate-800/30">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg mt-0.5">
              <FolderPlus className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <input
                type="text"
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newProjectName.trim() || actionLoading === 'create'}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  {actionLoading === 'create' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Create
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setNewProjectName('');
                    setNewProjectDescription('');
                  }}
                  className="px-3 py-1.5 hover:bg-white/10 text-slate-400 rounded-lg text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <FolderOpen className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">
              {searchQuery ? 'No projects found' : 'No projects yet'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {searchQuery ? 'Try a different search' : 'Create your first project to get started'}
            </p>
          </div>
        ) : (
          <div className="p-3 grid grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className={`group relative flex flex-col p-3 rounded-xl border transition-all cursor-pointer ${
                  currentProject?.id === project.id
                    ? 'bg-blue-500/10 border-blue-500/30 ring-1 ring-blue-500/20'
                    : 'bg-slate-800/30 border-white/5 hover:bg-slate-800/60 hover:border-white/10'
                }`}
                onClick={() => handleOpen(project.id)}
              >
                {/* Header: Icon + Menu */}
                <div className="flex items-start justify-between mb-2">
                  <div className={`p-2 rounded-lg ${
                    currentProject?.id === project.id
                      ? 'bg-blue-500/20'
                      : 'bg-slate-700/50 group-hover:bg-slate-700'
                  }`}>
                    {project.gitInitialized ? (
                      <FolderGit className={`w-5 h-5 ${
                        currentProject?.id === project.id ? 'text-blue-400' : 'text-emerald-400'
                      }`} />
                    ) : (
                      <FolderOpen className={`w-5 h-5 ${
                        currentProject?.id === project.id ? 'text-blue-400' : 'text-slate-400'
                      }`} />
                    )}
                  </div>

                  {/* Loading or Menu */}
                  {actionLoading === project.id && editingProjectId !== project.id ? (
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  ) : editingProjectId !== project.id && (
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === project.id ? null : project.id);
                        }}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-all"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menuOpenId === project.id && (
                        <div
                          className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-white/10 rounded-lg shadow-xl overflow-hidden z-20"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleStartEdit(project)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleOpenPush(project.id, project.name)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-blue-400 hover:bg-blue-500/10 transition-colors"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Push to GitHub
                          </button>
                          <button
                            onClick={() => handleDuplicate(project.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Duplicate
                          </button>
                          <button
                            onClick={() => {
                              setDeleteConfirmId(project.id);
                              setMenuOpenId(null);
                            }}
                            disabled={currentProject?.id === project.id}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Edit Form */}
                {editingProjectId === project.id ? (
                  <div className="flex-1 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Project name"
                      className="w-full px-2 py-1.5 bg-slate-800 border border-white/20 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description"
                      className="w-full px-2 py-1.5 bg-slate-800 border border-white/20 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={!editName.trim() || actionLoading === project.id}
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded text-xs font-medium transition-colors"
                      >
                        {actionLoading === project.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="flex items-center gap-1 px-2 py-1 hover:bg-white/10 text-slate-400 rounded text-xs transition-colors"
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Project Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-white truncate">
                          {project.name}
                        </h3>
                        {currentProject?.id === project.id && (
                          <span className="shrink-0 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded">
                            Active
                          </span>
                        )}
                      </div>
                      {project.description && (
                        <p className="text-xs text-slate-500 truncate">
                          {project.description}
                        </p>
                      )}
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-white/5">
                      <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Clock className="w-3 h-3" />
                        {formatDate(project.updatedAt)}
                      </span>
                      {project.gitInitialized && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                          <GitBranch className="w-3 h-3" />
                          Git
                        </span>
                      )}
                    </div>

                    {/* node_modules info with clean button */}
                    {project.hasNodeModules && project.nodeModulesSize && project.nodeModulesSize > 0 && (
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                        <span className="flex items-center gap-1.5 text-[10px] text-amber-500">
                          <Package className="w-3.5 h-3.5" />
                          node_modules: {formatSize(project.nodeModulesSize)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCleanNodeModules(project.id);
                          }}
                          className="px-2 py-0.5 text-[10px] font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded transition-colors"
                        >
                          Clean
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        title="Delete Project?"
        message="This will permanently delete the project and all its files. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        icon={<AlertCircle className="w-5 h-5 text-red-400" />}
        isLoading={!!deleteConfirmId && actionLoading === deleteConfirmId}
      />

      {/* GitHub Modal (Import/Push) */}
      <GitHubModal
        isOpen={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
        mode={gitHubModalMode}
        onImportComplete={handleGitHubImportComplete}
        projectId={pushProjectId || undefined}
        projectName={pushProjectName}
        hasExistingRemote={hasExistingRemote}
        existingRemoteUrl={existingRemoteUrl}
        onPushComplete={handleGitHubPushComplete}
      />
    </div>
  );
};

export default ProjectsPanel;
