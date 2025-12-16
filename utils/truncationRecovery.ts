/**
 * Truncation Recovery Utilities
 *
 * Handles recovery of files from truncated AI responses.
 * Extracted from useCodeGeneration for better maintainability.
 */

import { FileSystem } from '@/types';
import { GenerationMeta } from './cleanCode';
import { extractFilesFromTruncatedResponse } from './extractPartialFiles';

export interface FilePlan {
  create: string[];
  delete: string[];
  total: number;
  completed?: string[];
}

export interface RecoveryResult {
  /** Type of recovery action to take */
  action: 'none' | 'continuation' | 'success' | 'partial';
  /** Files that were successfully recovered */
  recoveredFiles?: Record<string, string>;
  /** Files that need to be regenerated */
  filesToRegenerate?: string[];
  /** Files that are confirmed complete */
  goodFiles?: Record<string, string>;
  /** Generation metadata for continuation */
  generationMeta?: GenerationMeta;
  /** Explanation message */
  message?: string;
  /** Count of recovered files */
  recoveredCount?: number;
}

/**
 * Analyze truncated response and determine recovery action
 */
export function analyzeTruncatedResponse(
  fullText: string,
  currentFiles: FileSystem,
  filePlan: FilePlan | null
): RecoveryResult {
  // Too short to recover anything meaningful
  if (fullText.length < 1000) {
    return { action: 'none' };
  }

  const extraction = extractFilesFromTruncatedResponse(fullText, currentFiles);
  const completeCount = Object.keys(extraction.completeFiles).length;
  const partialCount = Object.keys(extraction.partialFiles).length;

  if (completeCount === 0 && partialCount === 0) {
    return { action: 'none' };
  }

  const recoveredFileNames = Object.keys(extraction.completeFiles);

  // Check if we have a plan and there are missing files
  if (filePlan && filePlan.create.length > 0) {
    const missingFromPlan = filePlan.create.filter(
      (f) => !recoveredFileNames.includes(f)
    );

    if (missingFromPlan.length > 0) {
      const genMeta: GenerationMeta = {
        totalFilesPlanned: filePlan.total,
        filesInThisBatch: recoveredFileNames,
        completedFiles: recoveredFileNames,
        remainingFiles: missingFromPlan,
        currentBatch: 1,
        totalBatches: Math.ceil(filePlan.total / 5),
        isComplete: false,
      };

      return {
        action: 'continuation',
        recoveredFiles: extraction.completeFiles,
        generationMeta: genMeta,
        recoveredCount: completeCount,
        message: `Generating... ${completeCount}/${filePlan.total} files`,
      };
    }
  }

  // Check if all plan files are recovered
  if (filePlan && partialCount === 0) {
    const planFileNames = filePlan.create.map((f) => f.split('/').pop());
    const recoveredNames = recoveredFileNames.map((f) => f.split('/').pop());
    const allPlanFilesRecovered = planFileNames.every((name) => recoveredNames.includes(name));

    if (allPlanFilesRecovered) {
      return {
        action: 'success',
        recoveredFiles: extraction.completeFiles,
        recoveredCount: completeCount,
        message: `Generated ${completeCount} files!`,
      };
    }
  }

  // Check for suspicious truncation
  const suspiciousTruncation = checkSuspiciousTruncation(
    extraction.completeFiles,
    partialCount,
    filePlan,
    recoveredFileNames
  );

  if (suspiciousTruncation && filePlan && filePlan.create.length > 0) {
    const { truncatedFiles, goodFiles } = identifyTruncatedFiles(
      extraction.completeFiles,
      filePlan
    );

    return {
      action: 'continuation',
      recoveredFiles: extraction.completeFiles,
      filesToRegenerate: truncatedFiles,
      goodFiles,
      recoveredCount: Object.keys(goodFiles).length,
      message: `Generating... ${Object.keys(goodFiles).length}/${filePlan.total} files`,
    };
  }

  // All files look complete
  if (completeCount > 0) {
    return {
      action: 'success',
      recoveredFiles: extraction.completeFiles,
      recoveredCount: completeCount,
      message: `Generated ${completeCount} files!`,
    };
  }

  // Try to use partial files
  if (partialCount > 0) {
    const fixedPartialFiles = fixPartialFiles(extraction.partialFiles);

    if (Object.keys(fixedPartialFiles).length > 0) {
      return {
        action: 'partial',
        recoveredFiles: fixedPartialFiles,
        recoveredCount: Object.keys(fixedPartialFiles).length,
        message: `Recovered ${Object.keys(fixedPartialFiles).length} partial files`,
      };
    }
  }

  return { action: 'none' };
}

/**
 * Emergency extraction from code blocks when JSON parsing fails
 */
export function emergencyCodeBlockExtraction(
  fullText: string
): Record<string, string> | null {
  if (fullText.length < 5000) return null;

  const codeMatches = fullText.match(
    /```(?:tsx?|jsx?|typescript|javascript|js|ts)\s*\n([\s\S]*?)\n```/g
  );

  if (!codeMatches || codeMatches.length === 0) return null;

  const emergencyFiles: Record<string, string> = {};
  let fileIndex = 1;

  for (const match of codeMatches) {
    const codeContent = match
      .replace(/```(?:tsx?|jsx?|typescript|javascript|js|ts)\s*\n?/, '')
      .replace(/```$/, '')
      .trim();

    if (codeContent.length > 200) {
      emergencyFiles[`recovered${fileIndex}.tsx`] = codeContent;
      fileIndex++;
    }
  }

  return Object.keys(emergencyFiles).length > 0 ? emergencyFiles : null;
}

/**
 * Check if files have suspicious truncation patterns
 */
function checkSuspiciousTruncation(
  completeFiles: Record<string, string>,
  partialCount: number,
  filePlan: FilePlan | null,
  recoveredFileNames: string[]
): boolean {
  const shouldCheck =
    partialCount > 0 ||
    (filePlan && filePlan.create.some((f) => !recoveredFileNames.includes(f)));

  if (!shouldCheck) return false;

  return Object.entries(completeFiles).some(([path, content]) => {
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    const hasIncompleteEscape = /\\$/.test(content.trim());
    const isJSXFile = path.endsWith('.tsx') || path.endsWith('.jsx');
    const hasIncompleteJSX = isJSXFile && !content.trim().endsWith('}');

    return (
      openBraces - closeBraces > 1 ||
      openParens - closeParens > 2 ||
      hasIncompleteEscape ||
      hasIncompleteJSX
    );
  });
}

/**
 * Identify which files are truncated and which are good
 */
function identifyTruncatedFiles(
  completeFiles: Record<string, string>,
  filePlan: FilePlan
): { truncatedFiles: string[]; goodFiles: Record<string, string> } {
  const truncatedFiles = Object.entries(completeFiles)
    .filter(([path, content]) => {
      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;
      const isJSXFile = path.endsWith('.tsx') || path.endsWith('.jsx');
      const hasIncompleteJSX = isJSXFile && !content.trim().endsWith('}');
      return openBraces - closeBraces > 1 || hasIncompleteJSX || /\\$/.test(content.trim());
    })
    .map(([path]) => path);

  const filesToRegenerate =
    truncatedFiles.length > 0
      ? truncatedFiles
      : [filePlan.create[filePlan.create.length - 1]];

  const goodFiles = Object.fromEntries(
    Object.entries(completeFiles).filter(
      ([path]) => !filesToRegenerate.includes(path)
    )
  );

  return { truncatedFiles: filesToRegenerate, goodFiles };
}

/**
 * Attempt to fix partial files
 */
function fixPartialFiles(
  partialFiles: Record<string, string | { content: string; truncatedAt?: number }>
): Record<string, string> {
  const fixedFiles: Record<string, string> = {};

  for (const [filePath, fileData] of Object.entries(partialFiles)) {
    const content = typeof fileData === 'string' ? fileData : fileData.content;

    if (!content || content.length <= 100) continue;

    let cleaned = content
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .trim();

    cleaned = cleaned
      .replace(/,\s*$/, '')
      .replace(/[^\\]"$/, '"')
      .replace(/\{[^}]*$/, (match) => match + '\n}');

    if (cleaned.length > 100) {
      fixedFiles[filePath] = cleaned;
    }
  }

  return fixedFiles;
}
