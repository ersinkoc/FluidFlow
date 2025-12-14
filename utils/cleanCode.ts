import { applyPatch } from 'diff';
import type { DiffFileChange, DiffModeResponse, FileSystem } from '../types';

// Paths that should never be included in virtual file system
const IGNORED_PATHS = ['.git', 'node_modules', '.next', '.nuxt', 'dist', 'build', '.cache', '.DS_Store', 'Thumbs.db'];

/**
 * Checks if a file path should be ignored (e.g., .git, node_modules)
 */
export function isIgnoredFilePath(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return IGNORED_PATHS.some(ignored =>
    normalizedPath === ignored ||
    normalizedPath.startsWith(ignored + '/') ||
    normalizedPath.includes('/' + ignored + '/') ||
    normalizedPath.includes('/' + ignored)
  );
}

/**
 * Cleans AI-generated code by removing markdown artifacts and code block markers
 */
export function cleanGeneratedCode(code: string): string {
  if (!code) return '';

  let cleaned = code;

  // Remove code block markers with various language tags
  const codeBlockPatterns = [
    /^```(?:javascript|typescript|tsx|jsx|ts|js|react|html|css|json|sql|markdown|md|plaintext|text|sh|bash|shell)?\s*\n?/gim,
    /\n?```\s*$/gim,
    /^```\s*\n?/gim,
  ];

  codeBlockPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  // Remove leading language identifier on first line (e.g., "javascript" or "typescript" alone)
  cleaned = cleaned.replace(/^(javascript|typescript|tsx|jsx|ts|js|react)\s*\n/i, '');

  // Remove any remaining triple backticks
  cleaned = cleaned.replace(/```/g, '');

  // Trim whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Strips PLAN comment from AI response if present.
 * PLAN comments have format: // PLAN: {"create":[...],"update":[...],"delete":[],"total":N}
 * This should be called before JSON.parse on any AI response that might contain PLAN.
 */
export function stripPlanComment(response: string): string {
  if (!response) return '';

  // Trim leading whitespace and invisible characters
  let cleaned = response.trimStart();
  cleaned = cleaned.replace(/^[\uFEFF\u200B-\u200D\u00A0]+/, '');

  // Check for PLAN comment
  const planIndex = cleaned.indexOf('// PLAN:');
  if (planIndex === -1) return cleaned;

  // Only process if PLAN is at start or preceded only by whitespace
  if (planIndex !== 0 && !/^[\s]*$/.test(cleaned.slice(0, planIndex))) {
    return cleaned;
  }

  // Find the PLAN JSON's opening brace
  const firstBrace = cleaned.indexOf('{', planIndex);
  if (firstBrace === -1 || firstBrace <= planIndex) return cleaned;

  // Use brace counting to find where PLAN JSON ends
  let braceCount = 0;
  let planEnd = firstBrace;

  for (let i = firstBrace; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '{') braceCount++;
    else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        planEnd = i + 1;
        break;
      }
    }
  }

  // Remove PLAN comment and return the rest
  return cleaned.substring(planEnd).trimStart();
}

/**
 * Safely parses JSON from AI response, handling PLAN comments and other artifacts.
 * Returns null if parsing fails instead of throwing.
 */
export function safeParseAIResponse<T = unknown>(response: string): T | null {
  if (!response) return null;

  try {
    // Strip PLAN comment first
    let cleaned = stripPlanComment(response);

    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trimStart();
      cleaned = cleaned.replace(/^[\uFEFF\u200B-\u200D\u00A0]+/, '');
    }

    // Find JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }

    return null;
  } catch (e) {
    console.debug('[safeParseAIResponse] Parse failed:', e);
    return null;
  }
}

/**
 * Attempts to repair truncated JSON from AI responses
 * Returns the repaired JSON string or throws a descriptive error
 */
// Maximum JSON size for repair operations (configurable via constant)
const MAX_JSON_REPAIR_SIZE = 500000; // 500KB - increased from 50KB to handle larger AI responses

export function repairTruncatedJson(jsonStr: string): string {
  const json = jsonStr.trim();

  // Prevent recursion by limiting input size
  if (json.length > MAX_JSON_REPAIR_SIZE) {
    throw new Error(`JSON too large to repair safely (${Math.round(json.length / 1000)}KB exceeds ${Math.round(MAX_JSON_REPAIR_SIZE / 1000)}KB limit)`);
  }

  // Count open/close braces and brackets
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
      else if (char === '[') bracketCount++;
      else if (char === ']') bracketCount--;
    }
  }

  // If balanced, return as-is
  if (braceCount === 0 && bracketCount === 0 && !inString) {
    return json;
  }

  console.log(`[JSON Repair] Unbalanced: braces=${braceCount}, brackets=${bracketCount}, inString=${inString}`);

  // Try to repair truncated JSON
  let repaired = json;

  // If we're in the middle of a string, try to close it
  if (inString) {
    // Find the last quote and truncate any partial content after it
    // Or close the string if it seems to be the value
    repaired += '"';
    inString = false;
  }

  // Remove trailing partial content (incomplete key or value)
  // Look for the last complete value
  const patterns = [
    // Remove trailing comma and whitespace
    /,\s*$/,
    // Remove incomplete key (": after key name without value)
    /,?\s*"[^"]*"\s*:\s*$/,
    // Remove partial string value
    /,?\s*"[^"]*"\s*:\s*"[^"]*$/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(repaired)) {
      repaired = repaired.replace(pattern, '');
      break;
    }
  }

  // Close remaining brackets and braces in correct order (JSON-001 fix)
  // Track opening order with a stack to close in reverse order
  const openStack: string[] = [];
  inString = false;
  escapeNext = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\' && inString) { escapeNext = true; continue; }
    if (char === '"' && !escapeNext) { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') openStack.push('{');
      else if (char === '[') openStack.push('[');
      else if (char === '}') {
        // Pop matching brace, or ignore if mismatched
        if (openStack.length > 0 && openStack[openStack.length - 1] === '{') {
          openStack.pop();
        }
      } else if (char === ']') {
        // Pop matching bracket, or ignore if mismatched
        if (openStack.length > 0 && openStack[openStack.length - 1] === '[') {
          openStack.pop();
        }
      }
    }
  }

  // Close remaining open containers in reverse order (LIFO)
  // BUG-004 fix: Add explicit undefined check for type safety
  while (openStack.length > 0) {
    const open = openStack.pop();
    if (open === '{') {
      repaired += '}';
    } else if (open === '[') {
      repaired += ']';
    }
    // Skip if undefined (shouldn't happen but defensive)
  }

  return repaired;
}

/**
 * Generation metadata for smart continuation
 */
export interface GenerationMeta {
  totalFilesPlanned: number;
  filesInThisBatch: string[];
  completedFiles: string[];
  remainingFiles: string[];
  currentBatch: number;
  totalBatches: number;
  isComplete: boolean;
}

/**
 * Parses AI response that might contain multiple files in JSON format
 * Includes enhanced repair for truncated responses
 * Supports generationMeta for smart continuation
 */
export function parseMultiFileResponse(response: string, noThrow: boolean = false): {
  files: Record<string, string>;
  explanation?: string;
  truncated?: boolean;
  deletedFiles?: string[];
  fileChanges?: Record<string, string>;
  generationMeta?: GenerationMeta;
  continuation?: {
    prompt: string;
    remainingFiles: string[];
    currentBatch: number;
    totalBatches: number;
  };
} | null {
  try {
    // Prevent recursion by limiting response size
    if (response.length > 100000) {
      console.warn('[parseMultiFileResponse] Response too large, potential recursion:', response.length);
      if (noThrow) return null;
      throw new Error(`Response too large (${Math.round(response.length/1000)}KB). This may indicate infinite recursion.`);
    }

    // First, try to extract JSON from markdown code blocks
    const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    let jsonString = codeBlockMatch ? codeBlockMatch[1] : response;

    // Trim leading whitespace/newlines (common in AI responses)
    // Use trimStart() which handles more Unicode whitespace than regex
    jsonString = jsonString.trimStart();
    // Also strip BOM and other invisible characters
    jsonString = jsonString.replace(/^[\uFEFF\u200B-\u200D\u00A0]+/, '');

    // Remove PLAN comment if present (it has its own JSON that would confuse parsing)
    // Format: // PLAN: {"create":[...],"update":[...],"delete":[],"total":N}
    // Strategy: Find the PLAN line, use brace counting to find where its JSON ends
    // Also handle case where PLAN might appear after some whitespace on the first line
    const planIndex = jsonString.indexOf('// PLAN:');
    const hasPlanComment = planIndex !== -1 && (planIndex === 0 || /^[\s]*$/.test(jsonString.slice(0, planIndex)));
    if (hasPlanComment) {
      // Start from the PLAN comment position
      const planStart = planIndex;
      // Find where the PLAN JSON starts (first { after the PLAN: prefix, not from string start)
      const firstBrace = jsonString.indexOf('{', planStart);
      if (firstBrace !== -1 && firstBrace > planStart) {
        // Use brace counting to find where the PLAN JSON ends
        let braceCount = 0;
        let planEnd = firstBrace;

        for (let i = firstBrace; i < jsonString.length; i++) {
          const char = jsonString[i];
          if (char === '{') braceCount++;
          else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              planEnd = i + 1;
              break;
            }
          }
        }

        // Remove everything from start to planEnd (including any trailing whitespace/newlines)
        const afterPlan = jsonString.substring(planEnd).trimStart();
        console.log('[parseMultiFileResponse] Removed PLAN comment, remaining:', afterPlan.slice(0, 100) + '...');
        jsonString = afterPlan;
      }
    }

    // Try to find JSON object in the string - be more greedy to capture full JSON
    const jsonMatch = jsonString.match(/\{[\s\S]*$/);
    if (jsonMatch) {
      let jsonToParse = jsonMatch[0];

      // Check if JSON ends abruptly (common with truncation)
      const trimmed = jsonToParse.trim();
      // Count braces to see if we're missing closing ones
      let openBraces = 0;
      let closeBraces = 0;
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (char === '\\' && inString) {
          escapeNext = true;
          continue;
        }
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '{') openBraces++;
          else if (char === '}') closeBraces++;
        }
      }

      // If we have more opening than closing braces, add the missing ones
      if (openBraces > closeBraces) {
        const missingBraces = openBraces - closeBraces;
        for (let i = 0; i < missingBraces; i++) {
          jsonToParse += '}';
        }
        console.log(`[parseMultiFileResponse] Added ${missingBraces} closing brace(s) to repair JSON`);
      }
      let wasTruncated = false;

      // Try direct parse first
      let parsed;
      try {
        parsed = JSON.parse(jsonToParse);
      } catch (_parseError) {
        // Try to repair truncated JSON
        console.log('[parseMultiFileResponse] Direct parse failed, attempting repair...');
        wasTruncated = true;

        try {
          const repaired = repairTruncatedJson(jsonToParse);
          parsed = JSON.parse(repaired);
          console.log('[parseMultiFileResponse] Repair successful');
        } catch (_repairError) {
          // Last resort: try to extract just the files object
          const filesMatch = jsonString.match(/"files"\s*:\s*\{([\s\S]*)/);
          if (filesMatch) {
            try {
              const filesJson = '{' + filesMatch[1];
              const repairedFiles = repairTruncatedJson(filesJson);
              const filesObj = JSON.parse(repairedFiles);
              parsed = { files: filesObj, explanation: 'Response was truncated - showing partial results.' };
              console.log('[parseMultiFileResponse] Extracted partial files object');
            } catch {
              // Try one more aggressive repair approach
              try {
                // Find the last complete file entry
                const fileMatches = jsonToParse.match(/"([^"]+\.(?:tsx?|jsx?|css|json))":\s*`([^`]*)`/gs);
                if (fileMatches && fileMatches.length > 0) {
                  const partialFiles: Record<string, string> = {};
                  fileMatches.forEach(match => {
                    const fileMatch = match.match(/"([^"]+\.(?:tsx?|jsx?|css|json))":\s*`([^`]*)`/);
                    if (fileMatch) {
                      partialFiles[fileMatch[1]] = fileMatch[2];
                    }
                  });
                  if (Object.keys(partialFiles).length > 0) {
                    parsed = {
                      files: partialFiles,
                      explanation: 'Response was severely truncated - recovered ' + Object.keys(partialFiles).length + ' files.'
                    };
                    console.log('[parseMultiFileResponse] Recovered partial files using regex');
                    return parsed;
                  }
                }
              } catch (_e) {
                // Final attempt: try to salvage any valid file content
                try {
                  // Look for files in quotes with content in backticks
                  const simpleFilePattern = /"([^"]+\.(?:tsx?|jsx?|css|json))":\s*"([^"]*(?:\\.[^"]*)*?)"/g;
                  const matches = [...jsonToParse.matchAll(simpleFilePattern)];

                  if (matches && matches.length > 0) {
                    const partialFiles: Record<string, string> = {};
                    matches.forEach(([_fullMatch, filePath, fileContent]) => {
                      // Clean up escaped quotes and newlines
                      const cleanedContent = fileContent
                        .replace(/\\'/g, "'")
                        .replace(/\\"/g, '"')
                        .replace(/\\n/g, '\n')
                        .trim();
                      partialFiles[filePath] = cleanedContent;
                    });

                    if (Object.keys(partialFiles).length > 0) {
                      parsed = {
                        files: partialFiles,
                        explanation: 'Response was severely truncated - recovered ' + Object.keys(partialFiles).length + ' files with basic parsing.'
                      };
                      console.log('[parseMultiFileResponse] Recovered files with simple pattern matching');
                      return parsed;
                    }

                    // Enhanced string-level truncation recovery
                    console.log('[parseMultiFileResponse] Attempting enhanced string-level truncation recovery...');

                    // Look for truncated file patterns where content is cut off mid-string
                    // JSON-002 fix: Use non-backtracking pattern to prevent ReDoS
                    // Match file path, then capture content up to next file pattern or end
                    const recoveredFiles: Record<string, string> = {};

                    // Limit input size to prevent DoS (max 500KB for recovery)
                    const safeJsonToParse = jsonToParse.length > 500000 ? jsonToParse.slice(0, 500000) : jsonToParse;

                    // Use simpler pattern: match "filepath": "content" without complex lookahead
                    const filePathPattern = /"([^"]{1,200}\.(tsx?|jsx?|css|json|md|ts|js))":\s*"/g;
                    let pathMatch;

                    while ((pathMatch = filePathPattern.exec(safeJsonToParse)) !== null) {
                      const filePath = pathMatch[1];
                      const contentStart = pathMatch.index + pathMatch[0].length;

                      // Find content end by looking for next unescaped quote followed by comma/brace or end
                      let contentEnd = contentStart;
                      let inEscape = false;
                      for (let i = contentStart; i < Math.min(safeJsonToParse.length, contentStart + 100000); i++) {
                        const char = safeJsonToParse[i];
                        if (inEscape) {
                          inEscape = false;
                          continue;
                        }
                        if (char === '\\') {
                          inEscape = true;
                          continue;
                        }
                        if (char === '"') {
                          contentEnd = i;
                          break;
                        }
                      }

                      if (contentEnd > contentStart) {
                        const content = safeJsonToParse.slice(contentStart, contentEnd);
                        if (content.length >= 50) {
                          recoveredFiles[filePath] = content;
                        }
                      }
                    }

                    // Process and clean recovered files
                    for (const filePath of Object.keys(recoveredFiles)) {
                      let content = recoveredFiles[filePath];

                      // Remove trailing ellipsis or incomplete patterns
                      content = content
                        .replace(/\.\.\.$/, '')
                        .replace(/```$/, '')
                        .replace(/className=\\"[^"]*$/, 'className=""');

                      // Clean up escaped content (JSON escapes)
                      content = content
                        .replace(/\\n/g, '\n')
                        .replace(/\\t/g, '\t')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\')
                        .trim();

                      // Only keep if it looks like valid code
                      if (isValidCode(content)) {
                        console.log(`[parseMultiFileResponse] Recovered file: ${filePath} (${content.length} chars)`);
                        recoveredFiles[filePath] = content;
                      } else {
                        delete recoveredFiles[filePath];
                      }
                    }

                    // Last resort: Look for code blocks without JSON structure
                    if (Object.keys(recoveredFiles).length === 0) {
                      const codeBlockPattern = /```(?:tsx?|jsx?|typescript|javascript)\s*\n([\s\S]*?)\n```/g;
                      let codeMatch;
                      let fileIndex = 1;

                      while ((codeMatch = codeBlockPattern.exec(jsonToParse)) !== null) {
                        const content = codeMatch[1].trim();
                        if (content.length > 50 && isValidCode(content)) {
                          const inferredFileName = content.includes('export default') || content.includes('React')
                            ? `component${fileIndex}.tsx`
                            : content.includes('export')
                            ? `module${fileIndex}.ts`
                            : `utils${fileIndex}.js`;

                          console.log(`[parseMultiFileResponse] Last resort recovery: ${inferredFileName}`);
                          recoveredFiles[inferredFileName] = content;
                          fileIndex++;
                        }
                      }
                    }

                    if (Object.keys(recoveredFiles).length > 0) {
                      parsed = {
                        files: recoveredFiles,
                        explanation: 'Enhanced recovery from string-level truncation - recovered ' + Object.keys(recoveredFiles).length + ' files.'
                      };
                      console.log('[parseMultiFileResponse] Enhanced recovery successful');
                      return parsed;
                    }
                  }
                } catch (_e) {
                  // Final attempt failed
                }
              }

              if (!noThrow) {
                throw new Error('Response was truncated and could not be repaired. The model may have hit token limits. Try a shorter prompt or different model.');
              }
              return null;
            }
          } else {
            if (!noThrow) {
                throw new Error('Response was truncated and could not be repaired. The model may have hit token limits. Try a shorter prompt or different model.');
              }
              return null;
          }
        }
      }

      // Validate that parsed is an object
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }

      // Extract explanation if present
      const explanation = parsed.explanation || parsed.description;

      // Get the files - could be in "files", "Changes", "fileChanges" key or at root level
      let filesObj = parsed.files || parsed.fileChanges || parsed.Changes || parsed.changes || parsed;
      if (filesObj.explanation) delete filesObj.explanation;
      if (filesObj.description) delete filesObj.description;

      // If no file-like keys found, check if filesObj itself is a file (single file response)
      const hasFileKeys = Object.keys(filesObj).some(k =>
        k.includes('.') || k.includes('/') // Has extension or path separator
      );

      // If filesObj doesn't look like a collection of files, but parsed does, check root level
      if (!hasFileKeys && typeof parsed === 'object') {
        const rootFileKeys = Object.keys(parsed).filter(k =>
          k.includes('.') || k.includes('/') // Has extension or path separator
        );
        if (rootFileKeys.length > 0) {
          filesObj = parsed;
        }
      }

      const fileKeys = Object.keys(filesObj).filter(k =>
        k.includes('.') || k.includes('/') // Has extension or path separator
      );

      if (fileKeys.length === 0) {
        throw new Error('Model returned no code files. Try a model better suited for code generation.');
      }

      // Clean each file's content
      const cleaned: Record<string, string> = {};
      const skippedFiles: { path: string; reason: string }[] = [];

      for (const [path, content] of Object.entries(filesObj)) {
        // Skip non-file keys
        if (!path.includes('.') && !path.includes('/')) {
          continue;
        }

        // Skip malformed file paths (e.g., "src/components/.tsx")
        if (path.includes('/.') || path.endsWith('/') || !path.match(/\.[a-z]+$/i)) {
          console.warn('[parseMultiFileResponse] Malformed file path:', path);
          skippedFiles.push({ path, reason: 'malformed path' });
          continue;
        }

        // Skip ignored paths like .git, node_modules
        if (isIgnoredFilePath(path)) {
          console.log('[parseMultiFileResponse] Skipping ignored path:', path);
          continue;
        }

        // Check content type - handle various formats AI might return
        let contentStr: string;

        if (typeof content === 'string') {
          contentStr = content;
        } else if (typeof content === 'object' && content !== null) {
          // AI might return { content: "...", type: "tsx" } or { diff: "...", isNew: true } format
          const contentObj = content as Record<string, unknown>;
          if ('content' in contentObj && typeof contentObj.content === 'string') {
            contentStr = contentObj.content;
            console.log('[parseMultiFileResponse] Extracted content from object for:', path);
          } else if ('code' in contentObj && typeof contentObj.code === 'string') {
            contentStr = contentObj.code;
            console.log('[parseMultiFileResponse] Extracted code from object for:', path);
          } else if ('diff' in contentObj && typeof contentObj.diff === 'string') {
            // Support diff mode format as fallback (for when isNew: true means full content)
            contentStr = contentObj.diff;
            console.log('[parseMultiFileResponse] Extracted diff from object for:', path);
          } else {
            console.warn('[parseMultiFileResponse] Object content without string content for:', path, '- keys:', Object.keys(content));
            skippedFiles.push({ path, reason: `object without content (keys: ${Object.keys(content).join(', ')})` });
            continue;
          }
        } else {
          console.warn('[parseMultiFileResponse] Invalid content type for:', path, '- type:', typeof content, '- value:', content);
          skippedFiles.push({ path, reason: `invalid content type (${typeof content})` });
          continue;
        }

        // Clean the content
        const cleanedContent = cleanGeneratedCode(contentStr);

        // Validate cleaned content
        if (!cleanedContent || cleanedContent.length < 10) {
          console.warn('[parseMultiFileResponse] Empty/too short content for:', path, '- length:', cleanedContent.length, '- content:', cleanedContent);
          skippedFiles.push({ path, reason: `empty content (${cleanedContent.length} chars)` });
          continue;
        }

        // Check for obviously invalid content (just file extension, etc.)
        if (/^(tsx|jsx|ts|js|css|json|md|html);?$/i.test(cleanedContent.trim())) {
          console.warn('[parseMultiFileResponse] Invalid content (just extension):', path, '- content:', cleanedContent);
          skippedFiles.push({ path, reason: 'content is just file extension' });
          continue;
        }

        cleaned[path] = cleanedContent;
      }

      // Log results
      if (skippedFiles.length > 0) {
        console.warn('[parseMultiFileResponse] Skipped files:', skippedFiles);
      }
      console.log('[parseMultiFileResponse] Valid files:', Object.keys(cleaned));

      // Return null if no valid file entries found
      if (Object.keys(cleaned).length === 0) {
        return null;
      }

      // Extract generationMeta if present (new smart continuation format)
      let generationMeta: GenerationMeta | undefined;
      if (parsed.generationMeta) {
        generationMeta = {
          totalFilesPlanned: parsed.generationMeta.totalFilesPlanned || 0,
          filesInThisBatch: parsed.generationMeta.filesInThisBatch || [],
          completedFiles: parsed.generationMeta.completedFiles || [],
          remainingFiles: parsed.generationMeta.remainingFiles || [],
          currentBatch: parsed.generationMeta.currentBatch || 1,
          totalBatches: parsed.generationMeta.totalBatches || 1,
          isComplete: parsed.generationMeta.isComplete ?? true
        };
        console.log('[parseMultiFileResponse] GenerationMeta detected:', {
          batch: `${generationMeta.currentBatch}/${generationMeta.totalBatches}`,
          completed: generationMeta.completedFiles.length,
          remaining: generationMeta.remainingFiles.length,
          isComplete: generationMeta.isComplete
        });
      }

      // Convert old continuation format to generationMeta if present
      if (!generationMeta && parsed.continuation) {
        generationMeta = {
          totalFilesPlanned: (parsed.continuation.remainingFiles?.length || 0) + Object.keys(cleaned).length,
          filesInThisBatch: Object.keys(cleaned),
          completedFiles: Object.keys(cleaned),
          remainingFiles: parsed.continuation.remainingFiles || [],
          currentBatch: parsed.continuation.currentBatch || 1,
          totalBatches: parsed.continuation.totalBatches || 1,
          isComplete: !parsed.continuation.remainingFiles?.length
        };
        console.log('[parseMultiFileResponse] Converted old continuation to generationMeta');
      }

      return {
        files: cleaned,
        explanation: typeof explanation === 'string' ? explanation : undefined,
        truncated: wasTruncated,
        deletedFiles: parsed.deletedFiles,
        fileChanges: parsed.fileChanges,
        generationMeta,
        continuation: parsed.continuation
      };
    }

    // No JSON found in response
    throw new Error('No valid JSON found in response. The model may not support structured code generation.');
  } catch (e) {
    // Re-throw with better error message
    if (e instanceof Error) {
      throw e;
    }
    throw new Error('Failed to parse model response. Try a different model.');
  }
}

/**
 * Validates that the cleaned code looks like valid code
 */
export function isValidCode(code: string): boolean {
  if (!code || code.length < 10) return false;

  // Check for common code patterns
  const hasImport = /import\s+/.test(code);
  const hasExport = /export\s+/.test(code);
  const hasFunction = /function\s+|const\s+\w+\s*=|=>\s*{/.test(code);
  const hasJSX = /<\w+/.test(code);
  const hasClass = /class\s+\w+/.test(code);

  return hasImport || hasExport || hasFunction || hasJSX || hasClass;
}

// ============================================================================
// DIFF MODE (BETA) - Token-efficient updates
// ============================================================================

/**
 * Parses AI response in diff mode format.
 * Expected format:
 * {
 *   "explanation": "What changed",
 *   "changes": {
 *     "src/App.tsx": { "diff": "--- src/App.tsx\n+++ src/App.tsx\n@@ -1,3..." },
 *     "src/New.tsx": { "isNew": true, "diff": "full content here" }
 *   },
 *   "deletedFiles": ["src/old.tsx"]
 * }
 */
export function parseDiffModeResponse(response: string): DiffModeResponse | null {
  try {
    // Strip PLAN comment if present
    let cleaned = stripPlanComment(response);

    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    // Find JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[parseDiffModeResponse] No JSON found in response');
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Try to repair truncated JSON
      const repaired = repairTruncatedJson(jsonMatch[0]);
      parsed = JSON.parse(repaired);
    }

    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[parseDiffModeResponse] Invalid response structure');
      return null;
    }

    // Extract changes - support both "changes" and "files" keys
    const changes = parsed.changes || parsed.files || {};

    // Convert to DiffModeResponse format
    const result: DiffModeResponse = {
      explanation: parsed.explanation || '',
      changes: {},
      deletedFiles: parsed.deletedFiles || []
    };

    // Process each file change
    for (const [filePath, change] of Object.entries(changes)) {
      // Skip non-file keys
      if (!filePath.includes('.') && !filePath.includes('/')) continue;

      // Handle various formats AI might return
      if (typeof change === 'string') {
        // Simple string content - treat as full file (isNew)
        result.changes[filePath] = {
          diff: change,
          isNew: true
        };
      } else if (typeof change === 'object' && change !== null) {
        const changeObj = change as Record<string, unknown>;
        result.changes[filePath] = {
          diff: (changeObj.diff as string) || (changeObj.content as string) || '',
          isNew: Boolean(changeObj.isNew),
          isDeleted: Boolean(changeObj.isDeleted)
        };
      }
    }

    console.log('[parseDiffModeResponse] Parsed diff mode response:', {
      filesChanged: Object.keys(result.changes).length,
      deletedFiles: result.deletedFiles?.length || 0
    });

    return result;
  } catch (e) {
    console.error('[parseDiffModeResponse] Parse error:', e);
    return null;
  }
}

/**
 * Unescapes JSON-escaped newlines and other characters in diff content.
 * AI often returns diffs with \\n instead of actual newlines.
 */
function unescapeDiffContent(diff: string): string {
  return diff
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
}

/**
 * Checks if content looks like a unified diff format.
 */
function isUnifiedDiffFormat(content: string): boolean {
  // Must have @@ hunk markers
  if (!content.includes('@@')) return false;

  // Should have --- and/or +++ file markers, or at least +/- lines
  const hasFileMarkers = content.includes('---') || content.includes('+++');
  const hasChangeLines = /^[+-][^+-]/m.test(content);

  return hasFileMarkers || hasChangeLines;
}

/**
 * Applies a unified diff patch to the original content.
 * Returns the patched content or null if patch failed.
 */
export function applyUnifiedDiff(originalContent: string, diffPatch: string): string | null {
  try {
    // Normalize line endings
    const normalizedOriginal = originalContent.replace(/\r\n/g, '\n');

    // Unescape JSON-escaped characters (AI often returns \\n instead of \n)
    let normalizedPatch = unescapeDiffContent(diffPatch);
    normalizedPatch = normalizedPatch.replace(/\r\n/g, '\n');

    console.log('[applyUnifiedDiff] Checking diff format:', {
      hasHunkMarkers: normalizedPatch.includes('@@'),
      hasFileMarkers: normalizedPatch.includes('---') || normalizedPatch.includes('+++'),
      firstLines: normalizedPatch.split('\n').slice(0, 5).join(' | ')
    });

    // Check if this looks like a unified diff
    if (!isUnifiedDiffFormat(normalizedPatch)) {
      console.log('[applyUnifiedDiff] Content is not unified diff format, returning as full content');
      return normalizedPatch;
    }

    console.log('[applyUnifiedDiff] Applying unified diff patch...');

    // Apply the patch using the diff library
    const result = applyPatch(normalizedOriginal, normalizedPatch);

    if (result === false) {
      console.warn('[applyUnifiedDiff] Patch application failed - diff library returned false');
      // Try with fuzzFactor for more lenient matching
      const fuzzyResult = applyPatch(normalizedOriginal, normalizedPatch, { fuzzFactor: 3 });
      if (fuzzyResult !== false) {
        console.log('[applyUnifiedDiff] Patch applied with fuzz factor');
        return fuzzyResult;
      }
      return null;
    }

    console.log('[applyUnifiedDiff] Patch applied successfully');
    return result;
  } catch (e) {
    console.error('[applyUnifiedDiff] Error applying patch:', e);
    return null;
  }
}

/**
 * Merges diff changes with the current file system.
 * Returns the new file system or throws an error if merge fails.
 */
export function mergeDiffChanges(
  currentFiles: FileSystem,
  changes: Record<string, DiffFileChange>,
  deletedFiles: string[] = []
): FileSystem {
  const newFiles: FileSystem = { ...currentFiles };
  const errors: string[] = [];

  // Process deletions first
  for (const filePath of deletedFiles) {
    if (newFiles[filePath]) {
      delete newFiles[filePath];
      console.log(`[mergeDiffChanges] Deleted: ${filePath}`);
    }
  }

  // Process changes
  for (const [filePath, change] of Object.entries(changes)) {
    // Skip ignored paths
    if (isIgnoredFilePath(filePath)) {
      console.log(`[mergeDiffChanges] Skipping ignored path: ${filePath}`);
      continue;
    }

    // Handle deleted files
    if (change.isDeleted) {
      delete newFiles[filePath];
      console.log(`[mergeDiffChanges] Deleted: ${filePath}`);
      continue;
    }

    // Handle new files
    if (change.isNew || !currentFiles[filePath]) {
      // Clean the content
      const cleanedContent = cleanGeneratedCode(change.diff);
      if (cleanedContent && cleanedContent.length >= 10) {
        newFiles[filePath] = cleanedContent;
        console.log(`[mergeDiffChanges] Created new file: ${filePath} (${cleanedContent.length} chars)`);
      } else {
        errors.push(`New file ${filePath} has invalid content`);
      }
      continue;
    }

    // Handle modifications - apply diff
    const originalContent = currentFiles[filePath];
    const patchedContent = applyUnifiedDiff(originalContent, change.diff);

    if (patchedContent === null) {
      errors.push(`Failed to apply diff to ${filePath}`);
      // Keep original content on failure
      continue;
    }

    // Clean and validate the patched content
    const cleanedPatched = cleanGeneratedCode(patchedContent);
    if (cleanedPatched && cleanedPatched.length >= 10) {
      newFiles[filePath] = cleanedPatched;
      console.log(`[mergeDiffChanges] Updated: ${filePath} (${cleanedPatched.length} chars)`);
    } else {
      errors.push(`Patched content for ${filePath} is invalid`);
    }
  }

  // Log summary
  console.log(`[mergeDiffChanges] Summary: ${Object.keys(changes).length} changes, ${deletedFiles.length} deletions`);

  if (errors.length > 0) {
    console.warn('[mergeDiffChanges] Errors encountered:', errors);
    // Don't throw - return partial results and let the UI handle it
  }

  return newFiles;
}

/**
 * Result type for diff mode merge operation
 */
export interface DiffMergeResult {
  success: boolean;
  files: FileSystem;
  errors: string[];
  stats: {
    created: number;
    updated: number;
    deleted: number;
    failed: number;
  };
}

/**
 * Safely merges diff changes with detailed result reporting.
 * Use this for better error handling and user feedback.
 */
export function safeMergeDiffChanges(
  currentFiles: FileSystem,
  diffResponse: DiffModeResponse
): DiffMergeResult {
  const result: DiffMergeResult = {
    success: true,
    files: { ...currentFiles },
    errors: [],
    stats: { created: 0, updated: 0, deleted: 0, failed: 0 }
  };

  // Process deletions
  for (const filePath of diffResponse.deletedFiles || []) {
    if (result.files[filePath]) {
      delete result.files[filePath];
      result.stats.deleted++;
    }
  }

  // Process changes
  for (const [filePath, change] of Object.entries(diffResponse.changes)) {
    if (isIgnoredFilePath(filePath)) continue;

    if (change.isDeleted) {
      delete result.files[filePath];
      result.stats.deleted++;
      continue;
    }

    // Unescape the diff content first (AI often returns \\n instead of \n)
    const unescapedDiff = change.diff
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\');

    // Check if content is actually a unified diff format
    const looksLikeDiff = isUnifiedDiffFormat(unescapedDiff);
    const fileExists = !!currentFiles[filePath];

    console.log(`[safeMergeDiffChanges] Processing ${filePath}:`, {
      isNew: change.isNew,
      fileExists,
      looksLikeDiff,
      diffPreview: unescapedDiff.substring(0, 100)
    });

    // Decision logic:
    // 1. If file doesn't exist -> create new file (use content as-is)
    // 2. If file exists AND content is diff format -> apply diff
    // 3. If file exists AND content is NOT diff format AND isNew -> replace file
    // 4. If file exists AND content is NOT diff format AND NOT isNew -> treat as full replacement

    if (!fileExists) {
      // New file - use content directly
      const cleanedContent = cleanGeneratedCode(unescapedDiff);
      if (cleanedContent && cleanedContent.length >= 10) {
        result.files[filePath] = cleanedContent;
        result.stats.created++;
        console.log(`[safeMergeDiffChanges] Created new file: ${filePath}`);
      } else {
        result.errors.push(`Invalid content for new file: ${filePath}`);
        result.stats.failed++;
      }
    } else if (looksLikeDiff) {
      // Existing file with diff content - apply the diff
      console.log(`[safeMergeDiffChanges] Applying diff to existing file: ${filePath}`);
      const patched = applyUnifiedDiff(currentFiles[filePath], unescapedDiff);
      if (patched !== null) {
        const cleanedPatched = cleanGeneratedCode(patched);
        if (cleanedPatched && cleanedPatched.length >= 10) {
          result.files[filePath] = cleanedPatched;
          result.stats.updated++;
          console.log(`[safeMergeDiffChanges] Successfully patched: ${filePath}`);
        } else {
          result.errors.push(`Invalid patched content for: ${filePath}`);
          result.stats.failed++;
        }
      } else {
        result.errors.push(`Diff apply failed for: ${filePath}`);
        result.stats.failed++;
      }
    } else {
      // Existing file with full content (not diff) - replace the file
      console.log(`[safeMergeDiffChanges] Replacing file with full content: ${filePath}`);
      const cleanedContent = cleanGeneratedCode(unescapedDiff);
      if (cleanedContent && cleanedContent.length >= 10) {
        result.files[filePath] = cleanedContent;
        result.stats.updated++;
      } else {
        result.errors.push(`Invalid replacement content for: ${filePath}`);
        result.stats.failed++;
      }
    }
  }

  result.success = result.stats.failed === 0;

  console.log('[safeMergeDiffChanges] Result:', {
    success: result.success,
    stats: result.stats,
    errors: result.errors
  });

  return result;
}
