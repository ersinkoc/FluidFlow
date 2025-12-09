/**
 * Smart Auto-Fix Utility
 * Handles common code errors without AI assistance
 * Uses pattern matching and AST-lite analysis
 */

interface SimpleFixResult {
  fixed: boolean;
  newCode: string;
  description: string;
  fixType: 'import' | 'typo' | 'syntax' | 'jsx' | 'runtime' | 'react' | 'none';
}

// Common React imports
const REACT_IMPORTS: Record<string, string> = {
  'useState': 'react',
  'useEffect': 'react',
  'useCallback': 'react',
  'useMemo': 'react',
  'useRef': 'react',
  'useContext': 'react',
  'useReducer': 'react',
  'useLayoutEffect': 'react',
  'useImperativeHandle': 'react',
  'useDebugValue': 'react',
  'useDeferredValue': 'react',
  'useTransition': 'react',
  'useId': 'react',
  'useSyncExternalStore': 'react',
  'useInsertionEffect': 'react',
  'createContext': 'react',
  'Fragment': 'react',
  'Suspense': 'react',
  'lazy': 'react',
  'memo': 'react',
  'forwardRef': 'react',
  'createRef': 'react',
  'Component': 'react',
  'PureComponent': 'react',
  'StrictMode': 'react',
  'cloneElement': 'react',
  'isValidElement': 'react',
  'Children': 'react',
};

// Common third-party imports
const COMMON_IMPORTS: Record<string, string> = {
  // Lucide React icons
  'Search': 'lucide-react',
  'X': 'lucide-react',
  'Check': 'lucide-react',
  'ChevronDown': 'lucide-react',
  'ChevronUp': 'lucide-react',
  'ChevronLeft': 'lucide-react',
  'ChevronRight': 'lucide-react',
  'Menu': 'lucide-react',
  'Plus': 'lucide-react',
  'Minus': 'lucide-react',
  'Edit': 'lucide-react',
  'Trash': 'lucide-react',
  'Trash2': 'lucide-react',
  'Save': 'lucide-react',
  'Download': 'lucide-react',
  'Upload': 'lucide-react',
  'Settings': 'lucide-react',
  'User': 'lucide-react',
  'Users': 'lucide-react',
  'Home': 'lucide-react',
  'Mail': 'lucide-react',
  'Phone': 'lucide-react',
  'Calendar': 'lucide-react',
  'Clock': 'lucide-react',
  'Star': 'lucide-react',
  'Heart': 'lucide-react',
  'Share': 'lucide-react',
  'Copy': 'lucide-react',
  'Link': 'lucide-react',
  'ExternalLink': 'lucide-react',
  'Eye': 'lucide-react',
  'EyeOff': 'lucide-react',
  'Lock': 'lucide-react',
  'Unlock': 'lucide-react',
  'Filter': 'lucide-react',
  'SortAsc': 'lucide-react',
  'SortDesc': 'lucide-react',
  'ArrowUp': 'lucide-react',
  'ArrowDown': 'lucide-react',
  'ArrowLeft': 'lucide-react',
  'ArrowRight': 'lucide-react',
  'RefreshCw': 'lucide-react',
  'Loader': 'lucide-react',
  'Loader2': 'lucide-react',
  'AlertCircle': 'lucide-react',
  'AlertTriangle': 'lucide-react',
  'Info': 'lucide-react',
  'HelpCircle': 'lucide-react',
  'CheckCircle': 'lucide-react',
  'XCircle': 'lucide-react',
  'Bell': 'lucide-react',
  'MessageCircle': 'lucide-react',
  'Send': 'lucide-react',
  'Image': 'lucide-react',
  'File': 'lucide-react',
  'FileText': 'lucide-react',
  'Folder': 'lucide-react',
  'FolderOpen': 'lucide-react',
  'Database': 'lucide-react',
  'Server': 'lucide-react',
  'Cloud': 'lucide-react',
  'Wifi': 'lucide-react',
  'Bluetooth': 'lucide-react',
  'Battery': 'lucide-react',
  'Zap': 'lucide-react',
  'Sun': 'lucide-react',
  'Moon': 'lucide-react',
  'Globe': 'lucide-react',
  'Map': 'lucide-react',
  'MapPin': 'lucide-react',
  'Navigation': 'lucide-react',
  'Compass': 'lucide-react',
  'Camera': 'lucide-react',
  'Video': 'lucide-react',
  'Mic': 'lucide-react',
  'Volume': 'lucide-react',
  'Volume2': 'lucide-react',
  'VolumeX': 'lucide-react',
  'Play': 'lucide-react',
  'Pause': 'lucide-react',
  'Square': 'lucide-react',
  'Circle': 'lucide-react',
  'Triangle': 'lucide-react',
  'SkipBack': 'lucide-react',
  'SkipForward': 'lucide-react',
  'Rewind': 'lucide-react',
  'FastForward': 'lucide-react',
  'Shuffle': 'lucide-react',
  'Repeat': 'lucide-react',
  'MoreHorizontal': 'lucide-react',
  'MoreVertical': 'lucide-react',
  'Grid': 'lucide-react',
  'List': 'lucide-react',
  'Layout': 'lucide-react',
  'Sidebar': 'lucide-react',
  'Columns': 'lucide-react',
  'Rows': 'lucide-react',
  'Table': 'lucide-react',
  'BarChart': 'lucide-react',
  'LineChart': 'lucide-react',
  'PieChart': 'lucide-react',
  'Activity': 'lucide-react',
  'TrendingUp': 'lucide-react',
  'TrendingDown': 'lucide-react',
  'DollarSign': 'lucide-react',
  'CreditCard': 'lucide-react',
  'ShoppingCart': 'lucide-react',
  'ShoppingBag': 'lucide-react',
  'Package': 'lucide-react',
  'Gift': 'lucide-react',
  'Tag': 'lucide-react',
  'Bookmark': 'lucide-react',
  'Flag': 'lucide-react',
  'Award': 'lucide-react',
  'Trophy': 'lucide-react',
  'Target': 'lucide-react',
  'Crosshair': 'lucide-react',
  'Aperture': 'lucide-react',
  'Maximize': 'lucide-react',
  'Minimize': 'lucide-react',
  'Move': 'lucide-react',
  'Crop': 'lucide-react',
  'Scissors': 'lucide-react',
  'Clipboard': 'lucide-react',
  'ClipboardCheck': 'lucide-react',
  'ClipboardList': 'lucide-react',
  'FileCode': 'lucide-react',
  'Terminal': 'lucide-react',
  'Code': 'lucide-react',
  'Code2': 'lucide-react',
  'Braces': 'lucide-react',
  'Hash': 'lucide-react',
  'AtSign': 'lucide-react',
  'Key': 'lucide-react',
  'Shield': 'lucide-react',
  'ShieldCheck': 'lucide-react',
  'Fingerprint': 'lucide-react',
  'Scan': 'lucide-react',
  'QrCode': 'lucide-react',
  'Barcode': 'lucide-react',
  'Printer': 'lucide-react',
  'Smartphone': 'lucide-react',
  'Tablet': 'lucide-react',
  'Monitor': 'lucide-react',
  'Laptop': 'lucide-react',
  'Tv': 'lucide-react',
  'Watch': 'lucide-react',
  'Headphones': 'lucide-react',
  'Speaker': 'lucide-react',
  'Radio': 'lucide-react',
  'Cpu': 'lucide-react',
  'HardDrive': 'lucide-react',
  'MemoryStick': 'lucide-react',
  'Usb': 'lucide-react',
  'Power': 'lucide-react',
  'PowerOff': 'lucide-react',
  'ToggleLeft': 'lucide-react',
  'ToggleRight': 'lucide-react',
  'Sliders': 'lucide-react',
  'SlidersHorizontal': 'lucide-react',
  'Gauge': 'lucide-react',
  'Thermometer': 'lucide-react',
  'Droplet': 'lucide-react',
  'Wind': 'lucide-react',
  'Umbrella': 'lucide-react',
  'Snowflake': 'lucide-react',
  'Flame': 'lucide-react',
  'Leaf': 'lucide-react',
  'Tree': 'lucide-react',
  'Flower': 'lucide-react',
  'Bug': 'lucide-react',
  'Sparkles': 'lucide-react',
  'Wand': 'lucide-react',
  'Wand2': 'lucide-react',
  'Lightbulb': 'lucide-react',
  'Lamp': 'lucide-react',
  'Flashlight': 'lucide-react',
  'Glasses': 'lucide-react',
  'Briefcase': 'lucide-react',
  'Building': 'lucide-react',
  'Building2': 'lucide-react',
  'Factory': 'lucide-react',
  'Warehouse': 'lucide-react',
  'Store': 'lucide-react',
  'Landmark': 'lucide-react',
  'School': 'lucide-react',
  'GraduationCap': 'lucide-react',
  'Book': 'lucide-react',
  'BookOpen': 'lucide-react',
  'Library': 'lucide-react',
  'Newspaper': 'lucide-react',
  'Rss': 'lucide-react',
  'Podcast': 'lucide-react',
  'Music': 'lucide-react',
  'Music2': 'lucide-react',
  'Mic2': 'lucide-react',
  'Guitar': 'lucide-react',
  'Piano': 'lucide-react',
  'Drum': 'lucide-react',
  'Film': 'lucide-react',
  'Clapperboard': 'lucide-react',
  'Popcorn': 'lucide-react',
  'Gamepad': 'lucide-react',
  'Gamepad2': 'lucide-react',
  'Dice1': 'lucide-react',
  'Dice2': 'lucide-react',
  'Dice3': 'lucide-react',
  'Dice4': 'lucide-react',
  'Dice5': 'lucide-react',
  'Dice6': 'lucide-react',
  'Puzzle': 'lucide-react',
  'Shapes': 'lucide-react',
  'Palette': 'lucide-react',
  'Paintbrush': 'lucide-react',
  'Brush': 'lucide-react',
  'Pen': 'lucide-react',
  'PenTool': 'lucide-react',
  'Pencil': 'lucide-react',
  'Eraser': 'lucide-react',
  'Highlighter': 'lucide-react',
  'Type': 'lucide-react',
  'Bold': 'lucide-react',
  'Italic': 'lucide-react',
  'Underline': 'lucide-react',
  'Strikethrough': 'lucide-react',
  'AlignLeft': 'lucide-react',
  'AlignCenter': 'lucide-react',
  'AlignRight': 'lucide-react',
  'AlignJustify': 'lucide-react',
  'Indent': 'lucide-react',
  'Outdent': 'lucide-react',
  'ListOrdered': 'lucide-react',
  'ListTodo': 'lucide-react',
  'ListChecks': 'lucide-react',
  'Quote': 'lucide-react',
  'Heading1': 'lucide-react',
  'Heading2': 'lucide-react',
  'Heading3': 'lucide-react',
  'Heading4': 'lucide-react',
  'Heading5': 'lucide-react',
  'Heading6': 'lucide-react',
  'Subscript': 'lucide-react',
  'Superscript': 'lucide-react',
  'Pilcrow': 'lucide-react',
  'TextCursor': 'lucide-react',
  'TextCursorInput': 'lucide-react',
  'CaseSensitive': 'lucide-react',
  'CaseUpper': 'lucide-react',
  'CaseLower': 'lucide-react',
  'SpellCheck': 'lucide-react',
  'Languages': 'lucide-react',
  'Binary': 'lucide-react',
  'Regex': 'lucide-react',
  'Variable': 'lucide-react',
  'Sigma': 'lucide-react',
  'Pi': 'lucide-react',
  'Infinity': 'lucide-react',
  'Percent': 'lucide-react',
  'Equal': 'lucide-react',
  'NotEqual': 'lucide-react',
  'LessThan': 'lucide-react',
  'GreaterThan': 'lucide-react',
  'LessThanOrEqual': 'lucide-react',
  'GreaterThanOrEqual': 'lucide-react',
  'PlusCircle': 'lucide-react',
  'MinusCircle': 'lucide-react',
  'Divide': 'lucide-react',
  'DivideCircle': 'lucide-react',
  'DivideSquare': 'lucide-react',
  'PlusSquare': 'lucide-react',
  'MinusSquare': 'lucide-react',
  'XSquare': 'lucide-react',
  'CheckSquare': 'lucide-react',
  'SquareCheck': 'lucide-react',
  'SquareX': 'lucide-react',
  'Box': 'lucide-react',
  'BoxSelect': 'lucide-react',
  'Boxes': 'lucide-react',
  'Component': 'lucide-react',
  'Layers': 'lucide-react',
  'Layers2': 'lucide-react',
  'Layers3': 'lucide-react',
  'Stack': 'lucide-react',
  'LayoutDashboard': 'lucide-react',
  'LayoutGrid': 'lucide-react',
  'LayoutList': 'lucide-react',
  'LayoutTemplate': 'lucide-react',
  'Blocks': 'lucide-react',
  'Workflow': 'lucide-react',
  'GitBranch': 'lucide-react',
  'GitCommit': 'lucide-react',
  'GitMerge': 'lucide-react',
  'GitPullRequest': 'lucide-react',
  'GitFork': 'lucide-react',
  'Github': 'lucide-react',
  'Gitlab': 'lucide-react',
  'Slack': 'lucide-react',
  'Twitter': 'lucide-react',
  'Facebook': 'lucide-react',
  'Instagram': 'lucide-react',
  'Linkedin': 'lucide-react',
  'Youtube': 'lucide-react',
  'Twitch': 'lucide-react',
  'Discord': 'lucide-react',
  'Chrome': 'lucide-react',
  'Firefox': 'lucide-react',
  'Safari': 'lucide-react',
  'Edge': 'lucide-react',
  'Opera': 'lucide-react',
  'Figma': 'lucide-react',
  'Framer': 'lucide-react',
  'Dribbble': 'lucide-react',
  'Codepen': 'lucide-react',
  'Codesandbox': 'lucide-react',
  'LifeBuoy': 'lucide-react',
  'Rocket': 'lucide-react',
  'Plane': 'lucide-react',
  'Car': 'lucide-react',
  'Bus': 'lucide-react',
  'Train': 'lucide-react',
  'Ship': 'lucide-react',
  'Anchor': 'lucide-react',
  'Bike': 'lucide-react',
  'Footprints': 'lucide-react',
};

// Common prop typos (case-insensitive key → correct value)
const PROP_TYPOS: Record<string, string> = {
  'classname': 'className',
  'classNames': 'className',
  'class': 'className',
  'onclick': 'onClick',
  'onchange': 'onChange',
  'onsubmit': 'onSubmit',
  'oninput': 'onInput',
  'onkeydown': 'onKeyDown',
  'onkeyup': 'onKeyUp',
  'onkeypress': 'onKeyPress',
  'onfocus': 'onFocus',
  'onblur': 'onBlur',
  'onmouseover': 'onMouseOver',
  'onmouseout': 'onMouseOut',
  'onmouseenter': 'onMouseEnter',
  'onmouseleave': 'onMouseLeave',
  'onmousedown': 'onMouseDown',
  'onmouseup': 'onMouseUp',
  'ondrag': 'onDrag',
  'ondragstart': 'onDragStart',
  'ondragend': 'onDragEnd',
  'ondragenter': 'onDragEnter',
  'ondragleave': 'onDragLeave',
  'ondragover': 'onDragOver',
  'ondrop': 'onDrop',
  'onscroll': 'onScroll',
  'onload': 'onLoad',
  'onerror': 'onError',
  'ontouchstart': 'onTouchStart',
  'ontouchend': 'onTouchEnd',
  'ontouchmove': 'onTouchMove',
  'tabindex': 'tabIndex',
  'readonly': 'readOnly',
  'maxlength': 'maxLength',
  'minlength': 'minLength',
  'autocomplete': 'autoComplete',
  'autofocus': 'autoFocus',
  'autoplay': 'autoPlay',
  'htmlfor': 'htmlFor',
  'for': 'htmlFor',
  'srcset': 'srcSet',
  'crossorigin': 'crossOrigin',
  'colspan': 'colSpan',
  'rowspan': 'rowSpan',
  'cellpadding': 'cellPadding',
  'cellspacing': 'cellSpacing',
  'contenteditable': 'contentEditable',
  'spellcheck': 'spellCheck',
  'dangerouslysetinnerhtml': 'dangerouslySetInnerHTML',
  'defaultvalue': 'defaultValue',
  'defaultchecked': 'defaultChecked',
  'selectedindex': 'selectedIndex',
  'formaction': 'formAction',
  'formmethod': 'formMethod',
  'formtarget': 'formTarget',
  'formnovalidate': 'formNoValidate',
  'formenctype': 'formEncType',
  'acceptcharset': 'acceptCharset',
  'accesskey': 'accessKey',
  'usemap': 'useMap',
  'allowfullscreen': 'allowFullScreen',
  'frameborder': 'frameBorder',
  'marginheight': 'marginHeight',
  'marginwidth': 'marginWidth',
  'scrolling': 'scrolling',
  'srcdoc': 'srcDoc',
  'datetime': 'dateTime',
  'enctype': 'encType',
  'httpequiv': 'httpEquiv',
  'inputmode': 'inputMode',
  'enterkeyhint': 'enterKeyHint',
};

// Self-closing HTML tags that don't need closing tags in JSX
const SELF_CLOSING_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * Main entry point: Try to fix common errors without AI
 */
export function trySimpleFix(errorMessage: string, code: string): SimpleFixResult {
  const errorLower = errorMessage.toLowerCase();

  // 1. Try to fix missing imports (React hooks, common components)
  const importFix = tryFixMissingImport(errorMessage, code);
  if (importFix.fixed) return importFix;

  // 2. Try to fix prop typos
  const typoFix = tryFixPropTypo(errorMessage, code);
  if (typoFix.fixed) return typoFix;

  // 3. Try to fix "React is not defined"
  if (errorLower.includes('react is not defined') || errorLower.includes("react' is not defined")) {
    const reactFix = tryFixMissingReact(code);
    if (reactFix.fixed) return reactFix;
  }

  // 4. Try to fix JSX issues (unclosed tags, self-closing)
  const jsxFix = tryFixJSXIssues(errorMessage, code);
  if (jsxFix.fixed) return jsxFix;

  // 5. Try to fix runtime errors (null/undefined access)
  const runtimeFix = tryFixRuntimeError(errorMessage, code);
  if (runtimeFix.fixed) return runtimeFix;

  // 6. Try to fix missing closing bracket/brace
  const bracketFix = tryFixMissingClosing(errorMessage, code);
  if (bracketFix.fixed) return bracketFix;

  // 7. Try to fix common undefined variable typos
  const undefinedFix = tryFixUndefinedVariable(errorMessage, code);
  if (undefinedFix.fixed) return undefinedFix;

  // 8. Try to fix missing semicolon
  const semicolonFix = tryFixMissingSemicolon(errorMessage, code);
  if (semicolonFix.fixed) return semicolonFix;

  // 9. Try to fix React-specific issues
  const reactIssueFix = tryFixReactIssues(errorMessage, code);
  if (reactIssueFix.fixed) return reactIssueFix;

  // 10. Try to fix arrow function syntax
  const arrowFix = tryFixArrowFunction(errorMessage, code);
  if (arrowFix.fixed) return arrowFix;

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Fix missing imports (React hooks and common third-party)
 */
function tryFixMissingImport(errorMessage: string, code: string): SimpleFixResult {
  // Pattern: "X is not defined" where X might be importable
  const notDefinedMatch = errorMessage.match(/['"]?(\w+)['"]?\s+is not defined/i);
  if (!notDefinedMatch) {
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  const identifier = notDefinedMatch[1];

  // Check if already imported
  const importedRegex = new RegExp(`import\\s*{[^}]*\\b${identifier}\\b[^}]*}|import\\s+${identifier}\\s+from`, 'i');
  if (importedRegex.test(code)) {
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // Check React imports
  if (REACT_IMPORTS[identifier]) {
    return addNamedImport(code, identifier, 'react');
  }

  // Check common third-party imports
  if (COMMON_IMPORTS[identifier]) {
    return addNamedImport(code, identifier, COMMON_IMPORTS[identifier]);
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Add a named import to the code
 */
function addNamedImport(code: string, identifier: string, source: string): SimpleFixResult {
  // Check for existing import from same source
  const existingImportRegex = new RegExp(`import\\s*{([^}]*)}\\s*from\\s*['"]${source}['"]`);
  const existingMatch = code.match(existingImportRegex);

  let newCode: string;

  if (existingMatch) {
    // Add to existing import
    const currentImports = existingMatch[1].trim();
    // Check if already there
    if (new RegExp(`\\b${identifier}\\b`).test(currentImports)) {
      return { fixed: false, newCode: code, description: '', fixType: 'none' };
    }
    const newImports = currentImports ? `${currentImports}, ${identifier}` : identifier;
    newCode = code.replace(existingImportRegex, `import { ${newImports} } from '${source}'`);
  } else {
    // Add new import at the top (after any existing imports or at very top)
    const lastImportMatch = code.match(/^(import\s+.+from\s+['"][^'"]+['"];?\s*\n?)+/m);
    if (lastImportMatch) {
      const lastImportEnd = lastImportMatch.index! + lastImportMatch[0].length;
      newCode = code.slice(0, lastImportEnd) + `import { ${identifier} } from '${source}';\n` + code.slice(lastImportEnd);
    } else {
      newCode = `import { ${identifier} } from '${source}';\n${code}`;
    }
  }

  return {
    fixed: true,
    newCode,
    description: `Added import: ${identifier} from '${source}'`,
    fixType: 'import'
  };
}

/**
 * Fix common prop typos
 */
function tryFixPropTypo(errorMessage: string, code: string): SimpleFixResult {
  // Check if error mentions invalid prop name
  const invalidPropMatch = errorMessage.match(/invalid dom property ['"`](\w+)['"`]/i) ||
                          errorMessage.match(/unknown prop ['"`](\w+)['"`]/i) ||
                          errorMessage.match(/warning:.*['"`](\w+)['"`].*is not a valid/i) ||
                          errorMessage.match(/react does not recognize the ['"`](\w+)['"`] prop/i);

  if (invalidPropMatch) {
    const wrongProp = invalidPropMatch[1];
    const wrongPropLower = wrongProp.toLowerCase();
    const correctProp = PROP_TYPOS[wrongPropLower];

    if (correctProp && wrongProp !== correctProp) {
      // Replace the typo
      const regex = new RegExp(`\\b${wrongProp}\\s*=`, 'g');
      const newCode = code.replace(regex, `${correctProp}=`);

      if (newCode !== code) {
        return {
          fixed: true,
          newCode,
          description: `Fixed prop: ${wrongProp} → ${correctProp}`,
          fixType: 'typo'
        };
      }
    }
  }

  // Proactive scan for common typos in code
  for (const [typoLower, correct] of Object.entries(PROP_TYPOS)) {
    // Look for the typo as a JSX attribute
    const typoRegex = new RegExp(`<[^>]*\\b(${typoLower})\\s*=`, 'gi');
    const match = typoRegex.exec(code);
    if (match && match[1].toLowerCase() === typoLower && match[1] !== correct) {
      const newCode = code.replace(
        new RegExp(`\\b${match[1]}(\\s*=)`, 'g'),
        `${correct}$1`
      );
      if (newCode !== code) {
        return {
          fixed: true,
          newCode,
          description: `Fixed prop: ${match[1]} → ${correct}`,
          fixType: 'typo'
        };
      }
    }
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Fix missing React import for JSX
 */
function tryFixMissingReact(code: string): SimpleFixResult {
  if (/import\s+React/i.test(code) || /import\s*\*\s*as\s*React/i.test(code)) {
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // Add React import at the top
  const newCode = `import React from 'react';\n${code}`;
  return {
    fixed: true,
    newCode,
    description: 'Added React import',
    fixType: 'import'
  };
}

/**
 * Fix JSX-specific issues (unclosed tags, self-closing tags)
 */
function tryFixJSXIssues(errorMessage: string, code: string): SimpleFixResult {
  const errorLower = errorMessage.toLowerCase();

  // Fix unclosed JSX element
  if (errorLower.includes('unterminated jsx') ||
      errorLower.includes('expected corresponding jsx closing tag') ||
      errorLower.includes('unclosed') && errorLower.includes('element')) {

    // Try to find unclosed tag from error message
    const tagMatch = errorMessage.match(/['"`]<(\w+)['"`]|<\/(\w+)>|<(\w+)\s/i);
    if (tagMatch) {
      const tagName = tagMatch[1] || tagMatch[2] || tagMatch[3];

      // Count opening vs closing tags for this element
      const openingRegex = new RegExp(`<${tagName}(?:\\s|>|\\/)`, 'gi');
      const closingRegex = new RegExp(`<\\/${tagName}>`, 'gi');

      const openingCount = (code.match(openingRegex) || []).length;
      const closingCount = (code.match(closingRegex) || []).length;

      if (openingCount > closingCount) {
        // Need to add closing tag
        // Find the last opening tag without a closing tag
        const newCode = code.trimEnd() + `\n</${tagName}>`;
        return {
          fixed: true,
          newCode,
          description: `Added missing </${tagName}> tag`,
          fixType: 'jsx'
        };
      }
    }
  }

  // Fix self-closing tag issues
  if (errorLower.includes('void element') || errorLower.includes('must use self-closing')) {
    const tagMatch = errorMessage.match(/<(\w+)>/i);
    if (tagMatch && SELF_CLOSING_TAGS.has(tagMatch[1].toLowerCase())) {
      const tagName = tagMatch[1];
      // Replace <tag></tag> or <tag> with <tag />
      let newCode = code.replace(
        new RegExp(`<${tagName}(\\s[^>]*)?>\\s*<\\/${tagName}>`, 'gi'),
        `<${tagName}$1 />`
      );
      newCode = newCode.replace(
        new RegExp(`<${tagName}(\\s[^>]*)?>(?!/)`, 'gi'),
        `<${tagName}$1 />`
      );

      if (newCode !== code) {
        return {
          fixed: true,
          newCode,
          description: `Fixed self-closing <${tagName} /> tag`,
          fixType: 'jsx'
        };
      }
    }
  }

  // Fix common img/input/br without self-closing
  for (const tag of SELF_CLOSING_TAGS) {
    const badPattern = new RegExp(`<${tag}(\\s[^>]*)?>\\s*<\\/${tag}>`, 'gi');
    if (badPattern.test(code)) {
      const newCode = code.replace(badPattern, `<${tag}$1 />`);
      return {
        fixed: true,
        newCode,
        description: `Fixed self-closing <${tag} /> tag`,
        fixType: 'jsx'
      };
    }
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Fix runtime errors (null/undefined access, destructuring)
 */
function tryFixRuntimeError(errorMessage: string, code: string): SimpleFixResult {
  const errorLower = errorMessage.toLowerCase();

  // "Cannot read property 'X' of undefined/null"
  // "Cannot read properties of undefined (reading 'X')"
  const propMatch = errorMessage.match(/cannot read propert(?:y|ies) (?:of (?:undefined|null) \(reading )?['"](\w+)['"]/i) ||
                   errorMessage.match(/cannot read ['"](\w+)['"] of (?:undefined|null)/i);

  if (propMatch) {
    const propName = propMatch[1];

    // Find potential access patterns and add optional chaining
    // Pattern: obj.propName or obj[propName] where obj might be undefined
    const accessPatterns = [
      // variable.property access
      new RegExp(`(\\b\\w+)\\s*\\.\\s*${propName}\\b`, 'g'),
      // nested property access
      new RegExp(`(\\b\\w+(?:\\.\\w+)+)\\s*\\.\\s*${propName}\\b`, 'g'),
    ];

    let newCode = code;
    let fixed = false;

    for (const pattern of accessPatterns) {
      newCode = newCode.replace(pattern, (match, prefix) => {
        // Don't add ?. if already has it
        if (match.includes('?.')) return match;
        // Don't modify if it's a function definition
        if (/^(const|let|var|function)\s/.test(prefix)) return match;
        fixed = true;
        return `${prefix}?.${propName}`;
      });
    }

    if (fixed && newCode !== code) {
      return {
        fixed: true,
        newCode,
        description: `Added optional chaining for '${propName}' access`,
        fixType: 'runtime'
      };
    }
  }

  // "X is not a function"
  const notFunctionMatch = errorMessage.match(/['"]?(\w+)['"]?\s+is not a function/i);
  if (notFunctionMatch) {
    const funcName = notFunctionMatch[1];

    // Add optional chaining for function calls
    const callPattern = new RegExp(`(\\b\\w+(?:\\.\\w+)*)\\.(${funcName})\\s*\\(`, 'g');
    const newCode = code.replace(callPattern, (match, prefix, fn) => {
      if (match.includes('?.')) return match;
      return `${prefix}?.${fn}?.(`;
    });

    if (newCode !== code) {
      return {
        fixed: true,
        newCode,
        description: `Added optional chaining for '${funcName}()' call`,
        fixType: 'runtime'
      };
    }
  }

  // "Cannot destructure property 'X' of undefined"
  const destructureMatch = errorMessage.match(/cannot destructure property ['"](\w+)['"] of/i);
  if (destructureMatch) {
    const propName = destructureMatch[1];

    // Find destructuring patterns and add default empty object
    // Pattern: const { propName } = something
    const destructurePattern = new RegExp(`(const|let|var)\\s*{([^}]*\\b${propName}\\b[^}]*)}\\s*=\\s*([^;]+)`, 'g');
    const newCode = code.replace(destructurePattern, (match, keyword, props, source) => {
      // Add default empty object if not already there
      if (source.trim().endsWith('|| {}') || source.trim().endsWith('?? {}')) {
        return match;
      }
      return `${keyword} {${props}} = (${source.trim()}) || {}`;
    });

    if (newCode !== code) {
      return {
        fixed: true,
        newCode,
        description: `Added default value for destructuring '${propName}'`,
        fixType: 'runtime'
      };
    }
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Fix missing closing brackets/braces
 */
function tryFixMissingClosing(errorMessage: string, code: string): SimpleFixResult {
  const errorLower = errorMessage.toLowerCase();

  // Count brackets
  const counts: Record<string, number> = { '(': 0, ')': 0, '{': 0, '}': 0, '[': 0, ']': 0 };

  // Simple bracket counting (skip strings and comments)
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const nextChar = code[i + 1] || '';
    const prevChar = i > 0 ? code[i - 1] : '';

    // Handle comments
    if (!inString && !inBlockComment && char === '/' && nextChar === '/') {
      inLineComment = true;
      continue;
    }
    if (inLineComment && char === '\n') {
      inLineComment = false;
      continue;
    }
    if (!inString && !inLineComment && char === '/' && nextChar === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (inBlockComment && char === '*' && nextChar === '/') {
      inBlockComment = false;
      i++;
      continue;
    }
    if (inLineComment || inBlockComment) continue;

    // Handle strings
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // Count brackets outside strings
    if (!inString && counts.hasOwnProperty(char)) {
      counts[char]++;
    }
  }

  let newCode = code;
  const fixes: string[] = [];

  // Check for missing closing brackets
  if (counts['('] > counts[')']) {
    const missing = counts['('] - counts[')'];
    newCode = newCode.trimEnd() + ')'.repeat(missing);
    fixes.push(`${missing} closing )`);
  }

  if (counts['{'] > counts['}']) {
    const missing = counts['{'] - counts['}'];
    newCode = newCode.trimEnd() + '\n' + '}'.repeat(missing);
    fixes.push(`${missing} closing }`);
  }

  if (counts['['] > counts[']']) {
    const missing = counts['['] - counts[']'];
    newCode = newCode.trimEnd() + ']'.repeat(missing);
    fixes.push(`${missing} closing ]`);
  }

  if (fixes.length > 0 && newCode !== code) {
    return {
      fixed: true,
      newCode,
      description: `Added missing: ${fixes.join(', ')}`,
      fixType: 'syntax'
    };
  }

  // Check error message for specific hints
  if (errorLower.includes("expected '}'") || errorLower.includes("missing }")) {
    return {
      fixed: true,
      newCode: code.trimEnd() + '\n}',
      description: 'Added missing }',
      fixType: 'syntax'
    };
  }

  if (errorLower.includes("expected ')'") || errorLower.includes("missing )")) {
    return {
      fixed: true,
      newCode: code.trimEnd() + ')',
      description: 'Added missing )',
      fixType: 'syntax'
    };
  }

  if (errorLower.includes("expected ']'") || errorLower.includes("missing ]")) {
    return {
      fixed: true,
      newCode: code.trimEnd() + ']',
      description: 'Added missing ]',
      fixType: 'syntax'
    };
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Try to fix undefined variable (typos)
 */
function tryFixUndefinedVariable(errorMessage: string, code: string): SimpleFixResult {
  const match = errorMessage.match(/['"]?(\w+)['"]?\s+is not defined/i);
  if (!match) return { fixed: false, newCode: code, description: '', fixType: 'none' };

  const undefinedVar = match[1];

  // Skip if it's a known import we couldn't find
  if (REACT_IMPORTS[undefinedVar] || COMMON_IMPORTS[undefinedVar]) {
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // Extract all defined variables
  const definedVars = extractDefinedVariables(code);

  // Find most similar variable
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const definedVar of definedVars) {
    if (definedVar === undefinedVar) continue;
    const score = similarity(undefinedVar, definedVar);
    if (score > bestScore && score > 0.6) {
      bestScore = score;
      bestMatch = definedVar;
    }
  }

  if (bestMatch) {
    const replaceRegex = new RegExp(`\\b${undefinedVar}\\b`, 'g');
    const newCode = code.replace(replaceRegex, bestMatch);
    if (newCode !== code) {
      return {
        fixed: true,
        newCode,
        description: `Fixed typo: ${undefinedVar} → ${bestMatch}`,
        fixType: 'typo'
      };
    }
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Extract defined variables from code
 */
function extractDefinedVariables(code: string): string[] {
  const vars: string[] = [];

  // const/let/var declarations
  for (const match of code.matchAll(/(const|let|var)\s+(\w+)/g)) {
    vars.push(match[2]);
  }

  // Function declarations
  for (const match of code.matchAll(/function\s+(\w+)/g)) {
    vars.push(match[1]);
  }

  // Destructured state from useState
  for (const match of code.matchAll(/const\s+\[(\w+),\s*(\w+)\]/g)) {
    vars.push(match[1], match[2]);
  }

  // Object destructuring
  for (const match of code.matchAll(/const\s+{\s*([^}]+)\s*}/g)) {
    const props = match[1].split(',');
    for (const prop of props) {
      const propName = prop.split(':')[0].trim();
      if (propName && /^\w+$/.test(propName)) {
        vars.push(propName);
      }
    }
  }

  // Arrow function parameters
  for (const match of code.matchAll(/(?:const|let|var)\s+\w+\s*=\s*\(([^)]*)\)\s*=>/g)) {
    const params = match[1].split(',');
    for (const param of params) {
      const paramName = param.split('=')[0].split(':')[0].trim();
      if (paramName && /^\w+$/.test(paramName)) {
        vars.push(paramName);
      }
    }
  }

  return [...new Set(vars)];
}

/**
 * Calculate similarity between two strings (Jaro-Winkler-like)
 */
function similarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const s1Lower = s1.toLowerCase();
  const s2Lower = s2.toLowerCase();

  if (s1Lower === s2Lower) return 0.95; // Case difference only

  // Simple character overlap ratio
  const chars1 = new Set(s1Lower);
  const chars2 = new Set(s2Lower);
  let common = 0;
  for (const c of chars1) {
    if (chars2.has(c)) common++;
  }

  const unionSize = new Set([...chars1, ...chars2]).size;
  const charSimilarity = common / unionSize;

  // Length similarity
  const lengthSimilarity = 1 - Math.abs(s1.length - s2.length) / Math.max(s1.length, s2.length);

  // Prefix similarity bonus
  let prefixLength = 0;
  for (let i = 0; i < Math.min(s1Lower.length, s2Lower.length); i++) {
    if (s1Lower[i] === s2Lower[i]) prefixLength++;
    else break;
  }
  const prefixBonus = prefixLength / Math.max(s1.length, s2.length) * 0.2;

  return (charSimilarity * 0.5 + lengthSimilarity * 0.3) + prefixBonus;
}

/**
 * Try to fix missing semicolon
 */
function tryFixMissingSemicolon(errorMessage: string, code: string): SimpleFixResult {
  const errorLower = errorMessage.toLowerCase();

  if (errorLower.includes('missing semicolon') || errorLower.includes("expected ';'")) {
    // Try to find the line number from error
    const lineMatch = errorMessage.match(/line\s+(\d+)/i);
    if (lineMatch) {
      const lineNum = parseInt(lineMatch[1], 10);
      const lines = code.split('\n');

      if (lineNum > 0 && lineNum <= lines.length) {
        const targetLine = lines[lineNum - 1];
        const trimmed = targetLine.trimEnd();

        // Add semicolon if appropriate
        if (!trimmed.endsWith(';') &&
            !trimmed.endsWith('{') &&
            !trimmed.endsWith('}') &&
            !trimmed.endsWith(',') &&
            !trimmed.endsWith(':') &&
            !trimmed.match(/^\s*\/\//) &&
            !trimmed.match(/^\s*\*/) &&
            !trimmed.match(/^\s*\/\*/)) {
          lines[lineNum - 1] = trimmed + ';';
          return {
            fixed: true,
            newCode: lines.join('\n'),
            description: `Added semicolon at line ${lineNum}`,
            fixType: 'syntax'
          };
        }
      }
    }
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Try to fix React-specific issues
 */
function tryFixReactIssues(errorMessage: string, code: string): SimpleFixResult {
  const errorLower = errorMessage.toLowerCase();

  // Missing key prop in list
  if (errorLower.includes('unique "key" prop') || errorLower.includes('each child in a list')) {
    // Find map() calls that return JSX without key
    const mapPattern = /\.map\s*\(\s*\(?\s*(\w+)(?:\s*,\s*(\w+))?\s*\)?\s*=>\s*(?:\(?\s*)?(<\w+)(?![^>]*\bkey\s*=)/g;

    let newCode = code;
    let match;
    let fixed = false;

    while ((match = mapPattern.exec(code)) !== null) {
      const itemVar = match[1];
      const indexVar = match[2] || 'index';
      const jsxTag = match[3];

      // Add key prop to the JSX element
      const fullMatch = match[0];
      const replacement = fullMatch.replace(
        jsxTag,
        `${jsxTag} key={${itemVar}.id || ${indexVar}}`
      );

      newCode = newCode.slice(0, match.index) + replacement + newCode.slice(match.index + fullMatch.length);
      mapPattern.lastIndex = match.index + replacement.length;
      fixed = true;
    }

    if (fixed && newCode !== code) {
      // Also need to ensure index is available if we're using it
      if (!code.includes(', index)') && newCode.includes('|| index}')) {
        newCode = newCode.replace(
          /\.map\s*\(\s*\(?\s*(\w+)\s*\)?\s*=>/g,
          '.map(($1, index) =>'
        );
      }

      return {
        fixed: true,
        newCode,
        description: 'Added missing key prop to list items',
        fixType: 'react'
      };
    }
  }

  // Invalid hook call (hook inside condition)
  if (errorLower.includes('hooks can only be called') || errorLower.includes('invalid hook call')) {
    // This is complex to fix automatically - just note it
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // "Objects are not valid as a React child"
  if (errorLower.includes('objects are not valid as a react child')) {
    // Common fix: wrap object in JSON.stringify for debugging
    // But this is usually a logic error that needs manual review
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Try to fix arrow function syntax errors
 */
function tryFixArrowFunction(errorMessage: string, code: string): SimpleFixResult {
  const errorLower = errorMessage.toLowerCase();

  // Missing parentheses in arrow function
  if (errorLower.includes('unexpected token') && errorLower.includes('=>')) {
    // Fix: param => ({}) instead of param => {}
    // When returning object literal directly
    const objectReturnPattern = /=>\s*{\s*(\w+)\s*:/g;
    const newCode = code.replace(objectReturnPattern, '=> ({ $1:');

    if (newCode !== code) {
      // Also need to close the parens
      const fixedCode = newCode.replace(/=>\s*\(\{\s*(\w+)\s*:\s*([^}]+)\s*}/g, '=> ({ $1: $2 })');
      return {
        fixed: true,
        newCode: fixedCode,
        description: 'Fixed arrow function object return syntax',
        fixType: 'syntax'
      };
    }
  }

  // Missing return in multi-line arrow function
  if (errorLower.includes('unexpected token') || errorLower.includes('expected expression')) {
    // Pattern: () => { expression } without return
    // This is hard to detect reliably, skip for now
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Check if an error can potentially be fixed without AI
 */
export function canTrySimpleFix(errorMessage: string): boolean {
  const patterns = [
    /is not defined/i,
    /invalid.*prop/i,
    /unknown prop/i,
    /react does not recognize/i,
    /expected ['"`][});\]]['"`]/i,
    /missing.*[});\]]/i,
    /missing semicolon/i,
    /react is not defined/i,
    /unexpected token/i,
    /unterminated jsx/i,
    /expected corresponding jsx closing tag/i,
    /cannot read propert/i,
    /is not a function/i,
    /cannot destructure/i,
    /unique "key" prop/i,
    /each child in a list/i,
    /void element/i,
    /self-closing/i,
    /unclosed.*element/i,
  ];

  return patterns.some(pattern => pattern.test(errorMessage));
}

/**
 * Get a human-readable category for the fix type
 */
export function getFixTypeLabel(fixType: SimpleFixResult['fixType']): string {
  const labels: Record<string, string> = {
    'import': 'Import Fix',
    'typo': 'Typo Fix',
    'syntax': 'Syntax Fix',
    'jsx': 'JSX Fix',
    'runtime': 'Runtime Fix',
    'react': 'React Fix',
    'none': 'No Fix'
  };
  return labels[fixType] || 'Fix';
}
