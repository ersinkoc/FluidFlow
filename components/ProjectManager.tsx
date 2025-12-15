import React, { useState, useEffect } from 'react';
import {
  FolderOpen, Plus, Trash2, Copy, Clock, GitBranch, CloudOff, RefreshCw,
  Search, MoreVertical, Check, AlertCircle, FolderPlus, Loader2
} from 'lucide-react';
import type { ProjectMeta } from '@/services/projectApi';
import { BaseModal, ConfirmModal } from './shared/BaseModal';

interface ProjectManagerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectMeta[];
  currentProjectId?: string;
  isLoading: boolean;
  isServerOnline: boolean;
  onCreateProject: (name?: string, description?: string) => Promise<void>;
  onOpenProject: (id: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onDuplicateProject: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
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

export const ProjectManager: React.FC<ProjectManagerProps> = ({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  isLoading,
  isServerOnline,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onDuplicateProject,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  // Handle open project
  const handleOpen = async (id: string) => {
    setActionLoading(id);
    try {
      await onOpenProject(id);
      onClose();
    } finally {
      setActionLoading(null);
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

  // Close menu on outside click
  useEffect(() => {
    const handleClick = () => setMenuOpenId(null);
    if (menuOpenId) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuOpenId]);

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        title="Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''}`}
        icon={<FolderOpen className="w-5 h-5 text-blue-400" />}
        size="lg"
        maxHeight="max-h-[80vh]"
        zIndex="z-50"
      >

        {/* Search and Create */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-white/5">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh projects"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* New Project Button */}
          <button
            onClick={() => setIsCreating(true)}
            disabled={!isServerOnline}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        {/* Create Project Form */}
        {isCreating && (
          <div className="px-6 py-4 border-b border-white/10 bg-slate-800/30">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-500/20 rounded-lg mt-0.5">
                <FolderPlus className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 space-y-3">
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
                    className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {actionLoading === 'create' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false);
                      setNewProjectName('');
                      setNewProjectDescription('');
                    }}
                    className="px-4 py-1.5 hover:bg-white/10 text-slate-400 rounded-lg text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {!isServerOnline ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <CloudOff className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">Server is offline</p>
              <p className="text-xs text-slate-500 mt-1">Check if backend is running on port 3200</p>
            </div>
          ) : isLoading ? (
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
            <div className="p-3 space-y-2">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className={`group relative flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                    currentProjectId === project.id
                      ? 'bg-blue-500/10 border-blue-500/30'
                      : 'bg-slate-800/30 border-white/5 hover:bg-slate-800/60 hover:border-white/10'
                  }`}
                  onClick={() => handleOpen(project.id)}
                >
                  {/* Icon */}
                  <div className={`p-2.5 rounded-xl ${
                    currentProjectId === project.id
                      ? 'bg-blue-500/20'
                      : 'bg-slate-700/50 group-hover:bg-slate-700'
                  }`}>
                    <FolderOpen className={`w-5 h-5 ${
                      currentProjectId === project.id ? 'text-blue-400' : 'text-slate-400'
                    }`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white truncate">
                        {project.name}
                      </h3>
                      {currentProjectId === project.id && (
                        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded">
                          Current
                        </span>
                      )}
                      {project.gitInitialized && (
                        <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                    </div>
                    {project.description && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {project.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Clock className="w-3 h-3" />
                        {formatDate(project.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Loading */}
                  {actionLoading === project.id && (
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  )}

                  {/* Actions Menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === project.id ? null : project.id);
                      }}
                      className="p-2 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuOpenId === project.id && (
                      <div
                        className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-white/10 rounded-lg shadow-xl overflow-hidden z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleDuplicate(project.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-white/10 transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                          Duplicate
                        </button>
                        <button
                          onClick={() => {
                            setDeleteConfirmId(project.id);
                            setMenuOpenId(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
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

      </BaseModal>

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
    </>
  );
};

export default ProjectManager;
