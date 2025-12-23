/**
 * Error Fix Types
 *
 * Unified type definitions for the error fixing system.
 * All modules should import types from this file.
 */

import { FileSystem, LogEntry } from '../../types';

// ============================================================================
// Error Analysis Types
// ============================================================================

/**
 * Specific error types recognized by the analyzer
 */
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

/**
 * Broad error categories for fix strategy selection
 */
export type ErrorCategory =
  | 'syntax'
  | 'import'
  | 'runtime'
  | 'react'
  | 'type'
  | 'jsx'
  | 'async'
  | 'transient'
  | 'network'
  | 'unknown';

/**
 * Parsed error with all extracted details
 */
export interface ParsedError {
  message: string;
  stack?: string;
  type: ErrorType;
  category: ErrorCategory;
  file?: string;
  line?: number;
  column?: number;
  identifier?: string;
  importPath?: string;
  expectedType?: string;
  actualType?: string;
  missingProperty?: string;
  relatedFiles: string[];
  suggestedFix?: string;
  isAutoFixable: boolean;
  isIgnorable: boolean;
  confidence: number;
  priority: number; // 1-5, higher = more important
}

// ============================================================================
// Fix Result Types
// ============================================================================

/**
 * Fix strategies in order of complexity
 */
export type FixStrategy =
  | 'local-simple'
  | 'local-multifile'
  | 'local-proactive'
  | 'ai-quick'
  | 'ai-full'
  | 'ai-iterative'
  | 'ai-regenerate';

/**
 * Local fix types (pattern-based, no AI)
 */
export type LocalFixType =
  | 'bare-specifier'
  | 'missing-import'
  | 'syntax'
  | 'undefined-var'
  | 'jsx'
  | 'runtime'
  | 'react'
  | 'typo'
  | 'none';

/**
 * Result from local fix engine
 */
export interface LocalFixResult {
  success: boolean;
  fixedFiles: Record<string, string>;
  description: string;
  fixType: LocalFixType;
}

/**
 * Result from any fix attempt
 */
export interface FixResult {
  success: boolean;
  fixedFiles: Record<string, string>;
  description: string;
  strategy: FixStrategy;
  attempts: number;
  timeMs: number;
  error?: string;
}

// ============================================================================
// Fix Engine Types
// ============================================================================

/**
 * Options for the fix engine
 */
export interface FixEngineOptions {
  files: FileSystem;
  errorMessage: string;
  errorStack?: string;
  targetFile?: string;
  appCode?: string;
  logs?: LogEntry[];
  systemInstruction?: string;
  onProgress?: (stage: string, progress: number) => void;
  onStrategyChange?: (strategy: FixStrategy) => void;
  maxAttempts?: number;
  timeout?: number;
  skipStrategies?: FixStrategy[];
}

// ============================================================================
// Fix Agent Types
// ============================================================================

/**
 * Agent states for UI display
 */
export type AgentState =
  | 'idle'
  | 'analyzing'
  | 'local-fix'
  | 'ai-fix'
  | 'fixing'
  | 'applying'
  | 'verifying'
  | 'success'
  | 'failed'
  | 'max_attempts_reached';

/**
 * Log entry for agent UI
 */
export interface AgentLogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'prompt' | 'response' | 'fix' | 'error' | 'success' | 'warning';
  title: string;
  content: string;
  metadata?: {
    attempt?: number;
    file?: string;
    model?: string;
    duration?: number;
  };
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  maxAttempts: number;
  timeoutMs: number;
  onStateChange: (state: AgentState) => void;
  onLog: (entry: AgentLogEntry) => void;
  onFileUpdate: (path: string, content: string) => void;
  onComplete: (success: boolean, message: string) => void;
}

// ============================================================================
// Verification Types
// ============================================================================

/**
 * Verification result
 */
export interface VerificationResult {
  isValid: boolean;
  confidence: 'high' | 'medium' | 'low';
  issues: VerificationIssue[];
  suggestions: string[];
}

/**
 * Individual verification issue
 */
export interface VerificationIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
}

/**
 * Verification options
 */
export interface VerificationOptions {
  originalError: string;
  originalFiles: FileSystem;
  fixedFiles: FileSystem;
  changedFiles: string[];
  strictMode?: boolean;
}

// ============================================================================
// Analytics Types
// ============================================================================

/**
 * Fix attempt record
 */
export interface FixAttempt {
  errorMessage: string;
  timestamp: number;
  fixApplied: string | null;
  success: boolean;
}

/**
 * Fix analytics summary
 */
export interface FixAnalytics {
  totalAttempts: number;
  successfulFixes: number;
  failedFixes: number;
  fixesByCategory: Record<string, { attempts: number; successes: number }>;
  fixesByType: Record<string, { attempts: number; successes: number }>;
  averageFixTime: number;
  recentFixes: Array<{
    timestamp: number;
    errorSignature: string;
    category: string;
    fixType: string;
    success: boolean;
    timeMs: number;
  }>;
}

// ============================================================================
// Import Types
// ============================================================================

/**
 * Import information for auto-import
 */
export interface ImportInfo {
  from: string;
  isDefault?: boolean;
  isType?: boolean;
}

// ============================================================================
// Code Analysis Types
// ============================================================================

/**
 * Code issue detected by proactive analysis
 */
export interface CodeIssue {
  type: 'error' | 'warning' | 'suggestion';
  category: 'import' | 'syntax' | 'react' | 'typescript' | 'accessibility' | 'performance' | 'security';
  message: string;
  line?: number;
  fix?: () => string;
  autoFixable: boolean;
}
