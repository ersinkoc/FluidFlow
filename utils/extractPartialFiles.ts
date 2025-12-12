/**
 * Extracts complete files from a truncated AI response
 * Uses diff-like approach to identify fully formed files
 */

interface FileSystem {
  [filePath: string]: string;
}

interface ExtractionResult {
  completeFiles: FileSystem;
  partialFiles: {
    [filePath: string]: {
      content: string;
      isComplete: boolean;
    };
  };
  summary: string;
}

export function extractFilesFromTruncatedResponse(
  response: string,
  _existingFiles: FileSystem = {}
): ExtractionResult {
  const result: ExtractionResult = {
    completeFiles: {},
    partialFiles: {},
    summary: ''
  };

  // 1. Try to parse as JSON first
  try {
    // Remove PLAN comment if present (it has its own JSON that confuses parsing)
    let cleanResponse = response.trimStart();
    // Strip BOM and other invisible characters
    cleanResponse = cleanResponse.replace(/^[\uFEFF\u200B-\u200D\u00A0]+/, '');

    const planMatch = cleanResponse.match(/^(\/\/\s*PLAN:\s*)(\{)/m);
    if (planMatch && planMatch.index !== undefined) {
      const jsonStart = planMatch.index + planMatch[1].length;
      let braceCount = 0;
      let planEnd = jsonStart;

      for (let i = jsonStart; i < cleanResponse.length; i++) {
        const char = cleanResponse[i];
        if (char === '{') braceCount++;
        else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            planEnd = i + 1;
            break;
          }
        }
      }
      cleanResponse = cleanResponse.substring(planEnd).trimStart();
    }

    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}?/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      if (parsed.files) {
        // Check each file for completeness
        Object.entries(parsed.files).forEach(([filePath, content]) => {
          const fileContent = typeof content === 'string' ? content : String(content);
          if (isFileComplete(fileContent, filePath)) {
            result.completeFiles[filePath] = fileContent;
          } else {
            result.partialFiles[filePath] = {
              content: fileContent,
              isComplete: false
            };
          }
        });

        result.summary = parsed.explanation || 'Extracted from JSON response';
        return result;
      }
    }
  } catch (_e) {
    // JSON parsing failed, continue with regex extraction
  }

  // 2. Extract files using regex patterns
  // NOTE: Using non-capturing groups (?:...) for extensions to avoid offset issues
  const filePatterns = [
    // Pattern for files in backticks - content is in group 2
    /"([^"]+\.(?:tsx?|jsx?|css|json|md|sql|ts|js))":\s*`([^`]*(?:`(?!`)[^`]*)*)`/gs,
    // Pattern for files in quotes - content is in group 2
    /"([^"]+\.(?:tsx?|jsx?|css|json|md|sql|ts|js))":\s*"((?:[^"\\]|\\.)*)"/gs,
    // Pattern for files without explicit key (last resort) - content is in group 2
    /(?:^|\n)(src\/[^:\n]+\.(?:tsx?|jsx?|css|json|md|sql|ts|js)):\s*`([^`]*(?:`(?!`)[^`]*)*)`/gm,
    // NEW: More aggressive pattern for truncated JSON with incomplete strings
    /"([^"]+\.(?:tsx?|jsx?|css|json|md|sql|ts|js))":\s*"(.*)$/gm,
    // NEW: Pattern for JSON that ends mid-value
    /"([^"]+\.(?:tsx?|jsx?|css|json|md|sql|ts|js))":\s*"([^"]*)$/gm
  ];

  const explanationMatch = response.match(/"explanation":\s*"([^"]+)"/);
  if (explanationMatch) {
    result.summary = explanationMatch[1];
  }

  // Try each pattern
  for (const pattern of filePatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const filePath = match[1];
      let content = match[2]; // Now correctly gets content, not extension

      // Skip if content is just a file extension (indicates regex matched wrong part)
      if (/^(?:tsx?|jsx?|css|json|md|sql|ts|js)$/i.test(content)) {
        console.warn('[extractFiles] Skipping - content is just extension:', filePath, content);
        continue;
      }

      // Clean up the content
      content = content
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .trim();

      // Handle truncated content - if it looks cut off, mark as incomplete
      // Check for common truncation patterns
      const isTruncated =
        content.endsWith('\\') ||  // Ends with escape character
        content.match(/\\$/) ||    // Ends with backslash
        content.length < 20;       // Too short to be complete

      // If truncated, try to recover what we can
      if (isTruncated && content.length > 50) {
        // Remove trailing incomplete escape sequences
        content = content.replace(/\\+$/g, '').trim();
      }

      // Check if file is complete
      if (isFileComplete(content, filePath)) {
        result.completeFiles[filePath] = content;
      } else {
        result.partialFiles[filePath] = {
          content,
          isComplete: false
        };
      }
    }
  }

  // 3. Special handling for JSX/TSX files - check for complete components
  Object.entries(result.partialFiles).forEach(([filePath, file]) => {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      const { isComplete, fixedContent } = checkAndFixJSCompleteness(file.content);
      if (isComplete) {
        result.completeFiles[filePath] = fixedContent;
        delete result.partialFiles[filePath];
      } else {
        file.content = fixedContent;
      }
    }
  });

  // 4. Generate summary
  const completeCount = Object.keys(result.completeFiles).length;
  const partialCount = Object.keys(result.partialFiles).length;

  if (completeCount > 0 && partialCount > 0) {
    result.summary += `\n\n✅ ${completeCount} files recovered completely\n⚠️ ${partialCount} files were partially generated`;
  } else if (completeCount > 0) {
    result.summary += `\n\n✅ ${completeCount} files recovered successfully`;
  }

  return result;
}

function isFileComplete(content: string, filePath: string): boolean {
  const trimmed = content.trim();

  if (!trimmed || trimmed.length < 50) {
    return false;
  }

  // Check for common incomplete patterns
  const incompletePatterns = [
    /,\s*$/,                          // Ends with comma (likely incomplete object/array)
    /\.\.\.$/,                        // Ends with ellipsis
    /className="[^"]*$/,             // Incomplete className attribute
    /<[^>]*$/,                       // Incomplete opening tag
    /`[^`]*$/,                       // Incomplete template literal
    /\(\s*$/,                        // Incomplete function call
    /\{\s*$/,                        // Incomplete object
    /import.*from\s*"\s*$/,          // Incomplete import
    /export.*\{$/,                   // Incomplete export
  ];

  for (const pattern of incompletePatterns) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }

  // Special handling for truncated content: if it's very long (>2000 chars) and has substantial code,
  // consider it "complete enough" but require proper ending
  if (trimmed.length > 2000) {
    // Check if it has substantial code structure
    const hasCodeStructure = /function\s+|const\s+\w+\s*=|=>\s*{|class\s+\w+|<\w+/.test(trimmed);
    if (hasCodeStructure) {
      // Count opening vs closing braces to see if it's reasonably balanced
      const openBraces = (trimmed.match(/\{/g) || []).length;
      const closeBraces = (trimmed.match(/\}/g) || []).length;
      const braceDiff = Math.abs(openBraces - closeBraces);

      // Must have balanced braces AND end with a proper closing character
      const hasProperEnd = /[}\]);'"`>]\s*$/.test(trimmed);

      // If braces are balanced (diff <= 1) and has proper ending, consider it complete
      if (braceDiff <= 1 && hasProperEnd) {
        console.log(`[extractFiles] Treating long file as complete: ${filePath} (${trimmed.length} chars, brace diff: ${braceDiff})`);
        return true;
      }
    }
  }

  // File type specific checks
  if (filePath.endsWith('.json')) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    return checkJSXCompleteness(trimmed);
  }

  // For other files, check if it ends with a proper closing
  const hasProperEnding = [
    trimmed.endsWith('}'),
    trimmed.endsWith(');'),
    trimmed.endsWith('];'),
    trimmed.endsWith('};'),
    trimmed.endsWith('"\n'),
    trimmed.endsWith('\'\n'),
    trimmed.endsWith('`\n'),
    trimmed.endsWith('/>'),
    // Match closing tags like </div>, </Component>, etc.
    /<\/[a-zA-Z][a-zA-Z0-9]*>\s*$/.test(trimmed),
  ].some(Boolean);

  return hasProperEnding;
}

function checkJSXCompleteness(content: string): boolean {
  const _lines = content.split('\n');
  let openBraces = 0;
  let openTags = 0;
  let inString = false;
  let inTemplate = false;
  let escapeNext = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && (inString || inTemplate)) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !inTemplate && prevChar !== '\\') {
      inString = !inString;
      continue;
    }

    if (char === '`' && !inString && prevChar !== '\\') {
      inTemplate = !inTemplate;
      continue;
    }

    if (inString || inTemplate) continue;

    if (char === '{') {
      openBraces++;
    } else if (char === '}') {
      openBraces--;
    } else if (char === '<' && i + 1 < content.length && content[i + 1] !== '/' && content[i + 1] !== '!' && content[i + 1] !== ' ') {
      // Opening tag
      let j = i + 1;
      let _tagName = '';
      while (j < content.length && /[a-zA-Z]/.test(content[j])) {
        _tagName += content[j];
        j++;
      }

      // Skip self-closing tags
      if (content[j] === ' ' || content[j] === '>' || content[j] === '/') {
        if (content[j] === '/' && j + 1 < content.length && content[j + 1] === '>') {
          // Self-closing, ignore
        } else {
          openTags++;
        }
      }
    } else if (char === '/' && i > 0 && content[i - 1] === '<') {
      // Closing tag
      openTags--;
    }
  }

  return openBraces === 0 && openTags === 0;
}

function checkAndFixJSCompleteness(content: string): { isComplete: boolean; fixedContent: string } {
  let fixedContent = content.trim();

  // Remove trailing commas from objects/arrays
  fixedContent = fixedContent.replace(/,(\s*[}\]])/g, '$1');

  // Complete incomplete className attributes
  fixedContent = fixedContent.replace(/className="([^"]*)$/gm, 'className="$1"');

  // Complete incomplete style attributes
  fixedContent = fixedContent.replace(/style=\{([^}]*)$/gm, 'style={$1}');

  // Add missing semicolons
  const lines = fixedContent.split('\n');
  // Find last non-empty line (compatible alternative to findLastIndex)
  let lastNonEmptyLine = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) {
      lastNonEmptyLine = i;
      break;
    }
  }

  if (lastNonEmptyLine > -1) {
    const lastLine = lines[lastNonEmptyLine].trim();
    if (lastLine && !lastLine.endsWith(';') && !lastLine.endsWith('{') && !lastLine.endsWith('}') &&
        !lastLine.endsWith('</') && !lastLine.endsWith('/>') && !lastLine.includes('export') &&
        !lastLine.includes('import') && !lastLine.includes('return')) {
      lines[lastNonEmptyLine] += ';';
      fixedContent = lines.join('\n');
    }
  }

  const isComplete = checkJSXCompleteness(fixedContent);

  return { isComplete, fixedContent };
}