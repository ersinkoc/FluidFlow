/**
 * usePreviewAI Hook
 *
 * Handles AI-powered preview features like accessibility auditing,
 * responsiveness fixes, and error fixes.
 * Extracted from PreviewPanel to reduce complexity.
 */

import { useState, useCallback } from 'react';
import { FileSystem, AccessibilityReport } from '../types';
import { cleanGeneratedCode } from '../utils/cleanCode';
import { debugLog } from './useDebugStore';
import { getProviderManager } from '../services/ai';
import { ACCESSIBILITY_AUDIT_SCHEMA } from '../services/ai/utils/schemas';

// Type for raw accessibility issue from AI JSON response
interface RawAccessibilityIssue {
  type?: string;
  message?: string;
}

export interface UsePreviewAIOptions {
  files: FileSystem;
  appCode: string | undefined;
  selectedModel: string;
  setFiles: (files: FileSystem) => void;
  reviewChange: (label: string, newFiles: FileSystem) => void;
}

export interface UsePreviewAIReturn {
  // Accessibility
  accessibilityReport: AccessibilityReport | null;
  isAuditing: boolean;
  isFixingAccessibility: boolean;
  showAccessReport: boolean;
  setShowAccessReport: (show: boolean) => void;
  runAccessibilityAudit: () => Promise<void>;
  fixAccessibilityIssues: () => Promise<void>;

  // Responsiveness
  isFixingResponsiveness: boolean;
  fixResponsiveness: () => Promise<void>;

  // Database
  isGeneratingDB: boolean;
  generateDatabaseSchema: () => Promise<void>;
}

export function usePreviewAI(options: UsePreviewAIOptions): UsePreviewAIReturn {
  const { files, appCode, selectedModel, setFiles, reviewChange } = options;

  // Accessibility state
  const [accessibilityReport, setAccessibilityReport] = useState<AccessibilityReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isFixingAccessibility, setIsFixingAccessibility] = useState(false);
  const [showAccessReport, setShowAccessReport] = useState(false);

  // Responsiveness state
  const [isFixingResponsiveness, setIsFixingResponsiveness] = useState(false);

  // Database state
  const [isGeneratingDB, setIsGeneratingDB] = useState(false);

  /**
   * Run accessibility audit on the current app code
   */
  const runAccessibilityAudit = useCallback(async () => {
    if (!appCode) return;
    setIsAuditing(true);
    setShowAccessReport(true);

    const manager = getProviderManager();
    const activeConfig = manager.getActiveConfig();
    const currentModel = activeConfig?.defaultModel || selectedModel;

    const systemInstruction = `You are a WCAG 2.1 Accessibility Auditor. Analyze the provided React code for accessibility issues.

You MUST return a JSON object with this EXACT structure:
{
  "score": <number 0-100>,
  "issues": [
    {
      "type": "error" | "warning",
      "message": "<description of the accessibility issue>"
    }
  ]
}

Rules for scoring:
- 100: No accessibility issues found
- 80-99: Minor issues (warnings only)
- 50-79: Moderate issues (some errors)
- 0-49: Critical accessibility problems

Check for these WCAG 2.1 violations:
1. Missing alt text on images
2. Missing form labels
3. Poor color contrast
4. Missing ARIA attributes
5. Non-semantic HTML usage
6. Missing keyboard navigation support
7. Missing focus indicators
8. Missing skip links
9. Missing language attributes
10. Missing heading hierarchy`;

    const requestId = debugLog.request('accessibility', {
      model: currentModel,
      prompt: 'WCAG 2.1 Accessibility Audit',
      systemInstruction,
    });
    const startTime = Date.now();

    try {
      const response = await manager.generate(
        {
          prompt: `Audit this React code for accessibility issues:\n\n${appCode}`,
          systemInstruction,
          responseFormat: 'json',
          responseSchema: ACCESSIBILITY_AUDIT_SCHEMA,
          debugCategory: 'accessibility',
        },
        currentModel
      );

      let report: AccessibilityReport;
      try {
        const parsed = JSON.parse(response.text || '{}');
        // Normalize the response to match our expected format
        report = {
          score: typeof parsed.score === 'number' ? parsed.score : 0,
          issues: Array.isArray(parsed.issues)
            ? parsed.issues.map((issue: RawAccessibilityIssue | string) => ({
                type:
                  typeof issue === 'object' && (issue.type === 'error' || issue.type === 'warning')
                    ? issue.type
                    : 'warning',
                message:
                  typeof issue === 'object' && typeof issue.message === 'string'
                    ? issue.message
                    : typeof issue === 'string'
                      ? issue
                      : JSON.stringify(issue),
              }))
            : [],
        };
      } catch {
        report = { score: 0, issues: [{ type: 'error', message: 'Failed to parse audit response.' }] };
      }

      setAccessibilityReport(report);

      debugLog.response('accessibility', {
        id: requestId,
        model: currentModel,
        duration: Date.now() - startTime,
        response: JSON.stringify(report),
        metadata: { score: report.score, issueCount: report.issues?.length },
      });
    } catch (e) {
      setAccessibilityReport({
        score: 0,
        issues: [
          {
            type: 'error',
            message: 'Failed to run audit: ' + (e instanceof Error ? e.message : 'Unknown error'),
          },
        ],
      });
      debugLog.error('accessibility', e instanceof Error ? e.message : 'Audit failed', {
        id: requestId,
        duration: Date.now() - startTime,
      });
    } finally {
      setIsAuditing(false);
    }
  }, [appCode, selectedModel]);

  /**
   * Fix accessibility issues using AI
   */
  const fixAccessibilityIssues = useCallback(async () => {
    if (!appCode || !accessibilityReport) return;
    setIsFixingAccessibility(true);
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const response = await manager.generate(
        {
          prompt: `Fix the following accessibility issues in this React code.

Issues to fix:
${accessibilityReport.issues.map((issue, i) => `${i + 1}. [${issue.type.toUpperCase()}] ${issue.message}`).join('\n')}

Original Code:
${appCode}`,
          systemInstruction:
            'You are an accessibility expert. Apply the necessary fixes to resolve all listed accessibility issues. Return ONLY the complete fixed code without any markdown formatting or explanations.',
        },
        currentModel
      );

      const fixedCode = cleanGeneratedCode(response.text || '');
      reviewChange('Fixed Accessibility Issues', { ...files, 'src/App.tsx': fixedCode });
      setAccessibilityReport({ score: 100, issues: [] });
      setTimeout(() => setShowAccessReport(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsFixingAccessibility(false);
    }
  }, [appCode, accessibilityReport, files, selectedModel, reviewChange]);

  /**
   * Fix responsiveness issues using AI
   */
  const fixResponsiveness = useCallback(async () => {
    if (!appCode) return;
    setIsFixingResponsiveness(true);
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const response = await manager.generate(
        {
          prompt: `Optimize this React component for mobile devices.\n\nCode: ${appCode}\n\nOutput ONLY the full updated code.`,
          systemInstruction:
            'You are an expert React developer. Return only valid React/TypeScript code without any markdown formatting.',
        },
        currentModel
      );
      const fixedCode = cleanGeneratedCode(response.text || '');
      reviewChange('Fixed Responsiveness', { ...files, 'src/App.tsx': fixedCode });
    } catch (e) {
      console.error(e);
    } finally {
      setIsFixingResponsiveness(false);
    }
  }, [appCode, files, selectedModel, reviewChange]);

  /**
   * Generate database schema from app code
   */
  const generateDatabaseSchema = useCallback(async () => {
    if (!appCode) return;
    setIsGeneratingDB(true);
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const response = await manager.generate(
        {
          prompt: `Based on this React App, generate a SQL schema for SQLite.\nCode: ${appCode}\nOutput ONLY SQL.`,
          systemInstruction:
            'You are a database expert. Generate only valid SQL code without any markdown formatting.',
        },
        currentModel
      );
      const sql = cleanGeneratedCode(response.text || '');
      setFiles({ ...files, 'db/schema.sql': sql });
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingDB(false);
    }
  }, [appCode, files, selectedModel, setFiles]);

  return {
    // Accessibility
    accessibilityReport,
    isAuditing,
    isFixingAccessibility,
    showAccessReport,
    setShowAccessReport,
    runAccessibilityAudit,
    fixAccessibilityIssues,

    // Responsiveness
    isFixingResponsiveness,
    fixResponsiveness,

    // Database
    isGeneratingDB,
    generateDatabaseSchema,
  };
}
