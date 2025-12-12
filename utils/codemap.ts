import { FileSystem } from '../types';

// Maximum file size for detailed analysis (500KB)
// Larger files will have basic info only to prevent performance issues
const MAX_ANALYSIS_SIZE = 500 * 1024;

// BUG-FIX (MED-U02): Helper to escape regex special characters in strings
// Prevents regex injection when building patterns from user/code data
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ComponentInfo {
  name: string;
  props: string[];
  hooks: string[];
  children: string[]; // Components used inside
}

export interface FileInfo {
  path: string;
  type: 'component' | 'hook' | 'utility' | 'data' | 'style' | 'config';
  exports: string[];
  imports: { from: string; items: string[] }[];
  components: ComponentInfo[];
  functions: string[];
  constants: string[];
}

export interface CodeMap {
  files: FileInfo[];
  componentTree: Record<string, string[]>; // parent -> children
  summary: string;
}

// Extract information from a single file
function analyzeFile(path: string, content: string): FileInfo {
  const info: FileInfo = {
    path,
    type: 'utility',
    exports: [],
    imports: [],
    components: [],
    functions: [],
    constants: []
  };

  // MAP-001 fix: Helper to detect hooks (function or arrow function patterns)
  const hasHookExport = (text: string): boolean => {
    return /export\s+(?:function|const)\s+use[A-Z]\w*/.test(text);
  };

  // Skip detailed analysis for very large files to prevent performance issues
  if (content.length > MAX_ANALYSIS_SIZE) {
    // Just determine basic file type and return (check first 2000 chars for hooks)
    const preview = content.slice(0, 2000);
    if (path.includes('/components/') || path.endsWith('App.tsx')) {
      info.type = 'component';
    } else if (path.includes('/hooks/') || hasHookExport(preview)) {
      info.type = 'hook';
    } else if (path.includes('/data/') || path.endsWith('.json')) {
      info.type = 'data';
    } else if (path.endsWith('.css')) {
      info.type = 'style';
    } else if (path.includes('config') || path.includes('vite') || path.includes('tailwind')) {
      info.type = 'config';
    }
    return info;
  }

  // Determine file type
  if (path.includes('/components/') || path.endsWith('App.tsx')) {
    info.type = 'component';
  } else if (path.includes('/hooks/') || hasHookExport(content)) {
    info.type = 'hook';
  } else if (path.includes('/data/') || path.endsWith('.json')) {
    info.type = 'data';
  } else if (path.endsWith('.css')) {
    info.type = 'style';
  } else if (path.includes('config') || path.includes('vite') || path.includes('tailwind')) {
    info.type = 'config';
  }

  // Extract imports
  // MAP-002 fix: Reset lastIndex before exec loops to prevent state issues
  const importRegex = /import\s+(?:(\{[^}]+\})|(\w+)(?:\s*,\s*\{([^}]+)\})?)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  importRegex.lastIndex = 0;
  while ((match = importRegex.exec(content)) !== null) {
    const namedImports = match[1] || match[3] || '';
    const defaultImport = match[2] || '';
    // MAP-003 fix: Check for undefined before using
    const from = match[4];
    if (!from) continue;

    const items: string[] = [];
    if (defaultImport && !defaultImport.startsWith('{')) {
      items.push(defaultImport);
    }
    if (namedImports) {
      const named = namedImports.replace(/[{}]/g, '').split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean);
      items.push(...named);
    }

    if (items.length > 0) {
      info.imports.push({ from, items });
    }
  }

  // Extract exports
  const exportRegex = /export\s+(?:default\s+)?(?:const|function|class|interface|type)\s+(\w+)/g;
  exportRegex.lastIndex = 0;
  while ((match = exportRegex.exec(content)) !== null) {
    info.exports.push(match[1]);
  }

  // Also check for inline default exports
  const defaultExportMatch = content.match(/export\s+default\s+(\w+)/);
  if (defaultExportMatch && !info.exports.includes(defaultExportMatch[1])) {
    info.exports.push(defaultExportMatch[1]);
  }

  // Extract React components (functions returning JSX)
  const componentRegex = /(?:export\s+)?(?:const|function)\s+(\w+)(?::\s*React\.FC<(\w+)>)?\s*=?\s*(?:\([^)]*\)|[^=]+)?\s*(?:=>|{)/g;
  componentRegex.lastIndex = 0;
  while ((match = componentRegex.exec(content)) !== null) {
    const name = match[1];
    // Check if it's a component (starts with capital letter)
    if (name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) {
      const componentInfo: ComponentInfo = {
        name,
        props: [],
        hooks: [],
        children: []
      };

      // Extract props interface if exists
      // BUG-FIX (MED-U02): Escape component name to prevent regex injection
      const escapedName = escapeRegExp(name);
      const propsMatch = content.match(new RegExp(`interface\\s+${escapedName}Props\\s*{([^}]+)}`));
      if (propsMatch) {
        const propsContent = propsMatch[1];
        const propNames = propsContent.match(/(\w+)\s*[?:]?\s*:/g);
        if (propNames) {
          componentInfo.props = propNames.map(p => p.replace(/[?:]/g, '').trim());
        }
      }

      // Also try to extract from React.FC<{...}> inline props
      const inlinePropsMatch = content.match(new RegExp(`${escapedName}[^=]*=.*?\\(\\{([^}]+)\\}`));
      if (inlinePropsMatch) {
        const inlineProps = inlinePropsMatch[1].split(',').map(p => p.trim().split(':')[0].trim()).filter(Boolean);
        componentInfo.props = [...new Set([...componentInfo.props, ...inlineProps])];
      }

      // Find hooks used in component
      const hooksRegex = /use\w+/g;
      const componentBody = getComponentBody(content, name);
      if (componentBody) {
        const hooks = componentBody.match(hooksRegex);
        if (hooks) {
          componentInfo.hooks = [...new Set(hooks)];
        }

        // Find child components used
        const jsxComponentRegex = /<([A-Z]\w+)/g;
        jsxComponentRegex.lastIndex = 0;
        let jsxMatch;
        while ((jsxMatch = jsxComponentRegex.exec(componentBody)) !== null) {
          if (!componentInfo.children.includes(jsxMatch[1])) {
            componentInfo.children.push(jsxMatch[1]);
          }
        }
      }

      info.components.push(componentInfo);
    }
  }

  // Extract standalone functions
  const funcRegex = /(?:export\s+)?(?:const|function)\s+([a-z]\w*)\s*(?:=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*\w+)?\s*=>|(?:async\s*)?\([^)]*\))/g;
  funcRegex.lastIndex = 0;
  while ((match = funcRegex.exec(content)) !== null) {
    if (!info.functions.includes(match[1])) {
      info.functions.push(match[1]);
    }
  }

  // Extract constants
  const constRegex = /(?:export\s+)?const\s+([A-Z][A-Z_0-9]+)\s*=/g;
  constRegex.lastIndex = 0;
  while ((match = constRegex.exec(content)) !== null) {
    info.constants.push(match[1]);
  }

  return info;
}

// Helper to get component body (simplified)
function getComponentBody(content: string, componentName: string): string | null {
  // BUG-FIX (MED-U02): Escape component name to prevent regex injection
  const escapedName = escapeRegExp(componentName);
  // Find the component definition
  const patterns = [
    new RegExp(`(?:export\\s+)?(?:const|function)\\s+${escapedName}[^{]*\\{`, 'g'),
    new RegExp(`(?:export\\s+)?const\\s+${escapedName}[^=]*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`, 'g'),
    new RegExp(`(?:export\\s+)?const\\s+${escapedName}[^=]*=\\s*\\([^)]*\\)\\s*=>\\s*\\(`, 'g')
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match) {
      const startIndex = match.index + match[0].length;
      let depth = 1;
      let endIndex = startIndex;
      const openChar = match[0].endsWith('(') ? '(' : '{';
      const closeChar = openChar === '(' ? ')' : '}';

      for (let i = startIndex; i < content.length && depth > 0; i++) {
        if (content[i] === openChar) depth++;
        else if (content[i] === closeChar) depth--;
        endIndex = i;
      }

      // If closing brace not found (depth > 0), return null instead of truncated content
      if (depth > 0) {
        return null;
      }

      return content.substring(startIndex, endIndex);
    }
  }

  return null;
}

// Build component tree showing parent-child relationships
function buildComponentTree(files: FileInfo[]): Record<string, string[]> {
  const tree: Record<string, string[]> = {};

  for (const file of files) {
    for (const component of file.components) {
      tree[component.name] = component.children.filter(child => {
        // Only include children that are defined in our files
        return files.some(f => f.components.some(c => c.name === child));
      });
    }
  }

  return tree;
}

// Generate human-readable summary
function generateSummary(files: FileInfo[], tree: Record<string, string[]>): string {
  const components = files.flatMap(f => f.components);
  const hooks = files.filter(f => f.type === 'hook').flatMap(f => f.exports);
  const dataFiles = files.filter(f => f.type === 'data');

  let summary = `## Project Structure\n\n`;
  summary += `- **${components.length}** components\n`;
  summary += `- **${hooks.length}** custom hooks\n`;
  summary += `- **${dataFiles.length}** data files\n\n`;

  summary += `## Component Hierarchy\n\n`;

  // Find root components (not used as children anywhere)
  const allChildren = new Set(Object.values(tree).flat());
  const roots = components.filter(c => !allChildren.has(c.name));

  function printTree(name: string, indent: string = '', visited: Set<string> = new Set(), depth: number = 0): string {
    // Prevent infinite recursion
    if (depth > 50 || visited.has(name)) {
      return `${indent}- ${name} (max depth reached or circular reference)\n`;
    }

    visited.add(name);

    let result = `${indent}- ${name}`;
    const comp = components.find(c => c.name === name);
    if (comp && comp.props.length > 0) {
      result += ` (props: ${comp.props.slice(0, 5).join(', ')}${comp.props.length > 5 ? '...' : ''})`;
    }
    result += '\n';

    const children = tree[name] || [];
    for (const child of children) {
      result += printTree(child, indent + '  ', new Set(visited), depth + 1);
    }
    return result;
  }

  for (const root of roots) {
    summary += printTree(root.name, '', new Set(), 0);
  }

  summary += `\n## Key Components\n\n`;
  for (const comp of components.slice(0, 10)) {
    summary += `### ${comp.name}\n`;
    if (comp.props.length > 0) {
      summary += `- Props: ${comp.props.join(', ')}\n`;
    }
    if (comp.hooks.length > 0) {
      summary += `- Hooks: ${comp.hooks.join(', ')}\n`;
    }
    if (comp.children.length > 0) {
      summary += `- Uses: ${comp.children.join(', ')}\n`;
    }
    summary += '\n';
  }

  return summary;
}

// Main function to generate codemap
export function generateCodeMap(files: FileSystem): CodeMap {
  const fileInfos: FileInfo[] = [];

  for (const [path, content] of Object.entries(files)) {
    // Skip non-source files
    if (!path.match(/\.(tsx?|jsx?|css|json)$/) || path.includes('node_modules')) {
      continue;
    }

    fileInfos.push(analyzeFile(path, content));
  }

  const componentTree = buildComponentTree(fileInfos);
  const summary = generateSummary(fileInfos, componentTree);

  return {
    files: fileInfos,
    componentTree,
    summary
  };
}

// Generate a compact context string for the LLM prompt
export function generateContextForPrompt(files: FileSystem): string {
  const codemap = generateCodeMap(files);

  let context = `## CURRENT PROJECT ANALYSIS\n\n`;

  // File overview
  context += `### Files (${codemap.files.length} total)\n`;
  for (const file of codemap.files) {
    context += `- \`${file.path}\` [${file.type}]`;
    if (file.exports.length > 0) {
      context += ` exports: ${file.exports.join(', ')}`;
    }
    context += '\n';
  }

  // Component details
  const components = codemap.files.flatMap(f => f.components);
  if (components.length > 0) {
    context += `\n### Components (${components.length})\n`;
    for (const comp of components) {
      context += `\n**${comp.name}**\n`;
      if (comp.props.length > 0) {
        context += `  - Props: \`${comp.props.join('`, `')}\`\n`;
      }
      if (comp.hooks.length > 0) {
        context += `  - Hooks: ${comp.hooks.join(', ')}\n`;
      }
      if (comp.children.length > 0) {
        context += `  - Renders: ${comp.children.join(', ')}\n`;
      }
    }
  }

  // Import graph (simplified)
  context += `\n### Import Dependencies\n`;
  for (const file of codemap.files) {
    const localImports = file.imports.filter(i => i.from.startsWith('.') || i.from.startsWith('src/'));
    if (localImports.length > 0) {
      context += `- \`${file.path}\` imports from: ${localImports.map(i => i.from).join(', ')}\n`;
    }
  }

  return context;
}

// Generate full PROJECT_CONTEXT.md content
export function generateProjectContextMd(files: FileSystem): string {
  const codemap = generateCodeMap(files);
  const components = codemap.files.flatMap(f => f.components);
  const hooks = codemap.files.filter(f => f.type === 'hook');
  const utilities = codemap.files.filter(f => f.type === 'utility');
  const dataFiles = codemap.files.filter(f => f.type === 'data');

  // Generate folder tree
  const paths = Object.keys(files).sort();
  const treeLines: string[] = [];
  const seen = new Set<string>();

  for (const path of paths) {
    const parts = path.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!seen.has(currentPath)) {
        seen.add(currentPath);
        const indent = '  '.repeat(i);
        const prefix = isLast ? '📄' : '📁';
        treeLines.push(`${indent}${prefix} ${part}`);
      }
    }
  }

  let md = `# PROJECT CONTEXT

> Auto-generated project structure for AI context continuity.
> Last updated: ${new Date().toISOString()}

## Overview

| Metric | Count |
|--------|-------|
| Total Files | ${codemap.files.length} |
| Components | ${components.length} |
| Hooks | ${hooks.length} |
| Utilities | ${utilities.length} |
| Data Files | ${dataFiles.length} |

## File Structure

\`\`\`
${treeLines.join('\n')}
\`\`\`

## Components

${components.map(comp => `### ${comp.name}
${comp.props.length > 0 ? `- **Props:** ${comp.props.join(', ')}` : ''}
${comp.hooks.length > 0 ? `- **Hooks:** ${comp.hooks.join(', ')}` : ''}
${comp.children.length > 0 ? `- **Renders:** ${comp.children.join(', ')}` : ''}`).join('\n\n')}

## Hooks

${hooks.length > 0 ? hooks.map(h => `- **${h.path}**: ${h.exports.join(', ')}`).join('\n') : '_No custom hooks_'}

## Utilities

${utilities.length > 0 ? utilities.map(u => `- **${u.path}**: ${u.exports.join(', ')}`).join('\n') : '_No utilities_'}

## Data & Database

${dataFiles.length > 0 ? dataFiles.map(d => `- **${d.path}**`).join('\n') : '_No data files_'}

## Import Graph

${codemap.files.filter(f => f.imports.filter(i => i.from.startsWith('.')).length > 0).map(file => {
  const localImports = file.imports.filter(i => i.from.startsWith('.'));
  return `- **${file.path}** → ${localImports.map(i => i.from.split('/').pop()).join(', ')}`;
}).join('\n')}

---
_This context is automatically updated and sent with AI prompts for continuity._
`;

  return md;
}
