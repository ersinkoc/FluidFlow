/**
 * Fix Engine
 *
 * Multi-strategy error fixing pipeline.
 * Uses local fixes first, then AI as fallback.
 */

import { FileSystem } from '../../types';
import { FixResult, FixStrategy, FixEngineOptions, ErrorCategory } from './types';
import { errorAnalyzer } from './analyzer';
import { tryLocalFix, tryFixBareSpecifierMultiFile } from './localFixes';
import { isCodeValid } from './validation';
import { fixState } from './state';
import { fixAnalytics } from './analytics';
import { cleanGeneratedCode, isValidCode } from '../../utils/cleanCode';
import { buildAutoFixPrompt, getRelatedFiles } from '../../utils/errorContext';
import { getProviderManager } from '../ai';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  LOCAL_FIX_TIMEOUT: 2000,
  AI_QUICK_TIMEOUT: 15000,
  AI_FULL_TIMEOUT: 30000,
  AI_ITERATIVE_TIMEOUT: 60000,
  TOTAL_TIMEOUT: 90000,
  MAX_AI_ATTEMPTS: 3,
  MAX_ITERATIVE_ROUNDS: 3,
};

const STRATEGY_ORDER: FixStrategy[] = [
  'local-simple',
  'local-multifile',
  'local-proactive',
  'ai-quick',
  'ai-full',
  'ai-iterative',
  'ai-regenerate',
];

// ============================================================================
// Fix Engine Class
// ============================================================================

export class FixEngine {
  private options: Required<FixEngineOptions>;
  private startTime = 0;
  private attempts = 0;
  private currentStrategy: FixStrategy = 'local-simple';
  private abortController: AbortController | null = null;

  constructor(options: FixEngineOptions) {
    this.options = {
      files: options.files,
      errorMessage: options.errorMessage,
      errorStack: options.errorStack || '',
      targetFile: options.targetFile || this.detectTargetFile(options.errorMessage, options.files),
      appCode: options.appCode || options.files['src/App.tsx'] || '',
      logs: options.logs || [],
      systemInstruction: options.systemInstruction || '',
      onProgress: options.onProgress || (() => {}),
      onStrategyChange: options.onStrategyChange || (() => {}),
      maxAttempts: options.maxAttempts || 10,
      timeout: options.timeout || CONFIG.TOTAL_TIMEOUT,
      skipStrategies: options.skipStrategies || [],
    };
  }

  /**
   * Run the fix pipeline
   */
  async fix(): Promise<FixResult> {
    this.startTime = Date.now();
    this.abortController = new AbortController();

    // Check if we should skip this error
    const skipCheck = fixState.shouldSkip(this.options.errorMessage);
    if (skipCheck.skip) {
      return this.noFix(`Skipped: ${skipCheck.reason}`);
    }

    // Analyze error
    const parsed = errorAnalyzer.analyze(
      this.options.errorMessage,
      this.options.errorStack,
      this.options.files
    );

    if (parsed.isIgnorable) {
      return this.noFix('Ignorable error');
    }

    const category = parsed.category;
    const strategies = this.selectStrategies(category);

    // Try each strategy
    for (const strategy of strategies) {
      if (this.isTimedOut()) break;
      if (this.options.skipStrategies.includes(strategy)) continue;

      this.currentStrategy = strategy;
      this.options.onStrategyChange(strategy);
      this.options.onProgress(this.getLabel(strategy), this.getProgress());

      try {
        const result = await this.runStrategy(strategy);

        if (result.success && Object.keys(result.fixedFiles).length > 0) {
          const timeMs = Date.now() - this.startTime;

          // Record success
          fixState.recordAttempt(this.options.errorMessage, strategy, true);
          fixAnalytics.record(this.options.errorMessage, category, strategy, true, timeMs);

          return {
            ...result,
            strategy,
            attempts: this.attempts,
            timeMs,
          };
        }
      } catch (e) {
        console.error(`[FixEngine] ${strategy} failed:`, e);
      }
    }

    // All strategies failed
    const timeMs = Date.now() - this.startTime;
    fixState.recordAttempt(this.options.errorMessage, null, false);
    fixAnalytics.record(this.options.errorMessage, category, 'local-simple', false, timeMs);

    return this.noFix('All strategies exhausted');
  }

  /**
   * Abort the fix operation
   */
  abort(): void {
    this.abortController?.abort();
  }

  // ============================================================================
  // Strategy Selection
  // ============================================================================

  private selectStrategies(category: ErrorCategory): FixStrategy[] {
    const strategies: FixStrategy[] = ['local-simple'];

    if (category === 'import') {
      strategies.push('local-multifile');
    }

    strategies.push('local-proactive');

    if (category !== 'transient' && category !== 'network') {
      strategies.push('ai-quick', 'ai-full', 'ai-iterative', 'ai-regenerate');
    }

    return strategies;
  }

  // ============================================================================
  // Strategy Runners
  // ============================================================================

  private async runStrategy(strategy: FixStrategy): Promise<FixResult> {
    this.attempts++;

    switch (strategy) {
      case 'local-simple':
        return this.runLocalSimple();
      case 'local-multifile':
        return this.runLocalMultifile();
      case 'local-proactive':
        return this.runLocalProactive();
      case 'ai-quick':
        return this.runAIQuick();
      case 'ai-full':
        return this.runAIFull();
      case 'ai-iterative':
        return this.runAIIterative();
      case 'ai-regenerate':
        return this.runAIRegenerate();
      default:
        return this.noFix('Unknown strategy');
    }
  }

  private async runLocalSimple(): Promise<FixResult> {
    this.options.onProgress('Trying local fix...', 10);

    const code = this.options.files[this.options.targetFile] || this.options.appCode;
    if (!code) return this.noFix('No code found');

    const result = tryLocalFix(this.options.errorMessage, code);

    if (result.success && result.fixedFiles['current']) {
      const fixedCode = result.fixedFiles['current'];
      if (isCodeValid(fixedCode)) {
        return this.success(
          { [this.options.targetFile]: fixedCode },
          result.description,
          'local-simple'
        );
      }
    }

    return this.noFix('Local fix failed');
  }

  private async runLocalMultifile(): Promise<FixResult> {
    this.options.onProgress('Scanning files...', 15);

    const result = tryFixBareSpecifierMultiFile(this.options.errorMessage, this.options.files);

    if (result.success && Object.keys(result.fixedFiles).length > 0) {
      // Validate all files
      for (const code of Object.values(result.fixedFiles)) {
        if (!isCodeValid(code)) {
          return this.noFix('Invalid fix generated');
        }
      }
      return this.success(result.fixedFiles, result.description, 'local-multifile');
    }

    return this.noFix('Multi-file fix failed');
  }

  private async runLocalProactive(): Promise<FixResult> {
    this.options.onProgress('Analyzing code...', 20);
    // Proactive analysis is now done inline with local fixes
    return this.noFix('No proactive fixes found');
  }

  private async runAIQuick(): Promise<FixResult> {
    this.options.onProgress('Quick AI fix...', 30);

    const code = this.options.files[this.options.targetFile] || this.options.appCode;
    if (!code) return this.noFix('No code found');

    const manager = getProviderManager();
    const config = manager.getActiveConfig();
    if (!config) return this.noFix('No AI provider');

    const prompt = this.buildQuickPrompt(code);

    try {
      const response = await Promise.race([
        manager.generate({ prompt, responseFormat: 'text' }, config.defaultModel),
        this.createTimeout(CONFIG.AI_QUICK_TIMEOUT),
      ]);

      if (!response || typeof response === 'symbol') {
        return this.noFix('AI timeout');
      }

      const fixedCode = cleanGeneratedCode(response.text || '');
      if (fixedCode && isValidCode(fixedCode) && fixedCode !== code) {
        return this.success(
          { [this.options.targetFile]: fixedCode },
          'Quick AI fix',
          'ai-quick'
        );
      }
    } catch (e) {
      return this.noFix(String(e));
    }

    return this.noFix('AI fix invalid');
  }

  private async runAIFull(): Promise<FixResult> {
    this.options.onProgress('Full AI analysis...', 50);

    const code = this.options.files[this.options.targetFile] || this.options.appCode;
    if (!code) return this.noFix('No code found');

    const manager = getProviderManager();
    const config = manager.getActiveConfig();
    if (!config) return this.noFix('No AI provider');

    const prompt = buildAutoFixPrompt({
      errorMessage: this.options.errorMessage,
      targetFile: this.options.targetFile,
      targetFileContent: code,
      files: this.options.files,
      techStackContext: this.options.systemInstruction,
      logs: this.options.logs,
    });

    try {
      const response = await Promise.race([
        manager.generate({ prompt, responseFormat: 'text' }, config.defaultModel),
        this.createTimeout(CONFIG.AI_FULL_TIMEOUT),
      ]);

      if (!response || typeof response === 'symbol') {
        return this.noFix('AI timeout');
      }

      const fixedCode = cleanGeneratedCode(response.text || '');
      if (fixedCode && isValidCode(fixedCode) && fixedCode !== code) {
        return this.success(
          { [this.options.targetFile]: fixedCode },
          'AI fix with full context',
          'ai-full'
        );
      }
    } catch (e) {
      return this.noFix(String(e));
    }

    return this.noFix('AI fix invalid');
  }

  private async runAIIterative(): Promise<FixResult> {
    this.options.onProgress('Iterative AI...', 70);

    const code = this.options.files[this.options.targetFile] || this.options.appCode;
    if (!code) return this.noFix('No code found');

    const manager = getProviderManager();
    const config = manager.getActiveConfig();
    if (!config) return this.noFix('No AI provider');

    const feedback: string[] = [];

    for (let round = 0; round < CONFIG.MAX_ITERATIVE_ROUNDS; round++) {
      if (this.isTimedOut()) break;

      this.options.onProgress(`AI attempt ${round + 1}/${CONFIG.MAX_ITERATIVE_ROUNDS}...`, 70 + round * 10);

      const prompt = this.buildIterativePrompt(code, feedback, round);

      try {
        const response = await Promise.race([
          manager.generate({ prompt, responseFormat: 'text' }, config.defaultModel),
          this.createTimeout(CONFIG.AI_FULL_TIMEOUT),
        ]);

        if (!response || typeof response === 'symbol') {
          feedback.push('Timeout');
          continue;
        }

        const fixedCode = cleanGeneratedCode(response.text || '');

        if (!fixedCode) {
          feedback.push('Empty response');
          continue;
        }

        if (!isValidCode(fixedCode)) {
          feedback.push('Invalid syntax');
          continue;
        }

        if (fixedCode === code) {
          feedback.push('No changes');
          continue;
        }

        return this.success(
          { [this.options.targetFile]: fixedCode },
          `Fixed after ${round + 1} iterations`,
          'ai-iterative'
        );
      } catch (e) {
        feedback.push(String(e));
      }
    }

    return this.noFix(`Failed after ${CONFIG.MAX_ITERATIVE_ROUNDS} rounds`);
  }

  private async runAIRegenerate(): Promise<FixResult> {
    this.options.onProgress('Regenerating...', 90);

    const code = this.options.files[this.options.targetFile] || this.options.appCode;
    if (!code) return this.noFix('No code found');

    const manager = getProviderManager();
    const config = manager.getActiveConfig();
    if (!config) return this.noFix('No AI provider');

    const componentName = this.extractComponentName(code);
    const relatedFiles = getRelatedFiles(this.options.errorMessage, code, this.options.files);

    const prompt = this.buildRegenerationPrompt(code, componentName, relatedFiles);

    try {
      const response = await Promise.race([
        manager.generate({ prompt, responseFormat: 'text' }, config.defaultModel),
        this.createTimeout(CONFIG.AI_ITERATIVE_TIMEOUT),
      ]);

      if (!response || typeof response === 'symbol') {
        return this.noFix('AI timeout');
      }

      const fixedCode = cleanGeneratedCode(response.text || '');
      if (fixedCode && isValidCode(fixedCode)) {
        return this.success(
          { [this.options.targetFile]: fixedCode },
          `Regenerated ${componentName || 'component'}`,
          'ai-regenerate'
        );
      }
    } catch (e) {
      return this.noFix(String(e));
    }

    return this.noFix('Regeneration failed');
  }

  // ============================================================================
  // Prompt Builders
  // ============================================================================

  private buildQuickPrompt(code: string): string {
    const parsed = errorAnalyzer.analyze(this.options.errorMessage);

    return `Fix this ${parsed.category} error in React/TypeScript code.

ERROR: ${this.options.errorMessage}
${parsed.suggestedFix ? `HINT: ${parsed.suggestedFix}` : ''}

CODE:
\`\`\`tsx
${code.slice(0, 10000)}
\`\`\`

Return ONLY the complete fixed code. No explanations.`;
  }

  private buildIterativePrompt(code: string, feedback: string[], _round: number): string {
    let prompt = `Fix this error in React/TypeScript code.

ERROR: ${this.options.errorMessage}

`;

    if (feedback.length > 0) {
      prompt += `PREVIOUS ATTEMPTS FAILED:
${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Try a DIFFERENT approach.

`;
    }

    prompt += `CODE:
\`\`\`tsx
${code}
\`\`\`

Return ONLY the complete fixed code.`;

    return prompt;
  }

  private buildRegenerationPrompt(
    code: string,
    componentName: string | null,
    relatedFiles: Record<string, string>
  ): string {
    const imports = code.match(/^import\s+.*$/gm) || [];
    const jsxMatch = code.match(/return\s*\(\s*([\s\S]*?)\s*\);?\s*(?:}|$)/);
    const jsx = jsxMatch ? jsxMatch[1] : '';

    let related = '';
    if (Object.keys(relatedFiles).length > 0) {
      related = '\n\nRELATED FILES:\n';
      for (const [path, content] of Object.entries(relatedFiles).slice(0, 3)) {
        related += `\n// ${path}\n${content.slice(0, 2000)}\n`;
      }
    }

    return `Regenerate this React component fixing all errors.

ERROR: ${this.options.errorMessage}
COMPONENT: ${componentName || 'App'}

IMPORTS:
${imports.join('\n')}

JSX:
${jsx.slice(0, 3000)}
${related}

Return ONLY the complete fixed component.`;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private detectTargetFile(error: string, files: FileSystem): string {
    // Try to extract file from error
    const match = error.match(/(?:at\s+)?([^:\s]+\.tsx?):?\d*/);
    if (match && files[match[1]]) return match[1];

    // Check bare specifier
    const bare = error.match(/["']?(src\/[\w./-]+)["']?/i);
    if (bare) {
      for (const [path, content] of Object.entries(files)) {
        if (content?.includes(bare[1])) return path;
      }
    }

    return 'src/App.tsx';
  }

  private extractComponentName(code: string): string | null {
    const match = code.match(/export\s+(?:default\s+)?(?:function|const)\s+(\w+)/);
    return match ? match[1] : null;
  }

  private getLabel(strategy: FixStrategy): string {
    const labels: Record<FixStrategy, string> = {
      'local-simple': 'Quick fix',
      'local-multifile': 'Multi-file fix',
      'local-proactive': 'Code analysis',
      'ai-quick': 'Quick AI',
      'ai-full': 'AI analysis',
      'ai-iterative': 'Deep AI',
      'ai-regenerate': 'Regenerating',
    };
    return labels[strategy] || strategy;
  }

  private getProgress(): number {
    const index = STRATEGY_ORDER.indexOf(this.currentStrategy);
    return Math.round((index / STRATEGY_ORDER.length) * 100);
  }

  private isTimedOut(): boolean {
    return Date.now() - this.startTime > this.options.timeout;
  }

  private createTimeout(ms: number): Promise<symbol> {
    return new Promise(resolve => setTimeout(() => resolve(Symbol('timeout')), ms));
  }

  private success(files: Record<string, string>, desc: string, strategy: FixStrategy): FixResult {
    return {
      success: true,
      fixedFiles: files,
      description: desc,
      strategy,
      attempts: this.attempts,
      timeMs: Date.now() - this.startTime,
    };
  }

  private noFix(error?: string): FixResult {
    return {
      success: false,
      fixedFiles: {},
      description: error || 'No fix found',
      strategy: this.currentStrategy,
      attempts: this.attempts,
      timeMs: Date.now() - this.startTime,
      error,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function quickFix(
  errorMessage: string,
  files: FileSystem,
  options?: Partial<FixEngineOptions>
): Promise<Record<string, string> | null> {
  const engine = new FixEngine({ errorMessage, files, ...options });
  const result = await engine.fix();
  return result.success ? result.fixedFiles : null;
}

export async function fixWithProgress(
  errorMessage: string,
  files: FileSystem,
  onProgress: (stage: string, progress: number) => void,
  options?: Partial<FixEngineOptions>
): Promise<FixResult> {
  const engine = new FixEngine({ errorMessage, files, onProgress, ...options });
  return engine.fix();
}

// Legacy export for backward compatibility
export { FixEngine as ErrorFixEngine };
