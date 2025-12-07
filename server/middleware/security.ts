/**
 * Security middleware for Express server
 * Implements rate limiting, CORS, and security headers
 */

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

/**
 * Rate limiting configuration
 * Prevents brute force attacks and API abuse
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter rate limiting for AI endpoints
 */
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 AI requests per windowMs
  message: {
    error: 'Too many AI requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Security headers middleware
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https:", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "blob:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "ws:", "wss:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      childSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Needed for Monaco Editor
});

/**
 * Request validation middleware
 */
export function validateRequest(req: Request, res: Response, next: NextFunction) {
  // Check for common attack patterns
  const suspiciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // XSS
    /javascript:/gi, // JavaScript protocol
    /on\w+\s*=/gi, // Event handlers
    /expression\s*\(/gi, // CSS expression
  ];

  const body = JSON.stringify(req.body);
  const query = JSON.stringify(req.query);

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(body) || pattern.test(query)) {
      return res.status(400).json({
        error: 'Invalid request: potentially malicious content detected',
      });
    }
  }

  // Validate Content-Type for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    if (contentType && !contentType.includes('application/json')) {
      return res.status(400).json({
        error: 'Invalid Content-Type. Expected application/json',
      });
    }
  }

  next();
}

/**
 * Error handling middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log the error
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: isDevelopment ? err.message : undefined,
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  // Default error response
  res.status(500).json({
    error: 'Internal server error',
    details: isDevelopment ? err.message : undefined,
  });
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });

  next();
}