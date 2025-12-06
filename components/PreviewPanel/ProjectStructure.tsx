import React, { useMemo, useState } from 'react';
import {
  FileCode, FileJson, FileText, Database, Folder, FolderOpen,
  ChevronRight, ChevronDown, Box, Layers, GitBranch, Package,
  Component, Code2, Braces, Hash, Type
} from 'lucide-react';
import { FileSystem } from '../../types';

interface ProjectStructureProps {
  files: FileSystem;
}

interface FileAnalysis {
  path: string;
  name: string;
  type: 'component' | 'hook' | 'util' | 'type' | 'style' | 'config' | 'data' | 'other';
  exports: string[];
  imports: string[];
  dependencies: string[];
  lines: number;
  size: string;
}

// Analyze a file's content
function analyzeFile(path: string, content: string): FileAnalysis {
  const name = path.split('/').pop() || path;
  const lines = content.split('\n').length;
  const size = content.length > 1024 ? `${(content.length / 1024).toFixed(1)}KB` : `${content.length}B`;

  // Determine file type
  let type: FileAnalysis['type'] = 'other';
  if (path.includes('/hooks/') || name.startsWith('use')) {
    type = 'hook';
  } else if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
    type = 'component';
  } else if (path.includes('/utils/') || path.includes('/lib/')) {
    type = 'util';
  } else if (path.endsWith('.d.ts') || path.includes('/types')) {
    type = 'type';
  } else if (path.endsWith('.css') || path.endsWith('.scss')) {
    type = 'style';
  } else if (path.endsWith('.json') || path.includes('config')) {
    type = 'config';
  } else if (path.endsWith('.sql')) {
    type = 'data';
  }

  // Extract exports
  const exportMatches = content.matchAll(/export\s+(?:default\s+)?(?:const|function|class|interface|type|enum)\s+(\w+)/g);
  const exports = [...exportMatches].map(m => m[1]);

  // Extract imports
  const importMatches = content.matchAll(/import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g);
  const imports = [...importMatches].map(m => m[1]);

  // Extract dependencies (external packages)
  const dependencies = imports.filter(i => !i.startsWith('.') && !i.startsWith('@/'));

  return { path, name, type, exports, imports, dependencies, lines, size };
}

// Build project statistics
function buildProjectStats(files: FileSystem) {
  const analyses = Object.entries(files).map(([path, content]) => analyzeFile(path, content));

  const stats = {
    totalFiles: analyses.length,
    totalLines: analyses.reduce((sum, a) => sum + a.lines, 0),
    components: analyses.filter(a => a.type === 'component').length,
    hooks: analyses.filter(a => a.type === 'hook').length,
    utils: analyses.filter(a => a.type === 'util').length,
    types: analyses.filter(a => a.type === 'type').length,
    styles: analyses.filter(a => a.type === 'style').length,
    configs: analyses.filter(a => a.type === 'config').length,
    data: analyses.filter(a => a.type === 'data').length,
    dependencies: [...new Set(analyses.flatMap(a => a.dependencies))]
  };

  return { analyses, stats };
}

// Get type icon
const getTypeIcon = (type: FileAnalysis['type']) => {
  switch (type) {
    case 'component': return <Component className="w-3.5 h-3.5 text-blue-400" />;
    case 'hook': return <GitBranch className="w-3.5 h-3.5 text-purple-400" />;
    case 'util': return <Braces className="w-3.5 h-3.5 text-amber-400" />;
    case 'type': return <Type className="w-3.5 h-3.5 text-cyan-400" />;
    case 'style': return <Hash className="w-3.5 h-3.5 text-pink-400" />;
    case 'config': return <FileJson className="w-3.5 h-3.5 text-amber-400" />;
    case 'data': return <Database className="w-3.5 h-3.5 text-emerald-400" />;
    default: return <FileCode className="w-3.5 h-3.5 text-slate-400" />;
  }
};

// File Card Component
const FileCard: React.FC<{ analysis: FileAnalysis }> = ({ analysis }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-slate-800/50 border border-white/5 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {getTypeIcon(analysis.type)}
          <span className="text-sm text-slate-200 font-mono">{analysis.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded capitalize">
            {analysis.type}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500">{analysis.lines} lines</span>
          <span className="text-[10px] text-slate-500">{analysis.size}</span>
          {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3">
          <div className="text-[10px] text-slate-500 font-mono">{analysis.path}</div>

          {analysis.exports.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Exports</div>
              <div className="flex flex-wrap gap-1">
                {analysis.exports.map((exp, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded font-mono">
                    {exp}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.dependencies.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Dependencies</div>
              <div className="flex flex-wrap gap-1">
                {analysis.dependencies.map((dep, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded font-mono">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.imports.filter(i => i.startsWith('.')).length > 0 && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Local Imports</div>
              <div className="flex flex-wrap gap-1">
                {analysis.imports.filter(i => i.startsWith('.')).map((imp, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 bg-slate-600/50 text-slate-300 rounded font-mono">
                    {imp}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ProjectStructure: React.FC<ProjectStructureProps> = ({ files }) => {
  const [activeView, setActiveView] = useState<'overview' | 'files' | 'deps'>('overview');
  const { analyses, stats } = useMemo(() => buildProjectStats(files), [files]);

  // Group files by type
  const groupedFiles = useMemo(() => {
    const groups: Record<string, FileAnalysis[]> = {
      component: [],
      hook: [],
      util: [],
      type: [],
      style: [],
      config: [],
      data: [],
      other: []
    };
    analyses.forEach(a => groups[a.type].push(a));
    return groups;
  }, [analyses]);

  return (
    <div className="flex flex-col h-full w-full bg-[#0d1117] overflow-hidden">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-4 py-3 bg-[#0a0e16] border-b border-white/5">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-slate-200">Project Structure</span>
        </div>
        <div className="flex p-0.5 bg-slate-800/50 rounded-lg">
          {[
            { id: 'overview', label: 'Overview', icon: Box },
            { id: 'files', label: 'Files', icon: FileCode },
            { id: 'deps', label: 'Dependencies', icon: Package }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id as any)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${
                activeView === id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
        {activeView === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
                <div className="text-2xl font-bold text-white">{stats.totalFiles}</div>
                <div className="text-xs text-slate-500">Total Files</div>
              </div>
              <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
                <div className="text-2xl font-bold text-white">{stats.totalLines.toLocaleString()}</div>
                <div className="text-xs text-slate-500">Lines of Code</div>
              </div>
              <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
                <div className="text-2xl font-bold text-blue-400">{stats.components}</div>
                <div className="text-xs text-slate-500">Components</div>
              </div>
              <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
                <div className="text-2xl font-bold text-purple-400">{stats.hooks}</div>
                <div className="text-xs text-slate-500">Hooks</div>
              </div>
            </div>

            {/* Type Breakdown */}
            <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-200 mb-4">File Types</h3>
              <div className="space-y-2">
                {[
                  { type: 'component', count: stats.components, color: 'bg-blue-500' },
                  { type: 'hook', count: stats.hooks, color: 'bg-purple-500' },
                  { type: 'util', count: stats.utils, color: 'bg-amber-500' },
                  { type: 'type', count: stats.types, color: 'bg-cyan-500' },
                  { type: 'style', count: stats.styles, color: 'bg-pink-500' },
                  { type: 'config', count: stats.configs, color: 'bg-amber-600' },
                  { type: 'data', count: stats.data, color: 'bg-emerald-500' }
                ].filter(t => t.count > 0).map(({ type, count, color }) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 capitalize w-20">{type}</span>
                    <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full transition-all`}
                        style={{ width: `${(count / stats.totalFiles) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Component Tree Preview */}
            <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-200 mb-4">Component Hierarchy</h3>
              <div className="space-y-1 font-mono text-xs">
                {groupedFiles.component.slice(0, 10).map((comp, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/5">
                    <Component className="w-3 h-3 text-blue-400" />
                    <span className="text-slate-300">{comp.name}</span>
                    {comp.exports.length > 1 && (
                      <span className="text-[10px] text-slate-500">+{comp.exports.length - 1} exports</span>
                    )}
                  </div>
                ))}
                {groupedFiles.component.length > 10 && (
                  <div className="text-slate-500 text-[10px] pl-5">
                    ...and {groupedFiles.component.length - 10} more
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeView === 'files' && (
          <div className="space-y-4">
            {(Object.entries(groupedFiles) as [string, FileAnalysis[]][]).map(([type, fileList]) => {
              if (fileList.length === 0) return null;
              return (
                <div key={type}>
                  <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                    {getTypeIcon(type as FileAnalysis['type'])}
                    {type}s ({fileList.length})
                  </h3>
                  <div className="space-y-2">
                    {fileList.map((file, i) => (
                      <FileCard key={i} analysis={file} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeView === 'deps' && (
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-200 mb-4">
                External Dependencies ({stats.dependencies.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {stats.dependencies.map((dep, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-lg text-sm font-mono"
                  >
                    {dep}
                  </span>
                ))}
                {stats.dependencies.length === 0 && (
                  <span className="text-slate-500 text-sm">No external dependencies detected</span>
                )}
              </div>
            </div>

            {/* Dependency Graph (simplified) */}
            <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-200 mb-4">Import Graph</h3>
              <div className="space-y-3">
                {analyses.filter(a => a.imports.filter(i => i.startsWith('.')).length > 0).slice(0, 15).map((file, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex items-center gap-1.5 min-w-[140px]">
                      {getTypeIcon(file.type)}
                      <span className="text-xs text-slate-300 font-mono truncate">{file.name}</span>
                    </div>
                    <span className="text-slate-600">→</span>
                    <div className="flex flex-wrap gap-1 flex-1">
                      {file.imports.filter(i => i.startsWith('.')).map((imp, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded font-mono">
                          {imp.split('/').pop()}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
