/**
 * Code Validation
 *
 * Validates code syntax and verifies that fixes resolve errors.
 */

import { VerificationResult, VerificationIssue, VerificationOptions } from './types';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MIN_CODE_LENGTH: 50,
  MAX_NEW_ISSUES: 2,
  HIGH_CONFIDENCE_THRESHOLD: 0.9,
  MEDIUM_CONFIDENCE_THRESHOLD: 0.6,
};

// ============================================================================
// Syntax Validation
// ============================================================================

/**
 * Quick check if code has valid syntax
 */
export function isCodeValid(code: string): boolean {
  return validateSyntax(code).valid;
}

/**
 * Validate bracket balance and string termination
 */
export function validateSyntax(code: string): { valid: boolean; error?: string } {
  try {
    const brackets: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const stack: string[] = [];
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const nextChar = code[i + 1] || '';
      const prevChar = i > 0 ? code[i - 1] : '';

      // Comments
      if (!inString && !inBlockComment && char === '/' && nextChar === '/') {
        inComment = true;
        continue;
      }
      if (inComment && char === '\n') {
        inComment = false;
        continue;
      }
      if (!inString && !inComment && char === '/' && nextChar === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++;
        continue;
      }
      if (inComment || inBlockComment) continue;

      // Strings
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      if (inString) continue;

      // Brackets
      if (brackets[char]) {
        stack.push(brackets[char]);
      } else if (char === ')' || char === ']' || char === '}') {
        if (stack.length === 0) {
          return { valid: false, error: `Unexpected '${char}'` };
        }
        const expected = stack.pop();
        if (expected !== char) {
          return { valid: false, error: `Expected '${expected}' but found '${char}'` };
        }
      }
    }

    if (stack.length > 0) {
      return { valid: false, error: `Missing closing '${stack[stack.length - 1]}'` };
    }

    if (inString) {
      return { valid: false, error: 'Unterminated string' };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

/**
 * Validate JSX basics
 */
export function validateJSX(code: string): { valid: boolean; error?: string } {
  // Check for unclosed JSX tags
  const openTags: string[] = [];
  const tagPattern = /<(\/?)([\w.]+)([^>]*?)(\/?)>/g;
  let match;

  while ((match = tagPattern.exec(code)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2];
    const isSelfClosing = match[4] === '/';

    // Skip self-closing and void elements
    if (isSelfClosing) continue;

    const voidElements = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col']);
    if (voidElements.has(tagName.toLowerCase())) continue;

    if (isClosing) {
      if (openTags.length === 0 || openTags[openTags.length - 1] !== tagName) {
        return { valid: false, error: `Unexpected closing tag </${tagName}>` };
      }
      openTags.pop();
    } else {
      openTags.push(tagName);
    }
  }

  if (openTags.length > 0) {
    return { valid: false, error: `Unclosed tag <${openTags[openTags.length - 1]}>` };
  }

  return { valid: true };
}

// ============================================================================
// Fix Verification
// ============================================================================

/**
 * Verify that a fix is valid and resolves the original error
 */
export function verifyFix(options: VerificationOptions): VerificationResult {
  const issues: VerificationIssue[] = [];
  const suggestions: string[] = [];
  let confidence = 1.0;

  const { originalError, originalFiles, fixedFiles, changedFiles, strictMode = false } = options;

  for (const file of changedFiles) {
    const fixedCode = fixedFiles[file];

    if (!fixedCode) {
      issues.push({
        type: 'error',
        message: `Fixed file ${file} is empty or missing`,
        file,
      });
      confidence -= 0.5;
      continue;
    }

    if (fixedCode.length < CONFIG.MIN_CODE_LENGTH) {
      issues.push({
        type: 'warning',
        message: `Fixed file ${file} is very short (${fixedCode.length} chars)`,
        file,
      });
      confidence -= 0.2;
    }

    // Syntax validation
    const syntaxResult = validateSyntax(fixedCode);
    if (!syntaxResult.valid) {
      issues.push({
        type: 'error',
        message: `Syntax error: ${syntaxResult.error}`,
        file,
      });
      confidence -= 0.5;
    }

    // Check if error is addressed
    const errorCheck = checkErrorAddressed(originalError, originalFiles[file], fixedCode);
    if (!errorCheck.addressed) {
      issues.push({
        type: 'warning',
        message: `Fix may not address error: ${errorCheck.reason}`,
        file,
      });
      confidence -= 0.3;
      if (errorCheck.suggestion) {
        suggestions.push(errorCheck.suggestion);
      }
    }

    // Regression check (strict mode)
    if (strictMode) {
      const regression = checkForRegression(originalFiles[file], fixedCode);
      if (regression.hasRegression) {
        issues.push({
          type: 'warning',
          message: `Potential regression: ${regression.description}`,
          file,
        });
        confidence -= 0.2;
      }
    }
  }

  confidence = Math.max(0, Math.min(1, confidence));

  const confidenceLevel = confidence >= CONFIG.HIGH_CONFIDENCE_THRESHOLD
    ? 'high'
    : confidence >= CONFIG.MEDIUM_CONFIDENCE_THRESHOLD
      ? 'medium'
      : 'low';

  const hasErrors = issues.some(i => i.type === 'error');
  const isValid = !hasErrors && confidence >= CONFIG.MEDIUM_CONFIDENCE_THRESHOLD;

  return { isValid, confidence: confidenceLevel, issues, suggestions };
}

/**
 * Check if the original error is addressed
 */
function checkErrorAddressed(
  errorMessage: string,
  originalCode: string | undefined,
  fixedCode: string
): { addressed: boolean; reason?: string; suggestion?: string } {
  const errorLower = errorMessage.toLowerCase();

  // "not defined" errors
  const notDefinedMatch = errorMessage.match(/['"]?(\w+)['"]?\s+is\s+not\s+defined/i);
  if (notDefinedMatch) {
    const identifier = notDefinedMatch[1];
    const hasImport = new RegExp(`import.*\\b${identifier}\\b.*from`, 'i').test(fixedCode);
    const hasDefined = new RegExp(`(const|let|var|function)\\s+${identifier}\\b`).test(fixedCode);

    if (!hasImport && !hasDefined) {
      return {
        addressed: false,
        reason: `'${identifier}' is still not defined`,
        suggestion: `Add import for '${identifier}'`,
      };
    }
    return { addressed: true };
  }

  // Bare specifier errors
  if (errorLower.includes('bare specifier') || errorLower.includes('was not remapped')) {
    const bareMatch = errorMessage.match(/["']?(src\/[\w./-]+)["']?/i);
    if (bareMatch) {
      const barePath = bareMatch[1];
      if (fixedCode.includes(`'${barePath}'`) || fixedCode.includes(`"${barePath}"`)) {
        return {
          addressed: false,
          reason: `Bare specifier '${barePath}' still present`,
          suggestion: `Convert to relative path`,
        };
      }
    }
    return { addressed: true };
  }

  // Default: assume addressed if code changed
  if (originalCode && fixedCode !== originalCode) {
    return { addressed: true };
  }

  return {
    addressed: false,
    reason: 'Code appears unchanged',
    suggestion: 'Verify the fix was applied correctly',
  };
}

/**
 * Check for potential regressions
 */
function checkForRegression(
  originalCode: string | undefined,
  fixedCode: string
): { hasRegression: boolean; description?: string } {
  if (!originalCode) return { hasRegression: false };

  // Check if exports were removed
  const originalExports = (originalCode.match(/export\s+(const|function|default|class)/g) || []).length;
  const fixedExports = (fixedCode.match(/export\s+(const|function|default|class)/g) || []).length;

  if (fixedExports < originalExports) {
    return {
      hasRegression: true,
      description: `Exports reduced from ${originalExports} to ${fixedExports}`,
    };
  }

  // Check if code was significantly shortened
  const lengthRatio = fixedCode.length / originalCode.length;
  if (lengthRatio < 0.5) {
    return {
      hasRegression: true,
      description: `Code shortened by ${Math.round((1 - lengthRatio) * 100)}%`,
    };
  }

  // Check if return statement was removed
  const originalReturns = (originalCode.match(/return\s*\(/g) || []).length;
  const fixedReturns = (fixedCode.match(/return\s*\(/g) || []).length;

  if (originalReturns > 0 && fixedReturns === 0) {
    return {
      hasRegression: true,
      description: 'Return statement may have been removed',
    };
  }

  return { hasRegression: false };
}

/**
 * Quick check if fix likely resolves the error
 */
export function doesFixResolveError(
  errorMessage: string,
  originalCode: string,
  fixedCode: string
): boolean {
  return checkErrorAddressed(errorMessage, originalCode, fixedCode).addressed;
}
