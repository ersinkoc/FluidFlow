/**
 * Robust Auto-Fix Service
 * Bulletproof error fixing with safeguards against crashes and infinite loops
 */

import { trySimpleFix, canTrySimpleFix, getFixTypeLabel } from '../utils/simpleFixes';

// ============================================================================
// Types
// ============================================================================

export interface AutoFixResult {
  success: boolean;
  newCode: string;
  description: string;
  fixType: string;
  error?: string;
  wasAINeeded: boolean;
}

export interface FixAttempt {
  errorMessage: string;
  timestamp: number;
  fixApplied: string | null;
  success: boolean;
}

interface FixHistoryEntry {
  errorHash: string;
  attempts: number;
  lastAttempt: number;
  fixed: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Maximum attempts for same error before giving up
  MAX_ATTEMPTS_PER_ERROR: 3,
  // Time window for counting attempts (ms)
  ATTEMPT_WINDOW: 30000, // 30 seconds
  // Minimum time between fixes (ms)
  MIN_FIX_INTERVAL: 500,
  // Maximum code size to process (chars)
  MAX_CODE_SIZE: 500000, // 500KB
  // Timeout for fix operations (ms)
  FIX_TIMEOUT: 5000,
  // History retention time (ms)
  HISTORY_RETENTION: 60000, // 1 minute
};

// ============================================================================
// State Management
// ============================================================================

class AutoFixState {
  private fixHistory: Map<string, FixHistoryEntry> = new Map();
  private recentFixes: FixAttempt[] = [];
  private lastFixTime = 0;
  private isFixing = false;
  private fixQueue: Array<{ error: string; code: string; resolve: (result: AutoFixResult) => void }> = [];

  /**
   * Generate a hash for an error message (for deduplication)
   */
  private hashError(error: string): string {
    // Normalize error message (remove line numbers, file paths, etc.)
    const normalized = error
      .toLowerCase()
      .replace(/line\s*\d+/gi, 'line X')
      .replace(/:\d+:\d+/g, ':X:X')
      .replace(/at\s+\S+\s+\([^)]+\)/g, 'at X')
      .replace(/\d+/g, 'N')
      .trim();

    // Simple hash
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Check if we should attempt to fix this error
   */
  canAttemptFix(error: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const errorHash = this.hashError(error);

    // Check rate limiting
    if (now - this.lastFixTime < CONFIG.MIN_FIX_INTERVAL) {
      return { allowed: false, reason: 'Rate limited - too many fixes' };
    }

    // Clean up old history
    this.cleanupHistory();

    // Check attempt history for this error
    const history = this.fixHistory.get(errorHash);
    if (history) {
      if (history.fixed) {
        return { allowed: false, reason: 'Error already fixed' };
      }
      if (history.attempts >= CONFIG.MAX_ATTEMPTS_PER_ERROR) {
        return { allowed: false, reason: `Max attempts (${CONFIG.MAX_ATTEMPTS_PER_ERROR}) reached for this error` };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a fix attempt
   */
  recordAttempt(error: string, success: boolean, fixApplied: string | null): void {
    const now = Date.now();
    const errorHash = this.hashError(error);

    // Update history
    const existing = this.fixHistory.get(errorHash);
    if (existing) {
      existing.attempts++;
      existing.lastAttempt = now;
      existing.fixed = success;
    } else {
      this.fixHistory.set(errorHash, {
        errorHash,
        attempts: 1,
        lastAttempt: now,
        fixed: success
      });
    }

    // Record attempt
    this.recentFixes.push({
      errorMessage: error.slice(0, 200), // Truncate long errors
      timestamp: now,
      fixApplied,
      success
    });

    this.lastFixTime = now;
  }

  /**
   * Clean up old history entries
   */
  private cleanupHistory(): void {
    const now = Date.now();
    const cutoff = now - CONFIG.HISTORY_RETENTION;

    // Clean fix history
    for (const [hash, entry] of this.fixHistory.entries()) {
      if (entry.lastAttempt < cutoff && !entry.fixed) {
        this.fixHistory.delete(hash);
      }
    }

    // Clean recent fixes
    this.recentFixes = this.recentFixes.filter(f => f.timestamp > cutoff);
  }

  /**
   * Check if currently fixing
   */
  get isCurrentlyFixing(): boolean {
    return this.isFixing;
  }

  /**
   * Set fixing state
   */
  setFixing(value: boolean): void {
    this.isFixing = value;
  }

  /**
   * Get recent fix attempts for debugging
   */
  getRecentAttempts(): FixAttempt[] {
    return [...this.recentFixes];
  }

  /**
   * Reset all state (for testing or manual reset)
   */
  reset(): void {
    this.fixHistory.clear();
    this.recentFixes = [];
    this.lastFixTime = 0;
    this.isFixing = false;
    this.fixQueue = [];
  }
}

// Singleton instance
const state = new AutoFixState();

// ============================================================================
// Code Validation
// ============================================================================

/**
 * Basic syntax validation for JavaScript/TypeScript/JSX
 */
function validateCodeSyntax(code: string): { valid: boolean; error?: string } {
  try {
    // Check for balanced brackets
    const brackets: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const stack: string[] = [];
    let inString = false;
    let stringChar = '';
    let inTemplate = false;
    let templateDepth = 0;
    let inComment = false;
    let inBlockComment = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const nextChar = code[i + 1] || '';
      const prevChar = i > 0 ? code[i - 1] : '';

      // Skip comments
      if (!inString && !inTemplate) {
        if (char === '/' && nextChar === '/') {
          inComment = true;
          continue;
        }
        if (inComment && char === '\n') {
          inComment = false;
          continue;
        }
        if (char === '/' && nextChar === '*') {
          inBlockComment = true;
          i++;
          continue;
        }
        if (inBlockComment && char === '*' && nextChar === '/') {
          inBlockComment = false;
          i++;
          continue;
        }
      }
      if (inComment || inBlockComment) continue;

      // Track strings
      if ((char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString && !inTemplate) {
          inString = true;
          stringChar = char;
        } else if (inString && char === stringChar) {
          inString = false;
        }
        continue;
      }

      // Track template literals
      if (char === '`' && prevChar !== '\\') {
        if (!inString) {
          inTemplate = !inTemplate;
          if (inTemplate) templateDepth = 0;
        }
        continue;
      }

      // Track template expressions
      if (inTemplate && char === '$' && nextChar === '{') {
        templateDepth++;
        continue;
      }

      // Skip content inside strings and templates (except for nested braces)
      if (inString) continue;
      if (inTemplate && templateDepth === 0) continue;

      // Track brackets
      if (brackets[char]) {
        stack.push(brackets[char]);
      } else if (char === ')' || char === ']' || char === '}') {
        if (inTemplate && char === '}' && templateDepth > 0) {
          templateDepth--;
          continue;
        }
        if (stack.length === 0) {
          return { valid: false, error: `Unexpected '${char}' at position ${i}` };
        }
        const expected = stack.pop();
        if (expected !== char) {
          return { valid: false, error: `Expected '${expected}' but found '${char}' at position ${i}` };
        }
      }
    }

    if (stack.length > 0) {
      return { valid: false, error: `Missing closing '${stack[stack.length - 1]}'` };
    }

    if (inString) {
      return { valid: false, error: 'Unterminated string' };
    }

    if (inTemplate) {
      return { valid: false, error: 'Unterminated template literal' };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: `Validation error: ${e}` };
  }
}

/**
 * Check if code has obvious JSX issues
 */
function validateJSXBasics(code: string): { valid: boolean; error?: string } {
  try {
    // Check for common JSX issues
    // Note: This is a basic check, not a full parser

    // Check for unclosed JSX tags (simple heuristic)
    const jsxTagPattern = /<([A-Z][a-zA-Z0-9]*)[^>]*(?<!\/)\s*>/g;
    const selfClosingPattern = /<([A-Z][a-zA-Z0-9]*)[^>]*\/\s*>/g;
    const closingTagPattern = /<\/([A-Z][a-zA-Z0-9]*)>/g;

    const openTags: Record<string, number> = {};
    const closeTags: Record<string, number> = {};
    const selfCloseTags: Record<string, number> = {};

    let match;
    while ((match = jsxTagPattern.exec(code)) !== null) {
      const tag = match[1];
      openTags[tag] = (openTags[tag] || 0) + 1;
    }

    while ((match = selfClosingPattern.exec(code)) !== null) {
      const tag = match[1];
      selfCloseTags[tag] = (selfCloseTags[tag] || 0) + 1;
    }

    while ((match = closingTagPattern.exec(code)) !== null) {
      const tag = match[1];
      closeTags[tag] = (closeTags[tag] || 0) + 1;
    }

    // Adjust open tags by subtracting self-closing
    for (const tag of Object.keys(selfCloseTags)) {
      if (openTags[tag]) {
        openTags[tag] -= selfCloseTags[tag];
      }
    }

    // Check for mismatched tags
    for (const tag of Object.keys(openTags)) {
      const opens = openTags[tag] || 0;
      const closes = closeTags[tag] || 0;
      if (opens > closes) {
        return { valid: false, error: `Unclosed <${tag}> tag(s)` };
      }
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: `JSX validation error: ${e}` };
  }
}

/**
 * Comprehensive code validation
 */
function validateCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Size check
  if (code.length > CONFIG.MAX_CODE_SIZE) {
    errors.push('Code exceeds maximum size limit');
  }

  // Empty check
  if (!code.trim()) {
    errors.push('Code is empty');
  }

  // Syntax validation
  const syntaxResult = validateCodeSyntax(code);
  if (!syntaxResult.valid && syntaxResult.error) {
    errors.push(syntaxResult.error);
  }

  // JSX validation
  const jsxResult = validateJSXBasics(code);
  if (!jsxResult.valid && jsxResult.error) {
    errors.push(jsxResult.error);
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Safe Fix Execution
// ============================================================================

/**
 * Execute a fix with timeout protection
 */
function executeWithTimeout<T>(
  fn: () => T,
  timeout: number,
  fallback: T
): T {
  try {
    // In browser environment, we can't truly timeout sync code
    // But we can at least catch errors
    return fn();
  } catch (e) {
    console.error('[AutoFix] Execution error:', e);
    return fallback;
  }
}

/**
 * Safely attempt a simple fix with all safeguards
 */
function safeSimpleFix(errorMessage: string, code: string): AutoFixResult {
  const defaultResult: AutoFixResult = {
    success: false,
    newCode: code,
    description: '',
    fixType: 'none',
    wasAINeeded: true
  };

  try {
    // Size check
    if (code.length > CONFIG.MAX_CODE_SIZE) {
      return {
        ...defaultResult,
        error: 'Code too large for auto-fix'
      };
    }

    // Check if error is fixable
    if (!canTrySimpleFix(errorMessage)) {
      return {
        ...defaultResult,
        error: 'Error type not supported for simple fix'
      };
    }

    // Attempt the fix
    const result = executeWithTimeout(
      () => trySimpleFix(errorMessage, code),
      CONFIG.FIX_TIMEOUT,
      { fixed: false, newCode: code, description: '', fixType: 'none' as const }
    );

    if (!result.fixed) {
      return {
        ...defaultResult,
        error: 'Simple fix could not resolve the error'
      };
    }

    // Validate the fixed code
    const validation = validateCode(result.newCode);
    if (!validation.valid) {
      console.warn('[AutoFix] Fixed code failed validation:', validation.errors);
      return {
        ...defaultResult,
        error: `Fix would create invalid code: ${validation.errors.join(', ')}`
      };
    }

    // Check that the fix actually changed something
    if (result.newCode === code) {
      return {
        ...defaultResult,
        error: 'Fix produced no changes'
      };
    }

    // Success!
    return {
      success: true,
      newCode: result.newCode,
      description: result.description,
      fixType: getFixTypeLabel(result.fixType),
      wasAINeeded: false
    };

  } catch (e) {
    console.error('[AutoFix] Safe fix error:', e);
    return {
      ...defaultResult,
      error: `Fix failed: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Attempt to automatically fix an error
 * Returns immediately if fix is not possible/allowed
 */
export function attemptAutoFix(errorMessage: string, code: string): AutoFixResult {
  // Check if we should attempt
  const canAttempt = state.canAttemptFix(errorMessage);
  if (!canAttempt.allowed) {
    return {
      success: false,
      newCode: code,
      description: '',
      fixType: 'none',
      error: canAttempt.reason,
      wasAINeeded: true
    };
  }

  // Check if already fixing
  if (state.isCurrentlyFixing) {
    return {
      success: false,
      newCode: code,
      description: '',
      fixType: 'none',
      error: 'Another fix is in progress',
      wasAINeeded: true
    };
  }

  try {
    state.setFixing(true);

    // Attempt simple fix
    const result = safeSimpleFix(errorMessage, code);

    // Record attempt
    state.recordAttempt(
      errorMessage,
      result.success,
      result.success ? result.description : null
    );

    return result;

  } finally {
    state.setFixing(false);
  }
}

/**
 * Check if an error can potentially be auto-fixed
 */
export function canAutoFix(errorMessage: string): boolean {
  const canAttempt = state.canAttemptFix(errorMessage);
  if (!canAttempt.allowed) return false;
  return canTrySimpleFix(errorMessage);
}

/**
 * Get debug info about recent fix attempts
 */
export function getFixDebugInfo(): {
  recentAttempts: FixAttempt[];
  isFixing: boolean;
} {
  return {
    recentAttempts: state.getRecentAttempts(),
    isFixing: state.isCurrentlyFixing
  };
}

/**
 * Reset the auto-fix state (useful for testing)
 */
export function resetAutoFixState(): void {
  state.reset();
}

/**
 * Check if a specific error has already been fixed recently
 */
export function wasRecentlyFixed(errorMessage: string): boolean {
  const attempts = state.getRecentAttempts();
  const recent = attempts.filter(a =>
    a.success &&
    a.errorMessage.includes(errorMessage.slice(0, 100))
  );
  return recent.length > 0;
}

// ============================================================================
// Error Classification
// ============================================================================

export type ErrorCategory =
  | 'syntax'      // Syntax errors (missing brackets, etc.)
  | 'import'      // Missing imports
  | 'runtime'     // Runtime errors (null access, etc.)
  | 'react'       // React-specific errors
  | 'type'        // Type errors
  | 'transient'   // Transient errors (safe to ignore)
  | 'unknown';    // Unknown/unfixable errors

/**
 * Classify an error for better handling
 */
export function classifyError(errorMessage: string): {
  category: ErrorCategory;
  isFixable: boolean;
  isIgnorable: boolean;
  priority: number; // 1-5, higher = more important
} {
  const msg = errorMessage.toLowerCase();

  // Transient/ignorable errors
  const transientPatterns = [
    /resizeobserver/i,
    /script error/i,
    /loading chunk/i,
    /network error/i,
    /failed to fetch/i,
    /\[transient\]/i,
    /non-configurable property/i,
    /cannot redefine property/i,
    /hydration/i,
    /minified react error/i,
  ];

  if (transientPatterns.some(p => p.test(msg))) {
    return {
      category: 'transient',
      isFixable: false,
      isIgnorable: true,
      priority: 1
    };
  }

  // Import errors
  if (/is not defined/i.test(msg) || /cannot find module/i.test(msg)) {
    return {
      category: 'import',
      isFixable: true,
      isIgnorable: false,
      priority: 4
    };
  }

  // Syntax errors
  if (/unexpected token/i.test(msg) ||
      /missing/i.test(msg) && /[;:{}()[\]]/i.test(msg) ||
      /expected/i.test(msg)) {
    return {
      category: 'syntax',
      isFixable: true,
      isIgnorable: false,
      priority: 5
    };
  }

  // Runtime errors
  if (/cannot read propert/i.test(msg) ||
      /is not a function/i.test(msg) ||
      /cannot destructure/i.test(msg) ||
      /undefined is not/i.test(msg) ||
      /null is not/i.test(msg)) {
    return {
      category: 'runtime',
      isFixable: true,
      isIgnorable: false,
      priority: 4
    };
  }

  // React-specific
  if (/unique.*key.*prop/i.test(msg) ||
      /each child in a list/i.test(msg) ||
      /invalid hook/i.test(msg) ||
      /hooks can only be called/i.test(msg) ||
      /objects are not valid as a react child/i.test(msg)) {
    return {
      category: 'react',
      isFixable: /key.*prop/i.test(msg), // Only key errors are auto-fixable
      isIgnorable: false,
      priority: 3
    };
  }

  // Type errors (usually need manual fix)
  if (/type.*is not assignable/i.test(msg) ||
      /argument of type/i.test(msg) ||
      /property.*does not exist on type/i.test(msg)) {
    return {
      category: 'type',
      isFixable: false,
      isIgnorable: false,
      priority: 2
    };
  }

  // Unknown
  return {
    category: 'unknown',
    isFixable: canTrySimpleFix(errorMessage),
    isIgnorable: false,
    priority: 2
  };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  attemptAutoFix,
  canAutoFix,
  classifyError,
  getFixDebugInfo,
  resetAutoFixState,
  wasRecentlyFixed,
  validateCode
};
