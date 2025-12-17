// Shared types for FluidFlow application

export type FileSystem = Record<string, string>;

export interface HistoryEntry {
  id: string;
  timestamp: number;
  label: string;
  files: FileSystem;
}

// File change tracking
export interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
}

// Chat message types
export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatAttachment {
  type: 'sketch' | 'brand';
  file: File;
  preview: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  timestamp: number;
  // User message
  prompt?: string;
  llmContent?: string; // Full content for LLM (when different from prompt display)
  attachments?: ChatAttachment[];
  // Assistant message
  explanation?: string;
  files?: FileSystem;
  fileChanges?: FileChange[];
  // For reverting
  snapshotFiles?: FileSystem;
  isGenerating?: boolean;
  error?: string;
  // Token usage information
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    isEstimated?: boolean; // true if tokens are estimated, false if from API
  };
  // Model and provider info
  model?: string;
  provider?: string;
  generationTime?: number; // in ms
  // Proactive continuation for large responses
  continuation?: {
    prompt: string;
    remainingFiles: string[];
    currentBatch: number;
    totalBatches: number;
  };
  // Batch generation option for truncated responses
  batchGeneration?: {
    available: boolean;
    incompleteFiles: string[];
    prompt: string;
    systemInstruction: string;
  };
}

export interface AccessibilityIssue {
  type: 'error' | 'warning';
  message: string;
}

export interface AccessibilityReport {
  score: number;
  issues: AccessibilityIssue[];
}

export interface LogEntry {
  id: string;
  type: 'log' | 'warn' | 'error';
  message: string;
  timestamp: string;
  isFixing?: boolean;
  isFixed?: boolean;
}

export interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  status: number | string;
  duration: number;
  timestamp: string;
}

export interface PushResult {
  success: boolean;
  url?: string;
  error?: string;
}

// Device types for preview
export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';
export type TabType = 'preview' | 'code' | 'codemap' | 'database' | 'docs' | 'env' | 'debug' | 'git' | 'run' | 'webcontainer' | 'errorfix';
export type TerminalTab = 'console' | 'network';

// AI Model types
export type ModelTier = 'fast' | 'pro';

export interface ModelConfig {
  id: string;
  name: string;
  tier: ModelTier;
  description: string;
}

// Code generation models only (for Gemini provider) - Updated December 2025
export const AI_MODELS: ModelConfig[] = [
  {
    id: 'models/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    tier: 'fast',
    description: 'Fast & efficient'
  },
  {
    id: 'models/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    tier: 'pro',
    description: 'Best quality'
  },
  {
    id: 'models/gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    tier: 'pro',
    description: 'Latest flagship'
  }
  ,
  {
    id: 'models/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    tier: 'fast',
    description: 'Latest preview'
  }
];

// Debug types
export interface DebugLogEntry {
  id: string;
  timestamp: number;
  type: 'request' | 'response' | 'stream' | 'error' | 'info';
  category: 'generation' | 'accessibility' | 'quick-edit' | 'auto-fix' | 'other';
  model?: string;
  provider?: string;
  duration?: number;
  // Request data
  prompt?: string;
  systemInstruction?: string;
  attachments?: { type: string; size: number }[];
  // Response data
  response?: string;
  tokenCount?: {
    input?: number;
    output?: number;
    isEstimated?: boolean; // True if tokens are estimated (not from API)
  };
  // Streaming progress (for live updates)
  streamProgress?: {
    chars: number;       // Characters received so far
    chunks: number;      // Number of chunks received
    isComplete: boolean; // Whether streaming is done
  };
  // Error data
  error?: string;
  // Metadata
  metadata?: Record<string, unknown>;
}

// Technology Stack Configuration
export interface TechStackConfig {
  styling: {
    library: 'tailwind' | 'bootstrap' | 'material-ui' | 'ant-design' | 'chakra-ui' | 'css-modules' | 'styled-components' | 'emotion';
    version: string;
  };
  icons: {
    library: 'lucide-react' | 'react-icons' | 'heroicons' | 'material-icons' | 'font-awesome';
    version: string;
  };
  stateManagement: {
    library: 'none' | 'zustand' | 'redux-toolkit' | 'context-api' | 'recoil' | 'mobx';
    version: string;
  };
  routing: {
    library: 'none' | 'react-router' | 'next-router' | 'reach-router';
    version: string;
  };
  dataFetching: {
    library: 'none' | 'axios' | 'fetch' | 'react-query' | 'swr' | 'apollo-client';
    version: string;
  };
  forms: {
    library: 'none' | 'react-hook-form' | 'formik' | 'final-form';
    version: string;
  };
  animations: {
    library: 'none' | 'framer-motion' | 'react-spring' | 'react-transition-group';
    version: string;
  };
  testing: {
    library: 'none' | 'jest' | 'vitest' | 'react-testing-library';
    version: string;
  };
}

// Tech stack option type with version info
export interface TechStackOption {
  value: string;
  label: string;
  description: string;
  version: string;
}

// Available technology options - December 2025 latest versions
export const TECH_STACK_OPTIONS: Record<keyof TechStackConfig, TechStackOption[]> = {
  styling: [
    { value: 'tailwind', label: 'Tailwind CSS', description: 'Utility-first CSS framework', version: '^4.1' },
    { value: 'bootstrap', label: 'Bootstrap', description: 'Popular CSS framework', version: '^5.3.8' },
    { value: 'material-ui', label: 'Material-UI (MUI)', description: 'React Material Design components', version: '^7.3' },
    { value: 'ant-design', label: 'Ant Design', description: 'Enterprise UI design language (React 18+)', version: '^6.1' },
    { value: 'chakra-ui', label: 'Chakra UI', description: 'Simple modular component library', version: '^3.3' },
    { value: 'css-modules', label: 'CSS Modules', description: 'Locally scoped CSS', version: 'built-in' },
    { value: 'styled-components', label: 'Styled Components', description: 'CSS-in-JS styling', version: '^6.1' },
    { value: 'emotion', label: 'Emotion', description: 'Performance-focused CSS-in-JS', version: '^11.14' }
  ],
  icons: [
    { value: 'lucide-react', label: 'Lucide React', description: 'Beautiful & consistent icons', version: '^0.556' },
    { value: 'react-icons', label: 'React Icons', description: 'Multiple icon packs in one', version: '^5.5' },
    { value: 'heroicons', label: 'Heroicons', description: 'Handcrafted SVG icons (Tailwind)', version: '^2.2' },
    { value: 'material-icons', label: 'Material Icons', description: 'Google Material icons', version: '^1.13' },
    { value: 'font-awesome', label: 'Font Awesome', description: 'The internet\'s icon library', version: '^6.7' }
  ],
  stateManagement: [
    { value: 'none', label: 'None (React State)', description: 'Built-in React useState/useReducer', version: 'built-in' },
    { value: 'zustand', label: 'Zustand', description: 'Small, fast, scalable state management', version: '^5.0' },
    { value: 'redux-toolkit', label: 'Redux Toolkit', description: 'Official Redux toolkit', version: '^2.11' },
    { value: 'context-api', label: 'Context API', description: 'React built-in context', version: 'built-in' },
    { value: 'recoil', label: 'Recoil', description: 'Facebook\'s state management library', version: '^0.7' },
    { value: 'mobx', label: 'MobX', description: 'Simple, scalable state management', version: '^6.13' }
  ],
  routing: [
    { value: 'none', label: 'None (Single Page)', description: 'No routing needed', version: 'built-in' },
    { value: 'react-router', label: 'React Router', description: 'Declarative routing for React', version: '^7.10' },
    { value: 'next-router', label: 'Next.js Router', description: 'Next.js built-in router (App Router)', version: 'built-in' },
    { value: 'reach-router', label: 'TanStack Router', description: 'Type-safe routing for React', version: '^1.98' }
  ],
  dataFetching: [
    { value: 'none', label: 'None (Fetch API)', description: 'Built-in fetch API', version: 'built-in' },
    { value: 'axios', label: 'Axios', description: 'Promise based HTTP client', version: '^1.13' },
    { value: 'fetch', label: 'Fetch API', description: 'Modern fetch with polyfills', version: 'built-in' },
    { value: 'react-query', label: 'TanStack Query', description: 'Powerful async state management', version: '^5.90' },
    { value: 'swr', label: 'SWR', description: 'React Hooks for data fetching', version: '^2.3' },
    { value: 'apollo-client', label: 'Apollo Client', description: 'GraphQL client', version: '^3.12' }
  ],
  forms: [
    { value: 'none', label: 'None (HTML Forms)', description: 'Standard HTML forms', version: 'built-in' },
    { value: 'react-hook-form', label: 'React Hook Form', description: 'Performant forms with easy validation', version: '^7.66' },
    { value: 'formik', label: 'Formik', description: 'Build forms in React', version: '^2.4' },
    { value: 'final-form', label: 'Final Form', description: 'High performance subscription-based form state', version: '^4.20' }
  ],
  animations: [
    { value: 'none', label: 'None (CSS Transitions)', description: 'CSS transitions/animations', version: 'built-in' },
    { value: 'framer-motion', label: 'Motion', description: 'Production-ready motion library (formerly Framer Motion)', version: '^12.23' },
    { value: 'react-spring', label: 'React Spring', description: 'Spring physics based animation', version: '^10.0' },
    { value: 'react-transition-group', label: 'React Transition Group', description: 'Animation components for React', version: '^4.4' }
  ],
  testing: [
    { value: 'none', label: 'None', description: 'No testing library', version: 'built-in' },
    { value: 'jest', label: 'Jest', description: 'JavaScript testing framework', version: '^29.7' },
    { value: 'vitest', label: 'Vitest', description: 'Vite-native testing framework with Browser Mode', version: '^4.0' },
    { value: 'react-testing-library', label: 'React Testing Library', description: 'Simple and complete testing utilities', version: '^16.3' }
  ]
};

// Default tech stack configuration
export const DEFAULT_TECH_STACK: TechStackConfig = {
  styling: { library: 'tailwind', version: 'latest' },
  icons: { library: 'lucide-react', version: 'latest' },
  stateManagement: { library: 'none', version: 'built-in' },
  routing: { library: 'none', version: 'built-in' },
  dataFetching: { library: 'none', version: 'built-in' },
  forms: { library: 'none', version: 'built-in' },
  animations: { library: 'none', version: 'built-in' },
  testing: { library: 'none', version: 'built-in' }
};

export interface DebugState {
  enabled: boolean;
  logs: DebugLogEntry[];
  maxLogs: number;
  filter: {
    types: DebugLogEntry['type'][];
    categories: DebugLogEntry['category'][];
    searchQuery: string;
  };
}

// WebContainer Settings
export interface WebContainerSettings {
  clientId: string;
  scope: string;
  enabled: boolean;
}

export const DEFAULT_WEBCONTAINER_SETTINGS: WebContainerSettings = {
  clientId: '',
  scope: '',
  enabled: false,
};

// Search/Replace Mode Types (Beta) - Token-efficient updates
export interface SearchReplaceOperation {
  search: string;   // Exact text to find
  replace: string;  // Text to replace with
}

export interface SearchReplaceFileChange {
  replacements?: SearchReplaceOperation[];  // For existing files - list of search/replace pairs
  isNew?: boolean;     // true = new file (use content field)
  content?: string;    // Full content for new files only
  isDeleted?: boolean; // true = file should be deleted
}

export interface SearchReplaceModeResponse {
  explanation: string;
  changes: Record<string, SearchReplaceFileChange>;
  deletedFiles?: string[];
}
