/**
 * Error Analyzer
 *
 * Unified error analysis module that parses error messages,
 * classifies errors, and extracts actionable information.
 */

import { FileSystem } from '../../types';
import {
  ParsedError,
  ErrorType,
  ErrorCategory,
} from './types';

// ============================================================================
// Error Pattern Definitions
// ============================================================================

interface ErrorPattern {
  pattern: RegExp;
  type: ErrorType;
  category: ErrorCategory;
  priority: number;
  extract: (match: RegExpMatchArray, message: string) => Partial<ParsedError>;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Bare specifier errors (highest priority - most common)
  {
    pattern: /["']([^"']+)["']\s*was\s*a?\s*bare\s*specifier/i,
    type: 'bare-specifier',
    category: 'import',
    priority: 5,
    extract: (match) => ({
      importPath: match[1],
      suggestedFix: `Change import from "${match[1]}" to a relative path`,
      isAutoFixable: true,
      confidence: 0.95,
    }),
  },
  {
    pattern: /specifier\s*["']([^"']+)["']\s*was\s*not\s*remapped/i,
    type: 'bare-specifier',
    category: 'import',
    priority: 5,
    extract: (match) => ({
      importPath: match[1],
      isAutoFixable: true,
      confidence: 0.9,
    }),
  },

  // Module not found
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/i,
    type: 'module-not-found',
    category: 'import',
    priority: 4,
    extract: (match) => ({
      importPath: match[1],
      isAutoFixable: match[1].startsWith('.') || match[1].startsWith('src/'),
      confidence: 0.85,
    }),
  },
  {
    pattern: /Failed to resolve import ["']([^"']+)["']/i,
    type: 'module-not-found',
    category: 'import',
    priority: 4,
    extract: (match) => ({
      importPath: match[1],
      isAutoFixable: true,
      confidence: 0.85,
    }),
  },

  // Undefined variable (very common)
  {
    pattern: /ReferenceError:\s*(\w+)\s+is\s+not\s+defined/i,
    type: 'undefined-variable',
    category: 'import',
    priority: 4,
    extract: (match) => ({
      identifier: match[1],
      isAutoFixable: true,
      confidence: 0.95,
    }),
  },
  {
    pattern: /['"]?(\w+)['"]?\s+is\s+not\s+defined/i,
    type: 'undefined-variable',
    category: 'import',
    priority: 4,
    extract: (match) => ({
      identifier: match[1],
      suggestedFix: `Add import or define "${match[1]}"`,
      isAutoFixable: true,
      confidence: 0.9,
    }),
  },
  {
    pattern: /Cannot find name\s+['"]?(\w+)['"]?/i,
    type: 'undefined-variable',
    category: 'import',
    priority: 4,
    extract: (match) => ({
      identifier: match[1],
      isAutoFixable: true,
      confidence: 0.9,
    }),
  },

  // Type errors
  {
    pattern: /Type ['"]([^'"]+)['"] is not assignable to type ['"]([^'"]+)['"]/i,
    type: 'type-error',
    category: 'type',
    priority: 3,
    extract: (match) => ({
      actualType: match[1],
      expectedType: match[2],
      isAutoFixable: false,
      confidence: 0.8,
    }),
  },
  {
    pattern: /Property ['"](\w+)['"] does not exist on type/i,
    type: 'property-error',
    category: 'type',
    priority: 3,
    extract: (match) => ({
      missingProperty: match[1],
      isAutoFixable: false,
      confidence: 0.75,
    }),
  },

  // Syntax errors
  {
    pattern: /SyntaxError:\s*(.+)/i,
    type: 'syntax-error',
    category: 'syntax',
    priority: 5,
    extract: (match) => ({
      suggestedFix: `Fix syntax error: ${match[1]}`,
      isAutoFixable: false,
      confidence: 0.6,
    }),
  },
  {
    pattern: /Unexpected token\s*['"]?(\S+)['"]?/i,
    type: 'syntax-error',
    category: 'syntax',
    priority: 5,
    extract: (match) => ({
      identifier: match[1],
      isAutoFixable: false,
      confidence: 0.65,
    }),
  },
  {
    pattern: /Unterminated\s+(string|template)\s+literal/i,
    type: 'syntax-error',
    category: 'syntax',
    priority: 5,
    extract: (match) => ({
      suggestedFix: `Close the unterminated ${match[1]} literal`,
      isAutoFixable: false,
      confidence: 0.7,
    }),
  },

  // JSX errors
  {
    pattern: /JSX element ['"](\w+)['"] has no corresponding closing tag/i,
    type: 'jsx-error',
    category: 'jsx',
    priority: 4,
    extract: (match) => ({
      identifier: match[1],
      suggestedFix: `Add closing tag for <${match[1]}>`,
      isAutoFixable: false,
      confidence: 0.8,
    }),
  },
  {
    pattern: /Adjacent JSX elements must be wrapped/i,
    type: 'jsx-error',
    category: 'jsx',
    priority: 4,
    extract: () => ({
      suggestedFix: 'Wrap multiple JSX elements in a fragment <></>',
      isAutoFixable: false,
      confidence: 0.85,
    }),
  },

  // React Hook errors
  {
    pattern: /React Hook ["'](\w+)["'] is called conditionally/i,
    type: 'hook-error',
    category: 'react',
    priority: 4,
    extract: (match) => ({
      identifier: match[1],
      suggestedFix: `Move ${match[1]} to the top level`,
      isAutoFixable: false,
      confidence: 0.9,
    }),
  },
  {
    pattern: /Invalid hook call/i,
    type: 'hook-error',
    category: 'react',
    priority: 4,
    extract: () => ({
      suggestedFix: 'Ensure hooks are only called inside function components',
      isAutoFixable: false,
      confidence: 0.8,
    }),
  },

  // Runtime errors
  {
    pattern: /Cannot read propert(?:y|ies) (?:of\s+)?['"]?(\w+)['"]? (?:of\s+)?(undefined|null)/i,
    type: 'runtime-error',
    category: 'runtime',
    priority: 3,
    extract: (match) => ({
      missingProperty: match[1],
      suggestedFix: `Add null check before accessing "${match[1]}"`,
      isAutoFixable: false,
      confidence: 0.7,
    }),
  },
  {
    pattern: /(\w+) is not a function/i,
    type: 'runtime-error',
    category: 'runtime',
    priority: 3,
    extract: (match) => ({
      identifier: match[1],
      isAutoFixable: false,
      confidence: 0.65,
    }),
  },

  // Export errors
  {
    pattern: /does not provide an export named ['"](\w+)['"]/i,
    type: 'module-not-found',
    category: 'import',
    priority: 4,
    extract: (match) => ({
      identifier: match[1],
      isAutoFixable: false,
      confidence: 0.8,
    }),
  },

  // Network errors
  {
    pattern: /Failed to fetch/i,
    type: 'network-error',
    category: 'network',
    priority: 1,
    extract: () => ({
      suggestedFix: 'Check network connection and API endpoint',
      isAutoFixable: false,
      isIgnorable: true,
      confidence: 0.5,
    }),
  },
  {
    pattern: /NetworkError|CORS|Cross-Origin/i,
    type: 'network-error',
    category: 'network',
    priority: 1,
    extract: () => ({
      isAutoFixable: false,
      isIgnorable: true,
      confidence: 0.5,
    }),
  },
];

// Ignorable error patterns (transient/non-actionable)
const IGNORABLE_PATTERNS: RegExp[] = [
  /Loading chunk \d+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /ResizeObserver loop/i,
  /Script error\./i,
  /Network Error/i,
  /timeout/i,
  /AbortError/i,
  /cancelled/i,
  /ERR_CONNECTION/i,
];

// ============================================================================
// Error Analyzer Class
// ============================================================================

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
      isIgnorable: this.isIgnorable(errorMessage),
      confidence: 0,
      priority: 1,
    };

    // Check ignorable first
    if (result.isIgnorable) {
      return result;
    }

    // Try each pattern
    for (const pattern of ERROR_PATTERNS) {
      const match = errorMessage.match(pattern.pattern);
      if (match) {
        const extracted = pattern.extract(match, errorMessage);
        Object.assign(result, {
          type: pattern.type,
          category: pattern.category,
          priority: pattern.priority,
          ...extracted,
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
   * Quick classification for fix strategy selection
   */
  classify(errorMessage: string): ErrorCategory {
    const errorLower = errorMessage.toLowerCase();

    // Check ignorable first
    if (this.isIgnorable(errorMessage)) {
      return 'transient';
    }

    // Syntax errors - highest priority
    if (
      errorLower.includes('syntaxerror') ||
      errorLower.includes('unexpected token') ||
      errorLower.includes('unterminated') ||
      errorLower.includes('expected')
    ) {
      return 'syntax';
    }

    // Import errors
    if (
      errorLower.includes('is not defined') ||
      errorLower.includes('cannot find') ||
      errorLower.includes('bare specifier') ||
      errorLower.includes('module not found') ||
      errorLower.includes('failed to resolve')
    ) {
      return 'import';
    }

    // React errors
    if (
      errorLower.includes('hook') ||
      errorLower.includes('react') ||
      errorLower.includes('render') ||
      errorLower.includes('component')
    ) {
      return 'react';
    }

    // Type errors
    if (
      errorLower.includes('type') ||
      errorLower.includes('is not assignable') ||
      errorLower.includes('property') && errorLower.includes('does not exist')
    ) {
      return 'type';
    }

    // JSX errors
    if (
      errorLower.includes('jsx') ||
      errorLower.includes('closing tag') ||
      errorLower.includes('adjacent') && errorLower.includes('elements')
    ) {
      return 'jsx';
    }

    // Async errors
    if (
      errorLower.includes('async') ||
      errorLower.includes('await') ||
      errorLower.includes('promise')
    ) {
      return 'async';
    }

    // Runtime errors
    if (
      errorLower.includes('cannot read') ||
      errorLower.includes('undefined') ||
      errorLower.includes('null') ||
      errorLower.includes('is not a function')
    ) {
      return 'runtime';
    }

    return 'unknown';
  }

  /**
   * Check if error is ignorable (transient/non-actionable)
   */
  isIgnorable(errorMessage: string): boolean {
    return IGNORABLE_PATTERNS.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Get priority score for an error (1-5, higher = more important)
   */
  getPriority(parsedError: ParsedError): number {
    // Already set during analysis
    return parsedError.priority;
  }

  /**
   * Get a human-readable summary
   */
  getSummary(error: ParsedError): string {
    const parts: string[] = [];

    switch (error.type) {
      case 'bare-specifier':
        parts.push(`Import "${error.importPath}" needs relative path`);
        break;
      case 'module-not-found':
        parts.push(`Cannot find "${error.importPath || error.identifier}"`);
        break;
      case 'undefined-variable':
        parts.push(`"${error.identifier}" is not defined`);
        break;
      case 'type-error':
        if (error.expectedType && error.actualType) {
          parts.push(`Type mismatch: expected ${error.expectedType}`);
        } else {
          parts.push('Type error');
        }
        break;
      case 'syntax-error':
        parts.push('Syntax error');
        break;
      case 'jsx-error':
        parts.push('JSX error');
        break;
      case 'hook-error':
        parts.push(`Hook "${error.identifier}" used incorrectly`);
        break;
      case 'property-error':
        parts.push(`Property "${error.missingProperty}" missing`);
        break;
      case 'runtime-error':
        parts.push('Runtime error');
        break;
      case 'network-error':
        parts.push('Network error');
        break;
      default:
        parts.push(error.message.slice(0, 80));
    }

    if (error.file) {
      parts.push(`in ${error.file}`);
      if (error.line) {
        parts.push(`at line ${error.line}`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Extract file location from error
   */
  private extractLocation(
    errorMessage: string,
    errorStack?: string
  ): { file?: string; line?: number; column?: number } | null {
    const combined = errorMessage + (errorStack ? '\n' + errorStack : '');

    // Pattern: file.tsx:line:column
    const fileMatch = combined.match(
      /(?:at\s+)?(?:\()?([^()\s]+\.(?:tsx?|jsx?)):(\d+):(\d+)(?:\))?/
    );
    if (fileMatch) {
      return {
        file: this.normalizeFilePath(fileMatch[1]),
        line: parseInt(fileMatch[2], 10),
        column: parseInt(fileMatch[3], 10),
      };
    }

    // Pattern: in file.tsx (line X)
    const inFileMatch = combined.match(
      /in\s+([^()\s]+\.(?:tsx?|jsx?))\s*\(line\s+(\d+)/i
    );
    if (inFileMatch) {
      return {
        file: this.normalizeFilePath(inFileMatch[1]),
        line: parseInt(inFileMatch[2], 10),
      };
    }

    return null;
  }

  /**
   * Normalize file path
   */
  private normalizeFilePath(path: string): string {
    let normalized = path.replace(/^https?:\/\/[^/]+\//, '');
    normalized = normalized.split('?')[0];
    normalized = normalized.replace(/^\/+/, '');

    if (!normalized.startsWith('src/') && !normalized.startsWith('./')) {
      if (
        normalized.includes('components/') ||
        normalized.includes('utils/') ||
        normalized.includes('hooks/')
      ) {
        normalized = 'src/' + normalized;
      }
    }

    return normalized;
  }

  /**
   * Find related files
   */
  private findRelatedFiles(error: ParsedError, files: FileSystem): string[] {
    const related: string[] = [];

    if (error.importPath) {
      for (const [filePath, content] of Object.entries(files)) {
        if (content?.includes(error.importPath)) {
          related.push(filePath);
        }
      }
    }

    if (error.identifier) {
      const identifier = error.identifier;
      for (const [filePath, content] of Object.entries(files)) {
        if (!content) continue;

        if (
          new RegExp(`export\\s+(?:default\\s+)?(?:const|function|class)?\\s*${identifier}\\b`).test(content) ||
          new RegExp(`(?:function|const)\\s+${identifier}\\s*[=(]`).test(content)
        ) {
          related.push(filePath);
        }
      }
    }

    return [...new Set(related)].filter(f => f !== error.file).slice(0, 5);
  }
}

// Export singleton instance
export const errorAnalyzer = new ErrorAnalyzer();

// Re-export for backward compatibility
export { ErrorAnalyzer };
