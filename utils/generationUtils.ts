/**
 * Generation Utilities
 *
 * Pure utility functions for code generation.
 * Extracted from useCodeGeneration to improve modularity.
 */

import { FileSystem, FileChange, ChatAttachment } from '../types';
import { generateContextForPrompt } from './codemap';
import {
  BASE_GENERATION_INSTRUCTION,
  SEARCH_REPLACE_MODE_INSTRUCTION,
  STANDARD_UPDATE_INSTRUCTION,
} from '../components/ControlPanel/prompts';

/**
 * Calculate file changes between old and new file systems
 */
export function calculateFileChanges(oldFiles: FileSystem, newFiles: FileSystem): FileChange[] {
  const changes: FileChange[] = [];
  const allPaths = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);

  for (const path of allPaths) {
    const oldContent = oldFiles[path];
    const newContent = newFiles[path];

    if (!oldContent && newContent) {
      changes.push({
        path,
        type: 'added',
        additions: newContent.split('\n').length,
        deletions: 0,
      });
    } else if (oldContent && !newContent) {
      changes.push({
        path,
        type: 'deleted',
        additions: 0,
        deletions: oldContent.split('\n').length,
      });
    } else if (oldContent !== newContent) {
      const oldLines = oldContent?.split('\n').length || 0;
      const newLines = newContent?.split('\n').length || 0;
      changes.push({
        path,
        type: 'modified',
        additions: Math.max(0, newLines - oldLines),
        deletions: Math.max(0, oldLines - newLines),
      });
    }
  }

  return changes;
}

/**
 * Create token usage object from API response or estimation
 */
export function createTokenUsage(
  apiUsage?: { inputTokens?: number; outputTokens?: number },
  _prompt?: string,
  response?: string,
  newFiles?: Record<string, string>
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  // Use API usage if available
  if (apiUsage?.inputTokens || apiUsage?.outputTokens) {
    const inputTokens = apiUsage.inputTokens || 0;
    const outputTokens = apiUsage.outputTokens || 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  // Estimate from response size
  const responseTokens = Math.ceil((response?.length || 0) / 4);
  const filesTokens = newFiles
    ? Math.ceil(Object.values(newFiles).join('').length / 4)
    : 0;

  return {
    inputTokens: 0,
    outputTokens: responseTokens || filesTokens,
    totalTokens: responseTokens || filesTokens,
  };
}

/**
 * Build system instruction for code generation
 */
export function buildSystemInstruction(
  existingApp: boolean,
  hasBrand: boolean,
  isEducationMode: boolean,
  diffModeEnabled: boolean,
  techStackInstruction: string
): string {
  let systemInstruction = BASE_GENERATION_INSTRUCTION;

  if (hasBrand) {
    systemInstruction += `\n\n**BRANDING**: Extract the PRIMARY DOMINANT COLOR from the brand logo and use it for primary actions/accents.`;
  }

  if (isEducationMode) {
    systemInstruction += `\n\n**EDUCATION MODE**: Add detailed inline comments explaining complex Tailwind classes and React hooks.`;
  }

  // Add technology stack instructions
  systemInstruction += techStackInstruction;

  // Add update mode instructions
  if (existingApp) {
    if (diffModeEnabled) {
      systemInstruction += SEARCH_REPLACE_MODE_INSTRUCTION;
    } else {
      systemInstruction += STANDARD_UPDATE_INSTRUCTION;
    }
  }

  return systemInstruction;
}

/**
 * Build prompt parts for generation request
 */
export function buildPromptParts(
  userPrompt: string,
  attachments: ChatAttachment[],
  files: FileSystem,
  existingApp: boolean
): { promptParts: string[]; images: { data: string; mimeType: string }[] } {
  const promptParts: string[] = [];
  const images: { data: string; mimeType: string }[] = [];

  const sketchAtt = attachments.find((a) => a.type === 'sketch');
  const brandAtt = attachments.find((a) => a.type === 'brand');

  if (sketchAtt) {
    const base64Data = sketchAtt.preview.split(',')[1];
    promptParts.push('SKETCH/WIREFRAME: [attached image]');
    images.push({ data: base64Data, mimeType: sketchAtt.file.type });
  }

  if (brandAtt) {
    const base64Data = brandAtt.preview.split(',')[1];
    promptParts.push('BRAND LOGO: [attached image]');
    images.push({ data: base64Data, mimeType: brandAtt.file.type });
  }

  if (existingApp) {
    // Generate codemap for better context understanding
    const codeContext = generateContextForPrompt(files);

    // For efficiency, only send file summaries, not full content
    const fileSummaries = Object.entries(files).map(([path, content]) => {
      const contentStr = typeof content === 'string' ? content : String(content);
      return {
        path,
        preview: contentStr.length > 200 ? contentStr.substring(0, 200) + '...' : contentStr,
        size: contentStr.length,
        lines: contentStr.split('\n').length,
      };
    });

    promptParts.push(
      `${codeContext}\n\n### Current Files Summary\n\`\`\`json\n${JSON.stringify(fileSummaries, null, 2)}\n\`\`\``
    );
    promptParts.push(`USER REQUEST: ${userPrompt || 'Refine the app based on the attached images.'}`);
  } else {
    promptParts.push(
      `TASK: Create a React app from this design. ${userPrompt ? `Additional context: ${userPrompt}` : ''}`
    );
  }

  return { promptParts, images };
}
