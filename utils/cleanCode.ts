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
 * Attempts to repair truncated JSON from AI responses
 * Returns the repaired JSON string or throws a descriptive error
 */
// Maximum JSON size for repair operations (configurable via constant)
const MAX_JSON_REPAIR_SIZE = 500000; // 500KB - increased from 50KB to handle larger AI responses

export function repairTruncatedJson(jsonStr: string): string {
  let json = jsonStr.trim();

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
  while (openStack.length > 0) {
    const open = openStack.pop();
    repaired += open === '{' ? '}' : ']';
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

    // Remove PLAN comment if present (it has its own JSON that would confuse parsing)
    // Format: // PLAN: {"create":[...],"update":[...],"delete":[],"total":N}
    // The PLAN JSON can have nested arrays, so we need to match balanced braces
    const planMatch = jsonString.match(/^(\/\/\s*PLAN:\s*)(\{[\s\S]*?\})\s*\n/m);
    if (planMatch) {
      // Find where the PLAN JSON actually ends by counting braces
      const planStart = planMatch.index || 0;
      const jsonStart = planStart + planMatch[1].length;
      let braceCount = 0;
      let planEnd = jsonStart;

      for (let i = jsonStart; i < jsonString.length; i++) {
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

      // Remove the PLAN comment (including any trailing newline)
      const afterPlan = jsonString.substring(planEnd).replace(/^\s*\n/, '');
      jsonString = afterPlan;
      console.log('[parseMultiFileResponse] Removed PLAN comment, remaining:', jsonString.slice(0, 100) + '...');
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
      } catch (parseError) {
        // Try to repair truncated JSON
        console.log('[parseMultiFileResponse] Direct parse failed, attempting repair...');
        wasTruncated = true;

        try {
          const repaired = repairTruncatedJson(jsonToParse);
          parsed = JSON.parse(repaired);
          console.log('[parseMultiFileResponse] Repair successful');
        } catch (repairError) {
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
              } catch (e) {
                // Final attempt: try to salvage any valid file content
                try {
                  // Look for files in quotes with content in backticks
                  const simpleFilePattern = /"([^"]+\.(?:tsx?|jsx?|css|json))":\s*"([^"]*(?:\\.[^"]*)*?)"/g;
                  const matches = [...jsonToParse.matchAll(simpleFilePattern)];

                  if (matches && matches.length > 0) {
                    const partialFiles: Record<string, string> = {};
                    matches.forEach(([fullMatch, filePath, fileContent]) => {
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
                } catch (e) {
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
      let filesObj = parsed.files || parsed.fileChanges || parsed.Changes || parsed;
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
          // AI might return { content: "...", type: "tsx" } format
          if ('content' in content && typeof (content as any).content === 'string') {
            contentStr = (content as any).content;
            console.log('[parseMultiFileResponse] Extracted content from object for:', path);
          } else if ('code' in content && typeof (content as any).code === 'string') {
            contentStr = (content as any).code;
            console.log('[parseMultiFileResponse] Extracted code from object for:', path);
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
