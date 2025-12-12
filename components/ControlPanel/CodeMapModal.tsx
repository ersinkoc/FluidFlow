import React, { useState, useMemo } from 'react';
import * as Icons from 'lucide-react';
import { generateCodeMap, FileInfo, CodeMap } from '../../utils/codemap';
import { FileSystem } from '../../types';

interface CodeMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
}

export const CodeMapModal: React.FC<CodeMapModalProps> = ({ isOpen, onClose, files }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'components' | 'summary'>('tree');
  const [filterType, setFilterType] = useState<'all' | 'component' | 'hook' | 'utility'>('all');

  // Generate codemap from VFS
  const codeMap = useMemo<CodeMap | null>(() => {
    if (!isOpen || Object.keys(files).length === 0) return null;
    try {
      return generateCodeMap(files);
    } catch (err) {
      console.error('Failed to generate code map:', err);
      return null;
    }
  }, [isOpen, files]);

  const filteredFiles = useMemo(() => {
    if (!codeMap) return [];

    let filtered = codeMap.files;

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(f => f.type === filterType);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(f =>
        f.path.toLowerCase().includes(query) ||
        f.exports.some(e => e.toLowerCase().includes(query)) ||
        f.functions.some(fn => fn.toLowerCase().includes(query)) ||
        f.components.some(c => c.name.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [codeMap, filterType, searchQuery]);

  const allComponents = useMemo(() => {
    if (!codeMap) return [];
    return codeMap.files.flatMap(f => f.components);
  }, [codeMap]);

  const exportCodeMap = () => {
    if (!codeMap) return;

    const exportData = {
      metadata: {
        generated: new Date().toISOString(),
        totalFiles: codeMap.files.length,
        totalComponents: allComponents.length
      },
      files: codeMap.files,
      componentTree: codeMap.componentTree,
      summary: codeMap.summary
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codemap-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getFileIcon = (file: FileInfo) => {
    switch (file.type) {
      case 'component': return <Icons.Package className="w-4 h-4 text-green-400" />;
      case 'hook': return <Icons.GitBranch className="w-4 h-4 text-purple-400" />;
      case 'style': return <Icons.Palette className="w-4 h-4 text-pink-400" />;
      case 'data': return <Icons.Database className="w-4 h-4 text-yellow-400" />;
      case 'config': return <Icons.Settings className="w-4 h-4 text-orange-400" />;
      default: return <Icons.FileCode className="w-4 h-4 text-blue-400" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'component': return 'bg-green-500/20 text-green-300';
      case 'hook': return 'bg-purple-500/20 text-purple-300';
      case 'style': return 'bg-pink-500/20 text-pink-300';
      case 'data': return 'bg-yellow-500/20 text-yellow-300';
      case 'config': return 'bg-orange-500/20 text-orange-300';
      default: return 'bg-blue-500/20 text-blue-300';
    }
  };

  if (!isOpen) return null;

  const stats = {
    totalFiles: codeMap?.files.length || 0,
    components: codeMap?.files.filter(f => f.type === 'component').length || 0,
    hooks: codeMap?.files.filter(f => f.type === 'hook').length || 0,
    utilities: codeMap?.files.filter(f => f.type === 'utility').length || 0
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-6xl max-h-[90vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Icons.Map className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Code Map</h2>
              <p className="text-xs text-slate-400">Project structure analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCodeMap}
              disabled={!codeMap}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              title="Export as JSON"
            >
              <Icons.Download className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Icons.X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Stats Summary */}
        {codeMap && (
          <div className="px-4 py-3 border-b border-white/5 bg-slate-800/30">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-white">{stats.totalFiles}</div>
                <div className="text-xs text-slate-400">Files</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">{stats.components}</div>
                <div className="text-xs text-slate-400">Components</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">{stats.hooks}</div>
                <div className="text-xs text-slate-400">Hooks</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">{stats.utilities}</div>
                <div className="text-xs text-slate-400">Utilities</div>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            {/* View Mode */}
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('tree')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  viewMode === 'tree'
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Icons.FolderTree className="w-3 h-3 inline mr-1" />
                Files
              </button>
              <button
                onClick={() => setViewMode('components')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  viewMode === 'components'
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Icons.Package className="w-3 h-3 inline mr-1" />
                Components
              </button>
              <button
                onClick={() => setViewMode('summary')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  viewMode === 'summary'
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Icons.FileText className="w-3 h-3 inline mr-1" />
                Summary
              </button>
            </div>

            {/* Filter */}
            {viewMode === 'tree' && (
              <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
                {(['all', 'component', 'hook', 'utility'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      filterType === type
                        ? 'bg-purple-500 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="flex-1 relative">
              <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files, exports, functions..."
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <Icons.X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex">
          {!codeMap ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Icons.FolderX className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No files to analyze</p>
                <p className="text-xs text-slate-500 mt-1">Generate some code first</p>
              </div>
            </div>
          ) : viewMode === 'tree' ? (
            <>
              {/* File List */}
              <div className="w-80 border-r border-white/5 overflow-y-auto">
                <div className="p-4 space-y-2">
                  {filteredFiles.length === 0 ? (
                    <div className="text-center py-8">
                      <Icons.Search className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">No matching files</p>
                    </div>
                  ) : (
                    filteredFiles.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => setSelectedFile(file)}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          selectedFile?.path === file.path
                            ? 'bg-blue-500/20 border border-blue-500/50'
                            : 'bg-slate-800/50 border border-white/5 hover:bg-slate-800 hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {getFileIcon(file)}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                              {file.path.split('/').pop()}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{file.path}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] ${getTypeColor(file.type)}`}>
                            {file.type}
                          </span>
                        </div>
                        {file.exports.length > 0 && (
                          <div className="mt-2 text-xs text-slate-400 truncate">
                            Exports: {file.exports.slice(0, 3).join(', ')}
                            {file.exports.length > 3 && ` +${file.exports.length - 3}`}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* File Details */}
              <div className="flex-1 overflow-y-auto">
                {selectedFile ? (
                  <div className="p-6">
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        {selectedFile.path.split('/').pop()}
                      </h3>
                      <p className="text-sm text-slate-400">{selectedFile.path}</p>
                      <span className={`inline-block mt-2 px-2 py-1 rounded text-xs ${getTypeColor(selectedFile.type)}`}>
                        {selectedFile.type}
                      </span>
                    </div>

                    {/* Exports */}
                    {selectedFile.exports.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                          <Icons.FileOutput className="w-4 h-4 text-blue-400" />
                          Exports ({selectedFile.exports.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedFile.exports.map((exp) => (
                            <span key={exp} className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs font-mono">
                              {exp}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Components */}
                    {selectedFile.components.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                          <Icons.Package className="w-4 h-4 text-green-400" />
                          Components ({selectedFile.components.length})
                        </h4>
                        <div className="space-y-3">
                          {selectedFile.components.map((comp) => (
                            <div key={comp.name} className="p-3 bg-slate-800/50 rounded-lg">
                              <div className="text-sm font-medium text-green-300">{comp.name}</div>
                              {comp.props.length > 0 && (
                                <div className="mt-2 text-xs text-slate-400">
                                  Props: {comp.props.join(', ')}
                                </div>
                              )}
                              {comp.hooks.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {comp.hooks.map((hook) => (
                                    <span key={hook} className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[10px]">
                                      {hook}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {comp.children.length > 0 && (
                                <div className="mt-1 text-xs text-slate-500">
                                  Uses: {comp.children.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Functions */}
                    {selectedFile.functions.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                          <Icons.Code className="w-4 h-4 text-yellow-400" />
                          Functions ({selectedFile.functions.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedFile.functions.map((fn) => (
                            <span key={fn} className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded text-xs font-mono">
                              {fn}()
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Constants */}
                    {selectedFile.constants.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                          <Icons.Hash className="w-4 h-4 text-orange-400" />
                          Constants ({selectedFile.constants.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedFile.constants.map((c) => (
                            <span key={c} className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs font-mono">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Imports */}
                    {selectedFile.imports.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                          <Icons.FileInput className="w-4 h-4 text-slate-400" />
                          Imports ({selectedFile.imports.length})
                        </h4>
                        <div className="space-y-2">
                          {selectedFile.imports.map((imp, idx) => (
                            <div key={idx} className="p-2 bg-slate-800/30 rounded text-xs">
                              <span className="text-slate-500">from</span>
                              <span className="text-slate-300 ml-2 font-mono">{imp.from}</span>
                              {imp.items.length > 0 && (
                                <div className="mt-1 text-slate-400 ml-4">
                                  {imp.items.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Icons.MousePointer className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-slate-400">Select a file to view details</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : viewMode === 'components' ? (
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-lg font-semibold text-white mb-6">Component Hierarchy</h3>

              {allComponents.length === 0 ? (
                <div className="text-center py-12">
                  <Icons.Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No React components found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {allComponents.map((comp) => (
                    <div key={comp.name} className="p-4 bg-slate-800/50 rounded-lg border border-white/5">
                      <div className="flex items-center gap-2 mb-3">
                        <Icons.Package className="w-5 h-5 text-green-400" />
                        <span className="text-white font-medium">{comp.name}</span>
                      </div>

                      {comp.props.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-slate-500 mb-1">Props</div>
                          <div className="flex flex-wrap gap-1">
                            {comp.props.map((prop) => (
                              <span key={prop} className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-[10px]">
                                {prop}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {comp.hooks.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-slate-500 mb-1">Hooks</div>
                          <div className="flex flex-wrap gap-1">
                            {comp.hooks.map((hook) => (
                              <span key={hook} className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[10px]">
                                {hook}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {comp.children.length > 0 && (
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Uses Components</div>
                          <div className="flex flex-wrap gap-1">
                            {comp.children.map((child) => (
                              <span key={child} className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-[10px]">
                                {child}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Summary View */
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-invert max-w-none">
                <pre className="bg-slate-800/50 p-4 rounded-lg text-sm text-slate-300 whitespace-pre-wrap">
                  {codeMap.summary}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
