/**
 * Code Quality Panel
 *
 * Displays code quality metrics and issues for the current file
 */

import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle,
  FileCode,
  LineChart,
  Activity,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Bug,
  Code
} from 'lucide-react';
import { FileSystem } from '../../types';

export interface QualityIssue {
  id: string;
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule: string;
  fixable?: boolean;
}

export interface FileMetrics {
  path: string;
  lines: number;
  blankLines: number;
  codeLines: number;
  commentLines: number;
  complexity: number;
  imports: string[];
  exports: string[];
}

interface CodeQualityPanelProps {
  files: FileSystem;
  activeFile: string;
  onRunLint?: () => void;
}

// Simple complexity calculator (cyclomatic complexity approximation)
function calculateComplexity(code: string): number {
  const keywords = ['if', 'else', 'for', 'while', 'case', 'catch', 'switch', '&&', '||', '?'];
  let complexity = 1; // Base complexity

  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'g');
    const matches = code.match(regex);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
}

// Extract imports from code
function extractImports(code: string): string[] {
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
  const imports: string[] = [];
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

// Extract exports from code
function extractExports(code: string): string[] {
  const exports: string[] = [];

  // Named exports: export const/func/class name
  const namedExportRegex = /export\s+(?:const|function|class|interface|type)\s+(\w+)/g;
  let match;
  while ((match = namedExportRegex.exec(code)) !== null) {
    exports.push(match[1]);
  }

  // Default exports
  if (/export\s+default/.test(code)) {
    exports.push('default');
  }

  return exports;
}

// Analyze file metrics
function analyzeFileMetrics(filePath: string, content: string): FileMetrics {
  const lines = content.split('\n');
  const totalLines = lines.length;

  let blankLines = 0;
  let commentLines = 0;
  let codeLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      blankLines++;
    } else if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      commentLines++;
    } else {
      codeLines++;
    }
  }

  return {
    path: filePath,
    lines: totalLines,
    blankLines,
    codeLines,
    commentLines,
    complexity: calculateComplexity(content),
    imports: extractImports(content),
    exports: extractExports(content),
  };
}

// Generate quality issues based on simple rules
function generateQualityIssues(metrics: FileMetrics, content: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Check for high complexity
  if (metrics.complexity > 20) {
    issues.push({
      id: `complexity-${metrics.path}`,
      file: metrics.path,
      line: 1,
      column: 1,
      severity: 'warning',
      message: `File has high complexity (${metrics.complexity}). Consider breaking it into smaller components.`,
      rule: 'complexity',
    });
  }

  // Check for large files
  if (metrics.lines > 300) {
    issues.push({
      id: `file-size-${metrics.path}`,
      file: metrics.path,
      line: 1,
      column: 1,
      severity: 'warning',
      message: `File is large (${metrics.lines} lines). Consider splitting it.`,
      rule: 'file-size',
    });
  }

  // Check for unused imports (basic check)
  metrics.imports.forEach((imp) => {
    const importName = imp.split('/').pop() || imp;
    const regex = new RegExp(`\\b${importName}\\b`, 'g');
    const matches = content.match(regex);
    // Subtract 1 for the import statement itself
    if (!matches || matches.length <= 1) {
      issues.push({
        id: `unused-import-${metrics.path}-${imp}`,
        file: metrics.path,
        line: content.indexOf(imp) || 1,
        column: 1,
        severity: 'warning',
        message: `Import '${imp}' may be unused.`,
        rule: 'no-unused-imports',
        fixable: true,
      });
    }
  });

  // Check for console.log statements
  const consoleLogRegex = /console\.log\(/g;
  const consoleLogs = content.match(consoleLogRegex);
  if (consoleLogs && consoleLogs.length > 0) {
    issues.push({
      id: `console-log-${metrics.path}`,
      file: metrics.path,
      line: 1,
      column: 1,
      severity: 'info',
      message: `Found ${consoleLogs.length} console.log statement(s). Remove in production.`,
      rule: 'no-console-log',
      fixable: true,
    });
  }

  // Check for TODO comments
  const todoRegex = /TODO|FIXME|HACK/g;
  const todos = content.match(todoRegex);
  if (todos && todos.length > 0) {
    issues.push({
      id: `todo-${metrics.path}`,
      file: metrics.path,
      line: 1,
      column: 1,
      severity: 'info',
      message: `Found ${todos.length} TODO/FIXME comment(s).`,
      rule: 'todo-comments',
    });
  }

  return issues;
}

export const CodeQualityPanel: React.FC<CodeQualityPanelProps> = ({
  files,
  activeFile,
  onRunLint,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['issues', 'metrics']));
  const [selectedFile, setSelectedFile] = useState<string>(activeFile);

  const toggleExpand = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Analyze all files
  const { fileMetrics, allIssues, totalStats } = useMemo(() => {
    const metrics: Record<string, FileMetrics> = {};
    const issues: QualityIssue[] = [];

    for (const [path, content] of Object.entries(files)) {
      if (path.endsWith('.tsx') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.js')) {
        const fileMetric = analyzeFileMetrics(path, content);
        metrics[path] = fileMetric;
        issues.push(...generateQualityIssues(fileMetric, content));
      }
    }

    const stats = {
      totalFiles: Object.keys(metrics).length,
      totalLines: Object.values(metrics).reduce((sum, m) => sum + m.lines, 0),
      totalCodeLines: Object.values(metrics).reduce((sum, m) => sum + m.codeLines, 0),
      avgComplexity: Object.values(metrics).reduce((sum, m) => sum + m.complexity, 0) / Object.values(metrics).length || 0,
    };

    return { fileMetrics: metrics, allIssues: issues, totalStats: stats };
  }, [files]);

  // Filter issues by selected file
  const filteredIssues = selectedFile
    ? allIssues.filter(issue => issue.file === selectedFile)
    : allIssues;

  const issueStats = {
    error: filteredIssues.filter(i => i.severity === 'error').length,
    warning: filteredIssues.filter(i => i.severity === 'warning').length,
    info: filteredIssues.filter(i => i.severity === 'info').length,
  };

  const currentFileMetrics = fileMetrics[selectedFile];

  return (
    <div className="h-full flex flex-col bg-slate-950/50">
      {/* Header */}
      <div className="flex-none border-b border-white/5 p-4 bg-slate-900/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-white">Code Quality</h3>
          </div>
          <button
            onClick={() => {
              setSelectedFile(activeFile);
              onRunLint?.();
            }}
            className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Refresh analysis"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center p-2 bg-slate-800/50 rounded-lg border border-white/5">
            <div className="text-lg font-bold text-white">{totalStats.totalFiles}</div>
            <div className="text-[10px] text-slate-400">Files</div>
          </div>
          <div className="text-center p-2 bg-slate-800/50 rounded-lg border border-white/5">
            <div className="text-lg font-bold text-blue-400">{totalStats.totalLines}</div>
            <div className="text-[10px] text-slate-400">Lines</div>
          </div>
          <div className="text-center p-2 bg-slate-800/50 rounded-lg border border-white/5">
            <div className={`text-lg font-bold ${
              totalStats.avgComplexity > 15 ? 'text-red-400' : totalStats.avgComplexity > 10 ? 'text-yellow-400' : 'text-emerald-400'
            }`}>
              {totalStats.avgComplexity.toFixed(1)}
            </div>
            <div className="text-[10px] text-slate-400">Avg Complexity</div>
          </div>
          <div className="text-center p-2 bg-slate-800/50 rounded-lg border border-white/5">
            <div className={`text-lg font-bold ${
              issueStats.error > 0 ? 'text-red-400' : issueStats.warning > 0 ? 'text-yellow-400' : 'text-emerald-400'
            }`}>
              {filteredIssues.length}
            </div>
            <div className="text-[10px] text-slate-400">Issues</div>
          </div>
        </div>
      </div>

      {/* File Selector */}
      <div className="flex-none border-b border-white/5 p-2 bg-slate-900/20">
        <select
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
          className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50"
        >
          <option value="">All Files</option>
          {Object.keys(fileMetrics).map(path => (
            <option key={path} value={path}>{path}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Issues Section */}
        {filteredIssues.length > 0 ? (
          <div className="space-y-2">
            <button
              onClick={() => toggleExpand('issues')}
              className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors w-full"
            >
              {expandedSections.has('issues') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <Bug className="w-4 h-4" />
              Issues ({filteredIssues.length})
              <span className="ml-auto flex gap-2">
                {issueStats.error > 0 && <span className="text-red-400">{issueStats.error} errors</span>}
                {issueStats.warning > 0 && <span className="text-yellow-400">{issueStats.warning} warnings</span>}
                {issueStats.info > 0 && <span className="text-blue-400">{issueStats.info} info</span>}
              </span>
            </button>

            {expandedSections.has('issues') && (
              <div className="space-y-2 ml-6">
                {filteredIssues.map(issue => (
                  <div
                    key={issue.id}
                    className={`p-3 rounded-lg border ${
                      issue.severity === 'error'
                        ? 'bg-red-500/10 border-red-500/20'
                        : issue.severity === 'warning'
                          ? 'bg-yellow-500/10 border-yellow-500/20'
                          : 'bg-blue-500/10 border-blue-500/20'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {issue.severity === 'error' ? (
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      ) : issue.severity === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-white">{issue.message}</p>
                          {issue.fixable && (
                            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                          <span>{issue.file}</span>
                          <span>Line {issue.line}</span>
                          <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">{issue.rule}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
            <p className="text-sm">No issues found</p>
            <p className="text-xs mt-1">Code looks clean!</p>
          </div>
        )}

        {/* File Metrics Section */}
        {currentFileMetrics && (
          <div className="space-y-2">
            <button
              onClick={() => toggleExpand('metrics')}
              className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors w-full"
            >
              {expandedSections.has('metrics') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <LineChart className="w-4 h-4" />
              File Metrics
            </button>

            {expandedSections.has('metrics') && (
              <div className="ml-6 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-white/5">
                    <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                      <FileCode className="w-3 h-3" />
                      Total Lines
                    </div>
                    <div className="text-lg font-bold text-white">{currentFileMetrics.lines}</div>
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-white/5">
                    <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                      <Code className="w-3 h-3" />
                      Code Lines
                    </div>
                    <div className="text-lg font-bold text-blue-400">{currentFileMetrics.codeLines}</div>
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-white/5">
                    <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                      <Activity className="w-3 h-3" />
                      Complexity
                    </div>
                    <div className={`text-lg font-bold ${
                      currentFileMetrics.complexity > 20 ? 'text-red-400' : currentFileMetrics.complexity > 10 ? 'text-yellow-400' : 'text-emerald-400'
                    }`}>
                      {currentFileMetrics.complexity}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-white/5">
                    <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                      <Zap className="w-3 h-3" />
                      Density
                    </div>
                    <div className="text-lg font-bold text-purple-400">
                      {((currentFileMetrics.codeLines / currentFileMetrics.lines) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                {/* Imports */}
                {currentFileMetrics.imports.length > 0 && (
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-white/5">
                    <div className="text-xs text-slate-400 mb-2">Imports ({currentFileMetrics.imports.length})</div>
                    <div className="flex flex-wrap gap-1">
                      {currentFileMetrics.imports.map(imp => (
                        <span key={imp} className="px-2 py-1 bg-slate-900 rounded text-[10px] text-blue-400 font-mono">
                          {imp}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exports */}
                {currentFileMetrics.exports.length > 0 && (
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-white/5">
                    <div className="text-xs text-slate-400 mb-2">Exports ({currentFileMetrics.exports.length})</div>
                    <div className="flex flex-wrap gap-1">
                      {currentFileMetrics.exports.map(exp => (
                        <span key={exp} className="px-2 py-1 bg-slate-900 rounded text-[10px] text-emerald-400 font-mono">
                          {exp}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeQualityPanel;
