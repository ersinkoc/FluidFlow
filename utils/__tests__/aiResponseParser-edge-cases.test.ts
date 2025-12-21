import { describe, it, expect } from 'vitest';
import { parseAIResponse } from '../aiResponseParser';

describe('AILResponseParser Edge Cases', () => {
  it('should handle natural file transitions without end markers', () => {
    const response = `<!-- FILE:src/components/Component1.tsx -->
import React from 'react';

export function Component1() {
  return <div>Component 1</div>
}

<!-- FILE:src/components/FAQ/FAQAccordion.tsx -->
import { useState } from 'react'

export function FAQAccordion() {
  const [isOpen, setIsOpen] = useState(false)
  return <div>FAQ Accordion</div>
}`;

    const result = parseAIResponse(response);

    expect(Object.keys(result.files)).toHaveLength(2);
    expect(result.files['src/components/Component1.tsx']).toContain('export function Component1()');
    expect(result.files['src/components/Component1.tsx']).toContain('return <div>Component 1</div>');

    expect(result.files['src/components/FAQ/FAQAccordion.tsx']).toContain("import { useState } from 'react'");
    expect(result.files['src/components/FAQ/FAQAccordion.tsx']).toContain('export function FAQAccordion()');
  });

  it('should handle mixed content with natural transitions', () => {
    const response = `<!-- FILE:file1.ts -->
// File 1 content
function helper1() {
  return 'helper1'
}

<!-- FILE:file2.ts -->
// File 2 content
function helper2() {
  return 'helper2'
}

<!-- FILE:file3.ts -->
// File 3 content
function helper3() {
  return 'helper3'
}

<!-- FILE:file4.ts -->
// File 4 content
function helper4() {
  return 'helper4'
}`;

    const result = parseAIResponse(response);

    expect(Object.keys(result.files).length).toBeGreaterThanOrEqual(3);
    // Should extract file1, file2, file3, file4
    expect(result.files['file1.ts']).toBeDefined();
    expect(result.files['file2.ts']).toBeDefined();
    expect(result.files['file3.ts']).toBeDefined();
    expect(result.files['file4.ts']).toBeDefined();
  });

  it('should handle files ending with brackets and braces', () => {
    const response = `<!-- FILE:src/Component.tsx -->
const Component = () => {
  const [state, setState] = useState()

  useEffect(() => {
    // side effect
  }, [])

  return (
    <div>
      <button onClick={() => setState(!state)}>
        Toggle
      </button>
    </div>
  )
}

<!-- FILE:styles.css -->
.button {
  padding: 8px 16px;
  border-radius: 4px;
}`;

    const result = parseAIResponse(response);

    expect(Object.keys(result.files)).toHaveLength(2);
    expect(result.files['src/Component.tsx']).toContain('const Component = ()');
    expect(result.files['src/Component.tsx']).toContain('</div>');
    expect(result.files['styles.css']).toContain('.button');
  });
});
