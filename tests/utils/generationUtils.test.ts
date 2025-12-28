/**
 * Generation Utils - Comprehensive Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateFileChanges,
  createTokenUsage,
  buildSystemInstruction,
  buildPromptParts,
  markFilesAsShared,
  getFileContextStats,
  clearFileContext,
} from '../../utils/generationUtils';
import type { FileSystem } from '../../types';

// Mock dependencies
vi.mock('../../utils/codemap', () => ({
  generateContextForPrompt: vi.fn(() => '### Project Structure\n- src/App.tsx'),
}));

vi.mock('../../services/promptTemplates', () => ({
  getGenerationPrompt: vi.fn((format) =>
    format === 'marker'
      ? 'Generate code with markers'
      : 'Generate code with JSON'
  ),
}));

vi.mock('../../services/projectContext', () => ({
  getContextForPrompt: vi.fn(() => null),
}));

vi.mock('../../services/context/fileContextTracker', () => ({
  getFileContextTracker: vi.fn(() => ({
    getDelta: vi.fn(() => ({
      changed: [],
      unchanged: [],
      deleted: [],
      new: [],
    })),
    hasTrackedFiles: vi.fn(() => false),
    markFilesAsShared: vi.fn(),
    getStats: vi.fn(() => ({ totalFiles: 0, trackedFiles: 0 })),
    clear: vi.fn(),
    getFileState: vi.fn(() => null),
  })),
}));

describe('generationUtils', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('calculateFileChanges', () => {
    it('should return empty array for identical file systems', () => {
      const files: FileSystem = {
        'src/App.tsx': 'export default App',
        'src/index.ts': 'import App',
      };
      const changes = calculateFileChanges(files, files);
      expect(changes).toEqual([]);
    });

    it('should detect added files', () => {
      const oldFiles: FileSystem = {};
      const newFiles: FileSystem = {
        'src/App.tsx': 'line1\nline2\nline3',
        'src/index.ts': 'line1',
      };
      const changes = calculateFileChanges(oldFiles, newFiles);

      expect(changes).toHaveLength(2);
      expect(changes[0]).toMatchObject({
        type: 'added',
        additions: 3,
        deletions: 0,
      });
      expect(changes[1]).toMatchObject({
        type: 'added',
        additions: 1,
        deletions: 0,
      });
    });

    it('should detect deleted files', () => {
      const oldFiles: FileSystem = {
        'src/App.tsx': 'line1\nline2',
        'src/utils.ts': 'line1',
      };
      const newFiles: FileSystem = {};
      const changes = calculateFileChanges(oldFiles, newFiles);

      expect(changes).toHaveLength(2);
      expect(changes.every(c => c.type === 'deleted')).toBe(true);
      expect(changes.find(c => c.path === 'src/App.tsx')).toMatchObject({
        additions: 0,
        deletions: 2,
      });
    });

    it('should detect modified files with additions', () => {
      const oldFiles: FileSystem = {
        'src/App.tsx': 'line1\nline2',
      };
      const newFiles: FileSystem = {
        'src/App.tsx': 'line1\nline2\nline3\nline4',
      };
      const changes = calculateFileChanges(oldFiles, newFiles);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        path: 'src/App.tsx',
        type: 'modified',
        additions: 2,
        deletions: 0,
      });
    });

    it('should detect modified files with deletions', () => {
      const oldFiles: FileSystem = {
        'src/App.tsx': 'line1\nline2\nline3\nline4',
      };
      const newFiles: FileSystem = {
        'src/App.tsx': 'line1\nline2',
      };
      const changes = calculateFileChanges(oldFiles, newFiles);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        path: 'src/App.tsx',
        type: 'modified',
        additions: 0,
        deletions: 2,
      });
    });

    it('should handle mixed changes (add, delete, modify)', () => {
      const oldFiles: FileSystem = {
        'src/App.tsx': 'old content',
        'src/delete-me.ts': 'will be deleted',
      };
      const newFiles: FileSystem = {
        'src/App.tsx': 'new content\nmore lines',
        'src/new-file.ts': 'brand new',
      };
      const changes = calculateFileChanges(oldFiles, newFiles);

      expect(changes).toHaveLength(3);
      expect(changes.find(c => c.path === 'src/App.tsx')?.type).toBe('modified');
      expect(changes.find(c => c.path === 'src/delete-me.ts')?.type).toBe('deleted');
      expect(changes.find(c => c.path === 'src/new-file.ts')?.type).toBe('added');
    });

    it('should not report unchanged files', () => {
      const oldFiles: FileSystem = {
        'src/App.tsx': 'content',
        'src/unchanged.ts': 'same',
      };
      const newFiles: FileSystem = {
        'src/App.tsx': 'new content',
        'src/unchanged.ts': 'same',
      };
      const changes = calculateFileChanges(oldFiles, newFiles);

      expect(changes).toHaveLength(1);
      expect(changes[0].path).toBe('src/App.tsx');
    });

    it('should handle empty file systems', () => {
      const changes = calculateFileChanges({}, {});
      expect(changes).toEqual([]);
    });
  });

  describe('createTokenUsage', () => {
    it('should use API usage when both input and output provided', () => {
      const usage = createTokenUsage(
        { inputTokens: 100, outputTokens: 200 },
        'prompt',
        'response'
      );

      expect(usage).toEqual({
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
      });
    });

    it('should use API usage with only input tokens', () => {
      const usage = createTokenUsage(
        { inputTokens: 150, outputTokens: 0 },
        'prompt'
      );

      expect(usage).toEqual({
        inputTokens: 150,
        outputTokens: 0,
        totalTokens: 150,
      });
    });

    it('should use API usage with only output tokens', () => {
      const usage = createTokenUsage(
        { inputTokens: 0, outputTokens: 250 },
        undefined,
        'response'
      );

      expect(usage).toEqual({
        inputTokens: 0,
        outputTokens: 250,
        totalTokens: 250,
      });
    });

    it('should estimate from response when no API usage', () => {
      const response = 'a'.repeat(400); // 400 chars = ~100 tokens
      const usage = createTokenUsage(undefined, 'prompt', response);

      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(100);
      expect(usage.totalTokens).toBe(100);
    });

    it('should estimate from newFiles when no API usage or response', () => {
      const newFiles = {
        'file1.ts': 'a'.repeat(200),
        'file2.ts': 'b'.repeat(200),
      };
      const usage = createTokenUsage(undefined, undefined, undefined, newFiles);

      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(100); // 400 chars / 4
      expect(usage.totalTokens).toBe(100);
    });

    it('should handle empty response', () => {
      const usage = createTokenUsage(undefined, '', '');

      expect(usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });

    it('should handle undefined values gracefully', () => {
      const usage = createTokenUsage();

      expect(usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });

    it('should prioritize API usage over estimation', () => {
      const usage = createTokenUsage(
        { inputTokens: 50, outputTokens: 75 },
        'a'.repeat(1000), // Would estimate much higher
        'b'.repeat(1000)
      );

      expect(usage).toEqual({
        inputTokens: 50,
        outputTokens: 75,
        totalTokens: 125,
      });
    });

    it('should round up token estimates', () => {
      const response = 'abc'; // 3 chars should round to 1 token
      const usage = createTokenUsage(undefined, '', response);

      expect(usage.outputTokens).toBe(1);
    });
  });

  describe('buildSystemInstruction', () => {
    it('should build basic instruction for new app', () => {
      const instruction = buildSystemInstruction(
        false, // not existing app
        false, // no brand
        false, // not education mode
        false, // diff mode disabled
        '\n\n**Tech Stack**: React + Tailwind'
      );

      expect(instruction).toBeDefined();
      expect(typeof instruction).toBe('string');
      expect(instruction).toContain('Tech Stack');
    });

    it('should include brand instruction when hasBrand is true', () => {
      const instruction = buildSystemInstruction(
        false,
        true, // has brand
        false,
        false,
        ''
      );

      expect(instruction).toContain('BRANDING');
      expect(instruction).toContain('PRIMARY DOMINANT COLOR');
    });

    it('should include education mode instruction when enabled', () => {
      const instruction = buildSystemInstruction(
        false,
        false,
        true, // education mode
        false,
        ''
      );

      expect(instruction).toContain('EDUCATION MODE');
      expect(instruction).toContain('inline comments');
    });

    it('should include tech stack instruction', () => {
      const techStack = '\n\n**Framework**: Next.js 14';
      const instruction = buildSystemInstruction(
        false,
        false,
        false,
        false,
        techStack
      );

      expect(instruction).toContain('Framework');
      expect(instruction).toContain('Next.js 14');
    });

    it('should include update instructions for existing app', () => {
      const instruction = buildSystemInstruction(
        true, // existing app
        false,
        false,
        false,
        ''
      );

      expect(instruction).toBeDefined();
      // Should include some update mode instruction
      expect(instruction.length).toBeGreaterThan(0);
    });

    it('should use marker format when specified', () => {
      const instruction = buildSystemInstruction(
        true,
        false,
        false,
        false,
        '',
        'marker' // response format
      );

      expect(instruction).toContain('markers');
    });

    it('should handle all flags combined', () => {
      const instruction = buildSystemInstruction(
        true, // existing app
        true, // has brand
        true, // education mode
        true, // diff mode
        '\n\n**Tech**: Vite + React'
      );

      expect(instruction).toContain('BRANDING');
      expect(instruction).toContain('EDUCATION MODE');
      expect(instruction).toContain('Tech');
    });
  });

  describe('buildPromptParts', () => {
    it('should build prompt for new app without attachments', () => {
      const result = buildPromptParts(
        'Create a landing page',
        [], // no attachments
        {}, // no files
        false // not existing app
      );

      expect(result.promptParts).toHaveLength(1);
      expect(result.promptParts[0]).toContain('Create a React app');
      expect(result.promptParts[0]).toContain('landing page');
      expect(result.images).toEqual([]);
    });

    it('should include sketch attachment', () => {
      const result = buildPromptParts(
        'Build this',
        [{
          type: 'sketch',
          file: { name: 'sketch.png', type: 'image/png' } as File,
          preview: 'data:image/png;base64,abc123',
        }],
        {},
        false
      );

      expect(result.promptParts[0]).toContain('SKETCH/WIREFRAME');
      expect(result.images).toHaveLength(1);
      expect(result.images[0]).toMatchObject({
        data: 'abc123',
        mimeType: 'image/png',
      });
    });

    it('should include brand attachment', () => {
      const result = buildPromptParts(
        'Build this',
        [{
          type: 'brand',
          file: { name: 'logo.jpg', type: 'image/jpeg' } as File,
          preview: 'data:image/jpeg;base64,xyz789',
        }],
        {},
        false
      );

      expect(result.promptParts[0]).toContain('BRAND LOGO');
      expect(result.images).toHaveLength(1);
      expect(result.images[0].mimeType).toBe('image/jpeg');
    });

    it('should include both sketch and brand', () => {
      const result = buildPromptParts(
        'Build app',
        [
          {
            type: 'sketch',
            file: { name: 'sketch.png', type: 'image/png' } as File,
            preview: 'data:image/png;base64,sketch',
          },
          {
            type: 'brand',
            file: { name: 'logo.png', type: 'image/png' } as File,
            preview: 'data:image/png;base64,brand',
          },
        ],
        {},
        false
      );

      expect(result.promptParts[0]).toContain('SKETCH/WIREFRAME');
      expect(result.promptParts[1]).toContain('BRAND LOGO');
      expect(result.images).toHaveLength(2);
    });

    it('should handle existing app with files', () => {
      const files: FileSystem = {
        'src/App.tsx': 'export default App',
      };

      const result = buildPromptParts(
        'Add a button',
        [],
        files,
        true // existing app
      );

      expect(result.promptParts.length).toBeGreaterThan(1);
      expect(result.promptParts.some(p => p.includes('Project Structure'))).toBe(true);
    });

    it('should return file context info', () => {
      const result = buildPromptParts(
        'Update app',
        [],
        {},
        false
      );

      expect(result.fileContext).toBeDefined();
      expect(result.fileDelta).toBeDefined();
    });

    it('should use custom context ID', () => {
      const result = buildPromptParts(
        'Test',
        [],
        {},
        false,
        'custom-context'
      );

      expect(result).toBeDefined();
      expect(result.promptParts).toBeDefined();
    });
  });

  describe('markFilesAsShared', () => {
    it('should mark files when delta mode enabled', () => {
      localStorage.setItem('fileContextEnabled', 'true');
      const files: FileSystem = { 'src/App.tsx': 'content' };

      // Should not throw
      expect(() => markFilesAsShared(files)).not.toThrow();
    });

    it('should skip when delta mode disabled', () => {
      localStorage.setItem('fileContextEnabled', 'false');
      const files: FileSystem = { 'src/App.tsx': 'content' };

      // Should not throw
      expect(() => markFilesAsShared(files)).not.toThrow();
    });

    it('should accept custom context ID', () => {
      const files: FileSystem = { 'src/App.tsx': 'content' };

      expect(() => markFilesAsShared(files, 'custom-id')).not.toThrow();
    });
  });

  describe('getFileContextStats', () => {
    it('should return stats for empty file system', () => {
      const stats = getFileContextStats({});

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('totalFiles');
      expect(stats).toHaveProperty('trackedFiles');
    });

    it('should return stats for file system with files', () => {
      const files: FileSystem = {
        'src/App.tsx': 'content',
        'src/utils.ts': 'utils',
      };
      const stats = getFileContextStats(files);

      expect(stats).toBeDefined();
    });

    it('should accept custom context ID', () => {
      const stats = getFileContextStats({}, 'custom-context');
      expect(stats).toBeDefined();
    });
  });

  describe('clearFileContext', () => {
    it('should clear default context', () => {
      expect(() => clearFileContext()).not.toThrow();
    });

    it('should clear custom context', () => {
      expect(() => clearFileContext('custom-context')).not.toThrow();
    });
  });
});
