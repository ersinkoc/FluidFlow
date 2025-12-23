/**
 * Error Fix Module
 *
 * Unified exports for the error fixing system.
 *
 * Architecture:
 * 1. analyzer.ts    - Error parsing and classification
 * 2. localFixes.ts  - Pattern-based fixes (no AI)
 * 3. fixEngine.ts   - Multi-strategy fix pipeline
 * 4. fixAgent.ts    - Stateful UI agent
 * 5. validation.ts  - Code validation
 * 6. state.ts       - Fix history and deduplication
 * 7. analytics.ts   - Success rate tracking
 */

// ============================================================================
// Types
// ============================================================================
export type {
  ErrorType,
  ErrorCategory,
  ParsedError,
  FixStrategy,
  LocalFixType,
  LocalFixResult,
  FixResult,
  FixEngineOptions,
  AgentState,
  AgentLogEntry,
  AgentConfig,
  VerificationResult,
  VerificationIssue,
  VerificationOptions,
  FixAttempt,
  FixAnalytics,
  ImportInfo,
  CodeIssue,
} from './types';

// ============================================================================
// Error Analyzer
// ============================================================================
export { errorAnalyzer, ErrorAnalyzer } from './analyzer';

// ============================================================================
// Local Fixes
// ============================================================================
export {
  tryLocalFix,
  tryFixBareSpecifierMultiFile,
  COMMON_IMPORTS,
} from './localFixes';

// Legacy export for localFixEngine compatibility
export { tryLocalFix as localFixEngine } from './localFixes';

// ============================================================================
// Fix Engine
// ============================================================================
export {
  FixEngine,
  ErrorFixEngine,
  quickFix,
  fixWithProgress,
} from './fixEngine';

// ============================================================================
// Fix Agent
// ============================================================================
export {
  fixAgent,
  FixAgent,
  ErrorFixAgent,
} from './fixAgent';

// Legacy export name
export { fixAgent as errorFixAgent } from './fixAgent';

// ============================================================================
// Validation
// ============================================================================
export {
  isCodeValid,
  validateSyntax,
  validateJSX,
  verifyFix,
  doesFixResolveError,
} from './validation';

// ============================================================================
// State Management
// ============================================================================
export {
  fixState,
  FixState,
  getErrorSignature,
} from './state';

// ============================================================================
// Analytics
// ============================================================================
export {
  fixAnalytics,
  FixAnalyticsTracker,
} from './analytics';

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================

// Re-export analyzer functions with old names
export { errorAnalyzer as classifyError } from './analyzer';

// Import singletons for backward compatibility functions
import { errorAnalyzer as _errorAnalyzer } from './analyzer';
import { fixState as _fixState } from './state';
import { fixAnalytics as _fixAnalytics } from './analytics';
import type { ErrorCategory, LocalFixType, FixStrategy } from './types';

// Export helper functions with old signatures
export function canAutoFix(errorMessage: string): boolean {
  const parsed = _errorAnalyzer.analyze(errorMessage);
  return parsed.isAutoFixable;
}

export function wasRecentlyFixed(errorMessage: string): boolean {
  return _fixState.wasRecentlyFixed(errorMessage);
}

export function recordFixAttempt(
  errorMessage: string,
  category: string,
  fixType: string,
  success: boolean,
  timeMs: number
): void {
  _fixState.recordAttempt(errorMessage, success ? fixType : null, success);
  _fixAnalytics.record(
    errorMessage,
    category as ErrorCategory,
    fixType as LocalFixType | FixStrategy,
    success,
    timeMs
  );
}

export function getFixAnalytics() {
  return _fixAnalytics.getAnalytics();
}

// Legacy type exports
export type ErrorClassification = {
  category: string;
  isFixable: boolean;
  priority: number;
  suggestedFix?: string;
};

export type AutoFixResult = {
  fixed: boolean;
  newCode?: string;
  description?: string;
  multiFileChanges?: Record<string, string>;
};
