/**
 * Tests for syntaxFixer.ts - Comprehensive syntax error detection and auto-repair
 */

import { describe, it, expect } from 'vitest';
import {
  fixMalformedTernary,
  fixArrowFunctions,
  fixJsxAttributes,
  fixStringIssues,
  fixTypeScriptIssues,
  extractJsxTags,
  findUnclosedTags,
  fixJsxTagBalance,
  fixBracketBalanceAdvanced,
  parseImports,
  fixAndMergeImports,
  fixReturnStatements,
  aggressiveFix,
  quickValidate,
  safeAggressiveFix,
} from '@/utils/syntaxFixer';

// ============================================================================
// fixMalformedTernary tests
// ============================================================================

describe('fixMalformedTernary', () => {
  it('should wrap condition && JSX after ternary else', () => {
    const input = 'isActive ? <Active /> : isLoading && <Loading />';
    const result = fixMalformedTernary(input);
    expect(result).toContain('(isLoading &&');
  });

  it('should add : null for incomplete ternary', () => {
    const input = '{ condition ? <Component /> }';
    const result = fixMalformedTernary(input);
    expect(result).toContain(': null');
  });

  it('should not modify valid ternary expressions', () => {
    const input = 'condition ? <Yes /> : <No />';
    const result = fixMalformedTernary(input);
    expect(result).toBe(input);
  });

  it('should handle nested ternary in else branch', () => {
    const input = 'a ? <A /> : b ? <B />';
    const result = fixMalformedTernary(input);
    expect(result).toContain('(b ?');
  });
});

// ============================================================================
// fixArrowFunctions tests
// ============================================================================

describe('fixArrowFunctions', () => {
  it('should fix = > to =>', () => {
    const input = 'const fn = () = > value';
    const result = fixArrowFunctions(input);
    expect(result).toBe('const fn = () => value');
  });

  it('should fix ( ) => to () =>', () => {
    const input = 'const fn = ( ) => value';
    const result = fixArrowFunctions(input);
    expect(result).toBe('const fn = () => value');
  });

  it('should fix missing arrow after parameter list', () => {
    const input = 'const fn = (x) { return x; }';
    const result = fixArrowFunctions(input);
    expect(result).toContain(') => {');
  });

  it('should fix async functions missing arrow', () => {
    const input = 'const fn = async () { return 1; }';
    const result = fixArrowFunctions(input);
    expect(result).toContain('=> {');
  });

  it('should not modify valid arrow functions', () => {
    const input = 'const fn = () => value';
    const result = fixArrowFunctions(input);
    expect(result).toBe(input);
  });

  it('should fix hybrid function/arrow syntax: function Name() => {', () => {
    const input = 'export function GridOverlay() => {';
    const result = fixArrowFunctions(input);
    expect(result).toBe('export function GridOverlay() {');
  });

  it('should fix hybrid function/arrow with params: function Name(props) => {', () => {
    const input = 'function GlowCard({ children, className }: Props) => {';
    const result = fixArrowFunctions(input);
    expect(result).toBe('function GlowCard({ children, className }: Props) {');
  });

  it('should fix hybrid function/arrow with complex TS params', () => {
    const input = "export function GlitchText({ text, className = '', colors = 'cyan-400,pink-500' }: GlitchTextProps) => {";
    const result = fixArrowFunctions(input);
    expect(result).toContain('function GlitchText(');
    expect(result).toContain(') {');
    expect(result).not.toContain('=>');
  });

  it('should fix hybrid function/arrow with nested parentheses in default values', () => {
    // Edge case: rgba() contains parens that would break naive [^)]* regex
    const input = "export function GlowCard({ glowColor = 'rgba(0, 255, 255, 0.1)' }: Props) => {";
    const result = fixArrowFunctions(input);
    expect(result).toContain('function GlowCard(');
    expect(result).toContain(') {');
    expect(result).not.toContain('=>');
    expect(result).toContain('rgba(0, 255, 255, 0.1)'); // Preserve nested parens
  });

  it('should fix hybrid function/arrow with multi-line parameters', () => {
    const input = `export function ComplexComponent({
  title,
  description,
  color = 'rgba(255, 0, 0, 0.5)'
}: ComponentProps) => {`;
    const result = fixArrowFunctions(input);
    expect(result).toContain('function ComplexComponent(');
    expect(result).toContain('}: ComponentProps) {');
    expect(result).not.toContain('=>');
  });
});

// ============================================================================
// fixJsxAttributes tests
// ============================================================================

describe('fixJsxAttributes', () => {
  it('should fix className"value" to className="value"', () => {
    const input = '<div className"test">';
    const result = fixJsxAttributes(input);
    expect(result).toBe('<div className="test">');
  });

  it('should fix onClick"handler" to onClick={handler}', () => {
    const input = '<button onClick"handleClick">';
    const result = fixJsxAttributes(input);
    expect(result).toBe('<button onClick={handleClick}>');
  });

  it('should fix double equals in attributes', () => {
    const input = '<div className=="test">';
    const result = fixJsxAttributes(input);
    expect(result).toBe('<div className="test">');
  });

  it('should fix missing closing brace in JSX expression', () => {
    const input = '<div className={value onClick="test">';
    const result = fixJsxAttributes(input);
    expect(result).toContain('value}');
  });

  it('should handle single quotes', () => {
    const input = "<div className'test'>";
    const result = fixJsxAttributes(input);
    expect(result).toBe("<div className='test'>");
  });
});

// ============================================================================
// fixStringIssues tests
// ============================================================================

describe('fixStringIssues', () => {
  it('should close unclosed single quote strings', () => {
    const input = "const str = 'hello";
    const result = fixStringIssues(input);
    expect(result).toContain("'hello'");
  });

  it('should close unclosed double quote strings', () => {
    const input = 'const str = "hello';
    const result = fixStringIssues(input);
    expect(result).toContain('"hello"');
  });

  it('should close unclosed template literals', () => {
    const input = 'const str = `hello ${name}';
    const result = fixStringIssues(input);
    expect(result).toContain('`');
  });

  it('should not modify valid strings', () => {
    const input = 'const str = "hello";';
    const result = fixStringIssues(input);
    expect(result).toBe(input);
  });

  it('should not modify multi-line strings incorrectly', () => {
    const input = `const str = \`
      multi
      line
    \`;`;
    const result = fixStringIssues(input);
    expect(result).toBe(input);
  });
});

// ============================================================================
// fixTypeScriptIssues tests
// ============================================================================

describe('fixTypeScriptIssues', () => {
  it('should fix array type declaration', () => {
    const input = 'const arr: string = []';
    const result = fixTypeScriptIssues(input);
    expect(result).toBe('const arr: string[] = []');
  });

  it('should fix duplicate colons', () => {
    const input = 'const x: : number = 1';
    const result = fixTypeScriptIssues(input);
    expect(result).toBe('const x: number = 1');
  });

  it('should fix interface extends with comma', () => {
    const input = 'interface Foo extends Bar, {';
    const result = fixTypeScriptIssues(input);
    expect(result).toBe('interface Foo extends Bar {');
  });

  it('should fix type with leading pipe', () => {
    const input = 'type Foo = | string';
    const result = fixTypeScriptIssues(input);
    expect(result).toBe('type Foo = string');
  });
});

// ============================================================================
// JSX tag extraction and balancing tests
// ============================================================================

describe('extractJsxTags', () => {
  it('should extract opening tags', () => {
    const input = '<Component prop="value">';
    const tags = extractJsxTags(input);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('Component');
    expect(tags[0].isClosing).toBe(false);
    expect(tags[0].isSelfClosing).toBe(false);
  });

  it('should extract closing tags', () => {
    const input = '</Component>';
    const tags = extractJsxTags(input);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('Component');
    expect(tags[0].isClosing).toBe(true);
  });

  it('should extract self-closing tags', () => {
    const input = '<Component />';
    const tags = extractJsxTags(input);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('Component');
    expect(tags[0].isSelfClosing).toBe(true);
  });

  it('should ignore tags inside strings', () => {
    const input = 'const str = "<Component />";';
    const tags = extractJsxTags(input);
    expect(tags).toHaveLength(0);
  });

  it('should ignore tags inside comments', () => {
    const input = '// <Component />';
    const tags = extractJsxTags(input);
    expect(tags).toHaveLength(0);
  });
});

describe('findUnclosedTags', () => {
  it('should find unclosed tags', () => {
    const tags = extractJsxTags('<Div><Span>');
    const unclosed = findUnclosedTags(tags);
    expect(unclosed).toHaveLength(2);
  });

  it('should not report closed tags', () => {
    const tags = extractJsxTags('<Div></Div>');
    const unclosed = findUnclosedTags(tags);
    expect(unclosed).toHaveLength(0);
  });

  it('should not report self-closing tags', () => {
    const tags = extractJsxTags('<Component />');
    const unclosed = findUnclosedTags(tags);
    expect(unclosed).toHaveLength(0);
  });
});

describe('fixJsxTagBalance', () => {
  it('should add missing closing tags', () => {
    const input = `function App() {
  return (
    <Container>
      <Content>
  );
}`;
    const result = fixJsxTagBalance(input);
    expect(result).toContain('</Content>');
    expect(result).toContain('</Container>');
  });

  it('should not modify balanced JSX', () => {
    const input = '<Container><Content /></Container>';
    const result = fixJsxTagBalance(input);
    expect(result).toBe(input);
  });
});

// ============================================================================
// Bracket balancing tests
// ============================================================================

describe('fixBracketBalanceAdvanced', () => {
  it('should add missing closing braces', () => {
    const input = 'function test() { if (true) { return 1; }';
    const result = fixBracketBalanceAdvanced(input);
    const braceCount = (result.match(/\}/g) || []).length;
    expect(braceCount).toBe(2);
  });

  it('should add missing closing parentheses', () => {
    const input = 'console.log(foo(bar)';
    const result = fixBracketBalanceAdvanced(input);
    expect(result).toContain('))');
  });

  it('should not modify balanced code', () => {
    const input = 'function test() { return { foo: "bar" }; }';
    const result = fixBracketBalanceAdvanced(input);
    expect(result).toBe(input);
  });

  it('should ignore brackets in strings', () => {
    const input = 'const str = "{ unclosed';
    const result = fixBracketBalanceAdvanced(input);
    // Should not add closing brace since it's in a string
    expect(result).not.toContain('}');
  });
});

// ============================================================================
// Import handling tests
// ============================================================================

describe('parseImports', () => {
  it('should parse default imports', () => {
    const input = "import React from 'react';";
    const imports = parseImports(input);
    expect(imports).toHaveLength(1);
    expect(imports[0].defaultImport).toBe('React');
    expect(imports[0].source).toBe('react');
  });

  it('should parse named imports', () => {
    const input = "import { useState, useEffect } from 'react';";
    const imports = parseImports(input);
    expect(imports).toHaveLength(1);
    expect(imports[0].namedImports).toContain('useState');
    expect(imports[0].namedImports).toContain('useEffect');
  });

  it('should parse mixed imports', () => {
    const input = "import React, { useState } from 'react';";
    const imports = parseImports(input);
    expect(imports).toHaveLength(1);
    expect(imports[0].defaultImport).toBe('React');
    expect(imports[0].namedImports).toContain('useState');
  });

  it('should parse type imports', () => {
    const input = "import type { FC } from 'react';";
    const imports = parseImports(input);
    expect(imports).toHaveLength(1);
    expect(imports[0].typeOnly).toBe(true);
  });
});

describe('fixAndMergeImports', () => {
  it('should merge duplicate imports from same source', () => {
    const input = `import { useState } from 'react';
import { useEffect } from 'react';`;
    const result = fixAndMergeImports(input);
    expect((result.match(/import.*from 'react'/g) || []).length).toBe(1);
    expect(result).toContain('useState');
    expect(result).toContain('useEffect');
  });

  it('should merge default and named imports', () => {
    const input = `import React from 'react';
import { useState } from 'react';`;
    const result = fixAndMergeImports(input);
    expect((result.match(/import.*from 'react'/g) || []).length).toBe(1);
    expect(result).toContain('React');
    expect(result).toContain('useState');
  });

  it('should not merge imports from different sources', () => {
    const input = `import { useState } from 'react';
import { Button } from './components';`;
    const result = fixAndMergeImports(input);
    expect(result).toContain("from 'react'");
    expect(result).toContain("from './components'");
  });
});

// ============================================================================
// Return statement tests
// ============================================================================

describe('fixReturnStatements', () => {
  it('should add parenthesis for multi-line return with JSX', () => {
    const input = `function App() {
  return
    <div>Hello</div>
}`;
    const result = fixReturnStatements(input);
    expect(result).toContain('return (');
  });

  it('should not modify single-line returns', () => {
    const input = 'return <div>Hello</div>;';
    const result = fixReturnStatements(input);
    expect(result).toBe(input);
  });
});

// ============================================================================
// Master fix function tests
// ============================================================================

describe('aggressiveFix', () => {
  it('should apply multiple fixes', () => {
    const input = `import { useState } from 'react';
import { useEffect } from 'react';

const App = () = > {
  return <Container>
}`;
    const result = aggressiveFix(input);
    expect(result.fixesApplied.length).toBeGreaterThan(0);
    expect(result.code).toContain('=>');
    expect((result.code.match(/import.*from 'react'/g) || []).length).toBe(1);
  });

  it('should handle already valid code', () => {
    const input = `import React from 'react';
const App = () => <div>Hello</div>;`;
    const result = aggressiveFix(input);
    expect(result.fixesApplied).toHaveLength(0);
    expect(result.code).toBe(input);
  });

  it('should run multiple passes if needed', () => {
    const input = 'const fn = () = > { className"test" }';
    const result = aggressiveFix(input, 3);
    expect(result.code).toContain('=>');
    expect(result.code).toContain('className="test"');
  });
});

// ============================================================================
// Quick validation tests
// ============================================================================

describe('quickValidate', () => {
  it('should return true for valid code', () => {
    const input = 'const fn = () => { return { foo: "bar" }; }';
    expect(quickValidate(input)).toBe(true);
  });

  it('should return false for unbalanced braces', () => {
    const input = 'const fn = () => { return { foo: "bar" }';
    expect(quickValidate(input)).toBe(false);
  });

  it('should return false for unbalanced parentheses', () => {
    const input = 'console.log(foo(bar)';
    expect(quickValidate(input)).toBe(false);
  });

  it('should return false for = > pattern', () => {
    const input = 'const fn = () = > value';
    expect(quickValidate(input)).toBe(false);
  });

  it('should return false for className"value" pattern', () => {
    const input = '<div className"test">';
    expect(quickValidate(input)).toBe(false);
  });

  it('should ignore brackets in strings', () => {
    const input = 'const str = "{ not a brace }";';
    expect(quickValidate(input)).toBe(true);
  });
});

// ============================================================================
// Safe aggressive fix tests
// ============================================================================

describe('safeAggressiveFix', () => {
  it('should fix code and return fixed version', () => {
    const input = 'const fn = () = > value';
    const result = safeAggressiveFix(input);
    expect(result).toContain('=>');
  });

  it('should return original if fixes make code invalid', () => {
    // This is a theoretical case - the function should handle it gracefully
    const input = 'const valid = true;';
    const result = safeAggressiveFix(input);
    expect(result).toBe(input);
  });
});

// ============================================================================
// Edge cases and complex scenarios
// ============================================================================

describe('complex scenarios', () => {
  it('should handle nested JSX with conditions', () => {
    const input = `<Container>
  {isLoading ? <Spinner /> : data && <List items={data} />}
</Container>`;
    const result = aggressiveFix(input);
    expect(result.code).toBeDefined();
  });

  it('should handle TypeScript with JSX', () => {
    const input = `interface Props {
  name: string;
}

const Component: React.FC<Props> = ({ name }) = > {
  return <div className"container">{name}</div>
}`;
    const result = aggressiveFix(input);
    expect(result.code).toContain('=>');
    expect(result.code).toContain('className="container"');
  });

  it('should handle multiple syntax errors in one line', () => {
    const input = 'const fn = () = > <div className"test">';
    const result = aggressiveFix(input);
    expect(result.code).toContain('=>');
    expect(result.code).toContain('className="test"');
  });

  it('should preserve code structure while fixing', () => {
    const input = `function App() {
  const [state, setState] = useState(0);

  return (
    <div className"app">
      <button onClick"handleClick">Click</button>
    </div>
  );
}`;
    const result = aggressiveFix(input);
    expect(result.code).toContain('function App()');
    expect(result.code).toContain('useState');
    expect(result.code).toContain('className="app"');
    expect(result.code).toContain('onClick={handleClick}');
  });
});
