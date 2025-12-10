/**
 * LocalFixEngine - Fixes common errors without AI
 *
 * This engine handles simple, deterministic fixes:
 * - Bare specifier → relative path conversion
 * - Missing common imports (React, hooks, libraries)
 * - Simple syntax errors
 * - Undefined variables with obvious imports
 */

import { FileSystem } from '../types';

export interface LocalFixResult {
  success: boolean;
  fixedFiles: Record<string, string>;
  explanation: string;
  fixType: 'bare-specifier' | 'missing-import' | 'syntax' | 'undefined-var' | 'none';
}

// Common imports that can be auto-added
const COMMON_IMPORTS: Record<string, { from: string; isDefault?: boolean; isType?: boolean }> = {
  // React
  'React': { from: 'react', isDefault: true },
  'useState': { from: 'react' },
  'useEffect': { from: 'react' },
  'useCallback': { from: 'react' },
  'useMemo': { from: 'react' },
  'useRef': { from: 'react' },
  'useContext': { from: 'react' },
  'useReducer': { from: 'react' },
  'useLayoutEffect': { from: 'react' },
  'useImperativeHandle': { from: 'react' },
  'useDebugValue': { from: 'react' },
  'useDeferredValue': { from: 'react' },
  'useTransition': { from: 'react' },
  'useId': { from: 'react' },
  'useSyncExternalStore': { from: 'react' },
  'useInsertionEffect': { from: 'react' },
  'createContext': { from: 'react' },
  'forwardRef': { from: 'react' },
  'memo': { from: 'react' },
  'lazy': { from: 'react' },
  'Suspense': { from: 'react' },
  'Fragment': { from: 'react' },
  'StrictMode': { from: 'react' },
  'Children': { from: 'react' },
  'cloneElement': { from: 'react' },
  'isValidElement': { from: 'react' },
  'createElement': { from: 'react' },

  // React Types
  'FC': { from: 'react', isType: true },
  'ReactNode': { from: 'react', isType: true },
  'ReactElement': { from: 'react', isType: true },
  'CSSProperties': { from: 'react', isType: true },
  'ChangeEvent': { from: 'react', isType: true },
  'FormEvent': { from: 'react', isType: true },
  'MouseEvent': { from: 'react', isType: true },
  'KeyboardEvent': { from: 'react', isType: true },
  'FocusEvent': { from: 'react', isType: true },
  'SyntheticEvent': { from: 'react', isType: true },
  'RefObject': { from: 'react', isType: true },
  'MutableRefObject': { from: 'react', isType: true },
  'Dispatch': { from: 'react', isType: true },
  'SetStateAction': { from: 'react', isType: true },

  // Lucide Icons (common ones)
  'Search': { from: 'lucide-react' },
  'X': { from: 'lucide-react' },
  'Check': { from: 'lucide-react' },
  'ChevronDown': { from: 'lucide-react' },
  'ChevronUp': { from: 'lucide-react' },
  'ChevronLeft': { from: 'lucide-react' },
  'ChevronRight': { from: 'lucide-react' },
  'ArrowLeft': { from: 'lucide-react' },
  'ArrowRight': { from: 'lucide-react' },
  'Menu': { from: 'lucide-react' },
  'Settings': { from: 'lucide-react' },
  'User': { from: 'lucide-react' },
  'Home': { from: 'lucide-react' },
  'Mail': { from: 'lucide-react' },
  'Phone': { from: 'lucide-react' },
  'Calendar': { from: 'lucide-react' },
  'Clock': { from: 'lucide-react' },
  'Star': { from: 'lucide-react' },
  'Heart': { from: 'lucide-react' },
  'Plus': { from: 'lucide-react' },
  'Minus': { from: 'lucide-react' },
  'Edit': { from: 'lucide-react' },
  'Trash': { from: 'lucide-react' },
  'Trash2': { from: 'lucide-react' },
  'Copy': { from: 'lucide-react' },
  'Download': { from: 'lucide-react' },
  'Upload': { from: 'lucide-react' },
  'Share': { from: 'lucide-react' },
  'Link': { from: 'lucide-react' },
  'ExternalLink': { from: 'lucide-react' },
  'Eye': { from: 'lucide-react' },
  'EyeOff': { from: 'lucide-react' },
  'Lock': { from: 'lucide-react' },
  'Unlock': { from: 'lucide-react' },
  'Bell': { from: 'lucide-react' },
  'Info': { from: 'lucide-react' },
  'AlertCircle': { from: 'lucide-react' },
  'AlertTriangle': { from: 'lucide-react' },
  'HelpCircle': { from: 'lucide-react' },
  'Loader2': { from: 'lucide-react' },
  'RefreshCw': { from: 'lucide-react' },
  'RotateCcw': { from: 'lucide-react' },
  'Filter': { from: 'lucide-react' },
  'SortAsc': { from: 'lucide-react' },
  'SortDesc': { from: 'lucide-react' },
  'MoreHorizontal': { from: 'lucide-react' },
  'MoreVertical': { from: 'lucide-react' },
  'Grip': { from: 'lucide-react' },
  'Move': { from: 'lucide-react' },
  'Maximize': { from: 'lucide-react' },
  'Minimize': { from: 'lucide-react' },
  'FileText': { from: 'lucide-react' },
  'Folder': { from: 'lucide-react' },
  'Image': { from: 'lucide-react' },
  'Video': { from: 'lucide-react' },
  'Music': { from: 'lucide-react' },
  'Code': { from: 'lucide-react' },
  'Terminal': { from: 'lucide-react' },
  'Database': { from: 'lucide-react' },
  'Server': { from: 'lucide-react' },
  'Cloud': { from: 'lucide-react' },
  'Wifi': { from: 'lucide-react' },
  'Bluetooth': { from: 'lucide-react' },
  'Battery': { from: 'lucide-react' },
  'Zap': { from: 'lucide-react' },
  'Sun': { from: 'lucide-react' },
  'Moon': { from: 'lucide-react' },
  'MapPin': { from: 'lucide-react' },
  'Navigation': { from: 'lucide-react' },
  'Compass': { from: 'lucide-react' },
  'Globe': { from: 'lucide-react' },
  'Flag': { from: 'lucide-react' },
  'Bookmark': { from: 'lucide-react' },
  'Tag': { from: 'lucide-react' },
  'Hash': { from: 'lucide-react' },
  'AtSign': { from: 'lucide-react' },
  'Send': { from: 'lucide-react' },
  'MessageSquare': { from: 'lucide-react' },
  'MessageCircle': { from: 'lucide-react' },
  'ThumbsUp': { from: 'lucide-react' },
  'ThumbsDown': { from: 'lucide-react' },
  'Award': { from: 'lucide-react' },
  'Trophy': { from: 'lucide-react' },
  'Gift': { from: 'lucide-react' },
  'ShoppingCart': { from: 'lucide-react' },
  'ShoppingBag': { from: 'lucide-react' },
  'CreditCard': { from: 'lucide-react' },
  'Wallet': { from: 'lucide-react' },
  'DollarSign': { from: 'lucide-react' },
  'Percent': { from: 'lucide-react' },
  'TrendingUp': { from: 'lucide-react' },
  'TrendingDown': { from: 'lucide-react' },
  'BarChart': { from: 'lucide-react' },
  'PieChart': { from: 'lucide-react' },
  'Activity': { from: 'lucide-react' },
  'Layers': { from: 'lucide-react' },
  'Layout': { from: 'lucide-react' },
  'Grid': { from: 'lucide-react' },
  'List': { from: 'lucide-react' },
  'Table': { from: 'lucide-react' },
  'Columns': { from: 'lucide-react' },
  'Sidebar': { from: 'lucide-react' },
  'PanelLeft': { from: 'lucide-react' },
  'PanelRight': { from: 'lucide-react' },
  'Maximize2': { from: 'lucide-react' },
  'Minimize2': { from: 'lucide-react' },
  'Square': { from: 'lucide-react' },
  'Circle': { from: 'lucide-react' },
  'Triangle': { from: 'lucide-react' },
  'Hexagon': { from: 'lucide-react' },
  'Octagon': { from: 'lucide-react' },
  'Pentagon': { from: 'lucide-react' },
  'Play': { from: 'lucide-react' },
  'Pause': { from: 'lucide-react' },
  'Stop': { from: 'lucide-react' },
  'SkipBack': { from: 'lucide-react' },
  'SkipForward': { from: 'lucide-react' },
  'Volume': { from: 'lucide-react' },
  'Volume1': { from: 'lucide-react' },
  'Volume2': { from: 'lucide-react' },
  'VolumeX': { from: 'lucide-react' },
  'Mic': { from: 'lucide-react' },
  'MicOff': { from: 'lucide-react' },
  'Camera': { from: 'lucide-react' },
  'CameraOff': { from: 'lucide-react' },
  'Film': { from: 'lucide-react' },
  'Tv': { from: 'lucide-react' },
  'Monitor': { from: 'lucide-react' },
  'Smartphone': { from: 'lucide-react' },
  'Tablet': { from: 'lucide-react' },
  'Laptop': { from: 'lucide-react' },
  'Watch': { from: 'lucide-react' },
  'Headphones': { from: 'lucide-react' },
  'Speaker': { from: 'lucide-react' },
  'Radio': { from: 'lucide-react' },
  'Printer': { from: 'lucide-react' },
  'Save': { from: 'lucide-react' },
  'FolderOpen': { from: 'lucide-react' },
  'FilePlus': { from: 'lucide-react' },
  'FileMinus': { from: 'lucide-react' },
  'FileCheck': { from: 'lucide-react' },
  'FileX': { from: 'lucide-react' },
  'Files': { from: 'lucide-react' },
  'Archive': { from: 'lucide-react' },
  'Inbox': { from: 'lucide-react' },
  'Paperclip': { from: 'lucide-react' },
  'Clipboard': { from: 'lucide-react' },
  'ClipboardCheck': { from: 'lucide-react' },
  'ClipboardList': { from: 'lucide-react' },
  'ClipboardCopy': { from: 'lucide-react' },
  'ListTodo': { from: 'lucide-react' },
  'CheckSquare': { from: 'lucide-react' },
  'CheckCircle': { from: 'lucide-react' },
  'CheckCircle2': { from: 'lucide-react' },
  'XCircle': { from: 'lucide-react' },
  'XSquare': { from: 'lucide-react' },
  'PlusCircle': { from: 'lucide-react' },
  'PlusSquare': { from: 'lucide-react' },
  'MinusCircle': { from: 'lucide-react' },
  'MinusSquare': { from: 'lucide-react' },
  'Slash': { from: 'lucide-react' },
  'Equal': { from: 'lucide-react' },
  'Divide': { from: 'lucide-react' },
  'Asterisk': { from: 'lucide-react' },
  'Bot': { from: 'lucide-react' },
  'BrainCircuit': { from: 'lucide-react' },
  'Sparkles': { from: 'lucide-react' },
  'Wand2': { from: 'lucide-react' },
  'Palette': { from: 'lucide-react' },
  'Paintbrush': { from: 'lucide-react' },
  'Pipette': { from: 'lucide-react' },
  'Eraser': { from: 'lucide-react' },
  'Scissors': { from: 'lucide-react' },
  'Crop': { from: 'lucide-react' },
  'ZoomIn': { from: 'lucide-react' },
  'ZoomOut': { from: 'lucide-react' },
  'RotateCw': { from: 'lucide-react' },
  'FlipHorizontal': { from: 'lucide-react' },
  'FlipVertical': { from: 'lucide-react' },
  'Undo': { from: 'lucide-react' },
  'Undo2': { from: 'lucide-react' },
  'Redo': { from: 'lucide-react' },
  'Redo2': { from: 'lucide-react' },
  'History': { from: 'lucide-react' },
  'Timer': { from: 'lucide-react' },
  'TimerOff': { from: 'lucide-react' },
  'Hourglass': { from: 'lucide-react' },
  'AlarmClock': { from: 'lucide-react' },
  'Sunrise': { from: 'lucide-react' },
  'Sunset': { from: 'lucide-react' },
  'CloudRain': { from: 'lucide-react' },
  'CloudSnow': { from: 'lucide-react' },
  'CloudLightning': { from: 'lucide-react' },
  'Wind': { from: 'lucide-react' },
  'Thermometer': { from: 'lucide-react' },
  'Droplet': { from: 'lucide-react' },
  'Flame': { from: 'lucide-react' },
  'Leaf': { from: 'lucide-react' },
  'Tree': { from: 'lucide-react' },
  'Mountain': { from: 'lucide-react' },
  'Waves': { from: 'lucide-react' },
  'Anchor': { from: 'lucide-react' },
  'Ship': { from: 'lucide-react' },
  'Plane': { from: 'lucide-react' },
  'Car': { from: 'lucide-react' },
  'Truck': { from: 'lucide-react' },
  'Bus': { from: 'lucide-react' },
  'Train': { from: 'lucide-react' },
  'Bike': { from: 'lucide-react' },
  'Footprints': { from: 'lucide-react' },
  'Rocket': { from: 'lucide-react' },
  'Satellite': { from: 'lucide-react' },
  'Atom': { from: 'lucide-react' },
  'Dna': { from: 'lucide-react' },
  'Microscope': { from: 'lucide-react' },
  'TestTube': { from: 'lucide-react' },
  'Beaker': { from: 'lucide-react' },
  'Flask': { from: 'lucide-react' },
  'Pill': { from: 'lucide-react' },
  'Stethoscope': { from: 'lucide-react' },
  'Syringe': { from: 'lucide-react' },
  'Ambulance': { from: 'lucide-react' },
  'Hospital': { from: 'lucide-react' },
  'Building': { from: 'lucide-react' },
  'Building2': { from: 'lucide-react' },
  'School': { from: 'lucide-react' },
  'Church': { from: 'lucide-react' },
  'Landmark': { from: 'lucide-react' },
  'Factory': { from: 'lucide-react' },
  'Warehouse': { from: 'lucide-react' },
  'Store': { from: 'lucide-react' },
  'Tent': { from: 'lucide-react' },
  'Castle': { from: 'lucide-react' },
  'Crown': { from: 'lucide-react' },
  'Gem': { from: 'lucide-react' },
  'Diamond': { from: 'lucide-react' },
  'Key': { from: 'lucide-react' },
  'KeyRound': { from: 'lucide-react' },
  'Shield': { from: 'lucide-react' },
  'ShieldCheck': { from: 'lucide-react' },
  'ShieldAlert': { from: 'lucide-react' },
  'ShieldOff': { from: 'lucide-react' },
  'Fingerprint': { from: 'lucide-react' },
  'Scan': { from: 'lucide-react' },
  'ScanLine': { from: 'lucide-react' },
  'QrCode': { from: 'lucide-react' },
  'Barcode': { from: 'lucide-react' },
  'Binary': { from: 'lucide-react' },
  'Braces': { from: 'lucide-react' },
  'Brackets': { from: 'lucide-react' },
  'Bug': { from: 'lucide-react' },
  'Construction': { from: 'lucide-react' },
  'Hammer': { from: 'lucide-react' },
  'Wrench': { from: 'lucide-react' },
  'Screwdriver': { from: 'lucide-react' },
  'Drill': { from: 'lucide-react' },
  'Ruler': { from: 'lucide-react' },
  'Pencil': { from: 'lucide-react' },
  'PenTool': { from: 'lucide-react' },
  'Highlighter': { from: 'lucide-react' },
  'Type': { from: 'lucide-react' },
  'Bold': { from: 'lucide-react' },
  'Italic': { from: 'lucide-react' },
  'Underline': { from: 'lucide-react' },
  'Strikethrough': { from: 'lucide-react' },
  'AlignLeft': { from: 'lucide-react' },
  'AlignCenter': { from: 'lucide-react' },
  'AlignRight': { from: 'lucide-react' },
  'AlignJustify': { from: 'lucide-react' },
  'ListOrdered': { from: 'lucide-react' },
  'Indent': { from: 'lucide-react' },
  'Outdent': { from: 'lucide-react' },
  'Quote': { from: 'lucide-react' },
  'Heading': { from: 'lucide-react' },
  'Heading1': { from: 'lucide-react' },
  'Heading2': { from: 'lucide-react' },
  'Heading3': { from: 'lucide-react' },
  'Heading4': { from: 'lucide-react' },
  'Heading5': { from: 'lucide-react' },
  'Heading6': { from: 'lucide-react' },
  'Pilcrow': { from: 'lucide-react' },
  'TextCursor': { from: 'lucide-react' },
  'TextCursorInput': { from: 'lucide-react' },
  'SpellCheck': { from: 'lucide-react' },
  'Languages': { from: 'lucide-react' },
  'Translate': { from: 'lucide-react' },
  'BookOpen': { from: 'lucide-react' },
  'Book': { from: 'lucide-react' },
  'BookMarked': { from: 'lucide-react' },
  'Library': { from: 'lucide-react' },
  'GraduationCap': { from: 'lucide-react' },
  'ScrollText': { from: 'lucide-react' },
  'Newspaper': { from: 'lucide-react' },
  'Rss': { from: 'lucide-react' },
  'Podcast': { from: 'lucide-react' },
  'Gamepad2': { from: 'lucide-react' },
  'Joystick': { from: 'lucide-react' },
  'Dice1': { from: 'lucide-react' },
  'Dice2': { from: 'lucide-react' },
  'Dice3': { from: 'lucide-react' },
  'Dice4': { from: 'lucide-react' },
  'Dice5': { from: 'lucide-react' },
  'Dice6': { from: 'lucide-react' },
  'Puzzle': { from: 'lucide-react' },
  'Swords': { from: 'lucide-react' },
  'Target': { from: 'lucide-react' },
  'Crosshair': { from: 'lucide-react' },
  'Focus': { from: 'lucide-react' },
  'Aperture': { from: 'lucide-react' },
  'ScanFace': { from: 'lucide-react' },
  'Smile': { from: 'lucide-react' },
  'Frown': { from: 'lucide-react' },
  'Meh': { from: 'lucide-react' },
  'Angry': { from: 'lucide-react' },
  'Laugh': { from: 'lucide-react' },
  'PartyPopper': { from: 'lucide-react' },
  'Cake': { from: 'lucide-react' },
  'Cookie': { from: 'lucide-react' },
  'Pizza': { from: 'lucide-react' },
  'Apple': { from: 'lucide-react' },
  'Banana': { from: 'lucide-react' },
  'Cherry': { from: 'lucide-react' },
  'Grape': { from: 'lucide-react' },
  'Citrus': { from: 'lucide-react' },
  'Carrot': { from: 'lucide-react' },
  'Salad': { from: 'lucide-react' },
  'Sandwich': { from: 'lucide-react' },
  'Soup': { from: 'lucide-react' },
  'Coffee': { from: 'lucide-react' },
  'Cup': { from: 'lucide-react' },
  'Wine': { from: 'lucide-react' },
  'Beer': { from: 'lucide-react' },
  'Martini': { from: 'lucide-react' },
  'GlassWater': { from: 'lucide-react' },
  'Milk': { from: 'lucide-react' },
  'IceCream': { from: 'lucide-react' },
  'Candy': { from: 'lucide-react' },
  'Lollipop': { from: 'lucide-react' },
  'Popcorn': { from: 'lucide-react' },
  'Utensils': { from: 'lucide-react' },
  'UtensilsCrossed': { from: 'lucide-react' },
  'ChefHat': { from: 'lucide-react' },
  'Microwave': { from: 'lucide-react' },
  'Refrigerator': { from: 'lucide-react' },
  'CookingPot': { from: 'lucide-react' },
  'Bed': { from: 'lucide-react' },
  'BedDouble': { from: 'lucide-react' },
  'BedSingle': { from: 'lucide-react' },
  'Sofa': { from: 'lucide-react' },
  'Armchair': { from: 'lucide-react' },
  'Lamp': { from: 'lucide-react' },
  'LampDesk': { from: 'lucide-react' },
  'LampFloor': { from: 'lucide-react' },
  'LampCeiling': { from: 'lucide-react' },
  'Lightbulb': { from: 'lucide-react' },
  'LightbulbOff': { from: 'lucide-react' },
  'Fan': { from: 'lucide-react' },
  'AirVent': { from: 'lucide-react' },
  'Heater': { from: 'lucide-react' },
  'Snowflake': { from: 'lucide-react' },
  'ThermometerSun': { from: 'lucide-react' },
  'ThermometerSnowflake': { from: 'lucide-react' },
  'Shower': { from: 'lucide-react' },
  'Bath': { from: 'lucide-react' },
  'Toilet': { from: 'lucide-react' },
  'WashingMachine': { from: 'lucide-react' },
  'Shirt': { from: 'lucide-react' },
  'ShirtOff': { from: 'lucide-react' },
  'Hanger': { from: 'lucide-react' },
  'Glasses': { from: 'lucide-react' },
  'Sunglasses': { from: 'lucide-react' },
  'Ring': { from: 'lucide-react' },
  'Necklace': { from: 'lucide-react' },
  'Baby': { from: 'lucide-react' },
  'Cat': { from: 'lucide-react' },
  'Dog': { from: 'lucide-react' },
  'Bird': { from: 'lucide-react' },
  'Fish': { from: 'lucide-react' },
  'Rabbit': { from: 'lucide-react' },
  'Turtle': { from: 'lucide-react' },
  'Squirrel': { from: 'lucide-react' },
  'Rat': { from: 'lucide-react' },
  'PawPrint': { from: 'lucide-react' },
  'Bone': { from: 'lucide-react' },
  'Egg': { from: 'lucide-react' },
  'EggFried': { from: 'lucide-react' },
  'Feather': { from: 'lucide-react' },
  'Shell': { from: 'lucide-react' },
  'Snail': { from: 'lucide-react' },
  'Worm': { from: 'lucide-react' },
  'Flower': { from: 'lucide-react' },
  'Flower2': { from: 'lucide-react' },
  'Clover': { from: 'lucide-react' },
  'Sprout': { from: 'lucide-react' },
  'TreeDeciduous': { from: 'lucide-react' },
  'TreePine': { from: 'lucide-react' },
  'Palmtree': { from: 'lucide-react' },
  'Cactus': { from: 'lucide-react' },
  'Wheat': { from: 'lucide-react' },
  'Vegan': { from: 'lucide-react' },

  // Motion/Framer
  'motion': { from: 'motion/react' },
  'AnimatePresence': { from: 'motion/react' },
  'useAnimation': { from: 'motion/react' },
  'useMotionValue': { from: 'motion/react' },
  'useTransform': { from: 'motion/react' },
  'useSpring': { from: 'motion/react' },
  'useScroll': { from: 'motion/react' },
  'useInView': { from: 'motion/react' },

  // clsx/classnames
  'clsx': { from: 'clsx', isDefault: true },
  'cn': { from: 'clsx', isDefault: true },
  'classNames': { from: 'classnames', isDefault: true },

  // date-fns
  'format': { from: 'date-fns' },
  'formatDistance': { from: 'date-fns' },
  'formatRelative': { from: 'date-fns' },
  'parseISO': { from: 'date-fns' },
  'addDays': { from: 'date-fns' },
  'subDays': { from: 'date-fns' },
  'isAfter': { from: 'date-fns' },
  'isBefore': { from: 'date-fns' },
  'isValid': { from: 'date-fns' },

  // axios
  'axios': { from: 'axios', isDefault: true },
};

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
