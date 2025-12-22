/**
 * Script to split promptLibrary.ts into separate category files
 */
const fs = require('fs');
const path = require('path');

const sourceFile = path.join(__dirname, '..', 'data', 'promptLibrary.ts');
const outputDir = path.join(__dirname, '..', 'data', 'promptLibrary', 'categories');

// Read the source file
const content = fs.readFileSync(sourceFile, 'utf-8');
const lines = content.split('\n');

// Category definitions with their line ranges (0-indexed)
const categories = [
  { name: 'responsive', varName: 'responsiveCategory', start: 1014, end: 1232 },
  { name: 'ux', varName: 'uxCategory', start: 1232, end: 1506 },
  { name: 'animation', varName: 'animationCategory', start: 1506, end: 1752 },
  { name: 'accessibility', varName: 'accessibilityCategory', start: 2390, end: 2608 },
  { name: 'content', varName: 'contentCategory', start: 2608, end: 2826 },
  { name: 'features', varName: 'featuresCategory', start: 2826, end: 3086 },
  { name: 'forms', varName: 'formsCategory', start: 3086, end: 3339 },
  { name: 'dashboard', varName: 'dashboardCategory', start: 3339, end: 3571 },
  { name: 'ecommerce', varName: 'ecommerceCategory', start: 3571, end: 3817 },
  { name: 'social', varName: 'socialCategory', start: 3817, end: 4049 },
  { name: 'layouts', varName: 'layoutsCategory', start: 4049, end: 4266 },
];

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

categories.forEach(cat => {
  console.log(`Processing ${cat.name}...`);

  // Extract the category content (adjust for 0-indexed array)
  let categoryLines = lines.slice(cat.start, cat.end);

  // Find the actual start of the category object
  let startIdx = categoryLines.findIndex(line => line.trim().startsWith('{') || line.includes("id: '"));
  if (startIdx > 0) {
    categoryLines = categoryLines.slice(startIdx);
  }

  // Clean up: ensure it starts with { and ends with }
  let categoryContent = categoryLines.join('\n');

  // Remove leading comma if present
  categoryContent = categoryContent.replace(/^\s*,\s*/, '');

  // Ensure starts with {
  if (!categoryContent.trim().startsWith('{')) {
    categoryContent = '{\n' + categoryContent;
  }

  // Remove trailing comma before closing
  categoryContent = categoryContent.replace(/,(\s*}\s*)$/, '$1');

  // Build the file content
  const fileContent = `import type { PromptCategory } from '../types';

export const ${cat.varName}: PromptCategory = ${categoryContent.trim().replace(/^\{/, '{')}
`;

  // Write to file
  const outputPath = path.join(outputDir, `${cat.name}.ts`);
  fs.writeFileSync(outputPath, fileContent);
  console.log(`  Created ${cat.name}.ts`);
});

console.log('Done! All category files created.');
