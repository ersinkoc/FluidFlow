/**
 * UI Constants
 *
 * UI-related constants including ignored paths, device sizes, etc.
 */

// Paths to ignore in file system displays
export const IGNORED_PATHS = [
  '.git',
  '.git/',
  'node_modules',
  'node_modules/',
] as const;

// Device presets for preview
export const DEVICE_PRESETS = {
  desktop: { width: '100%', height: '100%', label: 'Desktop' },
  tablet: { width: '768px', height: '1024px', label: 'Tablet' },
  mobile: { width: '375px', height: '667px', label: 'Mobile' },
} as const;

// Z-index layers
export const Z_INDEX = {
  DROPDOWN: 50,
  MODAL: 100,
  TOAST: 150,
  TOOLTIP: 200,
} as const;

// Animation durations (for consistency)
export const ANIMATION = {
  FAST: 150,
  NORMAL: 200,
  SLOW: 300,
} as const;

// Default file to open when switching projects
export const DEFAULT_ACTIVE_FILE = 'src/App.tsx';
export const FALLBACK_ACTIVE_FILE = 'package.json';
