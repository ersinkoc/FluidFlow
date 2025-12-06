import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, FileCode, Component, X, Layers, Box, Code2 } from 'lucide-react';
import { FileSystem } from '../types';

interface ComponentTreeProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
  onFileSelect: (file: string) => void;
}

interface TreeNode {
  name: string;
  type: 'component' | 'file' | 'hook' | 'util';
  file: string;
  line?: number;
  children?: TreeNode[];
  props?: string[];
  imports?: string[];
}

// Parse a file to extract components, hooks, and imports
function parseFile(content: string, filename: string): TreeNode[] {
  const nodes: TreeNode[] = [];

  // Match component definitions
  const componentPatterns = [
    // const ComponentName: React.FC = () => { or function ComponentName()
    /(?:export\s+)?(?:const|function)\s+([A-Z][a-zA-Z0-9]*)\s*(?::\s*React\.FC(?:<[^>]+>)?|:\s*FC(?:<[^>]+>)?|\([^)]*\)\s*(?::\s*[^=]+)?\s*(?:=>|{))/g,
    // export default function ComponentName
    /export\s+default\s+function\s+([A-Z][a-zA-Z0-9]*)/g,
  ];

  // Match hooks
  const hookPattern = /(?:export\s+)?(?:const|function)\s+(use[A-Z][a-zA-Z0-9]*)\s*(?:=|\()/g;

  // Match imports from project files
  const importPattern = /import\s+(?:{[^}]+}|[^;]+)\s+from\s+['"]\.\/([^'"]+)['"]/g;

  const lines = content.split('\n');

  // Find components
  componentPatterns.forEach(pattern => {
    let match;
    const contentCopy = content;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(contentCopy)) !== null) {
      const name = match[1];
      const lineNumber = content.substring(0, match.index).split('\n').length;

      // Extract props from the component
      const propsMatch = content.substring(match.index, match.index + 500).match(/\{([^}]+)\}/);
      const props: string[] = [];
      if (propsMatch) {
        const propsStr = propsMatch[1];
        const propMatches = propsStr.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*[,}:]/g);
        if (propMatches) {
          propMatches.forEach(p => {
            const propName = p.replace(/[,}:]/g, '').trim();
            if (propName && !['const', 'let', 'return', 'if', 'else'].includes(propName)) {
              props.push(propName);
            }
          });
        }
      }

      // Check if component already exists
      if (!nodes.find(n => n.name === name)) {
        nodes.push({
          name,
          type: 'component',
          file: filename,
          line: lineNumber,
          props: props.slice(0, 10), // Limit props
        });
      }
    }
  });

  // Find hooks
  let hookMatch;
  hookPattern.lastIndex = 0;
  while ((hookMatch = hookPattern.exec(content)) !== null) {
    const name = hookMatch[1];
    const lineNumber = content.substring(0, hookMatch.index).split('\n').length;
    if (!nodes.find(n => n.name === name)) {
      nodes.push({
        name,
        type: 'hook',
        file: filename,
        line: lineNumber,
      });
    }
  }

  return nodes;
}

// Build component tree from files
function buildComponentTree(files: FileSystem): TreeNode[] {
  const allNodes: TreeNode[] = [];
  const fileGroups: Record<string, TreeNode[]> = {};

  // Parse each tsx/jsx file
  Object.entries(files).forEach(([path, content]) => {
    if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
      const nodes = parseFile(content as string, path);
      if (nodes.length > 0) {
        fileGroups[path] = nodes;
        allNodes.push(...nodes);
      }
    }
  });

  // Build tree structure - group by folder
  const tree: TreeNode[] = [];
  const folders: Record<string, TreeNode> = {};

  Object.entries(fileGroups).forEach(([path, nodes]) => {
    const parts = path.split('/');
    const fileName = parts.pop() || path;
    const folderPath = parts.join('/') || 'root';

    // Create folder node if it doesn't exist
    if (!folders[folderPath]) {
      folders[folderPath] = {
        name: folderPath || 'src',
        type: 'util',
        file: folderPath,
        children: [],
      };
      tree.push(folders[folderPath]);
    }

    // Create file node
    const fileNode: TreeNode = {
      name: fileName,
      type: 'file',
      file: path,
      children: nodes,
    };

    folders[folderPath].children!.push(fileNode);
  });

  return tree;
}

// Tree node component
const TreeNodeView: React.FC<{
  node: TreeNode;
  depth: number;
  onSelect: (file: string, line?: number) => void;
}> = ({ node, depth, onSelect }) => {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  const getIcon = () => {
    switch (node.type) {
      case 'component':
        return <Component className="w-4 h-4 text-blue-400" />;
      case 'hook':
        return <Code2 className="w-4 h-4 text-purple-400" />;
      case 'file':
        return <FileCode className="w-4 h-4 text-yellow-400" />;
      default:
        return <Box className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) {
            setIsExpanded(!isExpanded);
          } else {
            onSelect(node.file, node.line);
          }
        }}
        className={`w-full flex items-center gap-1.5 py-1 px-2 rounded hover:bg-white/5 transition-colors text-left ${
          node.type === 'component' ? 'text-blue-300' :
          node.type === 'hook' ? 'text-purple-300' :
          node.type === 'file' ? 'text-yellow-300' : 'text-slate-400'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="w-3 h-3 text-slate-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
          )
        ) : (
          <span className="w-3" />
        )}
        {getIcon()}
        <span className="text-sm truncate">{node.name}</span>
        {node.props && node.props.length > 0 && (
          <span className="text-[10px] text-slate-600 ml-auto">
            {node.props.length} props
          </span>
        )}
      </button>

      {/* Props preview for components */}
      {isExpanded && node.props && node.props.length > 0 && (
        <div className="ml-8 pl-4 border-l border-white/5 mb-1">
          {node.props.slice(0, 5).map(prop => (
            <div key={prop} className="text-[10px] text-slate-500 py-0.5 px-2">
              • {prop}
            </div>
          ))}
          {node.props.length > 5 && (
            <div className="text-[10px] text-slate-600 py-0.5 px-2">
              +{node.props.length - 5} more
            </div>
          )}
        </div>
      )}

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child, idx) => (
            <TreeNodeView
              key={`${child.name}-${idx}`}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ComponentTree: React.FC<ComponentTreeProps> = ({
  isOpen,
  onClose,
  files,
  onFileSelect,
}) => {
  const [search, setSearch] = useState('');

  const tree = useMemo(() => buildComponentTree(files), [files]);

  // Filter tree based on search
  const filteredTree = useMemo(() => {
    if (!search) return tree;

    const filterNode = (node: TreeNode): TreeNode | null => {
      const matchesSearch = node.name.toLowerCase().includes(search.toLowerCase());

      if (node.children) {
        const filteredChildren = node.children
          .map(filterNode)
          .filter((n): n is TreeNode => n !== null);

        if (matchesSearch || filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children,
          };
        }
      }

      return matchesSearch ? node : null;
    };

    return tree.map(filterNode).filter((n): n is TreeNode => n !== null);
  }, [tree, search]);

  // Component stats
  const stats = useMemo(() => {
    let components = 0;
    let hooks = 0;
    let files = 0;

    const countNodes = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.type === 'component') components++;
        else if (node.type === 'hook') hooks++;
        else if (node.type === 'file') files++;
        if (node.children) countNodes(node.children);
      });
    };

    countNodes(tree);
    return { components, hooks, files };
  }, [tree]);

  const handleSelect = (file: string, line?: number) => {
    onFileSelect(file);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg h-[70vh] bg-slate-900 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-white">Component Tree</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-white/5 bg-slate-950/50">
          <div className="flex items-center gap-1.5 text-xs">
            <Component className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">{stats.components} components</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Code2 className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-slate-400">{stats.hooks} hooks</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <FileCode className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-slate-400">{stats.files} files</span>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-white/5">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter components..."
            className="w-full px-3 py-1.5 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
          />
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {filteredTree.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              {search ? 'No matching components found' : 'No components found in project'}
            </div>
          ) : (
            filteredTree.map((node, idx) => (
              <TreeNodeView
                key={`${node.name}-${idx}`}
                node={node}
                depth={0}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/5 bg-slate-950/50">
          <p className="text-[10px] text-slate-600 text-center">
            Click component to open file • Ctrl+Shift+T to open
          </p>
        </div>
      </div>
    </div>
  );
};
