import express from 'express';
import cors from 'cors';
import { projectsRouter } from './api/projects.js';
import { gitRouter } from './api/git.js';
import { githubRouter } from './api/github.js';
import { settingsRouter } from './api/settings.js';
import { runnerRouter } from './api/runner.js';
import { apiLimiter, requestLogger } from './middleware/security.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.SERVER_PORT || 3200;

// Ensure projects directory exists
const PROJECTS_DIR = path.join(__dirname, '../projects');
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);

    // Allow localhost ports: 3100-3102 (FluidFlow), 5173 (Vite dev), 3300-3399 (running projects)
    // Support both HTTP and HTTPS
    const allowedPatterns = [
      /^https?:\/\/localhost:(3100|3101|3102|5173)$/,
      /^https?:\/\/localhost:33\d{2}$/, // 3300-3399
    ];

    const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
    callback(null, isAllowed);
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Rate limiting for all API endpoints (100 requests per 15 minutes)
app.use('/api', apiLimiter);

// Request logging (development only)
if (process.env.NODE_ENV !== 'production') {
  app.use(requestLogger);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// API Routes
app.use('/api/projects', projectsRouter);
app.use('/api/git', gitRouter);
app.use('/api/github', githubRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/runner', runnerRouter);

// Error handling middleware (must be after all routes)
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err);
  // SRV-001 fix: do not expose internal error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: isProduction ? 'Internal server error' : (err.message || 'Internal server error')
  });
});

// SRV-001 fix: Global error handlers for uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
  // do not exit immediately to allow graceful handling of in-flight requests
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
});

// Start server (HTTP - Vite proxies requests from HTTPS frontend)
app.listen(PORT, () => {
  console.log(`\n🚀 FluidFlow Backend Server running on http://localhost:${PORT}`);
  console.log(`   Projects directory: ${PROJECTS_DIR}\n`);
});

export { PROJECTS_DIR };
