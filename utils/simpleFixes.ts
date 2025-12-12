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

// Animation libraries
const MOTION_IMPORTS: Record<string, string> = {
  'motion': 'motion/react',
  'AnimatePresence': 'motion/react',
  'useAnimation': 'motion/react',
  'useMotionValue': 'motion/react',
  'useTransform': 'motion/react',
  'useSpring': 'motion/react',
  'useScroll': 'motion/react',
  'useInView': 'motion/react',
  'useReducedMotion': 'motion/react',
  'MotionConfig': 'motion/react',
  'LazyMotion': 'motion/react',
  'domAnimation': 'motion/react',
  'domMax': 'motion/react',
  'Reorder': 'motion/react',
  'LayoutGroup': 'motion/react',
};

// State management libraries
const STATE_MANAGEMENT_IMPORTS: Record<string, string> = {
  // Zustand
  'create': 'zustand',
  'createStore': 'zustand',
  'useStore': 'zustand',
  // TanStack Query
  'useQuery': '@tanstack/react-query',
  'useMutation': '@tanstack/react-query',
  'useQueryClient': '@tanstack/react-query',
  'QueryClient': '@tanstack/react-query',
  'QueryClientProvider': '@tanstack/react-query',
  'useInfiniteQuery': '@tanstack/react-query',
  'useSuspenseQuery': '@tanstack/react-query',
  // SWR
  'useSWR': 'swr',
  'useSWRConfig': 'swr',
  'SWRConfig': 'swr',
  // Jotai
  'atom': 'jotai',
  'useAtom': 'jotai',
  'useAtomValue': 'jotai',
  'useSetAtom': 'jotai',
  'Provider': 'jotai',
};

// Form libraries
const FORM_IMPORTS: Record<string, string> = {
  // React Hook Form
  'useForm': 'react-hook-form',
  'useFieldArray': 'react-hook-form',
  'useWatch': 'react-hook-form',
  'useFormContext': 'react-hook-form',
  'FormProvider': 'react-hook-form',
  'Controller': 'react-hook-form',
  // Formik
  'Formik': 'formik',
  'Form': 'formik',
  'Field': 'formik',
  'ErrorMessage': 'formik',
  'useFormik': 'formik',
  // Zod
  'z': 'zod',
  'ZodError': 'zod',
};

// Routing libraries
const ROUTING_IMPORTS: Record<string, string> = {
  // React Router v7
  'BrowserRouter': 'react-router',
  'Routes': 'react-router',
  'Route': 'react-router',
  'Link': 'react-router',
  'NavLink': 'react-router',
  'useNavigate': 'react-router',
  'useParams': 'react-router',
  'useSearchParams': 'react-router',
  'useLocation': 'react-router',
  'Outlet': 'react-router',
  'Navigate': 'react-router',
  'useRoutes': 'react-router',
  'useMatch': 'react-router',
};

// UI Component Libraries
const UI_LIBRARY_IMPORTS: Record<string, string> = {
  // Radix UI primitives (commonly used with shadcn)
  'Dialog': '@radix-ui/react-dialog',
  'DialogTrigger': '@radix-ui/react-dialog',
  'DialogContent': '@radix-ui/react-dialog',
  'Popover': '@radix-ui/react-popover',
  'PopoverTrigger': '@radix-ui/react-popover',
  'PopoverContent': '@radix-ui/react-popover',
  'Tooltip': '@radix-ui/react-tooltip',
  'TooltipTrigger': '@radix-ui/react-tooltip',
  'TooltipContent': '@radix-ui/react-tooltip',
  'DropdownMenu': '@radix-ui/react-dropdown-menu',
  'Select': '@radix-ui/react-select',
  'Tabs': '@radix-ui/react-tabs',
  'Accordion': '@radix-ui/react-accordion',
  'Switch': '@radix-ui/react-switch',
  'Checkbox': '@radix-ui/react-checkbox',
  'RadioGroup': '@radix-ui/react-radio-group',
  'Slider': '@radix-ui/react-slider',
  'ScrollArea': '@radix-ui/react-scroll-area',
  // Headless UI
  'Menu': '@headlessui/react',
  'Listbox': '@headlessui/react',
  'Combobox': '@headlessui/react',
  'Transition': '@headlessui/react',
  'Disclosure': '@headlessui/react',
};

// Toast/Notification libraries
const TOAST_IMPORTS: Record<string, string> = {
  // React Hot Toast
  'toast': 'react-hot-toast',
  'Toaster': 'react-hot-toast',
  // Sonner
  'Sonner': 'sonner',
  // React Toastify
  'ToastContainer': 'react-toastify',
  'cssTransition': 'react-toastify',
};

// Chart libraries
const CHART_IMPORTS: Record<string, string> = {
  // Recharts
  'LineChart': 'recharts',
  'BarChart': 'recharts',
  'PieChart': 'recharts',
  'AreaChart': 'recharts',
  'XAxis': 'recharts',
  'YAxis': 'recharts',
  'CartesianGrid': 'recharts',
  'Legend': 'recharts',
  'ResponsiveContainer': 'recharts',
  'Line': 'recharts',
  'Bar': 'recharts',
  'Area': 'recharts',
  'Pie': 'recharts',
  'Cell': 'recharts',
  // Chart.js React wrapper
  'Chart': 'react-chartjs-2',
  'Doughnut': 'react-chartjs-2',
  'Radar': 'react-chartjs-2',
};

// Table libraries
const TABLE_IMPORTS: Record<string, string> = {
  // TanStack Table
  'useReactTable': '@tanstack/react-table',
  'getCoreRowModel': '@tanstack/react-table',
  'getSortedRowModel': '@tanstack/react-table',
  'getFilteredRowModel': '@tanstack/react-table',
  'getPaginationRowModel': '@tanstack/react-table',
  'flexRender': '@tanstack/react-table',
  'createColumnHelper': '@tanstack/react-table',
};

// DnD (Drag and Drop) libraries
const DND_IMPORTS: Record<string, string> = {
  // DnD Kit
  'DndContext': '@dnd-kit/core',
  'useDraggable': '@dnd-kit/core',
  'useDroppable': '@dnd-kit/core',
  'DragOverlay': '@dnd-kit/core',
  'closestCenter': '@dnd-kit/core',
  'SortableContext': '@dnd-kit/sortable',
  'useSortable': '@dnd-kit/sortable',
  'arrayMove': '@dnd-kit/sortable',
  // React DnD
  'useDrag': 'react-dnd',
  'useDrop': 'react-dnd',
  'DndProvider': 'react-dnd',
};

// Utility libraries
const UTILITY_IMPORTS: Record<string, string> = {
  // clsx/classnames
  'clsx': 'clsx',
  'cx': 'clsx',
  'classNames': 'classnames',
  'cn': 'clsx', // commonly used alias - also check @/lib/utils
  // date-fns
  'format': 'date-fns',
  'parseISO': 'date-fns',
  'formatDistance': 'date-fns',
  'formatRelative': 'date-fns',
  'addDays': 'date-fns',
  'subDays': 'date-fns',
  'isValid': 'date-fns',
  'differenceInDays': 'date-fns',
  'startOfWeek': 'date-fns',
  'endOfWeek': 'date-fns',
  'isBefore': 'date-fns',
  'isAfter': 'date-fns',
  // lodash
  'debounce': 'lodash',
  'throttle': 'lodash',
  'cloneDeep': 'lodash',
  'isEmpty': 'lodash',
  'groupBy': 'lodash',
  'sortBy': 'lodash',
  'uniqBy': 'lodash',
  // axios
  'axios': 'axios',
  // uuid
  'v4': 'uuid',
  'uuidv4': 'uuid',
  // nanoid
  'nanoid': 'nanoid',
  // immer
  'produce': 'immer',
  'Draft': 'immer',
  // react-use hooks
  'useDebounce': 'react-use',
  'useThrottle': 'react-use',
  'useLocalStorage': 'react-use',
  'useWindowSize': 'react-use',
  'useMedia': 'react-use',
  'usePrevious': 'react-use',
  'useAsync': 'react-use',
  'useToggle': 'react-use',
  'useCopyToClipboard': 'react-use',
};

// Common third-party imports
const COMMON_IMPORTS: Record<string, string> = {
  // Merge all specialized imports
  ...MOTION_IMPORTS,
  ...STATE_MANAGEMENT_IMPORTS,
  ...FORM_IMPORTS,
  ...ROUTING_IMPORTS,
  ...UI_LIBRARY_IMPORTS,
  ...TOAST_IMPORTS,
  ...CHART_IMPORTS,
  ...TABLE_IMPORTS,
  ...DND_IMPORTS,
  ...UTILITY_IMPORTS,
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
 * Fix bare specifier errors (e.g., "src/components/Hero" -> "./components/Hero")
 * Error: The specifier "src/components/Hero.tsx" was a bare specifier
 */
function tryFixBareSpecifier(errorMessage: string, code: string): SimpleFixResult {
  console.log('[SimpleFix] tryFixBareSpecifier called with error:', errorMessage.slice(0, 100));

  // Match error pattern: "src/..." was a bare specifier
  const match = errorMessage.match(/["']?(src\/[\w./-]+)["']?\s*was a bare specifier/i);
  if (!match) {
    console.log('[SimpleFix] No bare specifier pattern match');
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  const bareSpecifier = match[1];
  console.log('[SimpleFix] Found bare specifier:', bareSpecifier);

  // Convert src/components/Hero.tsx -> ./components/Hero
  let relativePath = bareSpecifier.replace(/^src\//, './');
  // Remove file extension (optional in imports)
  relativePath = relativePath.replace(/\.(tsx?|jsx?)$/, '');
  console.log('[SimpleFix] Relative path:', relativePath);

  // Try multiple patterns to find and replace the import
  const patterns = [
    // With extension
    bareSpecifier,
    // Without extension
    bareSpecifier.replace(/\.(tsx?|jsx?)$/, ''),
  ];

  let newCode = code;
  let foundMatch = false;

  for (const pattern of patterns) {
    // Escape special regex chars
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match: import X from 'pattern' or import { X } from "pattern"
    const regex = new RegExp(
      `(import\\s+(?:[\\w,{}\\s*]+)\\s+from\\s*)(['"])${escaped}\\2`,
      'g'
    );

    // Check if pattern exists in code
    if (regex.test(code)) {
      console.log('[SimpleFix] Found import with pattern:', pattern);
      // Reset lastIndex (important for global regex!)
      regex.lastIndex = 0;
      newCode = code.replace(regex, `$1$2${relativePath}$2`);
      foundMatch = true;
      break;
    }
  }

  if (foundMatch && newCode !== code) {
    console.log('[SimpleFix] Successfully fixed import');
    return {
      fixed: true,
      newCode,
      description: `Fixed import path: "${bareSpecifier}" → "${relativePath}"`,
      fixType: 'import'
    };
  }

  console.log('[SimpleFix] Import not found in code, searching for:', patterns);
  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Main entry point: Try to fix common errors without AI
 */
export function trySimpleFix(errorMessage: string, code: string): SimpleFixResult {
  const errorLower = errorMessage.toLowerCase();

  // 0. Try to fix bare specifier errors (most common import path issue)
  if (errorLower.includes('bare specifier') || errorLower.includes('was not remapped')) {
    const bareSpecifierFix = tryFixBareSpecifier(errorMessage, code);
    if (bareSpecifierFix.fixed) return bareSpecifierFix;
  }

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

  // 11. Try to fix TypeScript type errors
  const tsFix = tryFixTypeScriptErrors(errorMessage, code);
  if (tsFix.fixed) return tsFix;

  // 12. Try to fix async/await errors
  const asyncFix = tryFixAsyncErrors(errorMessage, code);
  if (asyncFix.fixed) return asyncFix;

  // 13. Try to fix Promise-related errors
  const promiseFix = tryFixPromiseErrors(errorMessage, code);
  if (promiseFix.fixed) return promiseFix;

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

// Default imports (not named imports) - these use `import X from 'source'` syntax
const DEFAULT_IMPORTS: Set<string> = new Set([
  'axios',
  'clsx',
  'React',
  'ReactDOM',
]);

// Imports that need * as syntax
const NAMESPACE_IMPORTS: Record<string, string> = {
  'motion': 'motion/react', // Actually motion uses named export, but leaving for reference
};

/**
 * Detect missing imports from code usage
 * This is a proactive check that finds used but not imported identifiers
 */
function detectMissingImports(code: string): { identifier: string; source: string }[] {
  const missing: { identifier: string; source: string }[] = [];
  const allKnownImports = { ...REACT_IMPORTS, ...COMMON_IMPORTS };

  for (const [identifier, source] of Object.entries(allKnownImports)) {
    // Check if identifier is used in code (as JSX tag, function call, or variable)
    const usagePatterns = [
      new RegExp(`<${identifier}[\\s/>]`),           // JSX tag: <Component or <Component>
      new RegExp(`\\b${identifier}\\s*\\(`),          // Function call: func(
      new RegExp(`\\b${identifier}\\s*\\.`),          // Property access: obj.prop
      new RegExp(`\\{\\s*${identifier}\\s*[,}]`),     // Destructuring: { identifier }
    ];

    const isUsed = usagePatterns.some(pattern => pattern.test(code));
    if (!isUsed) continue;

    // Check if already imported
    const importedPatterns = [
      new RegExp(`import\\s*{[^}]*\\b${identifier}\\b[^}]*}\\s*from`),  // Named import
      new RegExp(`import\\s+${identifier}\\s+from`),                     // Default import
      new RegExp(`import\\s*\\*\\s*as\\s+${identifier}\\s+from`),       // Namespace import
    ];

    const isImported = importedPatterns.some(pattern => pattern.test(code));
    if (isImported) continue;

    missing.push({ identifier, source });
  }

  return missing;
}

/**
 * Fix missing imports (React hooks and common third-party)
 */
function tryFixMissingImport(errorMessage: string, code: string): SimpleFixResult {
  // Multiple patterns for "not defined" errors
  const patterns = [
    /['"]?(\w+)['"]?\s+is not defined/i,
    /cannot find name\s+['"]?(\w+)['"]?/i,
    /ReferenceError:\s*['"]?(\w+)['"]?\s+is not defined/i,
    /'(\w+)'\s+is undefined/i,
    /(\w+)\s+is not a constructor/i,
    /Cannot read propert(?:y|ies) of undefined \(reading ['"](\w+)['"]\)/i,
  ];

  let identifier: string | null = null;

  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match) {
      identifier = match[1];
      break;
    }
  }

  if (!identifier) {
    // No explicit error match, try proactive detection
    const missingImports = detectMissingImports(code);
    if (missingImports.length > 0) {
      // Fix the first missing import
      const { identifier: id, source } = missingImports[0];
      return addImport(code, id, source);
    }
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // Check if already imported
  const importedPatterns = [
    new RegExp(`import\\s*{[^}]*\\b${identifier}\\b[^}]*}\\s*from`),
    new RegExp(`import\\s+${identifier}\\s+from`),
    new RegExp(`import\\s*\\*\\s*as\\s+${identifier}\\s+from`),
  ];

  if (importedPatterns.some(pattern => pattern.test(code))) {
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // Check React imports
  if (REACT_IMPORTS[identifier]) {
    return addImport(code, identifier, 'react');
  }

  // Check common third-party imports
  if (COMMON_IMPORTS[identifier]) {
    return addImport(code, identifier, COMMON_IMPORTS[identifier]);
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Smart import adder - handles named, default, and namespace imports
 */
function addImport(code: string, identifier: string, source: string): SimpleFixResult {
  // Determine import type
  const isDefaultImport = DEFAULT_IMPORTS.has(identifier);
  const isNamespaceImport = !!NAMESPACE_IMPORTS[identifier];

  if (isDefaultImport) {
    return addDefaultImport(code, identifier, source);
  } else if (isNamespaceImport) {
    return addNamespaceImport(code, identifier, source);
  } else {
    return addNamedImport(code, identifier, source);
  }
}

/**
 * Add a default import: import X from 'source'
 */
function addDefaultImport(code: string, identifier: string, source: string): SimpleFixResult {
  // Check if already has default import from this source
  const existingDefaultRegex = new RegExp(`import\\s+\\w+\\s+from\\s*['"]${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
  if (existingDefaultRegex.test(code)) {
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  const importStatement = `import ${identifier} from '${source}';\n`;
  const newCode = insertImport(code, importStatement);

  return {
    fixed: true,
    newCode,
    description: `Added default import: ${identifier} from '${source}'`,
    fixType: 'import'
  };
}

/**
 * Add a namespace import: import * as X from 'source'
 */
function addNamespaceImport(code: string, identifier: string, source: string): SimpleFixResult {
  const importStatement = `import * as ${identifier} from '${source}';\n`;
  const newCode = insertImport(code, importStatement);

  return {
    fixed: true,
    newCode,
    description: `Added namespace import: * as ${identifier} from '${source}'`,
    fixType: 'import'
  };
}

/**
 * Insert import statement at appropriate position
 */
function insertImport(code: string, importStatement: string): string {
  // Find the last import statement
  const lastImportMatch = code.match(/^(import\s+.+from\s+['"][^'"]+['"];?\s*\n?)+/m);

  if (lastImportMatch) {
    const lastImportEnd = lastImportMatch.index! + lastImportMatch[0].length;
    return code.slice(0, lastImportEnd) + importStatement + code.slice(lastImportEnd);
  } else {
    return importStatement + code;
  }
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

  // Fix adjacent JSX elements (multiple root elements without wrapper)
  if (errorLower.includes('adjacent jsx elements') ||
      errorLower.includes('must be wrapped') ||
      errorLower.includes('only one element')) {
    // Find the return statement and wrap JSX in Fragment
    const returnMatch = code.match(/return\s*\(\s*\n?([\s\S]*?)\s*\);?\s*$/m);
    if (returnMatch) {
      const jsxContent = returnMatch[1].trim();
      // Check if already wrapped
      if (!jsxContent.startsWith('<>') && !jsxContent.startsWith('<Fragment') && !jsxContent.startsWith('<React.Fragment')) {
        // Count top-level JSX elements
        const topLevelTags = jsxContent.match(/^(\s*<[A-Za-z][^>]*>)/gm);
        if (topLevelTags && topLevelTags.length > 1) {
          const wrappedJsx = `<>\n      ${jsxContent}\n    </>`;
          const newCode = code.replace(returnMatch[0], `return (\n    ${wrappedJsx}\n  );`);
          if (newCode !== code) {
            return {
              fixed: true,
              newCode,
              description: 'Wrapped adjacent JSX elements in React Fragment',
              fixType: 'jsx'
            };
          }
        }
      }
    }
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Fix runtime errors (null/undefined access, destructuring)
 */
function tryFixRuntimeError(errorMessage: string, code: string): SimpleFixResult {
  const _errorLower = errorMessage.toLowerCase();

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
    if (!inString && Object.hasOwn(counts, char)) {
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
 * Try to fix TypeScript type errors
 */
function tryFixTypeScriptErrors(errorMessage: string, code: string): SimpleFixResult {
  const errorLower = errorMessage.toLowerCase();

  // TS2345: Argument type mismatch - often needs type assertion
  // "Argument of type 'X' is not assignable to parameter of type 'Y'"
  const argTypeMismatch = errorMessage.match(/argument of type ['"]([^'"]+)['"] is not assignable to parameter of type ['"]([^'"]+)['"]/i);
  if (argTypeMismatch) {
    // Can't easily fix without more context, but we can detect it
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // TS2322: Type assignment error - property missing or wrong
  // "Type 'X' is not assignable to type 'Y'"
  if (errorLower.includes('is not assignable to type')) {
    // Check for common patterns

    // null/undefined assignment
    if (errorLower.includes("'null'") || errorLower.includes("'undefined'")) {
      // Often needs a default value or optional chaining
      return { fixed: false, newCode: code, description: '', fixType: 'none' };
    }
  }

  // TS7006: Parameter implicitly has 'any' type
  if (errorMessage.includes("implicitly has an 'any' type") ||
      errorMessage.includes("Parameter '") && errorMessage.includes("any")) {
    const paramMatch = errorMessage.match(/Parameter ['"](\w+)['"]/);
    if (paramMatch) {
      const paramName = paramMatch[1];

      // Try to add type annotation based on common patterns
      // Event handlers
      if (paramName === 'e' || paramName === 'event') {
        const eventPatterns = [
          { pattern: /onClick.*=.*\((\s*)e\s*\)/g, type: 'React.MouseEvent' },
          { pattern: /onChange.*=.*\((\s*)e\s*\)/g, type: 'React.ChangeEvent<HTMLInputElement>' },
          { pattern: /onSubmit.*=.*\((\s*)e\s*\)/g, type: 'React.FormEvent<HTMLFormElement>' },
          { pattern: /onKeyDown.*=.*\((\s*)e\s*\)/g, type: 'React.KeyboardEvent' },
          { pattern: /onKeyUp.*=.*\((\s*)e\s*\)/g, type: 'React.KeyboardEvent' },
          { pattern: /onFocus.*=.*\((\s*)e\s*\)/g, type: 'React.FocusEvent' },
          { pattern: /onBlur.*=.*\((\s*)e\s*\)/g, type: 'React.FocusEvent' },
          { pattern: /onDrag.*=.*\((\s*)e\s*\)/g, type: 'React.DragEvent' },
        ];

        for (const { pattern, type } of eventPatterns) {
          if (pattern.test(code)) {
            const newCode = code.replace(
              /(\w+(?:Handler)?)\s*=\s*\((\s*)e\s*\)\s*=>/g,
              `$1 = ($2e: ${type}) =>`
            );
            if (newCode !== code) {
              return {
                fixed: true,
                newCode,
                description: `Added type annotation: ${type} for event parameter`,
                fixType: 'syntax'
              };
            }
          }
        }
      }
    }
  }

  // TS2339: Property does not exist on type
  // "Property 'X' does not exist on type 'Y'"
  const propNotExistMatch = errorMessage.match(/property ['"](\w+)['"] does not exist on type ['"]([^'"]+)['"]/i);
  if (propNotExistMatch) {
    const propName = propNotExistMatch[1];
    const typeName = propNotExistMatch[2];

    // For 'Object' or 'unknown' types, suggest type assertion
    if (typeName === 'Object' || typeName === 'unknown' || typeName === '{}') {
      // Look for the property access and add type assertion
      const accessPattern = new RegExp(`(\\w+)\\.${propName}\\b`, 'g');
      const newCode = code.replace(accessPattern, `($1 as any).${propName}`);
      if (newCode !== code) {
        return {
          fixed: true,
          newCode,
          description: `Added type assertion for '${propName}' property access`,
          fixType: 'syntax'
        };
      }
    }
  }

  // TS2532: Object is possibly undefined
  if (errorMessage.includes('Object is possibly') &&
      (errorMessage.includes('undefined') || errorMessage.includes('null'))) {
    // This typically needs optional chaining - handled in runtime fixes
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // TS18046: 'X' is of type 'unknown'
  if (errorMessage.includes("is of type 'unknown'")) {
    const varMatch = errorMessage.match(/['"](\w+)['"] is of type 'unknown'/);
    if (varMatch) {
      const varName = varMatch[1];
      // Add type assertion
      const pattern = new RegExp(`\\b${varName}\\b(?!\\s*as\\s)`, 'g');
      let firstReplace = true;
      const newCode = code.replace(pattern, (match) => {
        if (firstReplace) {
          firstReplace = false;
          return `(${match} as any)`;
        }
        return match;
      });
      if (newCode !== code) {
        return {
          fixed: true,
          newCode,
          description: `Added type assertion for unknown type '${varName}'`,
          fixType: 'syntax'
        };
      }
    }
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Try to fix async/await errors
 */
function tryFixAsyncErrors(errorMessage: string, code: string): SimpleFixResult {
  const errorLower = errorMessage.toLowerCase();

  // "'await' is only valid in async function"
  if (errorLower.includes("'await' is only valid in async") ||
      errorLower.includes("await is only allowed in async") ||
      errorLower.includes("unexpected reserved word 'await'")) {

    // Find the function containing the await
    // Look for function expressions without async
    const patterns = [
      // Arrow function: const fn = () => { await... } → const fn = async () => { await... }
      {
        pattern: /(const|let|var)\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*\{([^}]*await[^}]*)\}/g,
        replacement: '$1 $2 = async ($3) => {$4}'
      },
      // Arrow function single line: const fn = () => await... → const fn = async () => await...
      {
        pattern: /(const|let|var)\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*(await\s)/g,
        replacement: '$1 $2 = async ($3) => $4'
      },
      // Event handler: onClick={() => { await... }} → onClick={async () => { await... }}
      {
        pattern: /(\w+)=\{\s*\(([^)]*)\)\s*=>\s*\{([^}]*await[^}]*)\}\s*\}/g,
        replacement: '$1={async ($2) => {$3}}'
      },
      // Function expression: function fn() { await... } → async function fn() { await... }
      {
        pattern: /function\s+(\w+)\s*\(([^)]*)\)\s*\{([^}]*await[^}]*)\}/g,
        replacement: 'async function $1($2) {$3}'
      },
    ];

    for (const { pattern, replacement } of patterns) {
      if (pattern.test(code)) {
        const newCode = code.replace(pattern, replacement);
        if (newCode !== code) {
          return {
            fixed: true,
            newCode,
            description: 'Added async keyword to function containing await',
            fixType: 'syntax'
          };
        }
      }
    }
  }

  // "Cannot use 'await' outside of an async function or at the top level"
  // Similar to above but different message format
  if (errorLower.includes("cannot use await outside")) {
    // Same fix as above
    const arrowPattern = /(\w+)=\{\s*\(([^)]*)\)\s*=>\s*\{([^}]*await[^}]*)\}\s*\}/g;
    const newCode = code.replace(arrowPattern, '$1={async ($2) => {$3}}');
    if (newCode !== code) {
      return {
        fixed: true,
        newCode,
        description: 'Added async keyword to arrow function containing await',
        fixType: 'syntax'
      };
    }
  }

  // "Promise returned but not awaited" or similar
  if (errorLower.includes('promise') &&
      (errorLower.includes('not awaited') || errorLower.includes('floating promise'))) {
    // Find function calls that return promises but aren't awaited
    // This is complex to fix automatically without knowing which functions return promises
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // "Property 'then' does not exist on type 'void'"
  // This usually means a function was called without await that should have been
  if (errorMessage.includes("'then' does not exist")) {
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // ".then is not a function" - trying to call .then on non-promise
  if (errorLower.includes('.then is not a function')) {
    // Find .then() calls and remove them if the function isn't async
    const thenPattern = /(\w+\([^)]*\))\.then\(/g;
    const match = thenPattern.exec(code);
    if (match) {
      // This is tricky - the function might need to be async, or .then needs to be removed
      return { fixed: false, newCode: code, description: '', fixType: 'none' };
    }
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Try to fix Promise-related errors
 */
function tryFixPromiseErrors(errorMessage: string, code: string): SimpleFixResult {
  const errorLower = errorMessage.toLowerCase();

  // "Unhandled promise rejection" - needs try/catch or .catch()
  if (errorLower.includes('unhandled promise rejection') ||
      errorLower.includes('uncaught (in promise)')) {
    // Find async function calls without error handling
    // This is complex to fix automatically
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // "Cannot read property 'X' of Promise" - forgot to await
  const promisePropMatch = errorMessage.match(/cannot read propert(?:y|ies).*of promise/i);
  if (promisePropMatch) {
    // Find the likely culprit - a function call that should be awaited
    // Look for patterns like: const result = fetchData(); result.data
    // This is tricky without knowing which functions return promises
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  // "[object Promise]" in output - usually means Promise wasn't awaited
  if (errorMessage.includes('[object Promise]')) {
    // Find JSX that might be rendering a promise directly
    // Example: <div>{fetchData()}</div> should be handled with state
    return { fixed: false, newCode: code, description: '', fixType: 'none' };
  }

  return { fixed: false, newCode: code, description: '', fixType: 'none' };
}

/**
 * Check if an error can potentially be fixed without AI
 */
export function canTrySimpleFix(errorMessage: string): boolean {
  const patterns = [
    // Import/Reference errors
    /is not defined/i,
    /cannot find name/i,
    /is undefined/i,
    /ReferenceError/i,
    /is not a constructor/i,

    // Prop/attribute errors
    /invalid.*prop/i,
    /unknown prop/i,
    /react does not recognize/i,
    /Invalid DOM property/i,

    // Syntax errors
    /expected ['"`][});\]]['"`]/i,
    /missing.*[});\]]/i,
    /missing semicolon/i,
    /unexpected token/i,
    /unexpected end of input/i,
    /expected expression/i,
    /expected identifier/i,

    // React errors
    /react is not defined/i,
    /unique "key" prop/i,
    /each child in a list/i,
    /invalid hook call/i,

    // JSX errors
    /unterminated jsx/i,
    /expected corresponding jsx closing tag/i,
    /void element/i,
    /self-closing/i,
    /unclosed.*element/i,
    /adjacent jsx elements/i,

    // Runtime errors
    /cannot read propert/i,
    /is not a function/i,
    /cannot destructure/i,
    /null is not/i,
    /undefined is not/i,
    /cannot access/i,
    /is not iterable/i,

    // TypeScript errors
    /TS\d{4}/i, // TypeScript error codes (TS2345, TS2322, etc.)
    /is not assignable to/i,
    /implicitly has.*'any' type/i,
    /property.*does not exist on type/i,
    /object is possibly.*undefined/i,
    /object is possibly.*null/i,
    /is of type 'unknown'/i,
    /type.*has no.*signature/i,
    /cannot invoke.*type/i,

    // Async/await errors
    /await.*only.*async/i,
    /await.*outside.*async/i,
    /unexpected reserved word.*await/i,
    /floating promise/i,
    /unhandled promise/i,
    /uncaught.*in promise/i,
    /'then'.*does not exist/i,
    /\.then is not a function/i,
    /\[object Promise\]/i,
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

// ============================================================================
// PROACTIVE CODE ANALYSIS
// ============================================================================

export interface CodeIssue {
  type: 'error' | 'warning' | 'suggestion';
  category: 'import' | 'syntax' | 'react' | 'typescript' | 'accessibility' | 'performance' | 'security';
  message: string;
  line?: number;
  fix?: () => string; // Returns fixed code
  autoFixable: boolean;
}

/**
 * Proactively analyze code for potential issues BEFORE runtime errors occur
 * This is useful for catching common mistakes early
 */
export function analyzeCode(code: string): CodeIssue[] {
  const issues: CodeIssue[] = [];

  // 1. Check for missing imports (proactive)
  const missingImports = detectMissingImports(code);
  for (const { identifier, source } of missingImports) {
    issues.push({
      type: 'error',
      category: 'import',
      message: `'${identifier}' is used but not imported. Expected import from '${source}'`,
      autoFixable: true
    });
  }

  // 2. Check for common React mistakes
  issues.push(...checkReactPatterns(code));

  // 3. Check for potential runtime errors
  issues.push(...checkRuntimePatterns(code));

  // 4. Check for accessibility issues
  issues.push(...checkAccessibilityPatterns(code));

  // 5. Check for performance anti-patterns
  issues.push(...checkPerformancePatterns(code));

  // 6. Check for security issues
  issues.push(...checkSecurityPatterns(code));

  return issues;
}

/**
 * Check for common React mistakes
 */
function checkReactPatterns(code: string): CodeIssue[] {
  const issues: CodeIssue[] = [];

  // Check for .map() without key prop
  const mapWithoutKey = /\.map\s*\(\s*(?:\([^)]*\)|[^,)]+)\s*=>\s*(?:\(?\s*)?<\w+(?![^>]*\bkey\s*=)[^>]*>/g;
  const mapMatches = code.match(mapWithoutKey);
  if (mapMatches) {
    issues.push({
      type: 'warning',
      category: 'react',
      message: 'List items in .map() should have unique "key" prop for optimal re-rendering',
      autoFixable: true
    });
  }

  // Check for setState in render/return
  const setStateInRender = /return\s*\([^)]*set\w+\s*\(/;
  if (setStateInRender.test(code)) {
    issues.push({
      type: 'error',
      category: 'react',
      message: 'Avoid calling setState directly in render. Use useEffect for side effects.',
      autoFixable: false
    });
  }

  // Check for hooks in conditionals
  const hooksInConditional = /if\s*\([^)]*\)\s*\{[^}]*(use\w+)\s*\(/;
  const hookMatch = code.match(hooksInConditional);
  if (hookMatch) {
    issues.push({
      type: 'error',
      category: 'react',
      message: `Hook '${hookMatch[1]}' is called conditionally. Hooks must be called in the same order every render.`,
      autoFixable: false
    });
  }

  // Check for hooks in loops
  const hooksInLoop = /(for|while)\s*\([^)]*\)\s*\{[^}]*(use\w+)\s*\(/;
  const loopHookMatch = code.match(hooksInLoop);
  if (loopHookMatch) {
    issues.push({
      type: 'error',
      category: 'react',
      message: `Hook '${loopHookMatch[2]}' is called inside a loop. Hooks must be called at the top level.`,
      autoFixable: false
    });
  }

  // Check for missing dependency array in useEffect
  const useEffectNoDeps = /useEffect\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*\)\s*;/g;
  if (useEffectNoDeps.test(code)) {
    // Check if it's actually missing (no second argument)
    const effectCalls = code.match(/useEffect\s*\([^;]+\)/g) || [];
    for (const call of effectCalls) {
      // Count commas to see if dependency array is provided
      const arrowIndex = call.indexOf('=>');
      if (arrowIndex === -1) continue;
      const afterArrow = call.slice(arrowIndex);
      // Look for closing brace followed by comma and array
      if (!afterArrow.match(/}\s*,\s*\[/)) {
        issues.push({
          type: 'warning',
          category: 'react',
          message: 'useEffect is missing dependency array. Add [] for mount-only or [deps] for updates.',
          autoFixable: false
        });
        break;
      }
    }
  }

  // Check for inline object/array in JSX props (causes re-renders)
  const inlineObjectProp = /\w+=\{\s*\{[^}]+\}\s*\}/g;
  const inlineArrayProp = /\w+=\{\s*\[[^\]]+\]\s*\}/g;
  if (inlineObjectProp.test(code) || inlineArrayProp.test(code)) {
    // Filter out style prop which is commonly inline
    if (!/style=\{/.test(code.match(inlineObjectProp)?.[0] || '')) {
      issues.push({
        type: 'suggestion',
        category: 'performance',
        message: 'Inline objects/arrays in JSX props create new references on every render. Consider using useMemo.',
        autoFixable: false
      });
    }
  }

  // Check for event handler recreated on every render
  const inlineHandler = /on\w+=\{\s*\([^)]*\)\s*=>/g;
  const handlerMatches = code.match(inlineHandler);
  if (handlerMatches && handlerMatches.length > 3) {
    issues.push({
      type: 'suggestion',
      category: 'performance',
      message: 'Multiple inline event handlers may cause unnecessary re-renders. Consider useCallback.',
      autoFixable: false
    });
  }

  return issues;
}

/**
 * Check for potential runtime errors
 */
function checkRuntimePatterns(code: string): CodeIssue[] {
  const issues: CodeIssue[] = [];

  // Check for potential null/undefined access without guard
  const dangerousAccess = /(\w+)\.(\w+)\.\w+(?![\s\S]*\?\.)(?![\s\S]*&&)/g;
  const accessMatch = code.match(dangerousAccess);
  if (accessMatch && accessMatch.length > 5) {
    issues.push({
      type: 'suggestion',
      category: 'typescript',
      message: 'Deep property access without optional chaining (?.) could cause runtime errors if properties are undefined.',
      autoFixable: false
    });
  }

  // Check for array access without bounds check
  const arrayAccess = /\w+\[\d+\]/g;
  if (arrayAccess.test(code)) {
    // Check if it's accessing a potentially undefined index
    const matches = code.match(/\w+\[(\d+)\]/g) || [];
    for (const match of matches) {
      const index = parseInt(match.match(/\[(\d+)\]/)?.[1] || '0');
      if (index > 10) {
        issues.push({
          type: 'warning',
          category: 'typescript',
          message: `Array access at index ${index} might be out of bounds. Consider adding bounds check.`,
          autoFixable: false
        });
        break;
      }
    }
  }

  // Check for async function without error handling
  const asyncNoTryCatch = /async\s+(?:\w+\s*)?\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?\s*)?\{(?![\s\S]*try\s*\{)[^}]*await/g;
  if (asyncNoTryCatch.test(code)) {
    issues.push({
      type: 'suggestion',
      category: 'typescript',
      message: 'Async function with await but no try/catch. Consider adding error handling.',
      autoFixable: false
    });
  }

  // Check for JSON.parse without try/catch
  const jsonParseNoTry = /JSON\.parse\s*\([^)]+\)(?![\s\S]{0,50}catch)/;
  if (jsonParseNoTry.test(code)) {
    issues.push({
      type: 'warning',
      category: 'typescript',
      message: 'JSON.parse can throw on invalid input. Consider wrapping in try/catch.',
      autoFixable: false
    });
  }

  return issues;
}

/**
 * Check for accessibility issues
 */
function checkAccessibilityPatterns(code: string): CodeIssue[] {
  const issues: CodeIssue[] = [];

  // Check for img without alt
  const imgNoAlt = /<img(?![^>]*\balt\s*=)[^>]*>/gi;
  if (imgNoAlt.test(code)) {
    issues.push({
      type: 'warning',
      category: 'accessibility',
      message: '<img> elements should have alt attribute for screen readers.',
      autoFixable: true
    });
  }

  // Check for button without type
  const buttonNoType = /<button(?![^>]*\btype\s*=)[^>]*>/gi;
  if (buttonNoType.test(code)) {
    issues.push({
      type: 'suggestion',
      category: 'accessibility',
      message: '<button> elements should have explicit type="button" or type="submit".',
      autoFixable: true
    });
  }

  // Check for onClick on non-interactive elements
  const onClickNonInteractive = /<(div|span|p)\s[^>]*onClick/gi;
  if (onClickNonInteractive.test(code)) {
    issues.push({
      type: 'warning',
      category: 'accessibility',
      message: 'onClick on <div>/<span> is not keyboard accessible. Use <button> or add role and keyboard handlers.',
      autoFixable: false
    });
  }

  // Check for missing form labels
  const inputNoLabel = /<input(?![^>]*\baria-label)[^>]*>(?![\s\S]{0,50}<label)/gi;
  if (inputNoLabel.test(code)) {
    issues.push({
      type: 'suggestion',
      category: 'accessibility',
      message: 'Input elements should have associated <label> or aria-label for accessibility.',
      autoFixable: false
    });
  }

  return issues;
}

/**
 * Check for performance anti-patterns
 */
function checkPerformancePatterns(code: string): CodeIssue[] {
  const issues: CodeIssue[] = [];

  // Check for large inline styles
  const largeInlineStyle = /style=\{\{[^}]{100,}\}\}/;
  if (largeInlineStyle.test(code)) {
    issues.push({
      type: 'suggestion',
      category: 'performance',
      message: 'Large inline style objects create new references on each render. Consider extracting to a constant or useMemo.',
      autoFixable: false
    });
  }

  // Check for console.log in production code
  const consoleLog = /console\.(log|debug|info)\s*\(/g;
  const consoleLogs = code.match(consoleLog);
  if (consoleLogs && consoleLogs.length > 3) {
    issues.push({
      type: 'suggestion',
      category: 'performance',
      message: 'Multiple console.log statements found. Consider removing for production.',
      autoFixable: false
    });
  }

  // Check for spread operator in loop
  const spreadInLoop = /(for|while|\.map|\.forEach|\.reduce)[^}]*\.\.\./;
  if (spreadInLoop.test(code)) {
    issues.push({
      type: 'suggestion',
      category: 'performance',
      message: 'Spread operator in loops can be slow for large arrays. Consider push() or concat().',
      autoFixable: false
    });
  }

  return issues;
}

/**
 * Check for potential security issues
 */
function checkSecurityPatterns(code: string): CodeIssue[] {
  const issues: CodeIssue[] = [];

  // Check for dangerouslySetInnerHTML
  if (/dangerouslySetInnerHTML/i.test(code)) {
    issues.push({
      type: 'warning',
      category: 'security',
      message: 'dangerouslySetInnerHTML can expose XSS vulnerabilities. Sanitize input with DOMPurify.',
      autoFixable: false
    });
  }

  // Check for eval()
  if (/\beval\s*\(/.test(code)) {
    issues.push({
      type: 'error',
      category: 'security',
      message: 'eval() is dangerous and should not be used. Consider safer alternatives.',
      autoFixable: false
    });
  }

  // Check for innerHTML assignment
  if (/\.innerHTML\s*=/.test(code)) {
    issues.push({
      type: 'warning',
      category: 'security',
      message: 'Direct innerHTML assignment can cause XSS. Use React state and JSX instead.',
      autoFixable: false
    });
  }

  // Check for hardcoded credentials
  const credentials = /(password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{5,}['"]/i;
  if (credentials.test(code)) {
    issues.push({
      type: 'error',
      category: 'security',
      message: 'Possible hardcoded credentials detected. Use environment variables instead.',
      autoFixable: false
    });
  }

  return issues;
}

/**
 * Get all issues and optionally apply auto-fixes
 */
export function analyzeAndFix(code: string, autoFix: boolean = false): {
  issues: CodeIssue[];
  fixedCode: string;
  appliedFixes: string[];
} {
  const issues = analyzeCode(code);
  let fixedCode = code;
  const appliedFixes: string[] = [];

  if (autoFix) {
    // Apply auto-fixable issues
    for (const issue of issues) {
      if (issue.autoFixable && issue.category === 'import') {
        // Handle import fixes using existing function
        const match = issue.message.match(/'(\w+)' is used but not imported.*from '([^']+)'/);
        if (match) {
          const result = addImport(fixedCode, match[1], match[2]);
          if (result.fixed) {
            fixedCode = result.newCode;
            appliedFixes.push(result.description);
          }
        }
      }
    }
  }

  return { issues, fixedCode, appliedFixes };
}
