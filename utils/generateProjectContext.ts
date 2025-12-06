import { FileSystem } from '../types';

interface FileAnalysis {
  path: string;
  name: string;
  type: 'component' | 'hook' | 'util' | 'type' | 'style' | 'config' | 'data' | 'other';
  exports: string[];
  imports: string[];
  dependencies: string[];
  lines: number;
}

// Analyze a file's content
function analyzeFile(path: string, content: string): FileAnalysis {
  const name = path.split('/').pop() || path;
  const lines = content.split('\n').length;

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

  return { path, name, type, exports, imports, dependencies, lines };
}

// Generate folder tree string
function generateFolderTree(files: FileSystem): string {
  const paths = Object.keys(files).sort();
  const tree: string[] = [];
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
        tree.push(`${indent}${prefix} ${part}`);
      }
    }
  }

  return tree.join('\n');
}

// Generate PROJECT_CONTEXT.md content
export function generateProjectContext(files: FileSystem): string {
  const analyses = Object.entries(files).map(([path, content]) => analyzeFile(path, content));

  // Statistics
  const stats = {
    totalFiles: analyses.length,
    totalLines: analyses.reduce((sum, a) => sum + a.lines, 0),
    components: analyses.filter(a => a.type === 'component'),
    hooks: analyses.filter(a => a.type === 'hook'),
    utils: analyses.filter(a => a.type === 'util'),
    types: analyses.filter(a => a.type === 'type'),
    styles: analyses.filter(a => a.type === 'style'),
    configs: analyses.filter(a => a.type === 'config'),
    data: analyses.filter(a => a.type === 'data'),
    dependencies: [...new Set(analyses.flatMap(a => a.dependencies))]
  };

  // Build markdown
  let md = `# Project Context

> Auto-generated project structure for AI context. Last updated: ${new Date().toISOString()}

## Overview

| Metric | Value |
|--------|-------|
| Total Files | ${stats.totalFiles} |
| Total Lines | ${stats.totalLines.toLocaleString()} |
| Components | ${stats.components.length} |
| Hooks | ${stats.hooks.length} |
| Utilities | ${stats.utils.length} |
| Types | ${stats.types.length} |

## File Structure

\`\`\`
${generateFolderTree(files)}
\`\`\`

## Components

${stats.components.length > 0 ? stats.components.map(c =>
  `### ${c.name}\n- **Path:** \`${c.path}\`\n- **Exports:** ${c.exports.join(', ') || 'default'}\n- **Lines:** ${c.lines}`
).join('\n\n') : '_No components_'}

## Hooks

${stats.hooks.length > 0 ? stats.hooks.map(h =>
  `- **${h.name}** (\`${h.path}\`) - ${h.exports.join(', ') || 'default'}`
).join('\n') : '_No hooks_'}

## Utilities

${stats.utils.length > 0 ? stats.utils.map(u =>
  `- **${u.name}** (\`${u.path}\`) - ${u.exports.join(', ') || 'default'}`
).join('\n') : '_No utilities_'}

## Types & Interfaces

${stats.types.length > 0 ? stats.types.map(t =>
  `- **${t.name}** (\`${t.path}\`)`
).join('\n') : '_No type files_'}

## Database Schema

${stats.data.length > 0 ? stats.data.map(d =>
  `- **${d.name}** (\`${d.path}\`) - ${d.lines} lines`
).join('\n') : '_No database files_'}

## Dependencies

${stats.dependencies.length > 0 ? stats.dependencies.map(d => `- \`${d}\``).join('\n') : '_No external dependencies_'}

## Import Graph

${analyses.filter(a => a.imports.filter(i => i.startsWith('.')).length > 0).slice(0, 20).map(file =>
  `- **${file.name}** → ${file.imports.filter(i => i.startsWith('.')).map(i => `\`${i.split('/').pop()}\``).join(', ')}`
).join('\n')}

---

_This context helps AI understand the project structure for better code generation._
`;

  return md;
}

// Generate a compact context for prompts (shorter version)
export function generateCompactContext(files: FileSystem): string {
  const analyses = Object.entries(files).map(([path, content]) => analyzeFile(path, content));

  const components = analyses.filter(a => a.type === 'component').map(c => c.name);
  const hooks = analyses.filter(a => a.type === 'hook').map(h => h.name);
  const utils = analyses.filter(a => a.type === 'util').map(u => u.name);

  return `Project Structure:
- Components: ${components.join(', ') || 'none'}
- Hooks: ${hooks.join(', ') || 'none'}
- Utilities: ${utils.join(', ') || 'none'}
- Files: ${Object.keys(files).join(', ')}`;
}
