/**
 * useAutoCommit - Automatically commit when preview is error-free
 *
 * Features:
 * - Debounce: Wait 3 seconds of stable error-free state
 * - Cooldown: Minimum 10 seconds between auto-commits
 * - AI-generated commit messages with "auto:" prefix
 * - Safety guards: max files, git clean check
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { getProviderManager } from '../services/ai';

interface LocalChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

interface UseAutoCommitOptions {
  enabled: boolean;
  files: Record<string, string>;
  hasUncommittedChanges: boolean;
  previewHasErrors: boolean;
  gitInitialized: boolean;
  localChanges: LocalChange[];
  onCommit: (message: string) => Promise<boolean>;
}

// Debounce time: wait 3 seconds of stable error-free state
const DEBOUNCE_MS = 3000;
// Cooldown: minimum 10 seconds between auto-commits
const COOLDOWN_MS = 10000;
// Max files: skip if more than 20 files changed
const MAX_FILES_FOR_AUTO_COMMIT = 20;

export function useAutoCommit({
  enabled,
  files,
  hasUncommittedChanges,
  previewHasErrors,
  gitInitialized,
  localChanges,
  onCommit,
}: UseAutoCommitOptions) {
  const [isAutoCommitting, setIsAutoCommitting] = useState(false);
  const [lastAutoCommitMessage, setLastAutoCommitMessage] = useState<string | null>(null);

  // Refs for tracking state
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitTimeRef = useRef<number>(0);
  const isCommittingRef = useRef(false);

  // Generate AI commit message
  const generateCommitMessage = useCallback(async (): Promise<string> => {
    if (localChanges.length === 0) {
      return 'auto: update files';
    }

    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();

      if (!activeConfig) {
        // Fallback to simple message
        const fileNames = localChanges.slice(0, 5).map(c => c.path.split('/').pop()).join(', ');
        return `auto: update ${fileNames}${localChanges.length > 5 ? ` +${localChanges.length - 5} more` : ''}`;
      }

      // Build context from changed files
      const changedFilesContext = localChanges
        .slice(0, 10)
        .map(change => {
          const content = files[change.path];
          const preview = content ? content.slice(0, 500) : '(file content not available)';
          return `${change.status.toUpperCase()}: ${change.path}\n${preview}`;
        })
        .join('\n\n---\n\n');

      const prompt = `Generate a concise git commit message for these changes. Follow conventional commit format (feat:, fix:, refactor:, etc.). Be specific but brief (max 72 chars for first line). Only output the commit message, nothing else.

Changed files:
${changedFilesContext}`;

      const response = await manager.generate({
        prompt,
        systemInstruction: 'You are a helpful assistant that generates git commit messages. Output only the commit message text, no explanations or markdown.',
      });

      const message = response.text?.trim() || '';
      // Clean any markdown or quotes
      const cleanMessage = message
        .replace(/^```.*\n?/gm, '')
        .replace(/```$/gm, '')
        .replace(/^["']|["']$/g, '')
        .trim();

      // Add "auto:" prefix if not already present
      if (cleanMessage && !cleanMessage.toLowerCase().startsWith('auto:')) {
        return `auto: ${cleanMessage}`;
      }

      return cleanMessage || 'auto: update files';
    } catch (err) {
      console.error('[AutoCommit] Failed to generate message:', err);
      // Fallback to simple message
      const fileNames = localChanges.slice(0, 3).map(c => c.path.split('/').pop()).join(', ');
      return `auto: update ${fileNames}`;
    }
  }, [localChanges, files]);

  // Perform auto-commit
  const performAutoCommit = useCallback(async () => {
    // Safety checks
    if (isCommittingRef.current) return;
    if (!enabled || !gitInitialized || !hasUncommittedChanges) return;
    if (previewHasErrors) return;
    if (localChanges.length === 0) return;
    if (localChanges.length > MAX_FILES_FOR_AUTO_COMMIT) {
      console.log('[AutoCommit] Skipping: too many files changed', localChanges.length);
      return;
    }

    // Check cooldown
    const now = Date.now();
    if (now - lastCommitTimeRef.current < COOLDOWN_MS) {
      console.log('[AutoCommit] Skipping: cooldown active');
      return;
    }

    isCommittingRef.current = true;
    setIsAutoCommitting(true);

    try {
      console.log('[AutoCommit] Starting auto-commit...');

      // Generate commit message
      const message = await generateCommitMessage();
      console.log('[AutoCommit] Generated message:', message);

      // Perform commit
      const success = await onCommit(message);

      if (success) {
        lastCommitTimeRef.current = Date.now();
        setLastAutoCommitMessage(message);
        console.log('[AutoCommit] Success!');
      } else {
        console.log('[AutoCommit] Commit failed');
      }
    } catch (err) {
      console.error('[AutoCommit] Error:', err);
    } finally {
      isCommittingRef.current = false;
      setIsAutoCommitting(false);
    }
  }, [enabled, gitInitialized, hasUncommittedChanges, previewHasErrors, localChanges, generateCommitMessage, onCommit]);

  // Effect: Monitor conditions and trigger auto-commit with debounce
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Check if all conditions are met
    const shouldCommit = enabled &&
                         gitInitialized &&
                         hasUncommittedChanges &&
                         !previewHasErrors &&
                         localChanges.length > 0 &&
                         localChanges.length <= MAX_FILES_FOR_AUTO_COMMIT;

    if (shouldCommit && !isCommittingRef.current) {
      // Start debounce timer
      debounceTimerRef.current = setTimeout(() => {
        performAutoCommit();
      }, DEBOUNCE_MS);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, gitInitialized, hasUncommittedChanges, previewHasErrors, localChanges, performAutoCommit]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    isAutoCommitting,
    lastAutoCommitMessage,
  };
}

export default useAutoCommit;
