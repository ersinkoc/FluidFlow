/**
 * Simple Log Level System
 *
 * Provides level-aware logging to reduce noise in production
 * while keeping debug information available during development.
 *
 * Usage:
 *   import { parserLogger } from './logger';
 *   parserLogger.debug('Parsing response...');
 *   parserLogger.info('File processed');
 *   parserLogger.warn('Missing closing marker');
 *   parserLogger.error('Parse failed', error);
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

// Default to 'warn' in production, 'debug' in development
const DEFAULT_LEVEL: LogLevel = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'
  ? 'warn'
  : 'debug';

let currentLevel: LogLevel = DEFAULT_LEVEL;

/**
 * Set the minimum log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Get the current log level
 */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/**
 * Check if a log level is enabled
 */
function isEnabled(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

/**
 * Format log message with prefix
 */
function formatMessage(prefix: string, args: unknown[]): unknown[] {
  if (args.length === 0) return [prefix];
  if (typeof args[0] === 'string') {
    return [`${prefix} ${args[0]}`, ...args.slice(1)];
  }
  return [prefix, ...args];
}

/**
 * Create a prefixed logger for a specific module
 */
export function createLogger(moduleName: string) {
  const prefix = `[${moduleName}]`;

  return {
    debug(...args: unknown[]) {
      if (isEnabled('debug')) {
        console.debug(...formatMessage(prefix, args));
      }
    },

    info(...args: unknown[]) {
      if (isEnabled('info')) {
        console.log(...formatMessage(prefix, args));
      }
    },

    warn(...args: unknown[]) {
      if (isEnabled('warn')) {
        console.warn(...formatMessage(prefix, args));
      }
    },

    error(...args: unknown[]) {
      if (isEnabled('error')) {
        console.error(...formatMessage(prefix, args));
      }
    },

    /** Log only in debug mode - for verbose output */
    verbose(...args: unknown[]) {
      if (isEnabled('debug')) {
        console.debug(...formatMessage(`${prefix}[v]`, args));
      }
    },
  };
}

/**
 * Default logger instance
 */
export const logger = createLogger('FluidFlow');

/**
 * Parser-specific logger
 */
export const parserLogger = createLogger('Parser');

/**
 * JSON repair logger
 */
export const jsonRepairLogger = createLogger('JsonRepair');

/**
 * Batch generation logger
 */
export const batchLogger = createLogger('BatchGen');

/**
 * AI provider logger
 */
export const aiLogger = createLogger('AI');
