/**
 * LocalFixEngine - Fixes common errors without AI
 *
 * This engine handles simple, deterministic fixes:
 * - Bare specifier → relative path conversion
 * - Missing common imports (React, hooks, libraries)
 * - Simple syntax errors
 * - Undefined variables with obvious imports
 */

import { FileSystem } from '../../types';
import { COMMON_IMPORTS } from './commonImports';

export interface LocalFixResult {
  success: boolean;
  fixedFiles: Record<string, string>;
  explanation: string;
  fixType: 'bare-specifier' | 'missing-import' | 'syntax' | 'undefined-var' | 'none';
}

class LocalFixEngine {
  /**
   * Attempt to fix an error without AI
   */
  tryFix(
    errorMessage: string,
    errorStack: string | undefined,
    targetFile: string,
    files: FileSystem
  ): LocalFixResult {
    // Try each fix strategy in order
    const strategies = [
      () => this.fixBareSpecifier(errorMessage, files),
      () => this.fixMissingImport(errorMessage, targetFile, files),
      () => this.fixUndefinedVariable(errorMessage, targetFile, files),
    ];

    for (const strategy of strategies) {
      const result = strategy();
      if (result.success) {
        return result;
      }
    }

    return {
      success: false,
      fixedFiles: {},
      explanation: 'No local fix available',
      fixType: 'none'
    };
  }

  /**
   * Fix bare specifier imports (src/... → ./...)
   */
  private fixBareSpecifier(errorMessage: string, files: FileSystem): LocalFixResult {
    // Extract the bad import path
    const bareSpecifierMatch = errorMessage.match(/["']([^"']+)["']\s*was\s*a?\s*bare\s*specifier/i) ||
                                errorMessage.match(/specifier\s*["']([^"']+)["']/i);

    if (!bareSpecifierMatch) {
      return { success: false, fixedFiles: {}, explanation: '', fixType: 'none' };
    }

    const badPath = bareSpecifierMatch[1];

    // Only fix if it looks like a local path (starts with src/, ./, or similar)
    if (!badPath.startsWith('src/') && !badPath.includes('/components/') && !badPath.includes('/utils/')) {
      return { success: false, fixedFiles: {}, explanation: '', fixType: 'none' };
    }

    const fixedFiles: Record<string, string> = {};
    let fixCount = 0;

    // Find all files that import this path
    for (const [filePath, content] of Object.entries(files)) {
      if (!content) continue;

      // Check if this file has the bad import
      const importRegex = new RegExp(
        `(import\\s+(?:[\\w\\s{},*]+\\s+from\\s+)?['"])${this.escapeRegex(badPath)}(['"])`,
        'g'
      );

      if (importRegex.test(content)) {
        // Calculate the relative path
        const relativePath = this.calculateRelativePath(filePath, badPath);

        if (relativePath) {
          const fixedContent = content.replace(
            new RegExp(`(['"])${this.escapeRegex(badPath)}(['"])`, 'g'),
            `$1${relativePath}$2`
          );

          if (fixedContent !== content) {
            fixedFiles[filePath] = fixedContent;
            fixCount++;
          }
        }
      }
    }

    if (fixCount > 0) {
      return {
        success: true,
        fixedFiles,
        explanation: `Fixed ${fixCount} bare specifier import(s): "${badPath}" → relative path`,
        fixType: 'bare-specifier'
      };
    }

    return { success: false, fixedFiles: {}, explanation: '', fixType: 'none' };
  }

  /**
   * Fix missing imports for known libraries
   */
  private fixMissingImport(errorMessage: string, targetFile: string, files: FileSystem): LocalFixResult {
    // Extract the undefined identifier
    const undefinedMatch = errorMessage.match(/['"]?(\w+)['"]?\s+is\s+not\s+defined/i) ||
                           errorMessage.match(/Cannot find name ['"]?(\w+)['"]?/i) ||
                           errorMessage.match(/ReferenceError:\s*(\w+)\s+is\s+not\s+defined/i);

    if (!undefinedMatch) {
      return { success: false, fixedFiles: {}, explanation: '', fixType: 'none' };
    }

    const identifier = undefinedMatch[1];
    const importInfo = COMMON_IMPORTS[identifier];

    if (!importInfo) {
      return { success: false, fixedFiles: {}, explanation: '', fixType: 'none' };
    }

    const content = files[targetFile];
    if (!content) {
      return { success: false, fixedFiles: {}, explanation: '', fixType: 'none' };
    }

    // Check if already imported
    const existingImportRegex = new RegExp(
      `import\\s+.*?\\b${identifier}\\b.*?from\\s+['"]${this.escapeRegex(importInfo.from)}['"]`,
      'm'
    );

    if (existingImportRegex.test(content)) {
      return { success: false, fixedFiles: {}, explanation: 'Already imported', fixType: 'none' };
    }

    // Generate the import statement
    let importStatement: string;
    if (importInfo.isDefault) {
      importStatement = `import ${identifier} from '${importInfo.from}';\n`;
    } else if (importInfo.isType) {
      importStatement = `import type { ${identifier} } from '${importInfo.from}';\n`;
    } else {
      importStatement = `import { ${identifier} } from '${importInfo.from}';\n`;
    }

    // Try to add to existing import from same package
    const existingPackageImport = new RegExp(
      `(import\\s+)({[^}]*})(\\s+from\\s+['"]${this.escapeRegex(importInfo.from)}['"])`,
      'm'
    );

    let fixedContent: string;
    const packageMatch = content.match(existingPackageImport);

    if (packageMatch && !importInfo.isDefault) {
      // Add to existing import
      const existingImports = packageMatch[2];
      const newImports = existingImports.replace('}', `, ${identifier}}`);
      fixedContent = content.replace(existingPackageImport, `$1${newImports}$3`);
    } else {
      // Add new import at the top (after any existing imports)
      const firstImportMatch = content.match(/^(import\s+.*?['"][^'"]+['"];?\s*\n)/m);
      if (firstImportMatch) {
        // Add after first import
        const insertPos = content.indexOf(firstImportMatch[0]) + firstImportMatch[0].length;
        fixedContent = content.slice(0, insertPos) + importStatement + content.slice(insertPos);
      } else {
        // No imports, add at the very top
        fixedContent = importStatement + content;
      }
    }

    return {
      success: true,
      fixedFiles: { [targetFile]: fixedContent },
      explanation: `Added missing import: ${identifier} from '${importInfo.from}'`,
      fixType: 'missing-import'
    };
  }

  /**
   * Fix undefined variable by looking for local components/exports
   */
  private fixUndefinedVariable(errorMessage: string, targetFile: string, files: FileSystem): LocalFixResult {
    const undefinedMatch = errorMessage.match(/['"]?(\w+)['"]?\s+is\s+not\s+defined/i) ||
                           errorMessage.match(/Cannot find name ['"]?(\w+)['"]?/i);

    if (!undefinedMatch) {
      return { success: false, fixedFiles: {}, explanation: '', fixType: 'none' };
    }

    const identifier = undefinedMatch[1];

    // Skip if it's a known import
    if (COMMON_IMPORTS[identifier]) {
      return { success: false, fixedFiles: {}, explanation: '', fixType: 'none' };
    }

    const content = files[targetFile];
    if (!content) {
      return { success: false, fixedFiles: {}, explanation: '', fixType: 'none' };
    }

    // Look for a local file that exports this identifier
    for (const [filePath, fileContent] of Object.entries(files)) {
      if (!fileContent || filePath === targetFile) continue;

      // Check for default export with this name
      const defaultExportMatch = fileContent.match(
        new RegExp(`export\\s+default\\s+(?:function|class|const)?\\s*${identifier}\\b`, 'm')
      ) || fileContent.match(
        new RegExp(`export\\s+default\\s+${identifier}\\b`, 'm')
      );

      // Check for named export
      const namedExportMatch = fileContent.match(
        new RegExp(`export\\s+(?:const|let|var|function|class|interface|type)\\s+${identifier}\\b`, 'm')
      ) || fileContent.match(
        new RegExp(`export\\s*{[^}]*\\b${identifier}\\b[^}]*}`, 'm')
      );

      if (defaultExportMatch || namedExportMatch) {
        const relativePath = this.calculateRelativePath(targetFile, filePath);
        if (!relativePath) continue;

        // Remove extension for import
        const importPath = relativePath.replace(/\.(tsx?|jsx?)$/, '');

        let importStatement: string;
        if (defaultExportMatch) {
          importStatement = `import ${identifier} from '${importPath}';\n`;
        } else {
          importStatement = `import { ${identifier} } from '${importPath}';\n`;
        }

        // Add import at the top
        const firstImportMatch = content.match(/^(import\s+.*?['"][^'"]+['"];?\s*\n)/m);
        let fixedContent: string;

        if (firstImportMatch) {
          const insertPos = content.indexOf(firstImportMatch[0]) + firstImportMatch[0].length;
          fixedContent = content.slice(0, insertPos) + importStatement + content.slice(insertPos);
        } else {
          fixedContent = importStatement + content;
        }

        return {
          success: true,
          fixedFiles: { [targetFile]: fixedContent },
          explanation: `Added import for ${identifier} from '${importPath}'`,
          fixType: 'undefined-var'
        };
      }
    }

    return { success: false, fixedFiles: {}, explanation: '', fixType: 'none' };
  }

  /**
   * Calculate relative path from one file to another
   */
  private calculateRelativePath(fromFile: string, toPath: string): string | null {
    // Normalize paths
    const fromParts = fromFile.replace(/\\/g, '/').split('/');
    fromParts.pop(); // Remove filename, keep directory

    let toParts: string[];

    // If toPath starts with src/, remove it and treat as relative to src
    if (toPath.startsWith('src/')) {
      toParts = toPath.slice(4).split('/');
    } else {
      toParts = toPath.replace(/\\/g, '/').split('/');
    }

    // Find common prefix length
    let commonLength = 0;
    const fromDir = fromParts.filter(p => p && p !== 'src');
    const toDir = toParts.slice(0, -1);

    for (let i = 0; i < Math.min(fromDir.length, toDir.length); i++) {
      if (fromDir[i] === toDir[i]) {
        commonLength++;
      } else {
        break;
      }
    }

    // Calculate relative path
    const upCount = fromDir.length - commonLength;
    const downPath = toParts.slice(commonLength);

    let relativePath = '';
    if (upCount === 0) {
      relativePath = './' + downPath.join('/');
    } else {
      relativePath = '../'.repeat(upCount) + downPath.join('/');
    }

    // Remove extension if present
    relativePath = relativePath.replace(/\.(tsx?|jsx?)$/, '');

    return relativePath;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export const localFixEngine = new LocalFixEngine();
