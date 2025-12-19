/**
 * syntaxFixer.ts - Comprehensive syntax error detection and auto-repair
 *
 * This module provides aggressive, multi-pass syntax fixing for AI-generated code.
 * It handles common patterns that AI models produce incorrectly.
 */

// ============================================================================
// ERROR PATTERN DATABASE
// ============================================================================

export interface ErrorPattern {
  name: string;
  description: string;
  detect: RegExp;
  fix: (match: RegExpMatchArray, code: string) => string;
  priority: number; // Lower = run first
}

export interface JsxTag {
  name: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  line: number;
  column: number;
  index: number;
}

export interface ImportInfo {
  source: string;
  defaultImport: string | null;
  namedImports: string[];
  namespaceImport: string | null;
  typeOnly: boolean;
  line: number;
  fullMatch: string;
}

export interface FixResult {
  code: string;
  fixesApplied: string[];
  issues: string[];
}

// ============================================================================
// PATTERN-BASED FIXES
// ============================================================================

/**
 * Fix malformed ternary operators
 * AI often writes: condition ? <Component /> : condition2 && <Other />
 * Should be: condition ? <Component /> : (condition2 && <Other />)
 */
export function fixMalformedTernary(code: string): string {
  let result = code;

  // Pattern 1: ? <JSX> : condition && <JSX>  ->  ? <JSX> : (condition && <JSX>)
  result = result.replace(
    /(\?\s*<[A-Z]\w*[^?:]*(?:\/>|<\/[A-Z]\w*>))\s*:\s*(\w+(?:\.\w+)*\s*&&\s*<[A-Z])/g,
    '$1 : ($2'
  );

  // Pattern 2: Incomplete ternary: ? <JSX />  } without :
  // Look for ? followed by JSX, then } without intervening :
  result = result.replace(
    /(\?\s*<[A-Z]\w*[^}]*(?:\/>|<\/[A-Z]\w*>))(\s*\})/g,
    (match, jsx, closing) => {
      // Check if there's already a : in the jsx part
      if (jsx.includes(':') && !jsx.includes('className:') && !jsx.includes('style:')) {
        return match;
      }
      return `${jsx} : null${closing}`;
    }
  );

  // Pattern 3: ? <JSX> : otherJsx without proper wrapping when otherJsx is conditional
  result = result.replace(
    /:\s*(\w+\s*\?\s*<[A-Z])/g,
    ': ($1'
  );

  return result;
}

/**
 * Fix arrow function syntax errors
 */
export function fixArrowFunctions(code: string): string {
  let result = code;

  // = > should be =>
  result = result.replace(/=\s+>/g, '=>');

  // ( ) => should be () =>
  result = result.replace(/\(\s+\)\s*=>/g, '() =>');

  // Fix missing arrow after parameter: (x) { should be (x) => {
  result = result.replace(/\)\s*\{(\s*(?:return|const|let|if|for|while))/g, ') => {$1');

  // Fix async () { to async () => {
  result = result.replace(/async\s*\([^)]*\)\s*\{(?!\s*=>)/g, (match) => {
    if (match.includes('=>')) return match;
    return match.replace('{', '=> {');
  });

  return result;
}

/**
 * Fix JSX attribute syntax errors
 */
export function fixJsxAttributes(code: string): string {
  let result = code;

  // className"value" -> className="value"
  result = result.replace(/(\bclassName)"([^"]+)"/g, '$1="$2"');
  result = result.replace(/(\bclassName)'([^']+)'/g, "$1='$2'");

  // onClick"handler" -> onClick={handler} or onClick="handler"
  result = result.replace(/(\bonClick)"(\w+)"/g, '$1={$2}');

  // style"..." -> style={...}
  result = result.replace(/(\bstyle)"([^"]+)"/g, '$1={{$2}}');

  // key"value" -> key="value"
  result = result.replace(/(\bkey)"([^"]+)"/g, '$1="$2"');

  // href"url" -> href="url"
  result = result.replace(/(\bhref)"([^"]+)"/g, '$1="$2"');

  // src"url" -> src="url"
  result = result.replace(/(\bsrc)"([^"]+)"/g, '$1="$2"');

  // Fix double equals in JSX: className=="value" -> className="value"
  result = result.replace(/(\b(?:className|style|onClick|key|href|src|alt|id|name|type|value))==(")/g, '$1=$2');

  // Fix missing closing brace in JSX expression: {value -> {value}
  // This is tricky, only do it in obvious cases
  result = result.replace(/=\{([a-zA-Z_]\w*)(\s+[a-z])/gi, '={$1}$2');

  return result;
}

/**
 * Fix string and template literal issues
 */
export function fixStringIssues(code: string): string {
  let result = code;
  const lines = result.split('\n');
  const fixedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Count quotes to detect unclosed strings
    const singleQuotes = (line.match(/(?<!\\)'/g) || []).length;
    const doubleQuotes = (line.match(/(?<!\\)"/g) || []).length;
    const backticks = (line.match(/(?<!\\)`/g) || []).length;

    // If odd number of single quotes and line ends without semicolon
    if (singleQuotes % 2 === 1 && !line.trim().endsWith("'") && !line.trim().endsWith("',") && !line.trim().endsWith("';")) {
      // Check if next line starts with continuation
      if (i + 1 < lines.length && /^\s*['"]/.test(lines[i + 1])) {
        // Likely multi-line string, leave it
      } else if (line.includes("'") && !line.includes('`')) {
        // Try to close the string at end of meaningful content
        const match = line.match(/'([^']+)$/);
        if (match) {
          line = line.replace(/'([^']+)$/, "'$1'");
        }
      }
    }

    // Same for double quotes
    if (doubleQuotes % 2 === 1 && !line.trim().endsWith('"') && !line.trim().endsWith('",') && !line.trim().endsWith('";')) {
      if (i + 1 < lines.length && /^\s*["']/.test(lines[i + 1])) {
        // Multi-line, leave it
      } else if (line.includes('"') && !line.includes('`')) {
        const match = line.match(/"([^"]+)$/);
        if (match) {
          line = line.replace(/"([^"]+)$/, '"$1"');
        }
      }
    }

    // Fix unclosed template literals at end of line
    if (backticks % 2 === 1 && line.includes('${') && !line.trim().endsWith('`')) {
      // Check if it's a multi-line template literal
      const hasClosingBacktick = lines.slice(i + 1, i + 10).some(l => l.includes('`'));
      if (!hasClosingBacktick) {
        line = line + '`';
      }
    }

    fixedLines.push(line);
  }

  return fixedLines.join('\n');
}

/**
 * Fix TypeScript-specific issues
 */
export function fixTypeScriptIssues(code: string): string {
  let result = code;

  // Fix: type[] = [] should be: type[] = []
  // Sometimes AI writes: const arr: string = [] instead of const arr: string[] = []
  result = result.replace(/:\s*(\w+)\s*=\s*\[\]/g, ': $1[] = []');

  // Fix duplicate type annotations: : : type -> : type
  result = result.replace(/:\s*:\s*/g, ': ');

  // Fix: interface Foo extends Bar, { -> interface Foo extends Bar {
  result = result.replace(/interface\s+(\w+)\s+extends\s+(\w+)\s*,\s*\{/g, 'interface $1 extends $2 {');

  // Fix: type Foo = | value -> type Foo = value
  result = result.replace(/type\s+(\w+)\s*=\s*\|\s*/g, 'type $1 = ');

  // Fix generic angle brackets that look like JSX: React.FC<Props> should stay, but < alone shouldn't

  return result;
}

// ============================================================================
// JSX TAG BALANCING
// ============================================================================

/**
 * Extract all JSX tags from code
 */
export function extractJsxTags(code: string): JsxTag[] {
  const tags: JsxTag[] = [];
  const lines = code.split('\n');
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let inMultilineComment = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      const nextChar = line[col + 1] || '';
      const prevChar = line[col - 1] || '';

      // Track comment state
      if (!inString && !inMultilineComment && char === '/' && nextChar === '/') {
        inComment = true;
      }
      if (!inString && !inComment && char === '/' && nextChar === '*') {
        inMultilineComment = true;
      }
      if (inMultilineComment && char === '*' && nextChar === '/') {
        inMultilineComment = false;
        col++; // Skip the /
        continue;
      }
      if (inComment || inMultilineComment) continue;

      // Track string state
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }
      if (inString) continue;

      // Look for JSX tags
      if (char === '<') {
        // Check if it's a comparison operator
        if (nextChar === '=' || prevChar === ' ' && /[<>=!]/.test(nextChar)) continue;

        // Extract the tag
        const restOfLine = line.slice(col);

        // Self-closing tag: <Component ... />
        const selfClosingMatch = restOfLine.match(/^<([A-Z][a-zA-Z0-9]*)(?:\s[^>]*)?\s*\/>/);
        if (selfClosingMatch) {
          tags.push({
            name: selfClosingMatch[1],
            isClosing: false,
            isSelfClosing: true,
            line: lineNum + 1,
            column: col + 1,
            index: code.indexOf(line) + col
          });
          continue;
        }

        // Closing tag: </Component>
        const closingMatch = restOfLine.match(/^<\/([A-Z][a-zA-Z0-9]*)\s*>/);
        if (closingMatch) {
          tags.push({
            name: closingMatch[1],
            isClosing: true,
            isSelfClosing: false,
            line: lineNum + 1,
            column: col + 1,
            index: code.indexOf(line) + col
          });
          continue;
        }

        // Opening tag: <Component ...>
        const openingMatch = restOfLine.match(/^<([A-Z][a-zA-Z0-9]*)(?:\s[^>]*)?\s*>/);
        if (openingMatch) {
          tags.push({
            name: openingMatch[1],
            isClosing: false,
            isSelfClosing: false,
            line: lineNum + 1,
            column: col + 1,
            index: code.indexOf(line) + col
          });
        }
      }
    }

    inComment = false; // Reset single-line comment at end of line
  }

  return tags;
}

/**
 * Find unclosed JSX tags
 */
export function findUnclosedTags(tags: JsxTag[]): JsxTag[] {
  const stack: JsxTag[] = [];

  for (const tag of tags) {
    if (tag.isSelfClosing) continue;

    if (tag.isClosing) {
      // Look for matching opening tag
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === tag.name) {
          stack.splice(i, 1);
          break;
        }
      }
    } else {
      stack.push(tag);
    }
  }

  return stack;
}

/**
 * Fix unclosed JSX tags by adding closing tags
 */
export function fixJsxTagBalance(code: string): string {
  const tags = extractJsxTags(code);
  const unclosed = findUnclosedTags(tags);

  if (unclosed.length === 0) return code;

  // Sort unclosed tags by line number (descending) so we add closers from bottom up
  unclosed.sort((a, b) => b.line - a.line);

  const lines = code.split('\n');

  for (const tag of unclosed) {
    // Find a good place to insert the closing tag
    // Look for the next closing brace or the end of the containing block
    let insertLine = tag.line - 1; // 0-indexed

    // Search for a good insertion point
    for (let i = insertLine; i < lines.length; i++) {
      const line = lines[i];

      // If we find a return statement end or closing brace, insert before it
      if (i > insertLine && (/^\s*\);?\s*$/.test(line) || /^\s*\}\s*$/.test(line))) {
        insertLine = i;
        break;
      }

      // Don't go past the function/component end
      if (i > insertLine + 20) {
        insertLine = Math.min(insertLine + 5, lines.length - 1);
        break;
      }
    }

    // Insert the closing tag
    const indent = lines[tag.line - 1].match(/^\s*/)?.[0] || '';
    lines.splice(insertLine, 0, `${indent}</${tag.name}>`);
  }

  return lines.join('\n');
}

// ============================================================================
// BRACKET BALANCING
// ============================================================================

interface BracketInfo {
  char: string;
  line: number;
  column: number;
  index: number;
}

/**
 * Advanced bracket balancing with context awareness
 */
export function fixBracketBalanceAdvanced(code: string): string {
  const stack: BracketInfo[] = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

  let inString = false;
  let stringChar = '';
  let inTemplate = false;
  let templateDepth = 0;
  let inRegex = false;
  let inComment = false;
  let inMultilineComment = false;

  const lines = code.split('\n');
  let globalIndex = 0;
  const extraClosers: { char: string; afterIndex: number }[] = [];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      const nextChar = line[col + 1] || '';
      const prevChar = line[col - 1] || '';

      // Track comment state
      if (!inString && !inMultilineComment && char === '/' && nextChar === '/') {
        inComment = true;
      }
      if (!inString && !inComment && char === '/' && nextChar === '*') {
        inMultilineComment = true;
      }
      if (inMultilineComment && char === '*' && nextChar === '/') {
        inMultilineComment = false;
        col++;
        continue;
      }
      if (inComment || inMultilineComment) {
        globalIndex++;
        continue;
      }

      // Track string state
      if (!inTemplate && (char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      // Track template literal state
      if (char === '`' && prevChar !== '\\') {
        if (!inTemplate) {
          inTemplate = true;
          templateDepth = 0;
        } else if (templateDepth === 0) {
          inTemplate = false;
        }
      }

      // Track ${} inside template literals
      if (inTemplate && char === '$' && nextChar === '{') {
        templateDepth++;
      }
      if (inTemplate && templateDepth > 0 && char === '}') {
        templateDepth--;
      }

      if (inString || (inTemplate && templateDepth === 0)) {
        globalIndex++;
        continue;
      }

      // Track brackets
      if (pairs[char]) {
        stack.push({
          char,
          line: lineNum + 1,
          column: col + 1,
          index: globalIndex
        });
      } else if (closers[char]) {
        const lastOpen = stack[stack.length - 1];
        if (lastOpen && lastOpen.char === closers[char]) {
          stack.pop();
        } else {
          // Mismatched closer - this is an extra closer
          // We'll handle this by potentially removing it or ignoring
        }
      }

      globalIndex++;
    }

    inComment = false;
    globalIndex++; // For the newline
  }

  // Add missing closers at appropriate positions
  if (stack.length > 0) {
    // Sort by index descending to add from bottom up
    stack.sort((a, b) => b.index - a.index);

    let result = code;

    for (const unclosed of stack) {
      const closer = pairs[unclosed.char];

      // Find a good place to insert the closer
      // Generally at the end of the same or next logical block
      const insertPos = findBestCloserPosition(result, unclosed.index, closer);

      result = result.slice(0, insertPos) + closer + result.slice(insertPos);
    }

    return result;
  }

  return code;
}

/**
 * Find the best position to insert a missing closer
 */
function findBestCloserPosition(code: string, afterIndex: number, closer: string): number {
  const rest = code.slice(afterIndex);
  const lines = rest.split('\n');

  // For braces, look for end of block
  if (closer === '}') {
    // Look for lines that end with semicolon or another brace
    let offset = afterIndex;
    for (const line of lines.slice(0, 10)) {
      offset += line.length + 1;
      if (/;\s*$/.test(line) || /\}\s*$/.test(line)) {
        return offset;
      }
    }
  }

  // For parentheses, look for end of expression
  if (closer === ')') {
    let offset = afterIndex;
    for (const line of lines.slice(0, 5)) {
      // Look for likely expression ends
      if (/[;,}\]]/.test(line)) {
        const match = line.match(/[;,}\]]/);
        if (match) {
          return offset + (match.index || 0);
        }
      }
      offset += line.length + 1;
    }
  }

  // Default: insert at end of code
  return code.length;
}

// ============================================================================
// IMPORT HANDLING
// ============================================================================

/**
 * Parse import statements from code
 */
export function parseImports(code: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = code.split('\n');

  const importRegex = /^import\s+(?:(type)\s+)?(?:(\*\s+as\s+\w+)|(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"];?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('import ')) continue;

    const match = line.match(importRegex);
    if (match) {
      const [fullMatch, typeOnly, namespaceImport, defaultImport, namedImportsStr, source] = match;

      const namedImports = namedImportsStr
        ? namedImportsStr.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      imports.push({
        source,
        defaultImport: defaultImport || null,
        namedImports,
        namespaceImport: namespaceImport?.replace('* as ', '') || null,
        typeOnly: !!typeOnly,
        line: i + 1,
        fullMatch: lines[i]
      });
    }
  }

  return imports;
}

/**
 * Merge and deduplicate imports
 */
export function fixAndMergeImports(code: string): string {
  const imports = parseImports(code);

  if (imports.length === 0) return code;

  // Group imports by source
  const bySource: Record<string, ImportInfo[]> = {};
  for (const imp of imports) {
    if (!bySource[imp.source]) {
      bySource[imp.source] = [];
    }
    bySource[imp.source].push(imp);
  }

  // Build merged import statements
  const mergedImports: string[] = [];
  const usedLines = new Set<number>();

  for (const [source, sourceImports] of Object.entries(bySource)) {
    if (sourceImports.length === 1) {
      mergedImports.push(sourceImports[0].fullMatch);
      usedLines.add(sourceImports[0].line);
      continue;
    }

    // Merge multiple imports from same source
    let defaultImport: string | null = null;
    let namespaceImport: string | null = null;
    const namedSet = new Set<string>();
    let isTypeOnly = true;

    for (const imp of sourceImports) {
      usedLines.add(imp.line);

      if (imp.defaultImport && !defaultImport) {
        defaultImport = imp.defaultImport;
      }
      if (imp.namespaceImport && !namespaceImport) {
        namespaceImport = imp.namespaceImport;
      }
      for (const named of imp.namedImports) {
        namedSet.add(named);
      }
      if (!imp.typeOnly) {
        isTypeOnly = false;
      }
    }

    // Build merged import
    const typePrefix = isTypeOnly ? 'type ' : '';
    const namedStr = Array.from(namedSet).join(', ');

    if (namespaceImport) {
      mergedImports.push(`import ${typePrefix}* as ${namespaceImport} from '${source}';`);
    } else if (defaultImport && namedStr) {
      mergedImports.push(`import ${typePrefix}${defaultImport}, { ${namedStr} } from '${source}';`);
    } else if (defaultImport) {
      mergedImports.push(`import ${typePrefix}${defaultImport} from '${source}';`);
    } else if (namedStr) {
      mergedImports.push(`import ${typePrefix}{ ${namedStr} } from '${source}';`);
    }
  }

  // Reconstruct code with merged imports
  const lines = code.split('\n');
  const newLines: string[] = [];
  let importsInserted = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;

    if (usedLines.has(lineNum)) {
      // This was an import line, skip it
      if (!importsInserted) {
        // Insert all merged imports at first import location
        newLines.push(...mergedImports);
        importsInserted = true;
      }
    } else {
      newLines.push(lines[i]);
    }
  }

  return newLines.join('\n');
}

// ============================================================================
// RETURN STATEMENT FIXES
// ============================================================================

/**
 * Fix return statement issues
 */
export function fixReturnStatements(code: string): string {
  let result = code;

  // Fix: return ( without matching )
  // This requires careful analysis
  const lines = result.split('\n');
  const fixedLines: string[] = [];
  let returnParenDepth = 0;
  let inReturnParen = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Detect return (
    if (/return\s*\(/.test(line) && !inReturnParen) {
      inReturnParen = true;
      returnParenDepth = 0;
    }

    if (inReturnParen) {
      for (const char of line) {
        if (char === '(') returnParenDepth++;
        if (char === ')') returnParenDepth--;
      }

      if (returnParenDepth <= 0) {
        inReturnParen = false;
        returnParenDepth = 0;
      }
    }

    // Fix return without value followed by JSX
    if (/^\s*return\s*$/.test(line) && i + 1 < lines.length && /^\s*</.test(lines[i + 1])) {
      line = line.replace(/return\s*$/, 'return (');
    }

    fixedLines.push(line);
  }

  // If we ended with unclosed return paren, close it
  if (inReturnParen && returnParenDepth > 0) {
    // Find the last line with content and add closing parens
    for (let i = fixedLines.length - 1; i >= 0; i--) {
      if (fixedLines[i].trim()) {
        fixedLines[i] = fixedLines[i] + ')'.repeat(returnParenDepth);
        break;
      }
    }
  }

  return fixedLines.join('\n');
}

// ============================================================================
// MASTER FIX FUNCTION
// ============================================================================

/**
 * Apply all fixes in the correct order
 */
export function aggressiveFix(code: string, maxPasses = 3): FixResult {
  const fixesApplied: string[] = [];
  const issues: string[] = [];
  let currentCode = code;

  for (let pass = 0; pass < maxPasses; pass++) {
    const beforeCode = currentCode;

    // Phase 1: Import handling (run first to establish clean imports)
    const afterImports = fixAndMergeImports(currentCode);
    if (afterImports !== currentCode) {
      fixesApplied.push(`Pass ${pass + 1}: Merged duplicate imports`);
      currentCode = afterImports;
    }

    // Phase 2: Arrow function fixes
    const afterArrows = fixArrowFunctions(currentCode);
    if (afterArrows !== currentCode) {
      fixesApplied.push(`Pass ${pass + 1}: Fixed arrow function syntax`);
      currentCode = afterArrows;
    }

    // Phase 3: Ternary operator fixes
    const afterTernary = fixMalformedTernary(currentCode);
    if (afterTernary !== currentCode) {
      fixesApplied.push(`Pass ${pass + 1}: Fixed malformed ternary operators`);
      currentCode = afterTernary;
    }

    // Phase 4: JSX attribute fixes
    const afterAttrs = fixJsxAttributes(currentCode);
    if (afterAttrs !== currentCode) {
      fixesApplied.push(`Pass ${pass + 1}: Fixed JSX attribute syntax`);
      currentCode = afterAttrs;
    }

    // Phase 5: String and template literal fixes
    const afterStrings = fixStringIssues(currentCode);
    if (afterStrings !== currentCode) {
      fixesApplied.push(`Pass ${pass + 1}: Fixed string/template literal issues`);
      currentCode = afterStrings;
    }

    // Phase 6: TypeScript-specific fixes
    const afterTS = fixTypeScriptIssues(currentCode);
    if (afterTS !== currentCode) {
      fixesApplied.push(`Pass ${pass + 1}: Fixed TypeScript syntax issues`);
      currentCode = afterTS;
    }

    // Phase 7: Return statement fixes
    const afterReturns = fixReturnStatements(currentCode);
    if (afterReturns !== currentCode) {
      fixesApplied.push(`Pass ${pass + 1}: Fixed return statements`);
      currentCode = afterReturns;
    }

    // Phase 8: Bracket balancing (run near the end)
    const afterBrackets = fixBracketBalanceAdvanced(currentCode);
    if (afterBrackets !== currentCode) {
      fixesApplied.push(`Pass ${pass + 1}: Fixed bracket balance`);
      currentCode = afterBrackets;
    }

    // Phase 9: JSX tag balancing (run last)
    const afterJsxTags = fixJsxTagBalance(currentCode);
    if (afterJsxTags !== currentCode) {
      fixesApplied.push(`Pass ${pass + 1}: Fixed unclosed JSX tags`);
      currentCode = afterJsxTags;
    }

    // If no changes this pass, we're done
    if (currentCode === beforeCode) {
      break;
    }
  }

  return {
    code: currentCode,
    fixesApplied,
    issues
  };
}

/**
 * Quick validation - returns true if code appears valid
 */
export function quickValidate(code: string): boolean {
  // Check bracket balance
  let braces = 0, parens = 0, brackets = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const prevChar = code[i - 1] || '';

    // Track string state (simplified)
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (inString) continue;

    if (char === '{') braces++;
    if (char === '}') braces--;
    if (char === '(') parens++;
    if (char === ')') parens--;
    if (char === '[') brackets++;
    if (char === ']') brackets--;

    // Early exit if any goes negative (indicates syntax error)
    if (braces < 0 || parens < 0 || brackets < 0) {
      return false;
    }
  }

  if (braces !== 0 || parens !== 0 || brackets !== 0) {
    return false;
  }

  // Check for common syntax errors
  const errorPatterns = [
    /=\s+>/,              // = > instead of =>
    /className"[^"]/,     // className"value" without =
    /\?\s*<[A-Z][^:]*\}$/, // Incomplete ternary
    /:\s*:/,              // Double colon
  ];

  for (const pattern of errorPatterns) {
    if (pattern.test(code)) {
      return false;
    }
  }

  return true;
}

/**
 * Try to fix code and validate - returns fixed code or original if validation fails
 */
export function safeAggressiveFix(code: string): string {
  const result = aggressiveFix(code);

  // If we applied fixes, check if the result is valid
  if (result.fixesApplied.length > 0) {
    if (quickValidate(result.code)) {
      return result.code;
    } else {
      // Fixes made it worse, return original
      console.warn('[syntaxFixer] Fixes made code invalid, reverting');
      return code;
    }
  }

  return code;
}
