/**
 * ErrorFixAgent - Agentic Error Fixing System
 *
 * A hybrid agent that uses both local fixes and AI to resolve errors.
 * Flow: Analyze Error → Try Local Fix → If failed, AI Fix → Apply → Verify → Repeat
 */

import { getProviderManager } from './ai';
import { FileSystem } from '../types';
import { parseMultiFileResponse } from '../utils/cleanCode';
import { localFixEngine } from './errorFix/localFixEngine';
import { errorAnalyzer, ParsedError } from './errorAnalyzer';
import { FILE_GENERATION_SCHEMA, supportsAdditionalProperties } from './ai/utils/schemas';
import { ERROR_FIX_SYSTEM_PROMPT } from '../components/ControlPanel/prompts';

// Agent states
export type AgentState =
  | 'idle'
  | 'analyzing'
  | 'local-fix'      // Trying local fix without AI
  | 'ai-fix'         // Sending to AI
  | 'fixing'
  | 'applying'
  | 'verifying'
  | 'success'
  | 'failed'
  | 'max_attempts_reached';

// Log entry for UI display
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

// Agent configuration
export interface AgentConfig {
  maxAttempts: number;
  timeoutMs: number;
  onStateChange: (state: AgentState) => void;
  onLog: (entry: AgentLogEntry) => void;
  onFileUpdate: (path: string, content: string) => void;
  onComplete: (success: boolean, message: string) => void;
}

// Error context for LLM
interface ErrorContext {
  errorMessage: string;
  errorStack?: string;
  file: string;
  fileContent: string;
  allFiles: FileSystem;
  previousAttempts: Array<{
    prompt: string;
    response: string;
    appliedFix: string;
    resultingError?: string;
  }>;
}

class ErrorFixAgent {
  private state: AgentState = 'idle';
  private config: AgentConfig | null = null;
  private abortController: AbortController | null = null;
  private currentAttempt = 0;
  private previousAttempts: ErrorContext['previousAttempts'] = [];

  // Stored state for UI reconnection
  private logs: AgentLogEntry[] = [];
  private isRunning = false;
  private completionMessage: string | null = null;
  private maxAttempts = 5;
  private currentError: string | null = null;
  private currentTargetFile: string | null = null;

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private log(
    type: AgentLogEntry['type'],
    title: string,
    content: string,
    metadata?: AgentLogEntry['metadata']
  ): void {
    const entry: AgentLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      type,
      title,
      content,
      metadata: {
        ...metadata,
        attempt: this.currentAttempt
      }
    };

    // Store log for UI reconnection
    this.logs.push(entry);

    // Notify UI if connected
    this.config?.onLog(entry);
  }

  private setState(newState: AgentState): void {
    this.state = newState;
    this.config?.onStateChange(newState);
  }

  /**
   * Start the agentic error fixing loop
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
    this.previousAttempts = [];
    this.abortController = new AbortController();

    // Store state for UI reconnection
    this.logs = [];
    this.isRunning = true;
    this.completionMessage = null;
    this.maxAttempts = config.maxAttempts;
    this.currentError = errorMessage;
    this.currentTargetFile = targetFile;

    this.log('info', 'Agent Started', `Starting error fix agent for: ${targetFile}`);
    this.log('error', 'Error Detected', errorMessage, { file: targetFile });

    // Start the agentic loop
    await this.fixLoop(errorMessage, errorStack, targetFile, files);
  }

  /**
   * Main agentic loop - Hybrid approach: Local fix first, then AI
   */
  private async fixLoop(
    errorMessage: string,
    errorStack: string | undefined,
    targetFile: string,
    files: FileSystem
  ): Promise<void> {
    if (!this.config) return;

    while (this.currentAttempt < this.config.maxAttempts) {
      // Check if aborted
      if (this.abortController?.signal.aborted) {
        this.log('warning', 'Aborted', 'Agent was stopped by user');
        this.setState('idle');
        this.isRunning = false;
        this.completionMessage = 'Agent stopped by user';
        this.config.onComplete(false, this.completionMessage);
        return;
      }

      this.currentAttempt++;
      this.log('info', `Attempt ${this.currentAttempt}/${this.config.maxAttempts}`,
        'Starting fix attempt...');

      try {
        // Step 1: Analyze the error
        this.setState('analyzing');
        const parsedError = errorAnalyzer.analyze(errorMessage, errorStack, files);
        const errorSummary = errorAnalyzer.getSummary(parsedError);

        this.log('info', 'Error Analysis', `Type: ${parsedError.type}\nCategory: ${parsedError.category}\nSummary: ${errorSummary}\nAuto-fixable: ${parsedError.isAutoFixable}\nConfidence: ${(parsedError.confidence * 100).toFixed(0)}%`);

        // Step 2: Try LOCAL FIX first (no AI needed)
        if (parsedError.isAutoFixable && this.currentAttempt === 1) {
          this.setState('local-fix');
          this.log('info', 'Trying Local Fix', 'Attempting to fix without AI...');

          const localResult = localFixEngine.tryFix(errorMessage, errorStack, targetFile, files);

          if (localResult.success) {
            this.log('success', 'Local Fix Found', `${localResult.explanation}\nFix type: ${localResult.fixType}`);

            // Apply local fix
            this.setState('applying');
            const appliedFiles: string[] = [];

            for (const [filePath, content] of Object.entries(localResult.fixedFiles)) {
              this.log('fix', 'Applying Local Fix', `Updating ${filePath}`, { file: filePath });
              this.config.onFileUpdate(filePath, content);
              files = { ...files, [filePath]: content };
              appliedFiles.push(filePath);
            }

            this.previousAttempts.push({
              prompt: 'Local fix (no AI)',
              response: localResult.explanation,
              appliedFix: appliedFiles.join(', '),
              resultingError: undefined
            });

            // Verify
            this.setState('verifying');
            this.log('info', 'Verifying Local Fix', 'Waiting for preview to compile...');
            await this.delay(2000);

            const fixedFilesText = appliedFiles.length === 1 ? appliedFiles[0] : `${appliedFiles.length} files`;
            this.log('success', 'Local Fix Applied', `Successfully fixed ${fixedFilesText} without AI!`);
            this.setState('success');
            this.isRunning = false;
            this.completionMessage = `Fixed ${fixedFilesText} locally (no AI needed)`;
            this.config.onComplete(true, this.completionMessage);
            return;
          } else {
            this.log('info', 'Local Fix Failed', 'No local fix available, proceeding with AI...');
          }
        }

        // Step 3: AI FIX - Build context and prompt
        this.setState('ai-fix');
        const context = this.buildErrorContext(errorMessage, errorStack, targetFile, files);
        const prompt = this.buildPrompt(context, parsedError);

        this.log('prompt', 'Prompt Sent to LLM', prompt.slice(0, 1000) + (prompt.length > 1000 ? '\n...(truncated)' : ''), {
          file: targetFile,
          model: getProviderManager().getActiveConfig()?.defaultModel
        });

        // Step 4: Get fix from LLM
        this.setState('fixing');
        const startTime = Date.now();
        const fixedCode = await this.callLLM(prompt);
        const duration = Date.now() - startTime;

        if (!fixedCode || fixedCode.trim() === '') {
          this.log('error', 'Empty Response', 'LLM returned empty response');
          continue;
        }

        this.log('response', 'LLM Response', fixedCode.slice(0, 500) + (fixedCode.length > 500 ? '...' : ''), {
          duration,
          model: getProviderManager().getActiveConfig()?.defaultModel
        });

        // Check if model is asking questions instead of fixing (bad response)
        if (this.isModelAskingQuestions(fixedCode)) {
          this.log('warning', 'Invalid Response', 'Model asked questions instead of fixing. Retrying...');
          continue;
        }

        // Step 5: Parse and validate the response
        let parseResult = parseMultiFileResponse(fixedCode, true);

        // Try smart extraction if JSON parse failed
        if (!parseResult || !parseResult.files || Object.keys(parseResult.files).length === 0) {
          this.log('info', 'Trying Smart Extraction', 'JSON parse failed, attempting to extract code from response...');
          parseResult = this.smartExtractFix(fixedCode, targetFile, parsedError);
        }

        if (!parseResult || !parseResult.files || Object.keys(parseResult.files).length === 0) {
          this.log('error', 'Parse Failed', 'Could not parse LLM response as valid JSON with files');

          // Last resort fallback: try to use cleanResponse for raw code
          const fallbackCode = this.cleanResponse(fixedCode);
          if (fallbackCode && fallbackCode !== files[targetFile]) {
            this.log('info', 'Using Fallback', 'Applying raw code as fallback');

            this.setState('applying');
            this.config.onFileUpdate(targetFile, fallbackCode);
            files = { ...files, [targetFile]: fallbackCode };

            this.previousAttempts.push({
              prompt,
              response: fixedCode,
              appliedFix: fallbackCode,
              resultingError: undefined
            });

            this.setState('verifying');
            this.log('info', 'Verifying Fix', 'Waiting for preview to compile...');
            await this.delay(2000);

            this.log('success', 'Fix Applied (Fallback)', `Successfully applied fallback fix to ${targetFile}`);
            this.setState('success');
            this.isRunning = false;
            this.completionMessage = `Fixed ${targetFile} after ${this.currentAttempt} attempt(s) (fallback mode)`;
            this.config.onComplete(true, this.completionMessage);
            return;
          }

          continue;
        }

        // Log explanation if provided
        if (parseResult.explanation) {
          this.log('info', 'Fix Explanation', parseResult.explanation);
        }

        // Get all fixed files from response
        const fixedFiles = parseResult.files;
        const fileEntries = Object.entries(fixedFiles);

        if (fileEntries.length === 0) {
          this.log('warning', 'No Files', 'LLM response contained no file changes');
          continue;
        }

        // Check if any file actually changed
        let hasChanges = false;
        for (const [filePath, content] of fileEntries) {
          // Normalize path and check against existing files
          const existingContent = files[filePath] || files[this.normalizePath(filePath, files)];
          if (content && content !== existingContent) {
            hasChanges = true;
            break;
          }
        }

        if (!hasChanges) {
          this.log('warning', 'No Changes', 'LLM returned identical code for all files');
          continue;
        }

        // Step 5: Apply ALL fixes
        this.setState('applying');

        const appliedFiles: string[] = [];
        for (const [filePath, content] of fileEntries) {
          if (!content) continue;

          // Normalize the path to match our file system
          const actualPath = this.normalizePath(filePath, files);
          const existingContent = files[actualPath];

          // Skip if no change
          if (content === existingContent) {
            this.log('info', 'Skipped', `No changes to ${actualPath}`);
            continue;
          }

          this.log('fix', 'Applying Fix', `Updating ${actualPath}`, { file: actualPath });
          this.config.onFileUpdate(actualPath, content);

          // Update local files reference for next iteration
          files = { ...files, [actualPath]: content };
          appliedFiles.push(actualPath);
        }

        if (appliedFiles.length === 0) {
          this.log('warning', 'No Changes Applied', 'All files were identical');
          continue;
        }

        this.log('info', 'Files Updated', `Applied fixes to: ${appliedFiles.join(', ')}`);

        // Record this attempt
        this.previousAttempts.push({
          prompt,
          response: fixedCode,
          appliedFix: appliedFiles.join(', '),
          resultingError: undefined // Will be set if error persists
        });

        // Step 6: Verify (wait for preview to report new error or success)
        this.setState('verifying');
        this.log('info', 'Verifying Fix', 'Waiting for preview to compile...');

        // Give the preview time to compile and report errors
        // The verification is passive - we wait for the next error or success signal
        await this.delay(2000);

        // Check if we should continue (this will be updated externally via reportError or reportSuccess)
        // For now, we assume success if no new error is reported within timeout
        const fixedFilesText = appliedFiles.length === 1 ? appliedFiles[0] : `${appliedFiles.length} files`;
        this.log('success', 'Fix Applied', `Successfully applied fix to ${fixedFilesText}`);
        this.setState('success');
        this.isRunning = false;
        this.completionMessage = `Fixed ${fixedFilesText} after ${this.currentAttempt} attempt(s)`;
        this.config.onComplete(true, this.completionMessage);
        return;

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log('error', 'Error in Fix Attempt', errorMsg);

        if (this.previousAttempts.length > 0) {
          this.previousAttempts[this.previousAttempts.length - 1].resultingError = errorMsg;
        }
      }
    }

    // Max attempts reached
    this.setState('max_attempts_reached');
    this.log('warning', 'Max Attempts Reached',
      `Failed to fix error after ${this.config.maxAttempts} attempts`);
    this.isRunning = false;
    this.completionMessage = `Failed after ${this.config.maxAttempts} attempts`;
    this.config.onComplete(false, this.completionMessage);
  }

  /**
   * Report a new error (called after applying fix)
   * This continues the loop if the fix didn't work
   */
  reportError(errorMessage: string, _errorStack?: string): void {
    if (this.state !== 'verifying') return;

    this.log('error', 'New Error After Fix', errorMessage);

    if (this.previousAttempts.length > 0) {
      this.previousAttempts[this.previousAttempts.length - 1].resultingError = errorMessage;
    }

    // The loop will continue automatically since we're still within fixLoop
  }

  /**
   * Report success (no more errors)
   */
  reportSuccess(): void {
    if (this.state !== 'verifying') return;

    this.log('success', 'Error Resolved', 'Preview compiled successfully!');
    this.setState('success');
    this.config?.onComplete(true, 'Error fixed successfully!');
  }

  /**
   * Stop the agent
   */
  stop(): void {
    this.abortController?.abort();
    this.log('warning', 'Stopping', 'Agent stop requested');
    this.setState('idle');
    this.isRunning = false;
    this.completionMessage = 'Agent stopped by user';
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Get stored logs for UI reconnection
   */
  getLogs(): AgentLogEntry[] {
    return [...this.logs];
  }

  /**
   * Check if agent is currently running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get completion message
   */
  getCompletionMessage(): string | null {
    return this.completionMessage;
  }

  /**
   * Get max attempts setting
   */
  getMaxAttempts(): number {
    return this.maxAttempts;
  }

  /**
   * Get current error being fixed
   */
  getCurrentError(): string | null {
    return this.currentError;
  }

  /**
   * Get target file being fixed
   */
  getCurrentTargetFile(): string | null {
    return this.currentTargetFile;
  }

  /**
   * Reconnect UI callbacks to a running agent
   * Called when the ErrorFixPanel remounts
   */
  reconnect(callbacks: {
    onStateChange: (state: AgentState) => void;
    onLog: (entry: AgentLogEntry) => void;
    onFileUpdate: (path: string, content: string) => void;
    onComplete: (success: boolean, message: string) => void;
  }): void {
    if (this.config) {
      this.config.onStateChange = callbacks.onStateChange;
      this.config.onLog = callbacks.onLog;
      this.config.onFileUpdate = callbacks.onFileUpdate;
      this.config.onComplete = callbacks.onComplete;
    }
  }

  /**
   * Build error context for LLM
   */
  private buildErrorContext(
    errorMessage: string,
    errorStack: string | undefined,
    targetFile: string,
    files: FileSystem
  ): ErrorContext {
    return {
      errorMessage,
      errorStack,
      file: targetFile,
      fileContent: files[targetFile] || '',
      allFiles: files,
      previousAttempts: this.previousAttempts
    };
  }

  /**
   * Build prompt for LLM with enhanced error context
   */
  private buildPrompt(context: ErrorContext, parsedError?: ParsedError): string {
    const isBareSpecifierError = parsedError?.type === 'bare-specifier' ||
                                  /bare specifier|was not remapped/i.test(context.errorMessage);

    let prompt = `## ERROR TO FIX\n\n`;

    // Add parsed error info if available
    if (parsedError) {
      prompt += `**Error Type:** ${parsedError.type}\n`;
      prompt += `**Category:** ${parsedError.category}\n`;
      if (parsedError.identifier) {
        prompt += `**Identifier:** ${parsedError.identifier}\n`;
      }
      if (parsedError.importPath) {
        prompt += `**Import Path:** ${parsedError.importPath}\n`;
      }
      if (parsedError.suggestedFix) {
        prompt += `**Suggested Fix:** ${parsedError.suggestedFix}\n`;
      }
      if (parsedError.file) {
        prompt += `**Error Location:** ${parsedError.file}${parsedError.line ? `:${parsedError.line}` : ''}\n`;
      }
      prompt += '\n';
    }

    prompt += `**Error Message:**\n${context.errorMessage}\n`;

    if (context.errorStack) {
      prompt += `\n**Stack Trace:**\n\`\`\`\n${context.errorStack}\n\`\`\`\n`;
    }

    // For bare specifier errors, find files that have the bad import
    if (isBareSpecifierError) {
      const badPath = parsedError?.importPath || this.extractBadImportPath(context.errorMessage);
      if (badPath) {
        const importingFiles = this.findFilesWithImport(badPath, context.allFiles);

        if (importingFiles.length > 0) {
          prompt += `\n## ⚠️ CRITICAL: IMPORT ERROR\n`;
          prompt += `The problem is NOT in the imported file! The problem is in the file(s) that IMPORT "${badPath}" incorrectly.\n`;
          prompt += `\n### FILES THAT NEED FIXING (they have the bad import):\n`;

          for (const [filePath, content] of importingFiles) {
            prompt += `\n#### ${filePath} (FIX THIS FILE)\n\`\`\`tsx\n${content}\n\`\`\`\n`;
          }

          prompt += `\n**How to fix:** Change \`"${badPath}"\` to a relative path like \`"./${badPath.replace(/^src\//, '')}"\`\n`;
        }
      }
    }

    // Include the target file content
    prompt += `\n## TARGET FILE: ${context.file}\n\`\`\`tsx\n${context.fileContent}\n\`\`\`\n`;

    // Add related files from error analysis
    if (parsedError?.relatedFiles && parsedError.relatedFiles.length > 0) {
      prompt += `\n## RELATED FILES (may contain relevant context):\n`;
      for (const relatedPath of parsedError.relatedFiles.slice(0, 3)) {
        const content = context.allFiles[relatedPath];
        if (content) {
          const truncated = content.length > 1500 ? content.slice(0, 1500) + '\n...(truncated)' : content;
          prompt += `\n### ${relatedPath}\n\`\`\`tsx\n${truncated}\n\`\`\`\n`;
        }
      }
    } else if (!isBareSpecifierError) {
      // Fallback: Add relevant files for context
      const relevantFiles = this.getRelevantFiles(context);
      if (relevantFiles.length > 0) {
        prompt += `\n## RELATED FILES FOR CONTEXT:\n`;
        for (const [path, content] of relevantFiles) {
          const truncated = content.length > 1000 ? content.slice(0, 1000) + '\n...(truncated)' : content;
          prompt += `\n### ${path}\n\`\`\`tsx\n${truncated}\n\`\`\`\n`;
        }
      }
    }

    // Add previous attempts if any
    if (context.previousAttempts.length > 0) {
      prompt += `\n## PREVIOUS FAILED ATTEMPTS (do NOT repeat these):\n`;
      for (let i = 0; i < context.previousAttempts.length; i++) {
        const attempt = context.previousAttempts[i];
        prompt += `\n**Attempt ${i + 1}:**\n`;
        prompt += `- Files modified: ${attempt.appliedFix}\n`;
        prompt += `- Result: ${attempt.resultingError || 'Unknown error'}\n`;
      }
      prompt += `\n**Important:** Try a DIFFERENT approach from the failed attempts above.\n`;
    }

    // Final instructions
    prompt += `\n## INSTRUCTIONS\n`;
    if (isBareSpecifierError) {
      prompt += `Fix the IMPORTING file (the one with the bad import), NOT the imported file.\n`;
      prompt += `Change bare specifier imports like "src/..." to relative paths like "./".\n`;
    } else if (parsedError?.type === 'undefined-variable') {
      prompt += `Add the missing import for "${parsedError.identifier}" or define it.\n`;
    } else if (parsedError?.type === 'type-error') {
      prompt += `Fix the type mismatch while preserving functionality.\n`;
    } else {
      prompt += `Fix the error while preserving all existing functionality.\n`;
    }
    prompt += `Return the complete fixed file(s) - no placeholders or truncation.\n`;

    return prompt;
  }

  /**
   * Extract the bad import path from error message
   */
  private extractBadImportPath(errorMessage: string): string | null {
    // Match patterns like: "src/components/Hero.tsx" was a bare specifier
    const match = errorMessage.match(/["']([^"']+)["']\s*was\s*a?\s*bare\s*specifier/i);
    if (match) return match[1];

    // Match: specifier "src/..." was not remapped
    const match2 = errorMessage.match(/specifier\s*["']([^"']+)["']/i);
    if (match2) return match2[1];

    return null;
  }

  /**
   * Find files that import a given path
   */
  private findFilesWithImport(importPath: string, files: FileSystem): Array<[string, string]> {
    const results: Array<[string, string]> = [];

    for (const [filePath, content] of Object.entries(files)) {
      if (!content) continue;

      // Check if this file imports the problematic path
      // Match various import patterns
      const importPatterns = [
        new RegExp(`from\\s+['"]${this.escapeRegex(importPath)}['"]`, 'g'),
        new RegExp(`import\\s+['"]${this.escapeRegex(importPath)}['"]`, 'g'),
        new RegExp(`require\\s*\\(\\s*['"]${this.escapeRegex(importPath)}['"]`, 'g'),
      ];

      for (const pattern of importPatterns) {
        if (pattern.test(content)) {
          results.push([filePath, content]);
          break;
        }
      }
    }

    return results;
  }

  /**
   * Check if model is asking questions instead of providing a fix
   */
  private isModelAskingQuestions(response: string): boolean {
    const questionPatterns = [
      /I need to see/i,
      /could you (please )?provide/i,
      /can you (please )?share/i,
      /please provide/i,
      /I do not have (access|information|the file)/i,
      /which file (is|contains|has)/i,
      /I need more (information|context|details)/i,
      /without seeing the/i,
      /I cannot (fix|help|proceed)/i,
      /\?$/m  // Ends with question mark
    ];

    // If response has no code blocks and matches question patterns, it's asking questions
    const hasCodeBlock = /```[\s\S]*?```/.test(response) || /^\s*import /m.test(response);

    if (!hasCodeBlock) {
      for (const pattern of questionPatterns) {
        if (pattern.test(response)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Smart extraction: Try to extract fix from non-JSON response
   */
  private smartExtractFix(
    response: string,
    targetFile: string,
    parsedError?: ParsedError
  ): { files: Record<string, string>; explanation?: string } | null {
    // Try to find code blocks with file paths
    const codeBlockRegex = /```(?:tsx?|jsx?|javascript|typescript)?\s*\n?([\s\S]*?)```/g;
    const matches: string[] = [];

    let match;
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const code = match[1].trim();
      if (code && code.length > 50) { // Reasonable code length
        matches.push(code);
      }
    }

    if (matches.length === 0) {
      return null;
    }

    // For bare specifier errors, if model provided fixed code, use it
    if (parsedError?.type === 'bare-specifier' && parsedError.importPath) {
      // Check if any code block has the fixed import
      for (const code of matches) {
        const badPath = parsedError.importPath;
        const fixedPath = badPath.replace(/^src\//, './');

        // If the code contains the fixed import (not the bad one), use it
        if (code.includes(fixedPath) && !code.includes(`'${badPath}'`) && !code.includes(`"${badPath}"`)) {
          return {
            files: { [targetFile]: code },
            explanation: `Fixed import: ${badPath} → ${fixedPath}`
          };
        }
      }
    }

    // If we have a single code block, assume it's the fix for targetFile
    if (matches.length === 1) {
      const code = matches[0];
      // Basic validation: should look like valid TSX/JS
      if (code.includes('import ') || code.includes('export ') || code.includes('function ')) {
        return {
          files: { [targetFile]: code },
          explanation: 'Extracted from code block'
        };
      }
    }

    return null;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Normalize file path to match existing files in the file system
   * LLM might return "src/App.tsx" but we might have it stored as "App.tsx" or vice versa
   */
  private normalizePath(path: string, files: FileSystem): string {
    // If exact match exists, use it
    if (files[path]) return path;

    // Try without src/ prefix
    const withoutSrc = path.replace(/^src\//, '');
    if (files[withoutSrc]) return withoutSrc;

    // Try with src/ prefix
    const withSrc = `src/${path}`;
    if (files[withSrc]) return withSrc;

    // Try matching by filename
    const filename = path.split('/').pop();
    if (filename) {
      for (const existingPath of Object.keys(files)) {
        if (existingPath.endsWith(filename)) {
          return existingPath;
        }
      }
    }

    // Return original if no match found
    return path;
  }

  /**
   * Get relevant files for context (imports, etc.)
   */
  private getRelevantFiles(context: ErrorContext): Array<[string, string]> {
    const relevant: Array<[string, string]> = [];
    const currentContent = context.fileContent;

    // Find imports in current file
    const importRegex = /from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(currentContent)) !== null) {
      const importPath = match[1];

      // Skip npm packages
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue;

      // Resolve path
      const currentDir = context.file.split('/').slice(0, -1).join('/');
      let resolvedPath = importPath;

      if (importPath.startsWith('./')) {
        resolvedPath = currentDir + importPath.slice(1);
      } else if (importPath.startsWith('../')) {
        const parts = currentDir.split('/');
        const upCount = (importPath.match(/\.\.\//g) || []).length;
        resolvedPath = parts.slice(0, -upCount).join('/') + '/' + importPath.replace(/\.\.\//g, '');
      }

      // Try to find the file with various extensions
      const extensions = ['', '.tsx', '.ts', '.jsx', '.js'];
      for (const ext of extensions) {
        const fullPath = resolvedPath + ext;
        if (context.allFiles[fullPath]) {
          relevant.push([fullPath, context.allFiles[fullPath]]);
          break;
        }
      }
    }

    // Limit to 3 most relevant files
    return relevant.slice(0, 3);
  }

  /**
   * Call LLM with prompt
   */
  private async callLLM(prompt: string): Promise<string> {
    const providerManager = getProviderManager();
    const provider = providerManager.getProvider();
    const config = providerManager.getActiveConfig();

    if (!provider || !config) {
      throw new Error('No AI provider configured');
    }

    let response = '';

    const request = {
      prompt,
      systemInstruction: ERROR_FIX_SYSTEM_PROMPT,
      temperature: 0.2, // Low temperature for more deterministic fixes
      responseFormat: 'json' as const,
      // Only use native schema for providers that support dynamic keys
      responseSchema: config.type && supportsAdditionalProperties(config.type)
        ? FILE_GENERATION_SCHEMA
        : undefined
    };

    await provider.generateStream(
      request,
      config.defaultModel,
      (chunk) => {
        response += chunk.text;
      }
    );

    return response;
  }

  /**
   * Clean LLM response (remove markdown, explanations, etc.)
   */
  private cleanResponse(response: string): string {
    let code = response;

    // Remove markdown code blocks
    const codeBlockMatch = code.match(/```(?:tsx?|jsx?|javascript|typescript)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      code = codeBlockMatch[1];
    }

    // Remove any leading/trailing explanations
    const lines = code.split('\n');
    let startIndex = 0;
    let endIndex = lines.length;

    // Find where actual code starts (import or first non-comment line)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') || line.startsWith('export ') ||
          line.startsWith('const ') || line.startsWith('function ') ||
          line.startsWith('class ') || line.startsWith('interface ') ||
          line.startsWith('type ') || line.startsWith("'use ") ||
          line.startsWith('"use ')) {
        startIndex = i;
        break;
      }
    }

    // Find where actual code ends
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.endsWith(';') || line.endsWith('}') || line.endsWith(')') ||
          line.startsWith('export ')) {
        endIndex = i + 1;
        break;
      }
    }

    code = lines.slice(startIndex, endIndex).join('\n');

    return code.trim();
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const errorFixAgent = new ErrorFixAgent();
