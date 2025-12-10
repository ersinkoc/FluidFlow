/**
 * ErrorAnalyzer - Advanced error parsing and analysis
 *
 * Extracts detailed information from error messages and stack traces
 * to help both local and AI fixes
 */

import { FileSystem } from '../types';

export interface ParsedError {
  // Original error
  message: string;
  stack?: string;

  // Parsed details
  type: ErrorType;
  category: ErrorCategory;

  // Location info
  file?: string;
  line?: number;
  column?: number;

  // Specific error details
  identifier?: string;        // For undefined/import errors
  importPath?: string;        // For import errors
  expectedType?: string;      // For type errors
  actualType?: string;        // For type errors
  missingProperty?: string;   // For property errors

  // Related files
  relatedFiles: string[];     // Files that might be involved

  // Fix suggestions
  suggestedFix?: string;
  isAutoFixable: boolean;
  confidence: number;         // 0-1, how confident we are about the analysis
}

export type ErrorType =
  | 'bare-specifier'
  | 'module-not-found'
  | 'undefined-variable'
  | 'type-error'
  | 'syntax-error'
  | 'property-error'
  | 'jsx-error'
  | 'hook-error'
  | 'runtime-error'
  | 'network-error'
  | 'unknown';

export type ErrorCategory =
  | 'import'
  | 'reference'
  | 'type'
  | 'syntax'
  | 'runtime'
  | 'network'
  | 'unknown';

// Error patterns with their parsers
interface ErrorPattern {
  pattern: RegExp;
  type: ErrorType;
  category: ErrorCategory;
  extract: (match: RegExpMatchArray, errorMessage: string, stack?: string) => Partial<ParsedError>;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Bare specifier errors
  {
    pattern: /["']([^"']+)["']\s*was\s*a?\s*bare\s*specifier/i,
    type: 'bare-specifier',
    category: 'import',
    extract: (match) => ({
      importPath: match[1],
      suggestedFix: `Change import from "${match[1]}" to a relative path like "./${match[1].replace(/^src\//, '')}"`,
      isAutoFixable: true,
      confidence: 0.95
    })
  },
  {
    pattern: /specifier\s*["']([^"']+)["']\s*was\s*not\s*remapped/i,
    type: 'bare-specifier',
    category: 'import',
    extract: (match) => ({
      importPath: match[1],
      suggestedFix: `Change import from "${match[1]}" to a relative path`,
      isAutoFixable: true,
      confidence: 0.9
    })
  },

  // Module not found
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/i,
    type: 'module-not-found',
    category: 'import',
    extract: (match) => ({
      importPath: match[1],
      suggestedFix: `Check if "${match[1]}" exists or install the package`,
      isAutoFixable: match[1].startsWith('.') || match[1].startsWith('src/'),
      confidence: 0.85
    })
  },
  {
    pattern: /Module not found:\s*(?:Error:\s*)?(?:Can't resolve\s*)?['"]?([^'"]+)['"]?/i,
    type: 'module-not-found',
    category: 'import',
    extract: (match) => ({
      importPath: match[1],
      isAutoFixable: false,
      confidence: 0.8
    })
  },

  // Failed to resolve
  {
    pattern: /Failed to resolve import ["']([^"']+)["']/i,
    type: 'module-not-found',
    category: 'import',
    extract: (match) => ({
      importPath: match[1],
      isAutoFixable: true,
      confidence: 0.85
    })
  },

  // Undefined variable
  {
    pattern: /(\w+)\s+is\s+not\s+defined/i,
    type: 'undefined-variable',
    category: 'reference',
    extract: (match) => ({
      identifier: match[1],
      suggestedFix: `Add import for "${match[1]}" or define it`,
      isAutoFixable: true,
      confidence: 0.9
    })
  },
  {
    pattern: /ReferenceError:\s*(\w+)\s+is\s+not\s+defined/i,
    type: 'undefined-variable',
    category: 'reference',
    extract: (match) => ({
      identifier: match[1],
      isAutoFixable: true,
      confidence: 0.95
    })
  },
  {
    pattern: /Cannot find name\s+['"]?(\w+)['"]?/i,
    type: 'undefined-variable',
    category: 'reference',
    extract: (match) => ({
      identifier: match[1],
      isAutoFixable: true,
      confidence: 0.9
    })
  },

  // Type errors
  {
    pattern: /Type ['"]([^'"]+)['"] is not assignable to type ['"]([^'"]+)['"]/i,
    type: 'type-error',
    category: 'type',
    extract: (match) => ({
      actualType: match[1],
      expectedType: match[2],
      suggestedFix: `Fix type mismatch: expected ${match[2]} but got ${match[1]}`,
      isAutoFixable: false,
      confidence: 0.8
    })
  },
  {
    pattern: /Property ['"](\w+)['"] does not exist on type/i,
    type: 'property-error',
    category: 'type',
    extract: (match) => ({
      missingProperty: match[1],
      isAutoFixable: false,
      confidence: 0.75
    })
  },
  {
    pattern: /Argument of type ['"]([^'"]+)['"] is not assignable/i,
    type: 'type-error',
    category: 'type',
    extract: (match) => ({
      actualType: match[1],
      isAutoFixable: false,
      confidence: 0.7
    })
  },

  // Syntax errors
  {
    pattern: /SyntaxError:\s*(.+)/i,
    type: 'syntax-error',
    category: 'syntax',
    extract: (match) => ({
      suggestedFix: `Fix syntax error: ${match[1]}`,
      isAutoFixable: false,
      confidence: 0.6
    })
  },
  {
    pattern: /Unexpected token\s*['"]?(\S+)['"]?/i,
    type: 'syntax-error',
    category: 'syntax',
    extract: (match) => ({
      identifier: match[1],
      suggestedFix: `Fix unexpected token "${match[1]}"`,
      isAutoFixable: false,
      confidence: 0.65
    })
  },
  {
    pattern: /Unterminated\s+(string|template)\s+literal/i,
    type: 'syntax-error',
    category: 'syntax',
    extract: (match) => ({
      suggestedFix: `Close the unterminated ${match[1]} literal`,
      isAutoFixable: false,
      confidence: 0.7
    })
  },

  // JSX errors
  {
    pattern: /JSX element ['"](\w+)['"] has no corresponding closing tag/i,
    type: 'jsx-error',
    category: 'syntax',
    extract: (match) => ({
      identifier: match[1],
      suggestedFix: `Add closing tag for <${match[1]}>`,
      isAutoFixable: false,
      confidence: 0.8
    })
  },
  {
    pattern: /Adjacent JSX elements must be wrapped/i,
    type: 'jsx-error',
    category: 'syntax',
    extract: () => ({
      suggestedFix: 'Wrap multiple JSX elements in a fragment <></> or parent element',
      isAutoFixable: false,
      confidence: 0.85
    })
  },

  // React Hook errors
  {
    pattern: /React Hook ["'](\w+)["'] is called conditionally/i,
    type: 'hook-error',
    category: 'runtime',
    extract: (match) => ({
      identifier: match[1],
      suggestedFix: `Move ${match[1]} to the top level of the component (hooks cannot be called conditionally)`,
      isAutoFixable: false,
      confidence: 0.9
    })
  },
  {
    pattern: /React Hook ["'](\w+)["'] cannot be called inside a callback/i,
    type: 'hook-error',
    category: 'runtime',
    extract: (match) => ({
      identifier: match[1],
      suggestedFix: `Move ${match[1]} outside of the callback`,
      isAutoFixable: false,
      confidence: 0.9
    })
  },
  {
    pattern: /Invalid hook call/i,
    type: 'hook-error',
    category: 'runtime',
    extract: () => ({
      suggestedFix: 'Ensure hooks are only called inside function components or custom hooks',
      isAutoFixable: false,
      confidence: 0.8
    })
  },

  // Property/method errors
  {
    pattern: /Cannot read propert(?:y|ies) (?:of\s+)?['"]?(\w+)['"]? (?:of\s+)?(undefined|null)/i,
    type: 'runtime-error',
    category: 'runtime',
    extract: (match) => ({
      missingProperty: match[1],
      suggestedFix: `Add null check before accessing "${match[1]}"`,
      isAutoFixable: false,
      confidence: 0.7
    })
  },
  {
    pattern: /(\w+) is not a function/i,
    type: 'runtime-error',
    category: 'runtime',
    extract: (match) => ({
      identifier: match[1],
      suggestedFix: `"${match[1]}" is not a function - check import or definition`,
      isAutoFixable: false,
      confidence: 0.65
    })
  },

  // Export errors
  {
    pattern: /does not provide an export named ['"](\w+)['"]/i,
    type: 'module-not-found',
    category: 'import',
    extract: (match) => ({
      identifier: match[1],
      suggestedFix: `Export "${match[1]}" does not exist - check the module's exports`,
      isAutoFixable: false,
      confidence: 0.8
    })
  },
  {
    pattern: /export ['"](\w+)['"] (?:was )?not found/i,
    type: 'module-not-found',
    category: 'import',
    extract: (match) => ({
      identifier: match[1],
      isAutoFixable: false,
      confidence: 0.75
    })
  },

  // Network errors
  {
    pattern: /Failed to fetch/i,
    type: 'network-error',
    category: 'network',
    extract: () => ({
      suggestedFix: 'Check network connection and API endpoint',
      isAutoFixable: false,
      confidence: 0.5
    })
  },
  {
    pattern: /NetworkError|CORS|Cross-Origin/i,
    type: 'network-error',
    category: 'network',
    extract: () => ({
      suggestedFix: 'Check CORS configuration on the server',
      isAutoFixable: false,
      confidence: 0.5
    })
  }
];

class ErrorAnalyzer {
  /**
   * Parse and analyze an error message
   */
  analyze(errorMessage: string, errorStack?: string, files?: FileSystem): ParsedError {
    const result: ParsedError = {
      message: errorMessage,
      stack: errorStack,
      type: 'unknown',
      category: 'unknown',
      relatedFiles: [],
      isAutoFixable: false,
      confidence: 0
    };

    // Try each pattern
    for (const pattern of ERROR_PATTERNS) {
      const match = errorMessage.match(pattern.pattern);
      if (match) {
        const extracted = pattern.extract(match, errorMessage, errorStack);
        Object.assign(result, {
          type: pattern.type,
          category: pattern.category,
          ...extracted
        });
        break;
      }
    }

    // Extract file location from error message or stack
    const location = this.extractLocation(errorMessage, errorStack);
    if (location) {
      result.file = location.file;
      result.line = location.line;
      result.column = location.column;
    }

    // Find related files
    if (files) {
      result.relatedFiles = this.findRelatedFiles(result, files);
    }

    return result;
  }

  /**
   * Extract file location from error message or stack trace
   */
  private extractLocation(errorMessage: string, errorStack?: string): { file?: string; line?: number; column?: number } | null {
    const combined = errorMessage + (errorStack ? '\n' + errorStack : '');

    // Pattern: file.tsx:line:column
    const fileMatch = combined.match(/(?:at\s+)?(?:\()?([^()\s]+\.(?:tsx?|jsx?)):(\d+):(\d+)(?:\))?/);
    if (fileMatch) {
      return {
        file: this.normalizeFilePath(fileMatch[1]),
        line: parseInt(fileMatch[2], 10),
        column: parseInt(fileMatch[3], 10)
      };
    }

    // Pattern: in file.tsx (line X, column Y)
    const inFileMatch = combined.match(/in\s+([^()\s]+\.(?:tsx?|jsx?))\s*\(line\s+(\d+)/i);
    if (inFileMatch) {
      return {
        file: this.normalizeFilePath(inFileMatch[1]),
        line: parseInt(inFileMatch[2], 10)
      };
    }

    // Pattern: at file:line
    const atMatch = combined.match(/at\s+([^:]+):(\d+)/);
    if (atMatch && atMatch[1].includes('.')) {
      return {
        file: this.normalizeFilePath(atMatch[1]),
        line: parseInt(atMatch[2], 10)
      };
    }

    return null;
  }

  /**
   * Normalize file path (remove URL parts, make relative)
   */
  private normalizeFilePath(path: string): string {
    // Remove URL parts
    let normalized = path.replace(/^https?:\/\/[^/]+\//, '');

    // Remove query strings
    normalized = normalized.split('?')[0];

    // Remove leading slashes
    normalized = normalized.replace(/^\/+/, '');

    // Normalize to src/ prefix if needed
    if (!normalized.startsWith('src/') && !normalized.startsWith('./')) {
      // Check if it looks like a src file
      if (normalized.includes('components/') || normalized.includes('utils/') ||
          normalized.includes('hooks/') || normalized.includes('services/')) {
        normalized = 'src/' + normalized;
      }
    }

    return normalized;
  }

  /**
   * Find files that might be related to the error
   */
  private findRelatedFiles(error: ParsedError, files: FileSystem): string[] {
    const related: string[] = [];

    // If we have an import path, find files that import it
    if (error.importPath) {
      for (const [filePath, content] of Object.entries(files)) {
        if (!content) continue;
        if (content.includes(error.importPath)) {
          related.push(filePath);
        }
      }
    }

    // If we have an identifier, find files that define or use it
    if (error.identifier) {
      const identifier = error.identifier;
      for (const [filePath, content] of Object.entries(files)) {
        if (!content) continue;

        // Check for export
        if (new RegExp(`export\\s+(?:default\\s+)?(?:const|let|var|function|class)?\\s*${identifier}\\b`).test(content)) {
          related.push(filePath);
        }
        // Check for component definition
        if (new RegExp(`(?:function|const)\\s+${identifier}\\s*[=(]`).test(content)) {
          related.push(filePath);
        }
      }
    }

    // If we have the error file, add files it imports
    if (error.file && files[error.file]) {
      const content = files[error.file];
      const importMatches = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
      for (const match of importMatches) {
        const importPath = match[1];
        if (importPath.startsWith('.')) {
          // Resolve relative import
          const resolved = this.resolveImport(error.file, importPath, files);
          if (resolved) {
            related.push(resolved);
          }
        }
      }
    }

    // Remove duplicates and the error file itself
    return [...new Set(related)].filter(f => f !== error.file);
  }

  /**
   * Resolve a relative import to an actual file path
   */
  private resolveImport(fromFile: string, importPath: string, files: FileSystem): string | null {
    const fromDir = fromFile.split('/').slice(0, -1).join('/');

    let resolved = importPath;
    if (importPath.startsWith('./')) {
      resolved = fromDir + '/' + importPath.slice(2);
    } else if (importPath.startsWith('../')) {
      const parts = fromDir.split('/');
      const upCount = (importPath.match(/\.\.\//g) || []).length;
      resolved = parts.slice(0, -upCount).join('/') + '/' + importPath.replace(/\.\.\//g, '');
    }

    // Try with different extensions
    const extensions = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
    for (const ext of extensions) {
      const fullPath = resolved + ext;
      if (files[fullPath]) {
        return fullPath;
      }
    }

    return null;
  }

  /**
   * Get a severity score for the error (0-10)
   */
  getSeverity(error: ParsedError): number {
    const severityByCategory: Record<ErrorCategory, number> = {
      'syntax': 10,      // Blocks compilation
      'import': 9,       // Blocks compilation
      'reference': 8,    // Runtime crash likely
      'type': 6,         // TypeScript error, may still run
      'runtime': 7,      // Runtime crash
      'network': 4,      // May be transient
      'unknown': 5
    };

    return severityByCategory[error.category] || 5;
  }

  /**
   * Get a human-readable summary of the error
   */
  getSummary(error: ParsedError): string {
    const parts: string[] = [];

    switch (error.type) {
      case 'bare-specifier':
        parts.push(`Import "${error.importPath}" needs to use a relative path`);
        break;
      case 'module-not-found':
        parts.push(`Cannot find module "${error.importPath || error.identifier}"`);
        break;
      case 'undefined-variable':
        parts.push(`"${error.identifier}" is not defined`);
        break;
      case 'type-error':
        if (error.expectedType && error.actualType) {
          parts.push(`Type mismatch: expected ${error.expectedType}, got ${error.actualType}`);
        } else {
          parts.push('Type error');
        }
        break;
      case 'syntax-error':
        parts.push('Syntax error in code');
        break;
      case 'jsx-error':
        parts.push('JSX syntax error');
        break;
      case 'hook-error':
        parts.push(`React Hook "${error.identifier}" used incorrectly`);
        break;
      case 'property-error':
        parts.push(`Property "${error.missingProperty}" does not exist`);
        break;
      case 'runtime-error':
        parts.push('Runtime error');
        break;
      case 'network-error':
        parts.push('Network error');
        break;
      default:
        parts.push(error.message.slice(0, 100));
    }

    if (error.file) {
      parts.push(`in ${error.file}`);
      if (error.line) {
        parts.push(`at line ${error.line}`);
      }
    }

    return parts.join(' ');
  }
}

export const errorAnalyzer = new ErrorAnalyzer();
