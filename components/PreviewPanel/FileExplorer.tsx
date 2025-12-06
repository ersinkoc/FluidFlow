import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  FileCode, FileJson, FileText, Database, FlaskConical,
  File as FileIcon, Plus, Trash2, Pencil, X, Check, FilePlus, FolderPlus
} from 'lucide-react';
import { FileSystem } from '../../types';

interface FileExplorerProps {
  files: FileSystem;
  activeFile: string;
  onFileSelect: (file: string) => void;
  onCreateFile?: (path: string, content: string) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

const getFileIcon = (fileName: string) => {
  if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) {
    return <FileCode className="w-3.5 h-3.5 text-blue-400" />;
  }
  if (fileName.endsWith('.ts') || fileName.endsWith('.js')) {
    return <FileCode className="w-3.5 h-3.5 text-yellow-400" />;
  }
  if (fileName.endsWith('.json')) {
    return <FileJson className="w-3.5 h-3.5 text-amber-400" />;
  }
  if (fileName.endsWith('.css') || fileName.endsWith('.scss')) {
    return <FileIcon className="w-3.5 h-3.5 text-pink-400" />;
  }
  if (fileName.endsWith('.sql')) {
    return <Database className="w-3.5 h-3.5 text-emerald-400" />;
  }
  if (fileName.endsWith('.md')) {
    return <FileText className="w-3.5 h-3.5 text-orange-400" />;
  }
  if (fileName.endsWith('.test.tsx') || fileName.endsWith('.test.ts') || fileName.endsWith('.spec.ts')) {
    return <FlaskConical className="w-3.5 h-3.5 text-pink-400" />;
  }
  if (fileName.endsWith('.html')) {
    return <FileCode className="w-3.5 h-3.5 text-orange-500" />;
  }
  return <FileIcon className="w-3.5 h-3.5 text-slate-400" />;
};

const getFolderIcon = (name: string, isOpen: boolean) => {
  const iconClass = "w-3.5 h-3.5";

  if (name === 'src') {
    return isOpen
      ? <FolderOpen className={`${iconClass} text-blue-400`} />
      : <Folder className={`${iconClass} text-blue-400`} />;
  }
  if (name === 'db' || name === 'database') {
    return <Database className={`${iconClass} text-emerald-400`} />;
  }
  if (name === 'tests' || name === '__tests__') {
    return <FlaskConical className={`${iconClass} text-pink-400`} />;
  }
  if (name === 'components') {
    return isOpen
      ? <FolderOpen className={`${iconClass} text-purple-400`} />
      : <Folder className={`${iconClass} text-purple-400`} />;
  }
  if (name === 'hooks') {
    return isOpen
      ? <FolderOpen className={`${iconClass} text-cyan-400`} />
      : <Folder className={`${iconClass} text-cyan-400`} />;
  }
  if (name === 'utils' || name === 'lib') {
    return isOpen
      ? <FolderOpen className={`${iconClass} text-amber-400`} />
      : <Folder className={`${iconClass} text-amber-400`} />;
  }

  return isOpen
    ? <FolderOpen className={`${iconClass} text-slate-400`} />
    : <Folder className={`${iconClass} text-slate-400`} />;
};

// Build tree structure from flat file paths
function buildTree(files: FileSystem): TreeNode[] {
  const root: TreeNode[] = [];

  // Sort paths to ensure parent folders are processed first
  const sortedPaths = Object.keys(files).sort();

  for (const filePath of sortedPaths) {
    const parts = filePath.split('/');
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      let existing = currentLevel.find(n => n.name === part);

      if (!existing) {
        const newNode: TreeNode = {
          name: part,
          path: currentPath,
          type: isLast ? 'file' : 'folder',
          children: isLast ? undefined : []
        };
        currentLevel.push(newNode);
        existing = newNode;
      }

      if (!isLast && existing.children) {
        currentLevel = existing.children;
      }
    }
  }

  // Sort: folders first, then files, alphabetically
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    }).map(node => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined
    }));
  };

  return sortNodes(root);
}

// Tree Node Component
const TreeNodeComponent: React.FC<{
  node: TreeNode;
  depth: number;
  activeFile: string;
  onFileSelect: (file: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onCreateInFolder?: (folderPath: string) => void;
}> = ({ node, depth, activeFile, onFileSelect, expandedFolders, toggleFolder, onDelete, onRename, onCreateInFolder }) => {
  const isExpanded = expandedFolders.has(node.path);
  const isActive = activeFile === node.path;
  const paddingLeft = 8 + depth * 12;
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleRename = () => {
    if (newName.trim() && newName !== node.name && onRename) {
      const pathParts = node.path.split('/');
      pathParts[pathParts.length - 1] = newName.trim();
      const newPath = pathParts.join('/');
      onRename(node.path, newPath);
    }
    setIsRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setNewName(node.name);
      setIsRenaming(false);
    }
  };

  if (node.type === 'folder') {
    return (
      <div>
        <div
          className="w-full flex items-center gap-1.5 py-1 hover:bg-white/5 rounded text-left transition-colors group"
          style={{ paddingLeft }}
        >
          <button onClick={() => toggleFolder(node.path)} className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-slate-500">
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
            {getFolderIcon(node.name, isExpanded)}
            {isRenaming ? (
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={handleKeyDown}
                className="text-[11px] font-medium text-white bg-slate-800 border border-blue-500 rounded px-1 outline-none w-full min-w-[60px]"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-[11px] font-medium text-slate-300 truncate">{node.name}</span>
            )}
          </button>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
            {onCreateInFolder && (
              <button
                onClick={(e) => { e.stopPropagation(); onCreateInFolder(node.path); }}
                className="p-0.5 rounded hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition-colors"
                title="New file in folder"
              >
                <FilePlus className="w-3 h-3" />
              </button>
            )}
            {onRename && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
                className="p-0.5 rounded hover:bg-blue-500/20 text-slate-500 hover:text-blue-400 transition-colors"
                title="Rename folder"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
                className="p-0.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                title="Delete folder"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        {isExpanded && node.children && (
          <div className="relative">
            <div
              className="absolute top-0 bottom-0 border-l border-white/5"
              style={{ left: paddingLeft + 6 }}
            />
            {node.children.map(child => (
              <TreeNodeComponent
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFile={activeFile}
                onFileSelect={onFileSelect}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onDelete={onDelete}
                onRename={onRename}
                onCreateInFolder={onCreateInFolder}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node
  return (
    <div
      className={`w-full flex items-center gap-2 py-1 rounded text-left transition-all group ${
        isActive
          ? 'bg-blue-600/20 text-blue-200'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
      }`}
      style={{ paddingLeft }}
    >
      <button onClick={() => onFileSelect(node.path)} className="flex items-center gap-2 flex-1 min-w-0">
        {getFileIcon(node.name)}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            className="text-[11px] text-white bg-slate-800 border border-blue-500 rounded px-1 outline-none flex-1 min-w-[60px]"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-[11px] truncate">{node.name}</span>
        )}
      </button>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
        {onRename && (
          <button
            onClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
            className="p-0.5 rounded hover:bg-blue-500/20 text-slate-500 hover:text-blue-400 transition-colors"
            title="Rename file"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
            className="p-0.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
            title="Delete file"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

export const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  activeFile,
  onFileSelect,
  onCreateFile,
  onDeleteFile,
  onRenameFile
}) => {
  // Build tree structure
  const tree = useMemo(() => buildTree(files), [files]);

  // Track expanded folders - expand common folders by default
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const defaultExpanded = new Set<string>();
    // Auto-expand src and first-level folders
    Object.keys(files).forEach(path => {
      const parts = path.split('/');
      if (parts.length > 1) {
        defaultExpanded.add(parts[0]);
        if (parts[0] === 'src' && parts.length > 2) {
          defaultExpanded.add(`${parts[0]}/${parts[1]}`);
        }
      }
    });
    return defaultExpanded;
  });

  // New file creation state
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [createInFolder, setCreateInFolder] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating && newFileInputRef.current) {
      newFileInputRef.current.focus();
    }
  }, [isCreating]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allFolders = new Set<string>();
    const findFolders = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.type === 'folder') {
          allFolders.add(node.path);
          if (node.children) findFolders(node.children);
        }
      });
    };
    findFolders(tree);
    setExpandedFolders(allFolders);
  };

  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  const handleCreateFile = () => {
    if (!newFileName.trim() || !onCreateFile) return;

    const basePath = createInFolder ? `${createInFolder}/` : 'src/';
    const fullPath = basePath + newFileName.trim();

    // Determine default content based on extension
    let content = '';
    if (fullPath.endsWith('.tsx') || fullPath.endsWith('.jsx')) {
      const componentName = newFileName.replace(/\.(tsx|jsx)$/, '').replace(/[^a-zA-Z0-9]/g, '');
      content = `import React from 'react';\n\nexport const ${componentName}: React.FC = () => {\n  return (\n    <div>\n      {/* ${componentName} component */}\n    </div>\n  );\n};\n\nexport default ${componentName};\n`;
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
      content = `// ${newFileName}\n\nexport {};\n`;
    } else if (fullPath.endsWith('.css')) {
      content = `/* ${newFileName} */\n`;
    } else if (fullPath.endsWith('.json')) {
      content = '{\n  \n}\n';
    } else if (fullPath.endsWith('.md')) {
      content = `# ${newFileName.replace('.md', '')}\n\n`;
    } else if (fullPath.endsWith('.sql')) {
      content = `-- ${newFileName}\n\n`;
    }

    onCreateFile(fullPath, content);
    setNewFileName('');
    setIsCreating(false);
    setCreateInFolder(null);

    // Expand the folder where file was created
    if (createInFolder) {
      setExpandedFolders(prev => new Set([...prev, createInFolder]));
    }

    // Select the new file
    onFileSelect(fullPath);
  };

  const handleDelete = (path: string) => {
    if (showDeleteConfirm === path && onDeleteFile) {
      onDeleteFile(path);
      setShowDeleteConfirm(null);
    } else {
      setShowDeleteConfirm(path);
      // Auto-hide confirm after 3 seconds
      setTimeout(() => setShowDeleteConfirm(null), 3000);
    }
  };

  const handleRename = (oldPath: string, newPath: string) => {
    if (onRenameFile) {
      onRenameFile(oldPath, newPath);
    }
  };

  const handleCreateInFolder = (folderPath: string) => {
    setCreateInFolder(folderPath);
    setIsCreating(true);
    setExpandedFolders(prev => new Set([...prev, folderPath]));
  };

  const fileCount = Object.keys(files).length;
  const folderCount = new Set(
    Object.keys(files)
      .map(p => p.split('/').slice(0, -1).join('/'))
      .filter(Boolean)
  ).size;

  return (
    <div className="w-56 bg-[#0a0e16] border-r border-white/5 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          {onCreateFile && (
            <button
              onClick={() => { setCreateInFolder(null); setIsCreating(true); }}
              className="p-1 rounded hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition-colors"
              title="New file"
            >
              <FilePlus className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={expandAll}
            className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
            title="Expand all"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            onClick={collapseAll}
            className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
            title="Collapse all"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* New File Input */}
      {isCreating && (
        <div className="px-3 py-2 border-b border-white/5 bg-slate-800/50">
          <div className="flex items-center gap-1 mb-1">
            <FilePlus className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-slate-400">
              {createInFolder ? `in ${createInFolder}/` : 'in src/'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <input
              ref={newFileInputRef}
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFile();
                if (e.key === 'Escape') { setIsCreating(false); setNewFileName(''); setCreateInFolder(null); }
              }}
              placeholder="filename.tsx"
              className="flex-1 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500"
            />
            <button
              onClick={handleCreateFile}
              disabled={!newFileName.trim()}
              className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white transition-colors"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => { setIsCreating(false); setNewFileName(''); setCreateInFolder(null); }}
              className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {tree.map(node => (
          <TreeNodeComponent
            key={node.path}
            node={node}
            depth={0}
            activeFile={activeFile}
            onFileSelect={onFileSelect}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            onDelete={onDeleteFile ? handleDelete : undefined}
            onRename={onRenameFile ? handleRename : undefined}
            onCreateInFolder={onCreateFile ? handleCreateInFolder : undefined}
          />
        ))}
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="px-3 py-2 border-t border-red-500/20 bg-red-500/10">
          <p className="text-[10px] text-red-300 mb-1">Delete "{showDeleteConfirm.split('/').pop()}"?</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleDelete(showDeleteConfirm)}
              className="flex-1 px-2 py-1 text-[10px] bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
            >
              Confirm Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(null)}
              className="px-2 py-1 text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Footer Stats */}
      <div className="px-3 py-2 border-t border-white/5 bg-slate-950/50">
        <div className="flex items-center justify-between text-[10px] text-slate-600">
          <span>{folderCount} folders</span>
          <span>{fileCount} files</span>
        </div>
      </div>
    </div>
  );
};
