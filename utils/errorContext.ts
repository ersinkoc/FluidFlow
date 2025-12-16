/**
 * Error Context Utilities
 *
 * Helpers for building context from errors for AI-powered fixing.
 * Extracted from useAutoFix for reusability.
 */

import { FileSystem, LogEntry } from '@/types';
import { classifyError, ErrorCategory } from '@/services/autoFixService';

/**
 * Parse stack trace to identify error location
 */
export function parseStackTrace(errorMessage: string): { file?: string; line?: number; column?: number } {
  // Pattern: Transpilation failed for src/components/Features.tsx
  const transpileMatch = errorMessage.match(/(?:Transpilation failed for|failed for)\s+(src\/[\w./]+\.tsx?)[\s:]/i);
  if (transpileMatch) {
    const lineMatch = errorMessage.match(/\((\d+):(\d+)\)/);
    return {
      file: transpileMatch[1],
      line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      column: lineMatch ? parseInt(lineMatch[2], 10) : undefined
    };
  }

  // Pattern: at Component (filename.tsx:123:45)
  const stackMatch = errorMessage.match(/at\s+(?:\w+\s+\()?([\w./]+\.tsx?):(\d+):(\d+)/);
  if (stackMatch) {
    return {
      file: stackMatch[1],
      line: parseInt(stackMatch[2], 10),
      column: parseInt(stackMatch[3], 10)
    };
  }

  // Pattern: Error in src/App.tsx:123
  const simpleMatch = errorMessage.match(/(?:Error in|at)\s+(src\/[\w./]+\.tsx?):?(\d+)?/i);
  if (simpleMatch) {
    return {
      file: simpleMatch[1],
      line: simpleMatch[2] ? parseInt(simpleMatch[2], 10) : undefined
    };
  }

  // Pattern: /src/components/File.tsx: Unexpected token
  const pathMatch = errorMessage.match(/\/(src\/[\w./]+\.tsx?):/);
  if (pathMatch) {
    const lineMatch = errorMessage.match(/\((\d+):(\d+)\)/);
    return {
      file: pathMatch[1],
      line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      column: lineMatch ? parseInt(lineMatch[2], 10) : undefined
    };
  }

  return {};
}

/**
 * Extract local imports from code
 */
export function extractLocalImports(code: string, files: FileSystem): string[] {
  const imports: string[] = [];
  const importRegex = /import\s+(?:(?:\{[^}]*\}|[^{}\s,]+|\*\s+as\s+\w+)(?:\s*,\s*)?)+\s+from\s+['"]\.\.?\/([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[1];
    const possiblePaths = [
      `src/${importPath}.tsx`,
      `src/${importPath}.ts`,
      `src/${importPath}/index.tsx`,
      `src/${importPath}/index.ts`,
      `${importPath}.tsx`,
      `${importPath}.ts`,
    ];

    for (const p of possiblePaths) {
      if (files[p]) {
        imports.push(p);
        break;
      }
    }
  }

  return [...new Set(imports)];
}

/**
 * Get related files based on error context
 */
export function getRelatedFiles(
  errorMessage: string,
  mainCode: string,
  files: FileSystem
): Record<string, string> {
  const related: Record<string, string> = {};

  // Get local imports from App.tsx
  const localImports = extractLocalImports(mainCode, files);
  for (const importPath of localImports.slice(0, 5)) {
    if (files[importPath]) {
      related[importPath] = files[importPath];
    }
  }

  // Check for component name in error
  const componentMatch = errorMessage.match(/(?:Element type|'|")(\w+)(?:'|")|(?:cannot read|undefined)\s+(?:property\s+)?['"]?(\w+)['"]?/i);
  if (componentMatch) {
    const componentName = componentMatch[1] || componentMatch[2];
    for (const [path, content] of Object.entries(files)) {
      if (path.toLowerCase().includes(componentName.toLowerCase()) ||
          content.includes(`export const ${componentName}`) ||
          content.includes(`export function ${componentName}`) ||
          content.includes(`export default ${componentName}`)) {
        if (!related[path] && Object.keys(related).length < 6) {
          related[path] = content;
        }
      }
    }
  }

  // Include types file if exists
  if (files['src/types.ts'] && !related['src/types.ts']) {
    related['src/types.ts'] = files['src/types.ts'];
  }

  // Parse stack trace for specific file
  const stackInfo = parseStackTrace(errorMessage);
  if (stackInfo.file && files[stackInfo.file] && !related[stackInfo.file]) {
    related[stackInfo.file] = files[stackInfo.file];
  }

  return related;
}

/**
 * Get recent console logs for context
 */
export function getRecentLogsContext(logs: LogEntry[]): string {
  const recentLogs = logs.slice(-10);
  if (recentLogs.length === 0) return '';

  const logContext = recentLogs
    .filter(l => l.type === 'error' || l.type === 'warn')
    .map(l => `[${l.type.toUpperCase()}] ${l.message}`)
    .join('\n');

  return logContext ? `## Recent Console Logs\n\`\`\`\n${logContext}\n\`\`\`\n` : '';
}

/**
 * Category-specific hints for error fixing
 */
const CATEGORY_HINTS: Record<ErrorCategory, string> = {
  import: `- Check if the import source exists and is correct
- For motion animations, use 'motion/react' (not 'framer-motion')
- For React Router v7, imports are from 'react-router' (not 'react-router-dom')
- Verify named vs default exports match`,
  syntax: `- Check for missing brackets, parentheses, or semicolons
- Verify JSX syntax is valid
- Ensure template literals are properly closed`,
  type: `- Check type definitions in types.ts if available
- Ensure props match expected types
- Verify generic type parameters`,
  runtime: `- Check for null/undefined access
- Verify async operations are properly awaited
- Ensure state is initialized before use`,
  react: `- Verify hook rules (only call in component body)
- Check key props for list items
- Ensure proper event handler binding`,
  transient: '',
  unknown: '',
};

export interface AutoFixPromptContext {
  errorMessage: string;
  targetFile: string;
  targetFileContent: string;
  files: FileSystem;
  techStackContext: string;
  logs: LogEntry[];
}

/**
 * Build the system prompt for AI auto-fix
 */
export function buildAutoFixPrompt(context: AutoFixPromptContext): string {
  const { errorMessage, targetFile, targetFileContent, files, techStackContext, logs } = context;

  const errorClassification = classifyError(errorMessage);
  const relatedFiles = getRelatedFiles(errorMessage, targetFileContent, files);
  const recentLogsContext = getRecentLogsContext(logs);
  const stackInfo = parseStackTrace(errorMessage);
  const categoryHint = CATEGORY_HINTS[errorClassification.category] || '';

  // Build related files section
  let relatedFilesSection = '';
  const relatedEntries = Object.entries(relatedFiles).filter(([path]) => path !== targetFile);
  if (relatedEntries.length > 0) {
    relatedFilesSection = '\n## Related Files (may contain relevant code)\n';
    for (const [path, content] of relatedEntries) {
      const truncated = content.length > 2000 ? content.slice(0, 2000) + '\n// ... truncated' : content;
      relatedFilesSection += `### ${path}\n\`\`\`tsx\n${truncated}\n\`\`\`\n`;
    }
  }

  return `You are an expert React/TypeScript developer. Fix the following runtime error.

${techStackContext}

## Error Information
- **Error Message**: ${errorMessage}
- **Error Category**: ${errorClassification.category}
- **Priority**: ${errorClassification.priority}/5
- **Target File**: ${targetFile}${stackInfo.line ? ` (line ${stackInfo.line})` : ''}

${recentLogsContext}

## Available Files in Project
${Object.keys(files).join(', ')}

${relatedFilesSection}

## File to Fix (${targetFile})
\`\`\`tsx
${targetFileContent}
\`\`\`

## Fix Guidelines
1. ONLY fix the specific error - do not refactor unrelated code
2. Maintain the existing code style and patterns
3. Ensure all imports are correct (check the tech stack above for correct package names)
4. If a component is undefined, check if it should be imported or defined
5. For missing exports, check related files above for correct export names
6. Pay attention to special characters in strings (like apostrophes)

${categoryHint ? `## Category-Specific Hints\n${categoryHint}` : ''}

## Required Output Format
Return ONLY the complete fixed ${targetFile} code.
- No explanations or comments about the fix
- No markdown code blocks or backticks
- Just valid TypeScript/TSX code that can directly replace the file`;
}
