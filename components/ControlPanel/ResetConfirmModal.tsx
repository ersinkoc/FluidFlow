import React from 'react';
import { AlertTriangle, X, RotateCcw, MessageSquare, FileCode, History, Server, FolderOpen } from 'lucide-react';

interface ResetConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentProjectName?: string;
  hasUncommittedChanges?: boolean;
  onOpenGitTab?: () => void;
  hasRunningServer?: boolean;
}

export function ResetConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  currentProjectName,
  hasUncommittedChanges,
  onOpenGitTab,
  hasRunningServer
}: ResetConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-950/98 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden mx-4 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-white/10 bg-red-500/5">
          <div className="p-2 bg-red-500/20 rounded-xl">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">Start Fresh?</h3>
            <p className="text-sm text-slate-400">This action cannot be undone</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300">
            Starting fresh will clear the following:
          </p>

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
              <MessageSquare className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Chat History</p>
                <p className="text-xs text-slate-500">All messages and conversation context</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
              <FileCode className="w-5 h-5 text-purple-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Generated Code</p>
                <p className="text-xs text-slate-500">All files and the preview will be cleared</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
              <History className="w-5 h-5 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Version History</p>
                <p className="text-xs text-slate-500">All undo/redo states will be lost</p>
              </div>
            </div>

            {/* Running Server */}
            {hasRunningServer && (
              <div className="flex items-center gap-3 p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                <Server className="w-5 h-5 text-orange-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-300">Running Server</p>
                  <p className="text-xs text-orange-400/70">Development server will be stopped</p>
                </div>
              </div>
            )}

            {/* Current Project */}
            {currentProjectName && (
              <div className="flex items-center gap-3 p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                <FolderOpen className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-cyan-300">Project: {currentProjectName}</p>
                  <p className="text-xs text-cyan-400/70">Project will be closed (saved changes preserved)</p>
                </div>
              </div>
            )}
          </div>

          {/* Uncommitted Changes Warning */}
          {currentProjectName && hasUncommittedChanges && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Uncommitted Changes</p>
                  <p className="text-xs text-amber-400/80 mt-1">
                    You have unsaved changes in project "{currentProjectName}".
                    These changes will be lost if you reset.
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenGitTab?.();
                    }}
                    className="text-xs text-amber-300 hover:text-amber-200 underline mt-2"
                  >
                    Review changes in Git tab
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-5 border-t border-white/10 bg-slate-900/30">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Yes, Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
}
