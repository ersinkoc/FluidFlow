/**
 * Limit Constants
 *
 * Size limits, count limits, and thresholds.
 */

// File size limits (in bytes)
export const MAX_SINGLE_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_TOTAL_PROJECT_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_JSON_REPAIR_SIZE = 500_000; // 500KB
export const MAX_FILE_RECOVERY_SIZE = 100_000; // 100KB

// Count limits
export const MAX_FILE_COUNT = 1_000;
export const MAX_VERSION_HISTORY = 30;
export const MAX_AI_HISTORY = 100;
export const MAX_RECOVERY_ITERATIONS = 50;

// Token limits
export const DEFAULT_MAX_TOKENS = 8_000;
export const COMPACTION_THRESHOLD_TOKENS = 2_000;
export const TOKEN_ESTIMATION_CHARS_PER_TOKEN = 4;

// UI limits
export const MAX_VISIBLE_FILES_IN_PLAN = 5;
export const MAX_RELATED_PATHS_IN_ERROR = 3;
export const MAX_CONSOLE_LOGS = 1_000;
export const MAX_NETWORK_LOGS = 500;

// Runner port range
export const RUNNER_PORT_MIN = 3_300;
export const RUNNER_PORT_MAX = 3_399;
