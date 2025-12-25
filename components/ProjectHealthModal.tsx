/**
 * ProjectHealthModal
 *
 * Displays project health status and allows fixing issues
 * like missing package.json, vite.config.ts, etc.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Wrench,
  FileX,
  FileWarning,
  Loader2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  checkProjectHealth,
  applyFixes,
  type HealthCheckResult,
  type HealthIssue,
} from '../services/projectHealth';
import type { FileSystem } from '../types';

interface ProjectHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
  projectName?: string;
  onApplyFixes: (fixes: Record<string, string>) => void;
}

export const ProjectHealthModal: React.FC<ProjectHealthModalProps> = ({
  isOpen,
  onClose,
  files,
  projectName,
  onApplyFixes,
}) => {
  const [isFixing, setIsFixing] = useState(false);
  const [fixedIssues, setFixedIssues] = useState<Set<string>>(new Set());
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  // Reset state when project changes (files or projectName)
  useEffect(() => {
    setFixedIssues(new Set());
    setSelectedIssues(new Set());
    setExpandedIssues(new Set());
  }, [files, projectName]);

  // Run health check
  const healthCheck = useMemo<HealthCheckResult>(() => {
    return checkProjectHealth(files, projectName);
  }, [files, projectName]);

  // Filter out already fixed issues
  const activeIssues = useMemo(() => {
    return healthCheck.issues.filter((i) => !fixedIssues.has(i.id));
  }, [healthCheck.issues, fixedIssues]);

  const toggleIssue = (id: string) => {
    setSelectedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    const fixableIds = activeIssues.filter((i) => i.fixable).map((i) => i.id);
    setSelectedIssues(new Set(fixableIds));
  };

  const selectNone = () => {
    setSelectedIssues(new Set());
  };

  const handleFixSelected = async () => {
    const issuesToFix = activeIssues.filter(
      (i) => selectedIssues.has(i.id) && i.fixable
    );

    if (issuesToFix.length === 0) return;

    setIsFixing(true);

    try {
      // Small delay for UX
      await new Promise((r) => setTimeout(r, 500));

      const fixes = applyFixes(issuesToFix);
      onApplyFixes(fixes);

      // Mark as fixed
      setFixedIssues((prev) => {
        const next = new Set(prev);
        issuesToFix.forEach((i) => next.add(i.id));
        return next;
      });
      setSelectedIssues(new Set());
    } finally {
      setIsFixing(false);
    }
  };

  const handleFixAll = async () => {
    const fixableIssues = activeIssues.filter((i) => i.fixable);
    if (fixableIssues.length === 0) return;

    setIsFixing(true);

    try {
      await new Promise((r) => setTimeout(r, 500));

      const fixes = applyFixes(fixableIssues);
      onApplyFixes(fixes);

      // Mark all as fixed
      setFixedIssues((prev) => {
        const next = new Set(prev);
        fixableIssues.forEach((i) => next.add(i.id));
        return next;
      });
      setSelectedIssues(new Set());
    } finally {
      setIsFixing(false);
    }
  };

  const getStatusIcon = (status: HealthCheckResult['status']) => {
    switch (status) {
      case 'healthy':
        return <ShieldCheck className="w-6 h-6 text-emerald-400" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-amber-400" />;
      case 'critical':
        return <AlertCircle className="w-6 h-6 text-red-400" />;
    }
  };

  const getIssueIcon = (issue: HealthIssue) => {
    if (issue.type === 'missing') {
      return <FileX className="w-4 h-4" />;
    }
    return <FileWarning className="w-4 h-4" />;
  };

  const getSeverityColor = (severity: HealthIssue['severity']) => {
    switch (severity) {
      case 'error':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'warning':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'info':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    }
  };

  if (!isOpen) return null;

  const allHealthy = activeIssues.length === 0;
  const fixableCount = activeIssues.filter((i) => i.fixable).length;
  const selectedCount = selectedIssues.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                allHealthy
                  ? 'bg-emerald-500/20'
                  : healthCheck.status === 'critical'
                    ? 'bg-red-500/20'
                    : 'bg-amber-500/20'
              }`}
            >
              {getStatusIcon(allHealthy ? 'healthy' : healthCheck.status)}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Project Health</h2>
              <p className="text-sm text-slate-400">
                {allHealthy
                  ? 'All critical files are present and valid'
                  : `${activeIssues.length} issue(s) found`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {allHealthy ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                Project is Healthy
              </h3>
              <p className="text-slate-400 max-w-md">
                All critical configuration files are present and valid.
                Your project is ready to run.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Selection controls */}
              {fixableCount > 0 && (
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Select All ({fixableCount})
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      onClick={selectNone}
                      className="text-xs text-slate-400 hover:text-slate-300"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedCount} selected
                  </div>
                </div>
              )}

              {/* Issues list */}
              {activeIssues.map((issue) => (
                <div
                  key={issue.id}
                  className={`border rounded-lg overflow-hidden transition-colors ${getSeverityColor(
                    issue.severity
                  )}`}
                >
                  <div className="flex items-center gap-3 p-3">
                    {issue.fixable && (
                      <input
                        type="checkbox"
                        checked={selectedIssues.has(issue.id)}
                        onChange={() => toggleIssue(issue.id)}
                        className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50"
                      />
                    )}
                    <div
                      className={`p-1.5 rounded ${
                        issue.severity === 'error'
                          ? 'bg-red-500/20'
                          : issue.severity === 'warning'
                            ? 'bg-amber-500/20'
                            : 'bg-blue-500/20'
                      }`}
                    >
                      {getIssueIcon(issue)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-white">
                          {issue.file}
                        </code>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-medium ${
                            issue.type === 'missing'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {issue.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {issue.message}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleExpand(issue.id)}
                      className="p-1 hover:bg-white/10 rounded"
                    >
                      {expandedIssues.has(issue.id) ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </div>

                  {/* Expanded details */}
                  {expandedIssues.has(issue.id) && (
                    <div className="px-4 pb-3 border-t border-white/5">
                      <div className="flex items-start gap-2 pt-3">
                        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-slate-400">
                          {issue.fixable ? (
                            <>
                              This issue can be automatically fixed by generating
                              a default <code className="text-white">{issue.file}</code> file.
                            </>
                          ) : (
                            'This issue requires manual intervention.'
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <RefreshCw className="w-3.5 h-3.5" />
            Checked {new Date(healthCheck.checkedAt).toLocaleTimeString()}
          </div>

          <div className="flex items-center gap-3">
            {!allHealthy && fixableCount > 0 && (
              <>
                {selectedCount > 0 && (
                  <button
                    onClick={handleFixSelected}
                    disabled={isFixing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {isFixing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wrench className="w-4 h-4" />
                    )}
                    Fix Selected ({selectedCount})
                  </button>
                )}
                <button
                  onClick={handleFixAll}
                  disabled={isFixing}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-emerald-500/20"
                >
                  {isFixing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Fix All ({fixableCount})
                </button>
              </>
            )}
            {allHealthy && (
              <button
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectHealthModal;
