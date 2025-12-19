/**
 * Tests for cleanCode utility functions
 * Tests JSON parsing, PLAN comment handling, and pre-validation
 */

import { describe, it, expect } from 'vitest';
import {
  preValidateJson,
  stripPlanComment,
  safeParseAIResponse,
  cleanGeneratedCode,
  parseMultiFileResponse,
  fixJsxTextContent,
  fixBareSpecifierImports,
  fixCommonSyntaxErrors,
  validateJsxSyntax,
  validateAndFixCode,
  getErrorContext,
  parseBabelError
} from '../../utils/cleanCode';

describe('cleanCode', () => {
  describe('preValidateJson', () => {
    it('should validate correct JSON', () => {
      const result = preValidateJson('{"key": "value"}');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect empty response', () => {
      const result = preValidateJson('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Empty response');
    });

    it('should handle markdown code blocks', () => {
      const json = '```json\n{"key": "value"}\n```';
      const result = preValidateJson(json);
      expect(result.valid).toBe(true);
    });

    it('should detect unclosed markdown code blocks', () => {
      const json = '```json\n{"key": "value"}';
      const result = preValidateJson(json);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unclosed markdown code block');
    });

    it('should detect invalid text prefixes', () => {
      const prefixes = ['Here is', 'Sure,', 'I\'ll', 'Let me', 'The following'];
      prefixes.forEach(prefix => {
        const result = preValidateJson(`${prefix} the JSON: {"key": "value"}`);
        expect(result.valid).toBe(false);
        expect(result.error).toContain(prefix);
      });
    });

    it('should detect missing opening brace', () => {
      const result = preValidateJson('no json here');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No JSON object found (missing opening brace)');
    });

    it('should fix trailing commas', () => {
      const json = '{"a": 1, "b": 2,}';
      const result = preValidateJson(json);
      expect(result.valid).toBe(true);
      expect(result.fixedJson).toBe('{"a": 1, "b": 2}');
    });

    it('should handle PLAN comment followed by JSON', () => {
      const json = '// PLAN: {"create":[],"update":[],"delete":[],"total":0}\n{"files":{}}';
      const result = preValidateJson(json);
      expect(result.valid).toBe(true);
    });

    it('should provide helpful error context for parse errors', () => {
      const json = '{"key": "value"';
      const result = preValidateJson(json);
      expect(result.valid).toBe(false);
      // Should provide some error context
      expect(result.suggestion).toBeDefined();
    });
  });

  describe('stripPlanComment', () => {
    it('should strip PLAN comment from start', () => {
      const input = '// PLAN: {"create":[],"update":[],"delete":[],"total":0}\n{"files":{}}';
      const result = stripPlanComment(input);
      expect(result).toBe('{"files":{}}');
    });

    it('should handle PLAN with whitespace before', () => {
      const input = '  // PLAN: {"create":[]}\n{"files":{}}';
      const result = stripPlanComment(input);
      expect(result).toBe('{"files":{}}');
    });

    it('should return original if no PLAN comment', () => {
      const input = '{"files":{}}';
      const result = stripPlanComment(input);
      expect(result).toBe('{"files":{}}');
    });

    it('should handle nested braces in PLAN', () => {
      const input = '// PLAN: {"create":["a.tsx"],"update":["b.tsx"],"total":2}\n{"files":{"a.tsx":"code"}}';
      const result = stripPlanComment(input);
      expect(result).toBe('{"files":{"a.tsx":"code"}}');
    });

    it('should return empty string for empty input', () => {
      expect(stripPlanComment('')).toBe('');
    });
  });

  describe('safeParseAIResponse', () => {
    it('should parse valid JSON', () => {
      const result = safeParseAIResponse<{ key: string }>('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    it('should return null for invalid JSON', () => {
      const result = safeParseAIResponse('not json');
      expect(result).toBeNull();
    });

    it('should handle PLAN comment before JSON', () => {
      const input = '// PLAN: {"create":[]}\n{"explanation": "test"}';
      const result = safeParseAIResponse<{ explanation: string }>(input);
      expect(result).toEqual({ explanation: 'test' });
    });

    it('should extract JSON from markdown code blocks', () => {
      const input = '```json\n{"key": "value"}\n```';
      const result = safeParseAIResponse<{ key: string }>(input);
      expect(result).toEqual({ key: 'value' });
    });

    it('should return null for empty input', () => {
      expect(safeParseAIResponse('')).toBeNull();
      expect(safeParseAIResponse(null as unknown as string)).toBeNull();
    });
  });

  describe('cleanGeneratedCode', () => {
    it('should remove markdown code blocks', () => {
      const input = '```typescript\nconst x = 1;\n```';
      const result = cleanGeneratedCode(input);
      expect(result).toBe('const x = 1;');
    });

    it('should remove various language tags', () => {
      const languages = ['javascript', 'typescript', 'tsx', 'jsx', 'ts', 'js', 'react'];
      languages.forEach(lang => {
        const input = `\`\`\`${lang}\nconst x = 1;\n\`\`\``;
        const result = cleanGeneratedCode(input);
        expect(result).toBe('const x = 1;');
      });
    });

    it('should handle code without language tag', () => {
      const input = '```\nconst x = 1;\n```';
      const result = cleanGeneratedCode(input);
      expect(result).toBe('const x = 1;');
    });

    it('should return empty string for empty input', () => {
      expect(cleanGeneratedCode('')).toBe('');
    });

    it('should trim whitespace', () => {
      const input = '  const x = 1;  ';
      const result = cleanGeneratedCode(input);
      expect(result).toBe('const x = 1;');
    });
  });

  describe('parseMultiFileResponse', () => {
    it('should parse valid multi-file response', () => {
      const input = `{"files":{"src/App.tsx":"import React from 'react';\\nexport default function App() { return <div>Hello</div>; }"}}`;
      const result = parseMultiFileResponse(input);
      expect(result).not.toBeNull();
      expect(result?.files['src/App.tsx']).toBeDefined();
    });

    it('should handle PLAN comment', () => {
      const input = '// PLAN: {"create":["src/App.tsx"],"update":[],"delete":[],"total":1}\n{"files":{"src/App.tsx":"const App = () => <div>Test</div>;"}}';
      const result = parseMultiFileResponse(input);
      expect(result).not.toBeNull();
      expect(result?.files['src/App.tsx']).toBeDefined();
    });

    it('should extract explanation', () => {
      const input = '{"explanation":"Added component","files":{"src/App.tsx":"const App = () => null;"}}';
      const result = parseMultiFileResponse(input);
      expect(result?.explanation).toBe('Added component');
    });

    it('should handle deletedFiles array', () => {
      // File content must be at least 10 chars to be valid
      const input = '{"files":{"src/App.tsx":"const App = () => null;"},"deletedFiles":["src/old.tsx"]}';
      const result = parseMultiFileResponse(input);
      expect(result?.deletedFiles).toEqual(['src/old.tsx']);
    });

    it('should skip ignored paths', () => {
      // File content must be at least 10 chars to be valid
      const validCode = 'const App = () => null;';
      const input = `{"files":{"src/App.tsx":"${validCode}",".git/config":"${validCode}","node_modules/pkg/index.js":"${validCode}"}}`;
      const result = parseMultiFileResponse(input);
      expect(result?.files['src/App.tsx']).toBeDefined();
      expect(result?.files['.git/config']).toBeUndefined();
      expect(result?.files['node_modules/pkg/index.js']).toBeUndefined();
    });

    it('should throw for empty files object', () => {
      // parseMultiFileResponse throws when no valid files found
      expect(() => parseMultiFileResponse('{"files":{}}')).toThrow('Model returned no code files');
    });

    it('should handle generationMeta', () => {
      const validCode = 'const App = () => null;';
      const input = `{"files":{"src/App.tsx":"${validCode}"},"generationMeta":{"totalFilesPlanned":3,"filesInThisBatch":["src/App.tsx"],"completedFiles":["src/App.tsx"],"remainingFiles":["src/B.tsx","src/C.tsx"],"currentBatch":1,"totalBatches":3,"isComplete":false}}`;
      const result = parseMultiFileResponse(input);
      expect(result?.generationMeta).toBeDefined();
      expect(result?.generationMeta?.currentBatch).toBe(1);
      expect(result?.generationMeta?.totalBatches).toBe(3);
      expect(result?.generationMeta?.isComplete).toBe(false);
    });

    it('should use cleanGeneratedCode on file content', () => {
      // cleanGeneratedCode removes markdown artifacts
      const codeWithMarkers = '```tsx\nconst App = () => null;\n```';
      const cleaned = cleanGeneratedCode(codeWithMarkers);
      expect(cleaned).toBe('const App = () => null;');
      expect(cleaned).not.toContain('```');
    });
  });

  describe('fixJsxTextContent', () => {
    it('should escape > in arrow patterns like A -> B', () => {
      const input = '<div>A -> B</div>';
      const result = fixJsxTextContent(input);
      expect(result).toContain("{'>'}");
      // The text content "A -> B" has one > that gets escaped
      expect(result).toBe("<div>A -{'>'} B</div>");
    });

    it('should escape < in comparison patterns like x < 5', () => {
      const input = '<p>x < 5</p>';
      const result = fixJsxTextContent(input);
      expect(result).toContain("{'<'}");
    });

    it('should escape > in comparison patterns like x > 10', () => {
      const input = '<span>x > 10</span>';
      const result = fixJsxTextContent(input);
      expect(result).toContain("{'>'}");
    });

    it('should not modify already escaped characters', () => {
      const input = "<div>{'>'}</div>";
      const result = fixJsxTextContent(input);
      // Should still have exactly one {'>'}, not doubled
      expect((result.match(/\{'>'\}/g) || []).length).toBe(1);
    });

    it('should not modify JSX attributes', () => {
      const input = '<div className="test">Hello</div>';
      const result = fixJsxTextContent(input);
      expect(result).toBe(input);
    });

    it('should handle multiple problematic characters', () => {
      const input = '<p>1 < x < 10 and y > 5</p>';
      const result = fixJsxTextContent(input);
      expect((result.match(/\{'<'\}/g) || []).length).toBe(2);
      expect((result.match(/\{'>'\}/g) || []).length).toBe(1);
    });

    it('should preserve normal text without < or >', () => {
      const input = '<div>Hello World</div>';
      const result = fixJsxTextContent(input);
      expect(result).toBe(input);
    });

    it('should return unchanged if no JSX elements present', () => {
      const input = 'const x = a > b ? 1 : 2;';
      const result = fixJsxTextContent(input);
      expect(result).toBe(input);
    });

    it('should handle nested JSX elements', () => {
      const input = '<div><span>A -> B</span></div>';
      const result = fixJsxTextContent(input);
      expect(result).toContain("{'>'}");
    });

    it('should handle JSX expressions in attributes', () => {
      const input = '<div onClick={() => console.log("test")}>Click</div>';
      const result = fixJsxTextContent(input);
      // The arrow function in attribute should NOT be escaped
      expect(result).toContain('() => console.log');
    });
  });

  describe('fixBareSpecifierImports', () => {
    it('should fix src/ bare specifier imports', () => {
      const input = 'import App from "src/App.tsx";';
      const result = fixBareSpecifierImports(input);
      expect(result).toBe('import App from "/src/App.tsx";');
    });

    it('should fix components/ bare specifier imports', () => {
      const input = "import Button from 'components/Button';";
      const result = fixBareSpecifierImports(input);
      expect(result).toBe("import Button from '/components/Button';");
    });

    it('should fix hooks/ bare specifier imports', () => {
      const input = 'import { useAuth } from "hooks/useAuth";';
      const result = fixBareSpecifierImports(input);
      expect(result).toBe('import { useAuth } from "/hooks/useAuth";');
    });

    it('should fix utils/ bare specifier imports', () => {
      const input = 'import { formatDate } from "utils/date";';
      const result = fixBareSpecifierImports(input);
      expect(result).toBe('import { formatDate } from "/utils/date";');
    });

    it('should not modify already valid relative imports', () => {
      const input = 'import App from "./App";';
      const result = fixBareSpecifierImports(input);
      expect(result).toBe(input);
    });

    it('should not modify already valid absolute imports', () => {
      const input = 'import App from "/src/App";';
      const result = fixBareSpecifierImports(input);
      expect(result).toBe(input);
    });

    it('should not modify npm package imports', () => {
      const input = 'import React from "react";';
      const result = fixBareSpecifierImports(input);
      expect(result).toBe(input);
    });

    it('should handle multiple imports in same file', () => {
      const input = `import App from "src/App";
import Button from "components/Button";
import React from "react";`;
      const result = fixBareSpecifierImports(input);
      expect(result).toContain('from "/src/App"');
      expect(result).toContain('from "/components/Button"');
      expect(result).toContain('from "react"');
    });

    it('should fix dynamic imports', () => {
      const input = 'const App = lazy(() => import("src/App"));';
      const result = fixBareSpecifierImports(input);
      expect(result).toBe('const App = lazy(() => import("/src/App"));');
    });

    it('should fix export from statements', () => {
      const input = 'export { Button } from "components/Button";';
      const result = fixBareSpecifierImports(input);
      expect(result).toBe('export { Button } from "/components/Button";');
    });
  });

  describe('fixCommonSyntaxErrors', () => {
    describe('malformed ternary operators', () => {
      it('should fix ") : condition && (" pattern', () => {
        const input = `status === 'error' ? (<Error />) : status === 'loading' && (<Loading />)`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain(`: status === 'loading' ? (`);
        expect(result).not.toContain('&&');
      });

      it('should fix variable-based ") : isLoading && (" pattern', () => {
        const input = `isError ? (<Error />) : isLoading && (<Loading />)`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain(': isLoading ? (');
        expect(result).not.toContain('&& (');
      });

      it('should fix negated condition ") : !condition && ("', () => {
        const input = `isError ? (<Error />) : !isLoading && (<NotLoading />)`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain(': !isLoading ? (');
      });

      it('should fix after JSX closing tag "</Component>) : condition && ("', () => {
        const input = `condition ? (<div>Yes</div>) : otherCondition && (<div>No</div>)`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain('</div>) : otherCondition ? (');
      });

      it('should fix after self-closing JSX "/>) : condition && ("', () => {
        const input = `condition ? (<Icon />) : otherCondition && (<OtherIcon />)`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain('/>) : otherCondition ? (');
      });
    });

    describe('incomplete ternary (missing : null)', () => {
      it('should add ": null" when missing in simple case', () => {
        const input = `{isLoading ? <Spinner /> }`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain(': null}');
      });

      it('should add ": null" when missing with parentheses', () => {
        const input = `{isLoading ? (<Spinner />) }`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain(': null}');
      });

      it('should not add ": null" when already complete', () => {
        const input = `{isLoading ? <Spinner /> : null}`;
        const result = fixCommonSyntaxErrors(input);
        // Should remain unchanged
        expect(result).toBe(input);
      });
    });

    describe('arrow function syntax', () => {
      it('should fix "= >" with space', () => {
        const input = `const fn = () = > { return 1; };`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain('() => {');
      });

      it('should ensure space after arrow before brace', () => {
        const input = `const fn = () =>{`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain('=> {');
      });
    });

    describe('JSX attribute syntax', () => {
      it('should fix missing equals in className', () => {
        const input = `<div className"test">`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toBe('<div className="test">');
      });

      it('should fix double equals in className', () => {
        const input = `<div className=="test">`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toBe('<div className="test">');
      });

      it('should fix missing equals in type', () => {
        const input = `<input type"text">`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toBe('<input type="text">');
      });
    });

    describe('duplicate imports', () => {
      it('should remove exact duplicate imports', () => {
        const input = `import React from 'react';
import React from 'react';
const App = () => <div />;`;
        const result = fixCommonSyntaxErrors(input);
        const reactImports = result.match(/import React from 'react'/g);
        expect(reactImports?.length).toBe(1);
      });

      it('should merge named imports from same source', () => {
        const input = `import { useState } from 'react';
import { useEffect } from 'react';
const App = () => {};`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain('useState');
        expect(result).toContain('useEffect');
        // Should have only one import from 'react'
        const reactImports = result.match(/from 'react'/g);
        expect(reactImports?.length).toBe(1);
      });

      it('should merge default and named imports', () => {
        const input = `import React from 'react';
import { useState } from 'react';
const App = () => {};`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain('React');
        expect(result).toContain('useState');
        const reactImports = result.match(/from 'react'/g);
        expect(reactImports?.length).toBe(1);
      });
    });

    describe('JSX structural issues', () => {
      it('should fix double closing braces before JSX tag', () => {
        const input = `{value}}</div>`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toBe('{value}</div>');
      });

      it('should fix double opening braces', () => {
        const input = `<div>{ { value }</div>`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain('{ value');
        expect(result).not.toContain('{ {');
      });
    });

    describe('TypeScript issues', () => {
      it('should fix trailing comma before closing brace', () => {
        const input = `interface Props { a: string, }`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toBe('interface Props { a: string }');
      });

      it('should fix missing closing > in React.FC generic', () => {
        const input = `const App: React.FC<Props = () => <div />`;
        const result = fixCommonSyntaxErrors(input);
        expect(result).toContain('React.FC<Props>');
      });
    });

    describe('unclosed template literals', () => {
      it('should close unclosed template literal', () => {
        const input = 'const str = `hello world';
        const result = fixCommonSyntaxErrors(input);
        const backticks = result.match(/`/g);
        expect(backticks?.length).toBe(2);
      });

      it('should not modify already closed template literal', () => {
        const input = 'const str = `hello world`';
        const result = fixCommonSyntaxErrors(input);
        expect(result).toBe(input);
      });
    });

    it('should handle empty input', () => {
      expect(fixCommonSyntaxErrors('')).toBe('');
    });

    it('should not break valid code', () => {
      const validCode = `
import React, { useState, useEffect } from 'react';

const App: React.FC<Props> = () => {
  const [count, setCount] = useState(0);

  return (
    <div className="container">
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <Error />
      ) : (
        <Content />
      )}
    </div>
  );
};

export default App;
`;
      const result = fixCommonSyntaxErrors(validCode);
      // Valid code should remain essentially the same
      expect(result).toContain('useState');
      expect(result).toContain('useEffect');
      expect(result).toContain('isLoading ?');
      expect(result).toContain('isError ?');
      expect(result).toContain('<Content />');
    });
  });

  describe('validateJsxSyntax', () => {
    it('should detect malformed ternary patterns', () => {
      const code = `{status === 'error' ? (<Error />) : isLoading && (<Spinner />)}`;
      const issues = validateJsxSyntax(code);
      expect(issues.some(i => i.message.includes('Malformed ternary'))).toBe(true);
    });

    it('should detect arrow function syntax errors', () => {
      const code = `const fn = () = > { return 1; };`;
      const issues = validateJsxSyntax(code);
      expect(issues.some(i => i.message.includes('arrow function'))).toBe(true);
    });

    it('should detect missing equals in JSX attribute', () => {
      const code = `<div className"test">`;
      const issues = validateJsxSyntax(code);
      expect(issues.some(i => i.message.includes('Missing ='))).toBe(true);
    });

    it('should detect unbalanced braces', () => {
      const code = `function test() { if (true) { return 1; }`;
      const issues = validateJsxSyntax(code);
      expect(issues.some(i => i.message.includes('Unbalanced braces'))).toBe(true);
    });

    it('should detect unbalanced parentheses', () => {
      const code = `function test(a, b { return a + b; }`;
      const issues = validateJsxSyntax(code);
      expect(issues.some(i => i.message.includes('Unbalanced parentheses'))).toBe(true);
    });

    it('should return empty array for valid code', () => {
      const code = `
const App = () => {
  return (
    <div>
      {isLoading ? <Spinner /> : <Content />}
    </div>
  );
};`;
      const issues = validateJsxSyntax(code);
      const errors = issues.filter(i => i.type === 'error');
      expect(errors.length).toBe(0);
    });
  });

  describe('validateAndFixCode', () => {
    it('should detect syntax issues but not modify code', () => {
      // validateAndFixCode no longer attempts to fix code - it only validates
      // This prevents aggressive "fixes" from breaking working LLM-generated code
      const code = `const fn = () = > { return 1; };`;
      const result = validateAndFixCode(code, 'test.tsx');

      // Should return original code unchanged
      expect(result.code).toBe(code);
      expect(result.fixed).toBe(false);

      // Should detect the issue
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.message.includes('arrow function'))).toBe(true);
    });

    it('should detect multiple issues without modifying code', () => {
      const code = `
        const App = () = > {
          return (
            <div className"test">
            </div>
          );
        };
      `;
      const result = validateAndFixCode(code, 'test.tsx');

      // Should return original code unchanged
      expect(result.code).toBe(code);
      expect(result.fixed).toBe(false);

      // Should detect issues (arrow function and/or JSX attribute)
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should handle empty input', () => {
      const result = validateAndFixCode('');
      expect(result.code).toBe('');
      expect(result.fixed).toBe(false);
      expect(result.issues).toEqual([]);
    });

    it('should return no issues for valid code', () => {
      const code = `const App = () => { return <div className="test"></div>; };`;
      const result = validateAndFixCode(code, 'test.tsx');
      expect(result.code).toBe(code);
      expect(result.fixed).toBe(false);
      // Valid code should have few or no issues
    });
  });

  describe('getErrorContext', () => {
    it('should extract context around error line', () => {
      const code = `line 1
line 2
line 3
line 4
line 5`;
      const context = getErrorContext(code, 3, 1);
      expect(context).toContain('>>> ');
      expect(context).toContain('line 3');
      expect(context).toContain('line 2');
      expect(context).toContain('line 4');
    });

    it('should handle edge cases at start of file', () => {
      const code = `line 1
line 2
line 3`;
      const context = getErrorContext(code, 1, 2);
      expect(context).toContain('>>> ');
      expect(context).toContain('line 1');
    });

    it('should handle edge cases at end of file', () => {
      const code = `line 1
line 2
line 3`;
      const context = getErrorContext(code, 3, 2);
      expect(context).toContain('>>> ');
      expect(context).toContain('line 3');
    });
  });

  describe('parseBabelError', () => {
    it('should extract line and column from error with (line:col) format', () => {
      const error = 'file.tsx: Unexpected token (15:23)';
      const result = parseBabelError(error);
      expect(result.line).toBe(15);
      expect(result.column).toBe(23);
    });

    it('should extract line from "Line N:" format', () => {
      const error = 'Line 42: Unexpected identifier';
      const result = parseBabelError(error);
      expect(result.line).toBe(42);
      expect(result.message).toContain('Unexpected identifier');
    });

    it('should return just message for unrecognized format', () => {
      const error = 'Some random error message';
      const result = parseBabelError(error);
      expect(result.line).toBeUndefined();
      expect(result.column).toBeUndefined();
      expect(result.message).toBe('Some random error message');
    });
  });
});
