/**
 * Fix Analytics
 *
 * Tracks fix success rates and provides insights.
 */

import { FixAnalytics, ErrorCategory, LocalFixType, FixStrategy } from './types';
import { getErrorSignature } from './state';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MAX_RECENT_FIXES: 100,
  STORAGE_KEY: 'fluidflow-fix-analytics',
};

// ============================================================================
// Analytics Data
// ============================================================================

interface FixRecord {
  timestamp: number;
  errorSignature: string;
  category: ErrorCategory;
  fixType: LocalFixType | FixStrategy;
  success: boolean;
  timeMs: number;
}

// ============================================================================
// Analytics Class
// ============================================================================

class FixAnalyticsTracker {
  private records: FixRecord[] = [];
  private categoryStats: Map<string, { attempts: number; successes: number }> = new Map();
  private typeStats: Map<string, { attempts: number; successes: number }> = new Map();
  private totalTimeMs = 0;

  constructor() {
    this.load();
  }

  /**
   * Record a fix attempt
   */
  record(
    errorMessage: string,
    category: ErrorCategory,
    fixType: LocalFixType | FixStrategy,
    success: boolean,
    timeMs: number
  ): void {
    const record: FixRecord = {
      timestamp: Date.now(),
      errorSignature: getErrorSignature(errorMessage),
      category,
      fixType,
      success,
      timeMs,
    };

    this.records.push(record);
    this.totalTimeMs += timeMs;

    // Update category stats
    const catStats = this.categoryStats.get(category) || { attempts: 0, successes: 0 };
    catStats.attempts++;
    if (success) catStats.successes++;
    this.categoryStats.set(category, catStats);

    // Update type stats
    const typeStats = this.typeStats.get(fixType) || { attempts: 0, successes: 0 };
    typeStats.attempts++;
    if (success) typeStats.successes++;
    this.typeStats.set(fixType, typeStats);

    // Trim records
    if (this.records.length > CONFIG.MAX_RECENT_FIXES) {
      this.records = this.records.slice(-CONFIG.MAX_RECENT_FIXES);
    }

    this.save();
  }

  /**
   * Get analytics summary
   */
  getAnalytics(): FixAnalytics {
    const totalAttempts = this.records.length;
    const successfulFixes = this.records.filter(r => r.success).length;

    return {
      totalAttempts,
      successfulFixes,
      failedFixes: totalAttempts - successfulFixes,
      fixesByCategory: Object.fromEntries(this.categoryStats),
      fixesByType: Object.fromEntries(this.typeStats),
      averageFixTime: totalAttempts > 0 ? this.totalTimeMs / totalAttempts : 0,
      recentFixes: this.records.slice(-20).map(r => ({
        timestamp: r.timestamp,
        errorSignature: r.errorSignature,
        category: r.category as string,
        fixType: r.fixType as string,
        success: r.success,
        timeMs: r.timeMs,
      })),
    };
  }

  /**
   * Get success rate for a category
   */
  getSuccessRate(category: ErrorCategory): number {
    const stats = this.categoryStats.get(category);
    if (!stats || stats.attempts === 0) return 0;
    return stats.successes / stats.attempts;
  }

  /**
   * Get best strategy for a category
   */
  getBestStrategy(_category: ErrorCategory): FixStrategy | null {
    const strategies: FixStrategy[] = [
      'local-simple',
      'local-multifile',
      'ai-quick',
      'ai-full',
    ];

    let bestStrategy: FixStrategy | null = null;
    let bestRate = 0;

    for (const strategy of strategies) {
      const stats = this.typeStats.get(strategy);
      if (stats && stats.attempts >= 3) {
        const rate = stats.successes / stats.attempts;
        if (rate > bestRate) {
          bestRate = rate;
          bestStrategy = strategy;
        }
      }
    }

    return bestStrategy;
  }

  /**
   * Reset analytics
   */
  reset(): void {
    this.records = [];
    this.categoryStats.clear();
    this.typeStats.clear();
    this.totalTimeMs = 0;
    this.save();
  }

  /**
   * Save to localStorage
   */
  private save(): void {
    try {
      const data = {
        records: this.records,
        categoryStats: Object.fromEntries(this.categoryStats),
        typeStats: Object.fromEntries(this.typeStats),
        totalTimeMs: this.totalTimeMs,
      };
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Load from localStorage
   */
  private load(): void {
    try {
      const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.records = data.records || [];
        this.categoryStats = new Map(Object.entries(data.categoryStats || {}));
        this.typeStats = new Map(Object.entries(data.typeStats || {}));
        this.totalTimeMs = data.totalTimeMs || 0;
      }
    } catch {
      // Ignore load errors
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const fixAnalytics = new FixAnalyticsTracker();

// Re-export class for testing
export { FixAnalyticsTracker };
