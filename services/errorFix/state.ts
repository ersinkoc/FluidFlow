/**
 * Fix State Management
 *
 * Tracks fix history, prevents infinite loops, and manages fix attempts.
 */

import { FixAttempt } from './types';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MAX_HISTORY_SIZE: 50,
  MAX_ATTEMPTS_PER_ERROR: 3,
  RECENT_FIX_WINDOW_MS: 5000,
  SIGNATURE_CACHE_TTL_MS: 30000,
};

// ============================================================================
// Error Signature Generation
// ============================================================================

/**
 * Generate a stable signature for an error message
 */
export function getErrorSignature(errorMessage: string): string {
  let normalized = errorMessage.toLowerCase().trim();

  // Remove line numbers
  normalized = normalized.replace(/:\d+:\d+/g, ':X:X');
  normalized = normalized.replace(/line \d+/gi, 'line X');
  normalized = normalized.replace(/at line \d+/gi, 'at line X');

  // Remove file paths (keep just filename)
  normalized = normalized.replace(/[a-zA-Z]:[\\/][^\s]+/g, 'FILE');
  normalized = normalized.replace(/[/][^\s]+\.(tsx?|jsx?)/g, '/FILE.$1');

  // Remove dynamic values
  normalized = normalized.replace(/'[^']+'/g, "'X'");
  normalized = normalized.replace(/"[^"]+"/g, '"X"');

  // Keep first 200 chars
  return normalized.slice(0, 200);
}

// ============================================================================
// Fix State Class
// ============================================================================

class FixState {
  private fixHistory: FixAttempt[] = [];
  private recentFixes: Map<string, number> = new Map();
  private attemptCounts: Map<string, number> = new Map();

  /**
   * Record a fix attempt
   */
  recordAttempt(
    errorMessage: string,
    fixApplied: string | null,
    success: boolean
  ): void {
    const signature = getErrorSignature(errorMessage);

    // Update attempt count
    const count = this.attemptCounts.get(signature) || 0;
    this.attemptCounts.set(signature, count + 1);

    // Update recent fixes
    if (success && fixApplied) {
      this.recentFixes.set(signature, Date.now());
    }

    // Add to history
    this.fixHistory.push({
      errorMessage,
      timestamp: Date.now(),
      fixApplied,
      success,
    });

    // Trim history
    if (this.fixHistory.length > CONFIG.MAX_HISTORY_SIZE) {
      this.fixHistory = this.fixHistory.slice(-CONFIG.MAX_HISTORY_SIZE);
    }

    // Clean old entries
    this.cleanOldEntries();
  }

  /**
   * Check if an error was recently fixed
   */
  wasRecentlyFixed(errorMessage: string): boolean {
    const signature = getErrorSignature(errorMessage);
    const lastFix = this.recentFixes.get(signature);

    if (!lastFix) return false;

    return Date.now() - lastFix < CONFIG.RECENT_FIX_WINDOW_MS;
  }

  /**
   * Check if we should skip fixing an error
   */
  shouldSkip(errorMessage: string): { skip: boolean; reason?: string } {
    const signature = getErrorSignature(errorMessage);

    // Check recent fix
    if (this.wasRecentlyFixed(errorMessage)) {
      return { skip: true, reason: 'Recently fixed' };
    }

    // Check attempt count
    const attempts = this.attemptCounts.get(signature) || 0;
    if (attempts >= CONFIG.MAX_ATTEMPTS_PER_ERROR) {
      return { skip: true, reason: `Max attempts (${attempts}) reached` };
    }

    return { skip: false };
  }

  /**
   * Get attempt count for an error
   */
  getAttemptCount(errorMessage: string): number {
    const signature = getErrorSignature(errorMessage);
    return this.attemptCounts.get(signature) || 0;
  }

  /**
   * Reset state for an error
   */
  resetError(errorMessage: string): void {
    const signature = getErrorSignature(errorMessage);
    this.attemptCounts.delete(signature);
    this.recentFixes.delete(signature);
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.fixHistory = [];
    this.recentFixes.clear();
    this.attemptCounts.clear();
  }

  /**
   * Get fix history
   */
  getHistory(): FixAttempt[] {
    return [...this.fixHistory];
  }

  /**
   * Clean old entries
   */
  private cleanOldEntries(): void {
    const now = Date.now();

    // Clean recent fixes
    for (const [sig, time] of this.recentFixes.entries()) {
      if (now - time > CONFIG.SIGNATURE_CACHE_TTL_MS) {
        this.recentFixes.delete(sig);
      }
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const fixState = new FixState();

// Re-export class for testing
export { FixState };
