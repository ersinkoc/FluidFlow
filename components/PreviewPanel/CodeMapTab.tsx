import React, { useState, useMemo } from 'react';
import * as Icons from 'lucide-react';
import { generateCodeMap, FileInfo, CodeMap } from '../../utils/codemap';
import { FileSystem } from '../../types';

interface CodeMapTabProps {
  files: FileSystem;
}

export const CodeMapTab: React.FC<CodeMapTabProps> = ({ files }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'components' | 'graph'>('tree');
  const [filterType, setFilterType] = useState<'all' | 'component' | 'hook' | 'utility'>('all');

  // Generate codemap from VFS
  const codeMap = useMemo<CodeMap | null>(() => {
    if (Object.keys(files).length === 0) return null;
    try {
      return generateCodeMap(files);
    } catch (err) {
      console.error('Failed to generate code map:', err);
      return null;
    }
  }, [files]);

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

  const getFileIcon = (file: FileInfo) => {
    switch (file.type) {
      case 'component': return <Icons.Package className="w-3.5 h-3.5 text-green-400" />;
      case 'hook': return <Icons.GitBranch className="w-3.5 h-3.5 text-purple-400" />;
      case 'style': return <Icons.Palette className="w-3.5 h-3.5 text-pink-400" />;
      case 'data': return <Icons.Database className="w-3.5 h-3.5 text-yellow-400" />;
      case 'config': return <Icons.Settings className="w-3.5 h-3.5 text-orange-400" />;
      default: return <Icons.FileCode className="w-3.5 h-3.5 text-blue-400" />;
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

  const handleFileClick = (file: FileInfo) => {
    setSelectedFile(file);
  };

  if (!codeMap || Object.keys(files).length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <Icons.Map className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No files to analyze</p>
          <p className="text-xs text-slate-500 mt-1">Generate some code first</p>
        </div>
      </div>
    );
  }

  const stats = {
    totalFiles: codeMap.files.length,
    components: codeMap.files.filter(f => f.type === 'component').length,
    hooks: codeMap.files.filter(f => f.type === 'hook').length,
    utilities: codeMap.files.filter(f => f.type === 'utility').length
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
      {/* Stats Bar */}
      <div className="px-3 py-2 border-b border-white/5 bg-slate-800/50 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <Icons.FileCode className="w-3.5 h-3.5 text-white/40" />
          <span className="text-white font-medium">{stats.totalFiles}</span>
          <span className="text-white/50">files</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icons.Package className="w-3.5 h-3.5 text-green-400/60" />
          <span className="text-green-400">{stats.components}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icons.GitBranch className="w-3.5 h-3.5 text-purple-400/60" />
          <span className="text-purple-400">{stats.hooks}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icons.Code className="w-3.5 h-3.5 text-blue-400/60" />
          <span className="text-blue-400">{stats.utilities}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        {/* View Mode */}
        <div className="flex items-center gap-0.5 bg-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('tree')}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              viewMode === 'tree'
                ? 'bg-blue-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
            title="File Tree"
          >
            <Icons.FolderTree className="w-3 h-3" />
          </button>
          <button
            onClick={() => setViewMode('components')}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              viewMode === 'components'
                ? 'bg-blue-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Components"
          >
            <Icons.Package className="w-3 h-3" />
          </button>
          <button
            onClick={() => setViewMode('graph')}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              viewMode === 'graph'
                ? 'bg-blue-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Dependency Graph"
          >
            <Icons.Network className="w-3 h-3" />
          </button>
        </div>

        {/* Filter */}
        {viewMode === 'tree' && (
          <div className="flex items-center gap-0.5 bg-slate-800 rounded-lg p-0.5">
            {(['all', 'component', 'hook', 'utility'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  filterType === type
                    ? 'bg-purple-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {type === 'all' ? 'All' : type.charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="flex-1 relative">
          <Icons.Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-2 py-1 bg-slate-800 border border-white/5 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {viewMode === 'tree' && (
          <>
            {/* File List */}
            <div className="w-64 border-r border-white/5 overflow-y-auto">
              <div className="p-2 space-y-0.5">
                {filteredFiles.length === 0 ? (
                  <div className="text-center py-4">
                    <Icons.Search className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                    <p className="text-xs text-slate-500">No matching files</p>
                  </div>
                ) : (
                  filteredFiles.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => handleFileClick(file)}
                      className={`w-full text-left p-2 rounded transition-colors ${
                        selectedFile?.path === file.path
                          ? 'bg-blue-500/20 border border-blue-500/30'
                          : 'hover:bg-slate-800/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {getFileIcon(file)}
                        <span className="flex-1 text-xs text-white truncate">
                          {file.path.split('/').pop()}
                        </span>
                        <span className={`px-1 py-0.5 rounded text-[8px] ${getTypeColor(file.type)}`}>
                          {file.type.slice(0, 3)}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate mt-0.5 pl-5">
                        {file.path}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* File Details */}
            <div className="flex-1 overflow-y-auto">
              {selectedFile ? (
                <div className="p-3">
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      {getFileIcon(selectedFile)}
                      <h3 className="text-sm font-medium text-white">
                        {selectedFile.path.split('/').pop()}
                      </h3>
                    </div>
                    <p className="text-[10px] text-slate-500">{selectedFile.path}</p>
                    <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] ${getTypeColor(selectedFile.type)}`}>
                      {selectedFile.type}
                    </span>
                  </div>

                  {/* Exports */}
                  {selectedFile.exports.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-[10px] font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                        Exports ({selectedFile.exports.length})
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedFile.exports.map((exp) => (
                          <span key={exp} className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px] font-mono">
                            {exp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Components */}
                  {selectedFile.components.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-[10px] font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                        Components ({selectedFile.components.length})
                      </h4>
                      <div className="space-y-1.5">
                        {selectedFile.components.map((comp) => (
                          <div key={comp.name} className="p-2 bg-slate-800/50 rounded">
                            <div className="text-xs font-medium text-green-300">{comp.name}</div>
                            {comp.props.length > 0 && (
                              <div className="mt-1 text-[10px] text-slate-400">
                                Props: {comp.props.join(', ')}
                              </div>
                            )}
                            {comp.hooks.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-0.5">
                                {comp.hooks.slice(0, 5).map((hook) => (
                                  <span key={hook} className="px-1 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[8px]">
                                    {hook}
                                  </span>
                                ))}
                                {comp.hooks.length > 5 && (
                                  <span className="text-[8px] text-slate-500">+{comp.hooks.length - 5}</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Functions */}
                  {selectedFile.functions.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-[10px] font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                        Functions ({selectedFile.functions.length})
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedFile.functions.map((fn) => (
                          <span key={fn} className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 rounded text-[10px] font-mono">
                            {fn}()
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Imports */}
                  {selectedFile.imports.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                        Imports ({selectedFile.imports.length})
                      </h4>
                      <div className="space-y-1">
                        {selectedFile.imports.slice(0, 10).map((imp, idx) => (
                          <div key={idx} className="text-[10px] text-slate-400">
                            <span className="text-slate-500">from</span>
                            <span className="text-slate-300 ml-1 font-mono">{imp.from}</span>
                          </div>
                        ))}
                        {selectedFile.imports.length > 10 && (
                          <div className="text-[10px] text-slate-500">
                            +{selectedFile.imports.length - 10} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Icons.MousePointer className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                    <p className="text-xs text-slate-500">Select a file</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {viewMode === 'components' && (
          <div className="flex-1 overflow-y-auto p-3">
            {allComponents.length === 0 ? (
              <div className="text-center py-8">
                <Icons.Package className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No React components found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {allComponents.map((comp) => (
                  <div key={comp.name} className="p-2 bg-slate-800/50 rounded border border-white/5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icons.Package className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-xs text-white font-medium">{comp.name}</span>
                    </div>

                    {comp.props.length > 0 && (
                      <div className="mb-1.5">
                        <div className="text-[8px] text-slate-500 mb-0.5">Props</div>
                        <div className="flex flex-wrap gap-0.5">
                          {comp.props.slice(0, 4).map((prop) => (
                            <span key={prop} className="px-1 py-0.5 bg-slate-700 text-slate-300 rounded text-[8px]">
                              {prop}
                            </span>
                          ))}
                          {comp.props.length > 4 && (
                            <span className="text-[8px] text-slate-500">+{comp.props.length - 4}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {comp.hooks.length > 0 && (
                      <div className="mb-1.5">
                        <div className="text-[8px] text-slate-500 mb-0.5">Hooks</div>
                        <div className="flex flex-wrap gap-0.5">
                          {comp.hooks.slice(0, 3).map((hook) => (
                            <span key={hook} className="px-1 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[8px]">
                              {hook}
                            </span>
                          ))}
                          {comp.hooks.length > 3 && (
                            <span className="text-[8px] text-slate-500">+{comp.hooks.length - 3}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {comp.children.length > 0 && (
                      <div>
                        <div className="text-[8px] text-slate-500 mb-0.5">Uses</div>
                        <div className="flex flex-wrap gap-0.5">
                          {comp.children.slice(0, 3).map((child) => (
                            <span key={child} className="px-1 py-0.5 bg-green-500/20 text-green-300 rounded text-[8px]">
                              {child}
                            </span>
                          ))}
                          {comp.children.length > 3 && (
                            <span className="text-[8px] text-slate-500">+{comp.children.length - 3}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode === 'graph' && (
          <div className="flex-1 overflow-auto p-3">
            <div className="bg-slate-800/30 rounded-lg p-4 min-h-[400px]">
              <h3 className="text-xs font-medium text-white mb-3">Component Dependency Graph</h3>

              {/* Simple text-based dependency visualization */}
              <div className="space-y-3">
                {Object.entries(codeMap.componentTree)
                  .filter(([_, children]) => children.length > 0)
                  .map(([parent, children]) => (
                    <div key={parent} className="flex items-start gap-2">
                      <div className="flex items-center gap-1 px-2 py-1 bg-green-500/20 rounded text-xs text-green-300">
                        <Icons.Package className="w-3 h-3" />
                        {parent}
                      </div>
                      <Icons.ArrowRight className="w-4 h-4 text-slate-500 mt-1" />
                      <div className="flex flex-wrap gap-1">
                        {children.map(child => (
                          <span key={child} className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">
                            {child}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}

                {Object.entries(codeMap.componentTree).filter(([_, children]) => children.length > 0).length === 0 && (
                  <div className="text-center py-8">
                    <Icons.Network className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">No component dependencies found</p>
                  </div>
                )}
              </div>

              {/* File dependencies */}
              <div className="mt-6 pt-4 border-t border-white/5">
                <h3 className="text-xs font-medium text-white mb-3">File Import Dependencies</h3>
                <div className="space-y-2">
                  {codeMap.files
                    .filter(f => f.imports.filter(i => i.from.startsWith('.')).length > 0)
                    .slice(0, 10)
                    .map(file => {
                      const localImports = file.imports.filter(i => i.from.startsWith('.'));
                      return (
                        <div key={file.path} className="text-[10px]">
                          <span className="text-slate-300 font-mono">{file.path.split('/').pop()}</span>
                          <span className="text-slate-500 mx-1">imports</span>
                          <span className="text-slate-400">
                            {localImports.map(i => i.from.split('/').pop()).join(', ')}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeMapTab;
