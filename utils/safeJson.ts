/**
 * Safe JSON utilities - Client-side exports
 *
 * Re-exports from shared module for backwards compatibility.
 * All imports from '@/utils/safeJson' continue to work.
 */

// Re-export everything from shared
export {
  safeJsonParse,
  safeJsonStringify,
  safeJsonParseOrNull,
  type SafeJsonParseOptions,
  type SafeJsonStringifyOptions,
} from '../shared/safeJson';

// Backwards compatibility alias
export { safeJsonParseOrNull as safeJsonParseWithDefault } from '../shared/safeJson';
