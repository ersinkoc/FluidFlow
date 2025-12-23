/**
 * Fix Agent
 *
 * Stateful agentic system for UI-driven error fixing.
 * Provides logging, state tracking, and UI reconnection.
 */

import { FileSystem } from '../../types';
import { AgentState, AgentLogEntry, AgentConfig } from './types';
import { FixEngine } from './fixEngine';
import { errorAnalyzer } from './analyzer';

// ============================================================================
// Fix Agent Class
// ============================================================================

class FixAgentImpl {
  private state: AgentState = 'idle';
  private config: AgentConfig | null = null;
  private abortController: AbortController | null = null;
  private currentAttempt = 0;

  // UI state for reconnection
  private logs: AgentLogEntry[] = [];
  private isRunning = false;
  private completionMessage: string | null = null;
  private maxAttempts = 5;
  private currentError: string | null = null;
  private currentTargetFile: string | null = null;

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Start the error fixing agent
   */
  async start(
    errorMessage: string,
    errorStack: string | undefined,
    targetFile: string,
    files: FileSystem,
    config: AgentConfig
  ): Promise<void> {
    // Reset state
    this.config = config;
    this.currentAttempt = 0;
    this.abortController = new AbortController();
    this.logs = [];
    this.isRunning = true;
    this.completionMessage = null;
    this.maxAttempts = config.maxAttempts;
    this.currentError = errorMessage;
    this.currentTargetFile = targetFile;

    this.log('info', 'Agent Started', `Starting fix for: ${targetFile}`);
    this.log('error', 'Error Detected', errorMessage, { file: targetFile });

    await this.runFixLoop(errorMessage, errorStack, targetFile, files);
  }

  /**
   * Stop the agent
   */
  stop(): void {
    this.abortController?.abort();
    this.log('warning', 'Agent Stopped', 'Agent was stopped by user');
    this.setState('idle');
    this.isRunning = false;
    this.completionMessage = 'Stopped by user';
    this.config?.onComplete(false, this.completionMessage);
  }

  /**
   * Report a new error (from preview)
   */
  reportError(newError: string): void {
    if (!this.isRunning) return;
    this.currentError = newError;
    this.log('error', 'New Error', newError);
  }

  /**
   * Report success (from preview)
   */
  reportSuccess(): void {
    if (!this.isRunning) return;
    this.setState('success');
    this.isRunning = false;
    this.completionMessage = 'Error fixed successfully';
    this.log('success', 'Success', 'Error has been resolved');
    this.config?.onComplete(true, this.completionMessage);
  }

  /**
   * Get current state for UI
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Get full state object for UI
   */
  getFullState(): {
    state: AgentState;
    logs: AgentLogEntry[];
    isRunning: boolean;
    completionMessage: string | null;
    currentAttempt: number;
    maxAttempts: number;
    currentError: string | null;
  } {
    return {
      state: this.state,
      logs: [...this.logs],
      isRunning: this.isRunning,
      completionMessage: this.completionMessage,
      currentAttempt: this.currentAttempt,
      maxAttempts: this.maxAttempts,
      currentError: this.currentError,
    };
  }

  // Convenience methods for backward compatibility
  getIsRunning(): boolean {
    return this.isRunning;
  }

  getLogs(): AgentLogEntry[] {
    return [...this.logs];
  }

  getCompletionMessage(): string | null {
    return this.completionMessage;
  }

  getMaxAttempts(): number {
    return this.maxAttempts;
  }

  /**
   * Reconnect UI callbacks
   */
  reconnect(config: Partial<AgentConfig>): void {
    if (this.config) {
      this.config = { ...this.config, ...config };
    }
  }

  // ============================================================================
  // Fix Loop
  // ============================================================================

  private async runFixLoop(
    errorMessage: string,
    errorStack: string | undefined,
    targetFile: string,
    files: FileSystem
  ): Promise<void> {
    if (!this.config) return;

    while (this.currentAttempt < this.maxAttempts) {
      if (this.abortController?.signal.aborted) {
        return;
      }

      this.currentAttempt++;
      this.log('info', `Attempt ${this.currentAttempt}/${this.maxAttempts}`, 'Starting fix attempt...');

      try {
        // Analyze error
        this.setState('analyzing');
        const parsed = errorAnalyzer.analyze(errorMessage, errorStack, files);
        this.log('info', 'Error Analysis',
          `Type: ${parsed.type}\nCategory: ${parsed.category}\nConfidence: ${(parsed.confidence * 100).toFixed(0)}%`
        );

        // Run fix engine
        this.setState('fixing');
        const engine = new FixEngine({
          files,
          errorMessage,
          errorStack,
          targetFile,
          onProgress: (stage, progress) => {
            this.log('info', stage, `Progress: ${progress}%`);
          },
          onStrategyChange: (strategy) => {
            if (strategy.startsWith('local')) {
              this.setState('local-fix');
            } else if (strategy.startsWith('ai')) {
              this.setState('ai-fix');
            }
          },
        });

        const result = await engine.fix();

        if (result.success && Object.keys(result.fixedFiles).length > 0) {
          // Apply fixes
          this.setState('applying');
          const appliedFiles: string[] = [];

          for (const [filePath, content] of Object.entries(result.fixedFiles)) {
            this.log('fix', 'Applying Fix', `Updating ${filePath}`, { file: filePath });
            this.config.onFileUpdate(filePath, content);
            files = { ...files, [filePath]: content };
            appliedFiles.push(filePath);
          }

          // Verify
          this.setState('verifying');
          this.log('info', 'Verifying', 'Waiting for preview to compile...');
          await this.delay(2000);

          // Success
          const fileList = appliedFiles.length === 1
            ? appliedFiles[0]
            : `${appliedFiles.length} files`;

          this.log('success', 'Fix Applied', `Fixed ${fileList} using ${result.strategy}`);
          this.setState('success');
          this.isRunning = false;
          this.completionMessage = `Fixed ${fileList} after ${this.currentAttempt} attempt(s)`;
          this.config.onComplete(true, this.completionMessage);
          return;
        }

        // Fix failed, log and continue
        this.log('warning', 'Fix Failed', result.error || 'No fix found');

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log('error', 'Error in Fix Attempt', msg);
      }
    }

    // Max attempts reached
    this.setState('max_attempts_reached');
    this.isRunning = false;
    this.completionMessage = `Failed after ${this.maxAttempts} attempts`;
    this.log('error', 'Max Attempts Reached', this.completionMessage);
    this.config.onComplete(false, this.completionMessage);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private setState(newState: AgentState): void {
    this.state = newState;
    this.config?.onStateChange(newState);
  }

  private log(
    type: AgentLogEntry['type'],
    title: string,
    content: string,
    metadata?: AgentLogEntry['metadata']
  ): void {
    const entry: AgentLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date(),
      type,
      title,
      content,
      metadata: { ...metadata, attempt: this.currentAttempt },
    };

    this.logs.push(entry);
    this.config?.onLog(entry);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const fixAgent = new FixAgentImpl();

// Re-export class and legacy name
export { FixAgentImpl as FixAgent };
export { FixAgentImpl as ErrorFixAgent };
