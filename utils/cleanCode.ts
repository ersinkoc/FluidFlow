// Import and re-export isIgnoredPath as isIgnoredFilePath for backwards compatibility
import { isIgnoredPath } from './filePathUtils';
export { isIgnoredPath as isIgnoredFilePath };

// Import marker format utilities (ES module - no require())
import {
  isMarkerFormat,
  parseMarkerFormatResponse,
  extractMarkerFileList,
  getMarkerStreamingStatus,
} from './markerFormat';

// Note: syntaxFixer.ts exports are available but we intentionally don't use them here.
// Aggressive syntax "fixes" were causing more harm than good.
// The functions are still exported from syntaxFixer.ts for optional/explicit use.

// Local alias for internal use
const isIgnoredFilePath = isIgnoredPath;

/**
 * Checks if position i in code starts a JSX tag (not a comparison operator)
 * JSX tags: <div, </div, <Component, <>, </>
 */
function isJsxTagStart(code: string, i: number): boolean {
  if (code[i] !== '<') return false;
  const nextChar = code[i + 1];
  // JSX tags start with <letter, </, or <>
  return /[A-Za-z/!>]/.test(nextChar || '');
}

/**
 * Fixes unescaped < and > characters in JSX text content.
 * AI often generates code like <div>A -> B</div> which causes JSX parse errors.
 * This function escapes these characters in text content only.
 */
export function fixJsxTextContent(code: string): string {
  if (!code) return '';

  // Only process if it looks like JSX/TSX (has JSX elements)
  if (!/<\w+[^>]*>/.test(code)) {
    return code;
  }

  let result = '';
  let i = 0;
  const len = code.length;

  while (i < len) {
    // Check if we're at a JSX tag opening
    if (isJsxTagStart(code, i)) {
      // Find the end of this tag
      let tagEnd = i + 1;
      let inString = false;
      let stringChar = '';
      let braceDepth = 0;

      while (tagEnd < len) {
        const ch = code[tagEnd];

        // Track JSX expression braces
        if (!inString && ch === '{') {
          braceDepth++;
        } else if (!inString && ch === '}') {
          braceDepth--;
        }

        // Track strings
        if ((ch === '"' || ch === "'" || ch === '`') && code[tagEnd - 1] !== '\\') {
          if (!inString) {
            inString = true;
            stringChar = ch;
          } else if (ch === stringChar) {
            inString = false;
          }
        }

        // End of tag (only if not in string or brace expression)
        if (ch === '>' && !inString && braceDepth === 0) {
          break;
        }

        tagEnd++;
      }

      // Copy the tag including the closing >
      result += code.slice(i, tagEnd + 1);
      i = tagEnd + 1;

      // Now collect text content until next JSX tag
      // Skip over JSX expressions {..} as they contain JavaScript code, not text
      let textContent = '';
      while (i < len && !isJsxTagStart(code, i)) {
        // If we hit a JSX expression, copy it verbatim (don't escape inside)
        if (code[i] === '{') {
          let braceDepth = 1;
          textContent += code[i];
          i++;
          while (i < len && braceDepth > 0) {
            if (code[i] === '{') braceDepth++;
            if (code[i] === '}') braceDepth--;
            textContent += code[i];
            i++;
          }
          continue;
        }
        textContent += code[i];
        i++;
      }

      // If we have text content with non-whitespace, escape problematic chars
      // But NOT inside JSX expressions, and NOT arrow functions (=>)
      if (textContent.length > 0 && textContent.trim().length > 0) {
        // Process text in segments, preserving JSX expressions
        let processed = '';
        let j = 0;
        while (j < textContent.length) {
          if (textContent[j] === '{') {
            // Find matching closing brace and copy verbatim
            let depth = 1;
            processed += textContent[j];
            j++;
            while (j < textContent.length && depth > 0) {
              if (textContent[j] === '{') depth++;
              if (textContent[j] === '}') depth--;
              processed += textContent[j];
              j++;
            }
          } else if (textContent[j] === '>' && textContent[j - 1] !== '=') {
            // Escape standalone > (not part of =>)
            processed += "{'>'}";
            j++;
          } else if (textContent[j] === '<' && !isJsxTagStart(textContent, j)) {
            // Escape standalone < (not a JSX tag)
            processed += "{'<'}";
            j++;
          } else {
            processed += textContent[j];
            j++;
          }
        }
        textContent = processed;
      }

      result += textContent;
      continue;
    }

    // Default: copy character as-is (non-JSX code)
    result += code[i];
    i++;
  }

  return result;
}

/**
 * Comprehensive syntax error fixer for AI-generated JSX/TSX code.
 *
 * Fixes these common AI mistakes:
 * 1. Malformed ternary chains (mixing && with ?:)
 * 2. Incomplete ternary (missing : null)
 * 3. Duplicate imports (merges them)
 * 4. Malformed arrow functions
 * 5. JSX attribute syntax errors
 * 6. Unclosed template literals
 * 7. TypeScript syntax issues
 */
export function fixCommonSyntaxErrors(code: string): string {
  if (!code) return '';

  let fixed = code;

  // ══════════════════════════════════════════════════════════════
  // PHASE 1: Fix malformed ternary operators (most common AI error)
  // ══════════════════════════════════════════════════════════════

  // 1a: `) : condition && (` → `) : condition ? (`
  // Example: `status === 'error' ? <Error/>) : status === 'loading' && (<Loading/>)`
  fixed = fixed.replace(
    /\)\s*:\s*([\w.]+\s*===?\s*['"][^'"]+['"]\s*)&&\s*\(/g,
    ') : $1? ('
  );

  // 1b: Variable-based: `) : isLoading && (` or `) : !isLoading && (`
  fixed = fixed.replace(
    /\)\s*:\s*(!?[\w.]+)\s*&&\s*\(/g,
    ') : $1 ? ('
  );

  // 1c: After JSX closing tag: `</Component>) : condition && (`
  fixed = fixed.replace(
    /(<\/\w+>)\s*\)\s*:\s*([\w.!]+(?:\s*===?\s*['"][^'"]+['"])?)\s*&&\s*\(/g,
    '$1) : $2 ? ('
  );

  // 1d: After self-closing JSX: `<Component />) : condition && (`
  fixed = fixed.replace(
    /(\/>)\s*\)\s*:\s*([\w.!]+(?:\s*===?\s*['"][^'"]+['"])?)\s*&&\s*\(/g,
    '$1) : $2 ? ('
  );

  // 1e: `{condition && (content) : (other)}` → `{condition ? (content) : (other)}`
  fixed = fixed.replace(
    /\{\s*([\w.!]+(?:\s*[=!<>]+\s*['"\w.]+)?)\s*&&\s*\(([^)]+)\)\s*:\s*\(/g,
    '{ $1 ? ($2) : ('
  );

  // 1f: Negated condition with &&: `) : !something && (`
  fixed = fixed.replace(
    /\)\s*:\s*(![\w.]+(?:\?\.[\w.]+)*)\s*&&\s*\(/g,
    ') : $1 ? ('
  );

  // ══════════════════════════════════════════════════════════════
  // PHASE 2: Fix incomplete ternary (missing else)
  // ══════════════════════════════════════════════════════════════

  // 2a: `{condition ? <Component /> }` missing `: null`
  // Match: `? <.../>` followed by `}` without a `:` in between
  fixed = fixed.replace(
    /(\?\s*<[\w][\w\s="'{}.,-]*?\s*\/>)\s*(\})/g,
    (match, ternaryPart, closeBrace) => {
      // Check if there's already a colon after the ternary
      if (match.includes(' : ') || match.includes(': ')) return match;
      return ternaryPart + ' : null' + closeBrace;
    }
  );

  // 2b: `{condition ? (<Component />) }` missing `: null`
  fixed = fixed.replace(
    /(\?\s*\(\s*<[\w][\w\s="'{}.,-]*?\s*\/>\s*\))\s*(\})/g,
    (match, ternaryPart, closeBrace) => {
      if (match.includes(' : ') || match.includes(': ')) return match;
      return ternaryPart + ' : null' + closeBrace;
    }
  );

  // ══════════════════════════════════════════════════════════════
  // PHASE 3: Fix arrow function syntax
  // ══════════════════════════════════════════════════════════════

  // 3a: FIRST - `() = > {` (space before >) → `() => {` (must run before hybrid fix)
  fixed = fixed.replace(/=\s+>/g, '=>');

  // 3b: CRITICAL - Fix hybrid function/arrow syntax: "function Name() => {" -> "function Name() {"
  // AI commonly generates this invalid mix of function declaration and arrow function

  // Pattern 1: Simple case - no params: function Name() => {
  fixed = fixed.replace(/function\s+(\w+)\s*\(\)\s*=>\s*\{/g, 'function $1() {');

  // Pattern 2: With params but no nested parens: function Name(a, b) => {
  fixed = fixed.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*=>\s*\{/g, 'function $1($2) {');

  // Pattern 3: Complex - any content between function and => { (non-greedy)
  fixed = fixed.replace(/(\bfunction\s+\w+[\s\S]*?)\s*=>\s*\{/g, '$1 {');

  // 3c: `= >{` (no space after =>) → `=> {`
  fixed = fixed.replace(/=>\s*\{/g, '=> {');

  // ══════════════════════════════════════════════════════════════
  // PHASE 4: Fix JSX attribute syntax
  // ══════════════════════════════════════════════════════════════

  // 4a: `className"value"` missing `=`
  fixed = fixed.replace(
    /(className|style|onClick|onChange|onSubmit|type|placeholder|value|disabled|checked|id|name|href|src|alt)("[^"]*")/g,
    '$1=$2'
  );

  // 4b: `className=="value"` double equals
  fixed = fixed.replace(
    /(className|style|onClick|onChange|type|placeholder)=="([^"]*)"/g,
    '$1="$2"'
  );

  // ══════════════════════════════════════════════════════════════
  // PHASE 5: Fix JSX structural issues
  // ══════════════════════════════════════════════════════════════

  // 5a: Extra `}}` that should be single `}`
  // Only when followed by JSX closing tag
  fixed = fixed.replace(/\}\}\s*(<\/)/g, '}$1');

  // 5b: `{ {` double opening braces
  fixed = fixed.replace(/\{\s*\{\s*(?=[^{])/g, '{ ');

  // ══════════════════════════════════════════════════════════════
  // PHASE 6: Deduplicate and merge imports
  // ══════════════════════════════════════════════════════════════

  const lines = fixed.split('\n');
  const importsBySource = new Map<string, { line: string; idx: number; named: Set<string>; defaultImport: string | null }>();
  const dedupedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('import ') && trimmed.includes('from')) {
      // Extract source
      const sourceMatch = trimmed.match(/from\s+['"]([^'"]+)['"]/);
      if (sourceMatch) {
        const source = sourceMatch[1];
        const existing = importsBySource.get(source);

        // Extract named imports
        const namedMatch = trimmed.match(/\{\s*([^}]+)\s*\}/);
        const namedImports = new Set<string>();
        if (namedMatch) {
          namedMatch[1].split(',').map(s => s.trim()).filter(Boolean).forEach(n => namedImports.add(n));
        }

        // Extract default import
        const defaultMatch = trimmed.match(/import\s+(\w+)\s*(?:,|\s+from)/);
        const defaultImport = (defaultMatch && !trimmed.startsWith('import {')) ? defaultMatch[1] : null;

        if (existing) {
          // Merge with existing import
          namedImports.forEach(n => existing.named.add(n));
          if (defaultImport && !existing.defaultImport) {
            existing.defaultImport = defaultImport;
          }
          // Update the existing line
          const merged = buildImportLine(existing.defaultImport, existing.named, source);
          dedupedLines[existing.idx] = merged;
          continue; // Skip this duplicate
        }

        importsBySource.set(source, {
          line,
          idx: dedupedLines.length,
          named: namedImports,
          defaultImport
        });
      }
    } else if (trimmed.startsWith('import ') && !trimmed.includes('from')) {
      // Side-effect import like `import './styles.css'`
      const alreadyExists = dedupedLines.some(l => l.trim() === trimmed);
      if (alreadyExists) continue;
    }

    dedupedLines.push(line);
  }

  fixed = dedupedLines.join('\n');

  // ══════════════════════════════════════════════════════════════
  // PHASE 7: Fix unclosed template literals
  // ══════════════════════════════════════════════════════════════

  const backtickCount = (fixed.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0) {
    // Find unclosed template literal and close it
    const lines2 = fixed.split('\n');
    let inTemplate = false;
    for (let i = 0; i < lines2.length; i++) {
      const count = (lines2[i].match(/`/g) || []).length;
      if (count % 2 !== 0) {
        inTemplate = !inTemplate;
        if (inTemplate && i === lines2.length - 1) {
          // Last line starts unclosed template - close it
          lines2[i] += '`';
          inTemplate = false;
        }
      }
    }
    if (inTemplate) {
      // Still unclosed - add closing backtick to last line
      fixed += '`';
    } else {
      fixed = lines2.join('\n');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 8: Fix TypeScript issues
  // ══════════════════════════════════════════════════════════════

  // 8a: Trailing comma in interface/type before closing brace
  fixed = fixed.replace(/,(\s*\})/g, '$1');

  // 8b: Missing closing > in generics: `React.FC<Props =` → `React.FC<Props> =`
  fixed = fixed.replace(/(React\.FC<\w+)(\s*=)/g, '$1>$2');

  // ══════════════════════════════════════════════════════════════
  // PHASE 9: Fix bracket/brace/parenthesis balance
  // ══════════════════════════════════════════════════════════════

  fixed = fixBracketBalance(fixed);

  return fixed;
}

/**
 * Fix unbalanced brackets, braces, and parentheses
 * This is a best-effort fix - it adds missing closers at the end
 */
function fixBracketBalance(code: string): string {
  const stack: { char: string; line: number }[] = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
  const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' };

  let inString = false;
  let stringChar = '';
  let inTemplate = false;
  let inJsx = false;
  let lineNum = 1;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const prev = code[i - 1];

    // Track line numbers
    if (char === '\n') lineNum++;

    // Track string state
    if ((char === '"' || char === "'" || char === '`') && prev !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
        if (char === '`') inTemplate = true;
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
        if (char === '`') inTemplate = false;
      }
      continue;
    }

    // Skip if in string (except template literal expressions)
    if (inString && !inTemplate) continue;

    // Handle template literal ${} expressions
    if (inTemplate && char === '$' && code[i + 1] === '{') {
      // Template expression start - push the brace
      continue;
    }

    // Track JSX tags (simple heuristic)
    if (char === '<' && /[A-Z]/.test(code[i + 1] || '')) {
      inJsx = true;
    }
    if (inJsx && char === '>') {
      inJsx = false;
      continue; // Don't track JSX angle brackets
    }
    if (inJsx) continue;

    // Skip angle brackets in type annotations
    if (char === '<' || char === '>') {
      // Simple heuristic: skip if looks like generic/type annotation
      const before = code.substring(Math.max(0, i - 20), i);
      if (/<\w+>/.test(before) || /:\s*$/.test(before) || /extends\s+$/.test(before)) {
        continue;
      }
    }

    // Track brackets
    if (pairs[char] && char !== '<') {
      stack.push({ char, line: lineNum });
    } else if (closers[char] && char !== '>') {
      if (stack.length > 0 && stack[stack.length - 1].char === closers[char]) {
        stack.pop();
      }
      // If we have an unmatched closer, leave it (might be intentional)
    }
  }

  // Add missing closers at the end
  if (stack.length > 0) {
    let suffix = '';
    while (stack.length > 0) {
      const unmatched = stack.pop();
      if (unmatched) {
        suffix += pairs[unmatched.char];
      }
    }
    // Add closers on new line if there's content
    if (suffix && code.trim().length > 0) {
      code = code.trimEnd() + '\n' + suffix;
    }
  }

  return code;
}

/**
 * Validate JSX syntax and return issues found
 * This is a quick pre-check before transpilation
 */
export interface SyntaxIssue {
  type: 'error' | 'warning';
  message: string;
  line?: number;
  column?: number;
  fix?: string;
}

export function validateJsxSyntax(code: string): SyntaxIssue[] {
  const issues: SyntaxIssue[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for `: condition && (` pattern
    if (/\)\s*:\s*[\w!.]+\s*&&\s*\(/.test(line)) {
      issues.push({
        type: 'error',
        message: 'Malformed ternary: using && instead of ? after :',
        line: lineNum,
        fix: 'Replace && with ? for chained ternary'
      });
    }

    // Check for unclosed JSX tags on single line
    const jsxTagMatch = line.match(/<([A-Z]\w*)(?:\s[^>]*)?>(?!.*<\/\1>)(?!.*\/>)/);
    if (jsxTagMatch && !line.includes('return') && !lines.slice(i + 1, i + 10).some(l => l.includes(`</${jsxTagMatch[1]}>`))) {
      // Don't warn if closing tag is on a nearby line
      const hasClosingNearby = lines.slice(i, i + 20).some(l => l.includes(`</${jsxTagMatch[1]}>`));
      if (!hasClosingNearby) {
        issues.push({
          type: 'warning',
          message: `Potentially unclosed JSX tag: <${jsxTagMatch[1]}>`,
          line: lineNum
        });
      }
    }

    // Check for = > instead of =>
    if (/=\s+>/.test(line) && !/[<>]=/.test(line)) {
      issues.push({
        type: 'error',
        message: 'Malformed arrow function: space between = and >',
        line: lineNum,
        fix: 'Remove space: = > should be =>'
      });
    }

    // Check for className"value" without =
    if (/className"[^"]+"|onClick"[^"]+"/.test(line)) {
      issues.push({
        type: 'error',
        message: 'Missing = in JSX attribute',
        line: lineNum,
        fix: 'Add = before the value'
      });
    }

    // Check for incomplete ternary at end of expression
    if (/\?\s*<[A-Z]\w*[^:]*\s*\}$/.test(line.trim())) {
      const hasColonAfter = lines.slice(i + 1, i + 3).some(l => /^\s*:/.test(l));
      if (!hasColonAfter) {
        issues.push({
          type: 'error',
          message: 'Incomplete ternary: missing else branch (: null)',
          line: lineNum,
          fix: 'Add : null before the closing }'
        });
      }
    }
  }

  // Check overall bracket balance
  let braceCount = 0;
  let parenCount = 0;
  let bracketCount = 0;

  for (const char of code) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '(') parenCount++;
    if (char === ')') parenCount--;
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;
  }

  if (braceCount !== 0) {
    issues.push({
      type: 'error',
      message: `Unbalanced braces: ${braceCount > 0 ? 'missing ' + braceCount + ' closing }' : 'extra ' + Math.abs(braceCount) + ' closing }'}`,
    });
  }
  if (parenCount !== 0) {
    issues.push({
      type: 'error',
      message: `Unbalanced parentheses: ${parenCount > 0 ? 'missing ' + parenCount + ' closing )' : 'extra ' + Math.abs(parenCount) + ' closing )'}`,
    });
  }
  if (bracketCount !== 0) {
    issues.push({
      type: 'error',
      message: `Unbalanced brackets: ${bracketCount > 0 ? 'missing ' + bracketCount + ' closing ]' : 'extra ' + Math.abs(bracketCount) + ' closing ]'}`,
    });
  }

  return issues;
}

/**
 * Validates code and returns issues found.
 *
 * IMPORTANT: This function no longer attempts to "fix" code.
 * Previous "fix" attempts were causing more harm than good by transforming
 * valid LLM-generated code into broken code.
 *
 * Now it only validates and reports issues - the caller can decide what to do.
 */
export function validateAndFixCode(code: string, filePath?: string): {
  code: string;
  fixed: boolean;
  issues: SyntaxIssue[];
} {
  if (!code) return { code: '', fixed: false, issues: [] };

  // Only validate - do NOT attempt to fix
  // Aggressive fixes were causing issues like:
  // - "function Name() => {" hybrid syntax errors
  // - "const x = (param: Type) {" missing arrow errors
  const issues = validateJsxSyntax(code);

  if (issues.length > 0 && filePath) {
    console.warn(`[validateAndFixCode] ${filePath}: ${issues.length} syntax issues detected`);
  }

  return {
    code: code, // Return original code unchanged
    fixed: false,
    issues
  };
}

/**
 * Extract line context around an error for better debugging
 */
export function getErrorContext(code: string, line: number, contextLines = 2): string {
  const lines = code.split('\n');
  const start = Math.max(0, line - 1 - contextLines);
  const end = Math.min(lines.length, line + contextLines);

  return lines
    .slice(start, end)
    .map((l, i) => {
      const lineNum = start + i + 1;
      const marker = lineNum === line ? '>>> ' : '    ';
      return `${marker}${lineNum.toString().padStart(4)}: ${l}`;
    })
    .join('\n');
}

/**
 * Parse Babel error message to extract line/column info
 */
export function parseBabelError(error: string): { line?: number; column?: number; message: string } {
  // Pattern: "file.tsx: Unexpected token (15:23)"
  const lineColMatch = error.match(/\((\d+):(\d+)\)/);
  if (lineColMatch) {
    return {
      line: parseInt(lineColMatch[1], 10),
      column: parseInt(lineColMatch[2], 10),
      message: error.replace(/\(\d+:\d+\)/, '').trim()
    };
  }

  // Pattern: "Line 15: ..."
  const lineMatch = error.match(/Line (\d+):/i);
  if (lineMatch) {
    return {
      line: parseInt(lineMatch[1], 10),
      message: error
    };
  }

  return { message: error };
}

/**
 * Build an import statement from components
 */
function buildImportLine(defaultImport: string | null, named: Set<string>, source: string): string {
  const namedStr = Array.from(named).filter(Boolean).join(', ');

  if (defaultImport && namedStr) {
    return `import ${defaultImport}, { ${namedStr} } from '${source}';`;
  } else if (defaultImport) {
    return `import ${defaultImport} from '${source}';`;
  } else if (namedStr) {
    return `import { ${namedStr} } from '${source}';`;
  }
  return `import '${source}';`;
}

/**
 * Fixes bare specifier imports that AI often generates incorrectly.
 * Converts: import X from "src/..." to import X from "/src/..."
 * Also handles: import X from "components/..." etc.
 *
 * Browser ES modules require paths to start with "/", "./", or "../"
 */
export function fixBareSpecifierImports(code: string): string {
  if (!code) return '';

  // Common directory patterns that AI incorrectly uses as bare specifiers
  // These should be converted to absolute paths (prefixed with /)
  const bareSpecifierDirs = [
    'src',
    'components',
    'hooks',
    'utils',
    'services',
    'contexts',
    'types',
    'lib',
    'pages',
    'features',
    'modules',
    'assets',
    'styles',
    'api',
  ];

  // Build regex pattern: matches import/export from "dir/..." or 'dir/...'
  // Captures: full match, quote char, path
  const pattern = new RegExp(
    `(import\\s+[^;]+?from\\s*|export\\s+[^;]*?from\\s*|import\\s*\\()(['"\`])(${bareSpecifierDirs.join('|')})/`,
    'g'
  );

  // Replace bare specifiers with absolute paths
  return code.replace(pattern, (match, prefix, quote, dir) => {
    return `${prefix}${quote}/${dir}/`;
  });
}

/**
 * Cleans AI-generated code by removing markdown artifacts and code block markers.
 *
 * IMPORTANT: This function intentionally does MINIMAL processing.
 * We only remove markdown formatting - we do NOT attempt to "fix" syntax.
 * Aggressive transformations were causing more harm than good by breaking
 * valid code that LLMs generate.
 */
export function cleanGeneratedCode(code: string, filePath?: string): string {
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

  // ═══════════════════════════════════════════════════════════════════════
  // Remove stray FILE markers that AI sometimes leaves in generated code
  // These are from marker-based format parsing that wasn't fully cleaned
  // ═══════════════════════════════════════════════════════════════════════
  // Remove: <!-- FILE:path --> or <!-- /FILE:path --> or <!-- /FILE -->
  cleaned = cleaned.replace(/<!--\s*\/?FILE(?::[^\s>]*)?\s*-->/g, '');
  // Remove: <!-- GENERATION_META --> blocks
  cleaned = cleaned.replace(/<!--\s*GENERATION_META\s*-->[\s\S]*?<!--\s*\/GENERATION_META\s*-->/g, '');
  // Remove standalone GENERATION_META markers
  cleaned = cleaned.replace(/<!--\s*\/?GENERATION_META\s*-->/g, '');
  // Remove: <!-- PLAN --> blocks
  cleaned = cleaned.replace(/<!--\s*PLAN\s*-->[\s\S]*?<!--\s*\/PLAN\s*-->/g, '');
  // Remove standalone PLAN markers
  cleaned = cleaned.replace(/<!--\s*\/?PLAN\s*-->/g, '');
  // Remove: <!-- EXPLANATION --> blocks
  cleaned = cleaned.replace(/<!--\s*EXPLANATION\s*-->[\s\S]*?<!--\s*\/EXPLANATION\s*-->/g, '');
  // Remove standalone EXPLANATION markers
  cleaned = cleaned.replace(/<!--\s*\/?EXPLANATION\s*-->/g, '');

  // Check if this is a JS/TS file
  const isJsFile = filePath
    ? /\.(tsx?|jsx?|mjs|cjs)$/.test(filePath)
    : /import\s+.*from\s+['"]|export\s+/.test(cleaned);

  // Fix bare specifier imports (src/... -> /src/...)
  // This is safe and necessary for browser ES modules
  if (isJsFile) {
    cleaned = fixBareSpecifierImports(cleaned);

    // ═══════════════════════════════════════════════════════════════════
    // AI SYNTAX ERROR FIXES - Applied when code is saved to files state
    // These fix common mistakes AI makes with arrow function syntax
    // ═══════════════════════════════════════════════════════════════════

    // Fix space in arrow: = > → =>
    cleaned = cleaned.replace(/=\s+>/g, '=>');

    // ─────────────────────────────────────────────────────────────────
    // FIX 1: Hybrid function/arrow - "function Name() => {" → "function Name() {"
    // AI sometimes mixes function declaration with arrow syntax
    // ─────────────────────────────────────────────────────────────────
    cleaned = cleaned.replace(/function\s+(\w+)\s*\(\)\s*=>\s*\{/g, 'function $1() {');
    cleaned = cleaned.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*=>\s*\{/g, 'function $1($2) {');
    cleaned = cleaned.replace(/(\bfunction\s+\w+[\s\S]*?)\s*=>\s*\{/g, '$1 {');

    // ─────────────────────────────────────────────────────────────────
    // FIX 2: Missing arrow - "= () {" → "= () => {"
    // AI sometimes forgets the => in arrow functions
    // ─────────────────────────────────────────────────────────────────

    // Pattern: const fn = () { or const fn = async () {
    cleaned = cleaned.replace(/(=\s*)(async\s+)?\(([^)]*)\)\s*\{/g, (match, eq, asyncKw, params) => {
      if (match.includes('=>')) return match;
      return eq + (asyncKw || '') + '(' + params + ') => {';
    });

    // Pattern: useEffect(() { or any callback(() {
    cleaned = cleaned.replace(/(\w+)\s*\(\s*\(([^)]*)\)\s*\{(?!\s*=>)/g, (match, fnName, params) => {
      if (fnName === 'function') return match;
      if (match.includes('=>')) return match;
      return fnName + '((' + params + ') => {';
    });

    // ─────────────────────────────────────────────────────────────────
    // FIX 3: JSX event handler missing arrow - "onClick={() {}}" → "onClick={() => {}}"
    // AI sometimes forgets the => in JSX callback props
    // ─────────────────────────────────────────────────────────────────
    // Pattern: ={( or ={ ( followed by params and { without =>
    // Handles: onClick={() {}} onChange={(e) {}} onSubmit={(e, data) {}}
    cleaned = cleaned.replace(/=\{\s*\(([^)]*)\)\s*\{(?!\s*=>)/g, (match, params) => {
      if (match.includes('=>')) return match;
      return '={(' + params + ') => {';
    });

    // Pattern: return () { (useEffect cleanup)
    cleaned = cleaned.replace(/return\s+\(([^)]*)\)\s*\{/g, (match, params) => {
      if (match.includes('=>')) return match;
      return 'return (' + params + ') => {';
    });

    // Pattern: ( ) => → () => (extra space in empty params)
    cleaned = cleaned.replace(/\(\s+\)\s*=>/g, '() =>');
  }

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
 * Common JSON errors and their fixes
 */
interface JsonValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
  fixedJson?: string;
}

/**
 * Pre-validates JSON string and attempts to fix common issues
 */
export function preValidateJson(jsonStr: string): JsonValidationResult {
  if (!jsonStr || !jsonStr.trim()) {
    return { valid: false, error: 'Empty response' };
  }

  let json = jsonStr.trim();

  // Check for markdown code blocks
  if (json.startsWith('```')) {
    const match = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) {
      json = match[1].trim();
    } else {
      return {
        valid: false,
        error: 'Unclosed markdown code block',
        suggestion: 'Remove markdown formatting and return pure JSON'
      };
    }
  }

  // Check for common prefixes that shouldn't be there
  const invalidPrefixes = ['Here is', 'Sure,', 'I\'ll', 'Let me', 'The following'];
  for (const prefix of invalidPrefixes) {
    if (json.startsWith(prefix)) {
      return {
        valid: false,
        error: `Response starts with text: "${prefix}..."`,
        suggestion: 'Return only JSON, no explanatory text before it'
      };
    }
  }

  // Check for PLAN comment (valid, but note it)
  const hasPlan = json.includes('// PLAN:');

  // Find the JSON object
  const firstBrace = json.indexOf('{');
  if (firstBrace === -1) {
    return { valid: false, error: 'No JSON object found (missing opening brace)' };
  }

  // Extract just the JSON part (after PLAN if present)
  let jsonPart = json;
  if (hasPlan) {
    const afterPlan = stripPlanComment(json);
    jsonPart = afterPlan;
  }

  // Try to fix common issues
  let fixedJson = jsonPart;

  // Fix 1: Trailing commas before closing braces/brackets
  fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');

  // Fix 2: Single quotes to double quotes (naive - only for keys)
  // This is risky, so only do it if there are no double quotes
  if (!fixedJson.includes('"') && fixedJson.includes("'")) {
    fixedJson = fixedJson.replace(/'/g, '"');
  }

  // Try parsing
  try {
    JSON.parse(fixedJson);
    return { valid: true, fixedJson: fixedJson !== jsonPart ? fixedJson : undefined };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown parse error';

    // Provide specific suggestions based on error
    let suggestion = 'Check JSON syntax';
    if (error.includes('Unexpected token')) {
      suggestion = 'Invalid character in JSON - check for unescaped quotes or special characters';
    } else if (error.includes('Unexpected end')) {
      suggestion = 'JSON is truncated - missing closing braces or brackets';
    } else if (error.includes('position')) {
      const posMatch = error.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        const context = fixedJson.slice(Math.max(0, pos - 20), pos + 20);
        suggestion = `Error near: "...${context}..."`;
      }
    }

    return { valid: false, error, suggestion };
  }
}

/**
 * Safely parses JSON from AI response, handling PLAN comments and other artifacts.
 * Returns null if parsing fails instead of throwing.
 */
export function safeParseAIResponse<T = unknown>(response: string): T | null {
  if (!response) return null;

  try {
    // Pre-validate first
    const validation = preValidateJson(response);
    if (!validation.valid) {
      console.debug('[safeParseAIResponse] Pre-validation failed:', validation.error, validation.suggestion);
    }

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
      // Use fixed JSON if available from pre-validation
      const jsonToParse = validation.fixedJson || jsonMatch[0];
      return JSON.parse(jsonToParse) as T;
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

        // Clean the content (pass file path for JSX detection)
        const cleanedContent = cleanGeneratedCode(contentStr, path);

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
// SEARCH/REPLACE MODE - Re-exported from searchReplace.ts for backwards compatibility
// ============================================================================
export {
  parseSearchReplaceModeResponse,
  applySearchReplace,
  mergeSearchReplaceChanges,
  type SearchReplaceMergeResult,
} from './searchReplace';

// ============================================================================
// MARKER FORMAT - Re-exported from markerFormat.ts
// ============================================================================
export {
  isMarkerFormat,
  parseMarkerFormatResponse,
  parseMarkerPlan,
  parseMarkerFiles,
  parseStreamingMarkerFiles,
  extractMarkerFileList,
  getMarkerStreamingStatus,
  stripMarkerMetadata,
  type MarkerFilePlan,
  type MarkerFormatResponse,
} from './markerFormat';

// ============================================================================
// UNIFIED RESPONSE PARSER
// ============================================================================

/** Response format type */
export type ResponseFormatType = 'json' | 'marker';

/** Unified parsed response */
export interface UnifiedParsedResponse {
  format: ResponseFormatType;
  files: Record<string, string>;
  explanation?: string;
  truncated?: boolean;
  deletedFiles?: string[];
  generationMeta?: GenerationMeta;
  /** Files that were started but not completed (missing closing marker) */
  incompleteFiles?: string[];
}

/**
 * Detects the response format (JSON vs Marker)
 */
export function detectResponseFormat(response: string): ResponseFormatType {
  if (isMarkerFormat(response)) {
    return 'marker';
  }
  return 'json';
}

/**
 * Unified parser that handles both JSON and Marker formats
 * Automatically detects the format and calls the appropriate parser
 */
export function parseUnifiedResponse(response: string): UnifiedParsedResponse | null {
  if (!response || !response.trim()) {
    return null;
  }

  // Check for marker format first (it's more distinctive)
  if (isMarkerFormat(response)) {
    const markerResult = parseMarkerFormatResponse(response);
    if (markerResult) {
      // Log warning if there are incomplete files
      if (markerResult.incompleteFiles && markerResult.incompleteFiles.length > 0) {
        console.warn('[parseUnifiedResponse] Response has incomplete files that will NOT be included:', markerResult.incompleteFiles);
      }

      return {
        format: 'marker',
        files: markerResult.files,
        explanation: markerResult.explanation,
        truncated: markerResult.truncated,
        deletedFiles: markerResult.plan?.delete,
        generationMeta: markerResult.generationMeta,
        incompleteFiles: markerResult.incompleteFiles,
      };
    }
  }

  // Try JSON format
  const jsonResult = parseMultiFileResponse(response, true);
  if (jsonResult) {
    return {
      format: 'json',
      files: jsonResult.files,
      explanation: jsonResult.explanation,
      truncated: jsonResult.truncated,
      deletedFiles: jsonResult.deletedFiles,
      generationMeta: jsonResult.generationMeta,
    };
  }

  return null;
}

/**
 * Extract file list from response (works with both formats)
 */
export function extractFileListUnified(response: string): string[] {
  if (isMarkerFormat(response)) {
    return extractMarkerFileList(response);
  }

  // JSON format - use existing extraction
  const files = new Set<string>();

  // Try to parse PLAN comment
  const planMatch = response.match(/\/\/\s*PLAN:\s*(\{[\s\S]*?\})/);
  if (planMatch) {
    try {
      const plan = JSON.parse(planMatch[1]);
      if (plan.create) plan.create.forEach((f: string) => files.add(f));
      if (plan.update) plan.update.forEach((f: string) => files.add(f));
    } catch {
      // Ignore parse errors
    }
  }

  // Extract from JSON keys using matchAll
  const pattern = /"([^"]+\.(tsx?|jsx?|css|json|md|sql|ts|js))"\s*:/g;
  const matches = [...response.matchAll(pattern)];
  for (const match of matches) {
    files.add(match[1]);
  }

  return Array.from(files).sort();
}

/**
 * Get streaming status from response (works with both formats)
 */
export function getStreamingStatusUnified(response: string, detectedFiles: Set<string>): {
  pending: string[];
  streaming: string[];
  complete: string[];
} {
  if (isMarkerFormat(response)) {
    return getMarkerStreamingStatus(response);
  }

  // JSON format - analyze based on detected files and content
  const allFiles = extractFileListUnified(response);
  const complete: string[] = [];
  const streaming: string[] = [];

  for (const file of allFiles) {
    // Check if file content appears complete in JSON
    // A file is complete if we see its closing quote followed by comma or brace
    const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filePattern = new RegExp(`"${escapedFile}"\\s*:\\s*"[^"]*(?:\\\\.[^"]*)*"\\s*[,}]`);
    if (filePattern.test(response)) {
      complete.push(file);
    } else if (detectedFiles.has(file)) {
      streaming.push(file);
    }
  }

  const completeSet = new Set(complete);
  const streamingSet = new Set(streaming);
  const pending = allFiles.filter(f => !completeSet.has(f) && !streamingSet.has(f));

  return { pending, streaming, complete };
}
