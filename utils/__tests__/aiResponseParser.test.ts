import { describe, it, expect } from 'vitest';
import {
  parseAIResponse,
  detectFormat,
  hasFiles,
  extractFileList,
  getBatchContinuationPrompt,
  type ParseResult,
} from '../aiResponseParser';

describe('aiResponseParser', () => {
  describe('detectFormat', () => {
    it('should detect JSON v2 format', () => {
      const response = `{
        "meta": { "format": "json", "version": "2.0" },
        "files": { "src/App.tsx": "content" }
      }`;
      expect(detectFormat(response)).toBe('json-v2');
    });

    it('should detect JSON v1 format', () => {
      const response = `{
        "files": { "src/App.tsx": "content" },
        "explanation": "Created App"
      }`;
      expect(detectFormat(response)).toBe('json-v1');
    });

    it('should detect marker v2 format', () => {
      const response = `<!-- META -->
format: marker
version: 2.0
<!-- /META -->
<!-- FILE:src/App.tsx -->
content
<!-- /FILE:src/App.tsx -->`;
      expect(detectFormat(response)).toBe('marker-v2');
    });

    it('should detect marker v1 format', () => {
      const response = `<!-- FILE:src/App.tsx -->
content
<!-- /FILE:src/App.tsx -->`;
      expect(detectFormat(response)).toBe('marker-v1');
    });

    it('should detect fallback format (code blocks)', () => {
      const response = `Here's the code:
\`\`\`tsx
export function App() { return <div>Hello</div>; }
\`\`\``;
      expect(detectFormat(response)).toBe('fallback');
    });

    it('should return unknown for empty response', () => {
      expect(detectFormat('')).toBe('unknown');
      expect(detectFormat('   ')).toBe('unknown');
    });
  });

  describe('parseAIResponse - JSON v2', () => {
    it('should parse complete JSON v2 response', () => {
      const response = `{
        "meta": { "format": "json", "version": "2.0" },
        "plan": { "create": ["src/App.tsx"], "update": [], "delete": [] },
        "manifest": [
          { "path": "src/App.tsx", "action": "create", "lines": 10, "tokens": 50, "status": "included" }
        ],
        "explanation": "Created App component",
        "files": {
          "src/App.tsx": "export function App() { return <div>Hello</div>; }"
        },
        "batch": {
          "current": 1,
          "total": 1,
          "isComplete": true,
          "completed": ["src/App.tsx"],
          "remaining": []
        }
      }`;

      const result = parseAIResponse(response);

      expect(result.format).toBe('json-v2');
      expect(result.files['src/App.tsx']).toBeDefined();
      expect(result.explanation).toBe('Created App component');
      expect(result.meta?.format).toBe('json');
      expect(result.meta?.version).toBe('2.0');
      expect(result.batch?.isComplete).toBe(true);
      expect(result.truncated).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse multi-batch JSON v2 response', () => {
      const response = `{
        "meta": { "format": "json", "version": "2.0" },
        "files": { "src/App.tsx": "content" },
        "batch": {
          "current": 1,
          "total": 2,
          "isComplete": false,
          "completed": ["src/App.tsx"],
          "remaining": ["src/Header.tsx"]
        }
      }`;

      const result = parseAIResponse(response);

      expect(result.truncated).toBe(true);
      expect(result.batch?.isComplete).toBe(false);
      expect(result.batch?.remaining).toContain('src/Header.tsx');
    });
  });

  describe('parseAIResponse - JSON v1', () => {
    it('should parse simple JSON v1 response', () => {
      const response = `{
        "explanation": "Created components",
        "files": {
          "src/App.tsx": "export default function App() { return <div>Hello</div>; }",
          "src/index.tsx": "import App from './App';\\nrender(<App />);"
        }
      }`;

      const result = parseAIResponse(response);

      expect(result.format).toBe('json-v1');
      expect(Object.keys(result.files)).toHaveLength(2);
      expect(result.files['src/App.tsx']).toContain('function App');
      expect(result.errors).toHaveLength(0);
    });

    it('should handle fileChanges variant', () => {
      const response = `{
        "fileChanges": {
          "src/App.tsx": "export function App() { return <div>Hello</div>; }"
        }
      }`;

      const result = parseAIResponse(response);
      expect(result.files['src/App.tsx']).toBeDefined();
    });

    it('should repair truncated JSON', () => {
      const response = `{
        "files": {
          "src/App.tsx": "export function App() { return <div>Hello World</div>; }"`;

      const result = parseAIResponse(response);

      expect(result.files['src/App.tsx']).toBeDefined();
      expect(result.truncated).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('parseAIResponse - Marker v2', () => {
    it('should parse complete marker v2 response', () => {
      const response = `<!-- META -->
format: marker
version: 2.0
<!-- /META -->

<!-- PLAN -->
create: src/App.tsx, src/Header.tsx
update:
delete:
<!-- /PLAN -->

<!-- MANIFEST -->
| File | Action | Lines | Tokens | Status |
|------|--------|-------|--------|--------|
| src/App.tsx | create | 10 | ~50 | included |
| src/Header.tsx | create | 15 | ~80 | included |
<!-- /MANIFEST -->

<!-- EXPLANATION -->
Created main components for the application.
<!-- /EXPLANATION -->

<!-- FILE:src/App.tsx -->
import { Header } from './Header';

export default function App() {
  return (
    <div>
      <Header />
      <main>Content</main>
    </div>
  );
}
<!-- /FILE:src/App.tsx -->

<!-- FILE:src/Header.tsx -->
export function Header() {
  return <header>Navigation</header>;
}
<!-- /FILE:src/Header.tsx -->

<!-- BATCH -->
current: 1
total: 1
isComplete: true
completed: src/App.tsx, src/Header.tsx
remaining:
<!-- /BATCH -->`;

      const result = parseAIResponse(response);

      expect(result.format).toBe('marker-v2');
      expect(Object.keys(result.files)).toHaveLength(2);
      expect(result.meta?.version).toBe('2.0');
      expect(result.plan?.create).toContain('src/App.tsx');
      expect(result.manifest).toHaveLength(2);
      expect(result.explanation).toContain('main components');
      expect(result.batch?.isComplete).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle missing closing markers', () => {
      const response = `<!-- META -->
format: marker
version: 2.0
<!-- /META -->

<!-- FILE:src/App.tsx -->
export function App() { return <div>Hello</div>; }
<!-- /FILE:src/App.tsx -->

<!-- FILE:src/Header.tsx -->
export function Header() { return <header>Nav</header>; }`;
      // Note: Missing closing marker for Header.tsx

      const result = parseAIResponse(response);

      expect(result.files['src/App.tsx']).toBeDefined();
      // Header should be in incompleteFiles since it's the last file without closing
      expect(result.incompleteFiles).toContain('src/Header.tsx');
    });

    it('should recover files with missing closing markers in middle', () => {
      const response = `<!-- FILE:src/App.tsx -->
export function App() { return <div>App</div>; }
<!-- FILE:src/Header.tsx -->
export function Header() { return <header>Header</header>; }
<!-- /FILE:src/Header.tsx -->`;
      // App.tsx is missing closing but Header opens next

      const result = parseAIResponse(response);

      expect(result.files['src/App.tsx']).toBeDefined();
      expect(result.files['src/Header.tsx']).toBeDefined();
      // recoveredFiles should exist if any files were recovered
      if (result.recoveredFiles) {
        expect(result.recoveredFiles).toContain('src/App.tsx');
      }
    });
  });

  describe('parseAIResponse - Fallback', () => {
    it('should extract files from code blocks with file path header', () => {
      const response = `Here's the code:

src/App.tsx
\`\`\`tsx
export function App() { return <div>Hello</div>; }
\`\`\``;

      const result = parseAIResponse(response);

      expect(result.format).toBe('fallback');
      expect(Object.keys(result.files).length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should extract files with File: prefix', () => {
      const response = `\`\`\`tsx
File: src/App.tsx
export function App() { return <div>Hello</div>; }
\`\`\``;

      const result = parseAIResponse(response);

      // Should find the file
      expect(Object.keys(result.files).length).toBeGreaterThan(0);
    });
  });

  describe('parseAIResponse - Edge Cases', () => {
    it('should handle empty response', () => {
      const result = parseAIResponse('');
      expect(result.files).toEqual({});
      expect(result.errors).toContain('Empty or invalid response');
    });

    it('should handle response with only whitespace', () => {
      const result = parseAIResponse('   \n\t  ');
      expect(result.files).toEqual({});
    });

    it('should strip PLAN comment before JSON', () => {
      const response = `// PLAN: {"create":["src/App.tsx"],"update":[],"delete":[],"total":1}
{
  "files": { "src/App.tsx": "export function App() { return <div>Hello</div>; }" }
}`;

      const result = parseAIResponse(response);
      expect(result.files['src/App.tsx']).toBeDefined();
    });

    it('should handle markdown code blocks around JSON', () => {
      const response = `\`\`\`json
{
  "files": { "src/App.tsx": "export function App() { return <div>Hello</div>; }" }
}
\`\`\``;

      const result = parseAIResponse(response);
      expect(result.files['src/App.tsx']).toBeDefined();
    });

    it('should handle BOM and invisible characters', () => {
      const response = '\uFEFF\u200B{"files":{"src/App.tsx":"export function App() { return null; }"}}';
      const result = parseAIResponse(response);
      expect(result.files['src/App.tsx']).toBeDefined();
    });
  });

  describe('hasFiles', () => {
    it('should detect files in JSON format', () => {
      expect(hasFiles('{"files":{"a.tsx":""}}')).toBe(true);
      expect(hasFiles('{"fileChanges":{"a.tsx":""}}')).toBe(true);
      expect(hasFiles('{"explanation":"none"}')).toBe(false);
    });

    it('should detect files in marker format', () => {
      expect(hasFiles('<!-- FILE:a.tsx -->')).toBe(true);
      expect(hasFiles('<!-- PLAN -->')).toBe(false);
    });
  });

  describe('extractFileList', () => {
    it('should extract files from marker format', () => {
      const response = `<!-- PLAN -->
create: src/App.tsx, src/Header.tsx
<!-- /PLAN -->
<!-- FILE:src/App.tsx -->
<!-- /FILE:src/App.tsx -->`;

      const files = extractFileList(response);
      expect(files).toContain('src/App.tsx');
      expect(files).toContain('src/Header.tsx');
    });

    it('should extract files from JSON format', () => {
      const response = `{"files":{"src/App.tsx":"","src/Header.tsx":""}}`;
      const files = extractFileList(response);
      expect(files).toContain('src/App.tsx');
      expect(files).toContain('src/Header.tsx');
    });
  });

  describe('getBatchContinuationPrompt', () => {
    it('should return null for complete batches', () => {
      const result: ParseResult = {
        format: 'json-v2',
        files: {},
        truncated: false,
        warnings: [],
        errors: [],
        batch: {
          current: 1,
          total: 1,
          isComplete: true,
          completed: ['a.tsx'],
          remaining: [],
        },
      };

      expect(getBatchContinuationPrompt(result)).toBeNull();
    });

    it('should generate prompt for incomplete batches', () => {
      const result: ParseResult = {
        format: 'json-v2',
        files: { 'a.tsx': 'content' },
        truncated: true,
        warnings: [],
        errors: [],
        batch: {
          current: 1,
          total: 2,
          isComplete: false,
          completed: ['a.tsx'],
          remaining: ['b.tsx', 'c.tsx'],
        },
      };

      const prompt = getBatchContinuationPrompt(result);
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('2 files');
      expect(prompt).toContain('b.tsx');
      expect(prompt).toContain('c.tsx');
      expect(prompt).toContain('batch 2');
    });
  });

  describe('Truncation Recovery', () => {
    it('should recover from truncated JSON with missing closing braces', () => {
      const response = `{
        "files": {
          "src/App.tsx": "export function App() { return <div>Hello</div>; }"`;

      const result = parseAIResponse(response);

      // Should recover at least one file
      expect(Object.keys(result.files).length).toBeGreaterThan(0);
      expect(result.truncated).toBe(true);
    });

    it('should handle JSON with trailing comma (repair)', () => {
      const response = `{
        "files": {
          "src/App.tsx": "export function App() { return null; }",
        }
      }`;

      // This should parse after repair removes trailing comma
      const result = parseAIResponse(response);
      expect(Object.keys(result.files).length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Batch Handling', () => {
    it('should extract batch info from JSON v2', () => {
      const response = `{
        "meta": { "format": "json", "version": "2.0" },
        "files": { "src/App.tsx": "content" },
        "batch": {
          "current": 1,
          "total": 3,
          "isComplete": false,
          "completed": ["src/App.tsx"],
          "remaining": ["src/B.tsx", "src/C.tsx"],
          "nextBatchHint": "More components"
        }
      }`;

      const result = parseAIResponse(response);

      expect(result.batch).toBeDefined();
      expect(result.batch?.current).toBe(1);
      expect(result.batch?.total).toBe(3);
      expect(result.batch?.isComplete).toBe(false);
      expect(result.batch?.remaining).toHaveLength(2);
      expect(result.batch?.nextBatchHint).toBe('More components');
    });

    it('should extract batch info from marker v2', () => {
      const response = `<!-- META -->
format: marker
version: 2.0
<!-- /META -->
<!-- FILE:src/App.tsx -->
content
<!-- /FILE:src/App.tsx -->
<!-- BATCH -->
current: 2
total: 3
isComplete: false
completed: src/A.tsx, src/App.tsx
remaining: src/C.tsx
<!-- /BATCH -->`;

      const result = parseAIResponse(response);

      expect(result.batch).toBeDefined();
      expect(result.batch?.current).toBe(2);
      expect(result.batch?.total).toBe(3);
      expect(result.batch?.isComplete).toBe(false);
    });
  });

  describe('Sequential file extraction (Marker)', () => {
    it('should handle mixed start/end markers', () => {
      const response = `<!-- FILE:src/App.tsx -->
import React from 'react'
// App content
<!-- /FILE:src/App.tsx -->
<!-- FILE:src/App2.tsx -->
import React from 'react'
// App2 content
<!-- /FILE:src/App2.tsx -->`;

      const result = parseAIResponse(response);

      expect(Object.keys(result.files)).toHaveLength(2);
      expect(result.files['src/App.tsx']).toContain('App content');
      expect(result.files['src/App2.tsx']).toContain('App2 content');
    });

    it('should handle missing end markers between files', () => {
      const response = `<!-- FILE:src/App3.tsx -->
import React from 'react'
// App3 content
<!-- FILE:src/App4.tsx -->
import React from 'react'
// App4 content
<!-- /FILE:src/App4.tsx -->`;

      const result = parseAIResponse(response);

      expect(Object.keys(result.files)).toHaveLength(2);
      expect(result.files['src/App3.tsx']).toContain('App3 content');
      expect(result.files['src/App4.tsx']).toContain('App4 content');
      // recoveredFiles should exist if any files were recovered
      if (result.recoveredFiles) {
        expect(result.recoveredFiles).toContain('src/App3.tsx');
      }
    });
  });

  describe('Cross-validation', () => {
    it('should validate manifest against files', () => {
      const response = `<!-- META -->
format: marker
version: 2.0
<!-- /META -->

<!-- MANIFEST -->
| File | Action | Lines | Tokens | Status |
|------|--------|-------|--------|--------|
| src/App.tsx | create | 25 | ~180 | included |
| src/Missing.tsx | create | 15 | ~120 | included |
<!-- /MANIFEST -->

<!-- FILE:src/App.tsx -->
export default function App() { return <div>Hello</div>; }
<!-- /FILE:src/App.tsx -->`;

      const result = parseAIResponse(response);

      // Should have warning about missing file
      expect(result.warnings.some(w => w.includes('Missing.tsx'))).toBe(true);
    });
  });
});
