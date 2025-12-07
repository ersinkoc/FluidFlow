/**
 Centralized logging utility
 Replaces console.log with environment-aware logging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  source?: string;
}

class Logger {
  private isProduction: boolean;
  private logLevel: LogLevel;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize: number = 1000;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.logLevel = this.isProduction ? LogLevel.WARN : LogLevel.DEBUG;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private createLogEntry(level: LogLevel, message: string, data?: any, source?: string): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: this.isProduction && data ? this.sanitizeData(data) : data,
      source: source || 'FluidFlow',
    };
  }

  private sanitizeData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    // Remove sensitive fields
    const sensitiveKeys = ['apiKey', 'password', 'token', 'secret', 'key'];
    const sanitized = Array.isArray(data) ? [...data] : { ...data };

    for (const key in sanitized) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    }

    return sanitized;
  }

  private log(level: LogLevel, message: string, data?: any, source?: string): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createLogEntry(level, message, data, source);

    // Buffer logs for potential error reporting
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    // Console output based on environment
    if (!this.isProduction) {
      const prefix = `[${entry.timestamp}] [${LogLevel[level]}] [${entry.source || ''}]`;
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(prefix, message, data);
          break;
        case LogLevel.INFO:
          console.info(prefix, message, data);
          break;
        case LogLevel.WARN:
          console.warn(prefix, message, data);
          break;
        case LogLevel.ERROR:
          console.error(prefix, message, data);
          // In production, you might want to send errors to a service
          if (this.isProduction) {
            // TODO: Implement error reporting service integration
          }
          break;
      }
    }
  }

  debug(message: string, data?: any, source?: string): void {
    this.log(LogLevel.DEBUG, message, data, source);
  }

  info(message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, message, data, source);
  }

  warn(message: string, data?: any, source?: string): void {
    this.log(LogLevel.WARN, message, data, source);
  }

  error(message: string, data?: any, source?: string): void {
    this.log(LogLevel.ERROR, message, data, source);
  }

  // Specialized logging methods
  aiRequest(provider: string, model: string, prompt: string, responseTime?: number): void {
    this.debug('AI Request', {
      provider,
      model,
      promptLength: prompt.length,
      responseTime,
    }, 'AI');
  }

  apiRequest(method: string, endpoint: string, statusCode: number, responseTime?: number): void {
    this.debug('API Request', {
      method,
      endpoint,
      statusCode,
      responseTime,
    }, 'API');
  }

  gitOperation(operation: string, success: boolean, error?: string): void {
    this.info('Git Operation', {
      operation,
      success,
      error,
    }, 'Git');
  }

  fileOperation(operation: string, path: string, success: boolean, error?: string): void {
    this.debug('File Operation', {
      operation,
      path,
      success,
      error,
    }, 'FileSystem');
  }

  // Get buffered logs (useful for error reporting)
  getRecentLogs(count: number = 100): LogEntry[] {
    return this.logBuffer.slice(-count);
  }

  // Clear log buffer
  clearBuffer(): void {
    this.logBuffer = [];
  }

  // Export logs (for debugging)
  exportLogs(): string {
    return JSON.stringify(this.logBuffer, null, 2);
  }
}

// Create singleton logger instance
export const logger = new Logger();

// Export convenience functions
export const log = {
  debug: (message: string, data?: any, source?: string) => logger.debug(message, data, source),
  info: (message: string, data?: any, source?: string) => logger.info(message, data, source),
  warn: (message: string, data?: any, source?: string) => logger.warn(message, data, source),
  error: (message: string, data?: any, source?: string) => logger.error(message, data, source),
  aiRequest: (provider: string, model: string, prompt: string, responseTime?: number) =>
    logger.aiRequest(provider, model, prompt, responseTime),
  apiRequest: (method: string, endpoint: string, statusCode: number, responseTime?: number) =>
    logger.apiRequest(method, endpoint, statusCode, responseTime),
  gitOperation: (operation: string, success: boolean, error?: string) =>
    logger.gitOperation(operation, success, error),
  fileOperation: (operation: string, path: string, success: boolean, error?: string) =>
    logger.fileOperation(operation, path, success, error),
};