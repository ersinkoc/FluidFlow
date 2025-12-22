/**
 * Fix category file endings
 */
const fs = require('fs');
const path = require('path');

const categoriesDir = path.join(__dirname, '..', 'data', 'promptLibrary', 'categories');

const files = fs.readdirSync(categoriesDir).filter(f => f.endsWith('.ts'));

files.forEach(file => {
  const filePath = path.join(categoriesDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Find the last proper closing: ]  } (end of prompts array and category object)
  // The pattern we're looking for is:
  //       }
  //     ]
  //   }
  // followed by }; (which we add)

  // Remove any content after the category closes
  // Pattern: prompts array ends with ], then category object ends with }

  // Find where the export statement ends properly
  const exportMatch = content.match(/export const \w+Category: PromptCategory = /);
  if (!exportMatch) {
    console.log(`Skipping ${file} - no export found`);
    return;
  }

  // Find all closing braces and brackets
  let braceCount = 0;
  let bracketCount = 0;
  let endIdx = -1;
  let startIdx = content.indexOf('{', exportMatch.index);

  for (let i = startIdx; i < content.length; i++) {
    const char = content[i];
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;

    // When we're back to 0, we've closed the main object
    if (braceCount === 0 && i > startIdx) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    console.log(`Could not find end of category object in ${file}`);
    return;
  }

  // Keep content up to and including the closing brace
  const newContent = content.substring(0, endIdx + 1) + ';\n';

  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Fixed ${file}`);
  } else {
    console.log(`${file} already correct`);
  }
});

console.log('Done!');
