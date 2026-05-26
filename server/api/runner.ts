import { Router } from 'express';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { isValidProjectId, isValidInteger, isValidFilePath } from '../utils/validation';

// Type for VFS files
type FileSystem = Record<string, string>;

const router = Router();

// Projects directory
const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// Port range for running projects (3300-3399)
const PORT_RANGE_START = 3300;
const PORT_RANGE_END = 3399;

// Kill any processes using ports in our range (cleanup orphans)
// RUN-003 fix: Use spawnSync with array args to avoid shell injection
function cleanupOrphanProcesses() {
  if (process.platform !== 'win32') {
    // On Unix, use lsof + kill without shell interpolation
    try {
      for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
        try {
          // RUN-003 fix: Get PIDs using lsof without shell
          const lsofResult = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf-8' });
          if (lsofResult.status === 0 && lsofResult.stdout) {
            const pids = lsofResult.stdout.trim().split('\n').filter((p: string) => p.length > 0);
            for (const pid of pids) {
              // Validate PID before killing
              if (/^\d+$/.test(pid)) {
                spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
              }
            }
          }
        } catch {
          // Port not in use, ignore
        }
      }
    } catch {
      // Ignore errors
    }
  } else {
    // On Windows, use netstat + taskkill
    // BUG-012 fix: Use spawnSync with args array instead of execSync with shell string
    try {
      const netstatResult = spawnSync('netstat', ['-ano'], { encoding: 'utf-8' });
      if (netstatResult.status !== 0 || !netstatResult.stdout) {
        console.warn('[Runner] netstat command failed');
        return;
      }
      const output = netstatResult.stdout;
      const lines = output.split('\n');
      const pidsToKill = new Set<string>();

      for (const line of lines) {
        // Match lines like: TCP    0.0.0.0:3300    0.0.0.0:0    LISTENING    12345
        const match = line.match(/TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (match) {
          const port = parseInt(match[1] ?? '0', 10);
          const pid = match[2] ?? '0';
          if (port >= PORT_RANGE_START && port <= PORT_RANGE_END && pid !== '0') {
            pidsToKill.add(pid);
          }
        }
      }

      for (const pid of pidsToKill) {
        // Validate PID is a safe integer before using in command
        if (!isValidInteger(pid, 1, 999999)) {
          console.warn(`[Runner] Invalid PID skipped: ${pid}`);
          continue;
        }
        try {
          // Use spawn with array args instead of string interpolation for safety
          const result = spawnSync('taskkill', ['/pid', pid, '/f', '/t'], { stdio: 'ignore' });
          if (result.status === 0) {
            console.log(`[Runner] Killed orphan process PID ${pid}`);
          }
        } catch {
          // Process might have already exited
        }
      }

      if (pidsToKill.size > 0) {
        console.log(`[Runner] Cleaned up ${pidsToKill.size} orphan process(es)`);
      }
    } catch (err) {
      console.error('[Runner] Failed to cleanup orphan processes:', err);
    }
  }
}

// Run cleanup on startup
console.log('[Runner] Checking for orphan processes on ports 3300-3399...');
cleanupOrphanProcesses();

// Track running processes
const MAX_LOG_ENTRIES = 1000; // Limit log entries to prevent memory leak

/**
 * Circular buffer for efficient log storage
 * O(1) push, O(n) toArray when needed for API responses
 */
class CircularBuffer<T> {
  private buffer: T[] = [];
  private head = 0;
  private count = 0;

  constructor(private maxSize: number) {}

  push(item: T): void {
    if (this.count < this.maxSize) {
      this.buffer.push(item);
      this.count++;
    } else {
      this.buffer[this.head] = item;
      this.head = (this.head + 1) % this.maxSize;
    }
  }

  toArray(): T[] {
    if (this.count < this.maxSize) {
      return [...this.buffer];
    }
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
  }

  get length(): number {
    return this.count;
  }

  slice(start?: number, end?: number): T[] {
    const arr = this.toArray();
    return arr.slice(start, end);
  }

  // For compatibility with existing code that expects string[]
  [Symbol.iterator](): Iterator<T> {
    return this.toArray()[Symbol.iterator]();
  }
}

interface RunningProject {
  projectId: string;
  port: number;
  // BUG-F01/F02 FIX: Process can be null when not yet spawned or after cleanup on error
  process: ChildProcess | null;
  status: 'installing' | 'starting' | 'running' | 'error' | 'stopped';
  logs: CircularBuffer<string>;
  errorLogs: CircularBuffer<string>;
  startedAt: number;
  url: string;
  // EventEmitter for SSE log streaming
  logEmitter: EventEmitter;
}

const runningProjects: Map<string, RunningProject> = new Map();

// RUN-002 fix: Track reserved ports to prevent race condition
// Ports are reserved when a start request begins and released when fully registered or on error
const reservedPorts: Set<number> = new Set();

// Helper to push logs with size limit and emit to SSE clients
function pushLog(project: RunningProject, entry: string, isError: boolean = false): void {
  project.logs.push(entry);
  if (isError) {
    project.errorLogs.push(entry);
  }
  // Emit to SSE clients
  project.logEmitter.emit('log', { entry, isError, timestamp: Date.now() });
}

// Find an available port and reserve it atomically
// RUN-002 fix: Returns port only if successfully reserved
function findAndReservePort(): number | null {
  const usedPorts = new Set(Array.from(runningProjects.values()).map(p => p.port));

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    // Check both running projects AND reserved ports
    if (!usedPorts.has(port) && !reservedPorts.has(port)) {
      // Immediately reserve this port
      reservedPorts.add(port);
      return port;
    }
  }
  return null;
}

// Release a reserved port (called on error or when port is no longer needed)
function releasePort(port: number): void {
  reservedPorts.delete(port);
}

// Get project files directory
const getFilesDir = (id: string) => path.join(PROJECTS_DIR, id, 'files');

// Temp directory for running uncommitted VFS files
const TEMP_RUN_DIR = path.join(process.cwd(), 'projects', '_temp_run');

/**
 * Sync VFS files to disk
 * Creates directories as needed and writes all files
 */
function syncFilesToDisk(targetDir: string, files: FileSystem): void {
  // Clean the directory first (but keep node_modules if exists for faster installs)
  const nodeModulesPath = path.join(targetDir, 'node_modules');
  const hadNodeModules = existsSync(nodeModulesPath);

  // Remove all files except node_modules
  if (existsSync(targetDir)) {
    const entries = readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name !== 'node_modules') {
        const fullPath = path.join(targetDir, entry.name);
        rmSync(fullPath, { recursive: true, force: true });
      }
    }
  } else {
    mkdirSync(targetDir, { recursive: true });
  }

  // Write all files
  for (const [filePath, content] of Object.entries(files)) {
    // Validate file path to prevent path traversal
    if (!isValidFilePath(filePath)) {
      console.warn(`[Runner] Skipping invalid file path: ${filePath}`);
      continue;
    }

    const fullPath = path.join(targetDir, filePath);

    // Ensure resolved path stays within targetDir (defense in depth)
    const resolvedPath = path.resolve(fullPath);
    const resolvedTarget = path.resolve(targetDir);
    if (!resolvedPath.startsWith(resolvedTarget + path.sep) && resolvedPath !== resolvedTarget) {
      console.warn(`[Runner] Path escapes target directory: ${filePath}`);
      continue;
    }

    const dir = path.dirname(fullPath);

    // Create directory if needed
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write file
    writeFileSync(fullPath, content, 'utf-8');
  }

  console.log(`[Runner] Synced ${Object.keys(files).length} files to ${targetDir}${hadNodeModules ? ' (preserved node_modules)' : ''}`);
}

// COEP/CORP headers required for iframe embedding in FluidFlow
const COEP_HEADERS_CONFIG = `
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    }
  }`;

// Resolve aliases to fix bare specifier imports that AI often generates
// Uses fileURLToPath to get proper absolute paths that work with Vite
// Note: This requires adding the import at the top of the generated config
const RESOLVE_ALIAS_IMPORT = `import { fileURLToPath, URL } from 'node:url';`;
const RESOLVE_ALIAS_CONFIG = `
  resolve: {
    alias: {
      'src': fileURLToPath(new URL('./src', import.meta.url)),
      'components': fileURLToPath(new URL('./src/components', import.meta.url)),
      'hooks': fileURLToPath(new URL('./src/hooks', import.meta.url)),
      'utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
      'services': fileURLToPath(new URL('./src/services', import.meta.url)),
      'contexts': fileURLToPath(new URL('./src/contexts', import.meta.url)),
      'types': fileURLToPath(new URL('./src/types', import.meta.url)),
      'lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
      'pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
      'features': fileURLToPath(new URL('./src/features', import.meta.url)),
      'modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      'assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
      'styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
      'api': fileURLToPath(new URL('./src/api', import.meta.url))
    }
  }`;

// DevTools script for console/network interception (injected into running apps)
const DEVTOOLS_SCRIPT = `
(function() {
  if (window.__FLUIDFLOW_DEVTOOLS__) return;
  window.__FLUIDFLOW_DEVTOOLS__ = true;

  // Console interception
  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console)
  };

  const notify = (type, args) => {
    try {
      window.parent.postMessage({
        type: 'RUNNER_CONSOLE',
        logType: type,
        message: args.map(a => {
          if (a === null) return 'null';
          if (a === undefined) return 'undefined';
          if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch { return String(a); }
          }
          return String(a);
        }).join(' '),
        timestamp: Date.now()
      }, '*');
    } catch { /* postMessage may fail if iframe is detached */ }
  };

  console.log = (...args) => { originalConsole.log(...args); notify('log', args); };
  console.warn = (...args) => { originalConsole.warn(...args); notify('warn', args); };
  console.error = (...args) => { originalConsole.error(...args); notify('error', args); };
  console.info = (...args) => { originalConsole.info(...args); notify('info', args); };
  console.debug = (...args) => { originalConsole.debug(...args); notify('debug', args); };

  // Fetch interception
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const start = Date.now();
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || String(args[0]));
    const method = args[1]?.method || 'GET';

    try {
      const response = await originalFetch.apply(this, args);
      window.parent.postMessage({
        type: 'RUNNER_NETWORK',
        method,
        url,
        status: response.status,
        statusText: response.statusText,
        duration: Date.now() - start,
        timestamp: Date.now()
      }, '*');
      return response;
    } catch (err) {
      window.parent.postMessage({
        type: 'RUNNER_NETWORK',
        method,
        url,
        status: 0,
        statusText: err.message || 'Network Error',
        duration: Date.now() - start,
        timestamp: Date.now()
      }, '*');
      throw err;
    }
  };

  // XMLHttpRequest interception
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._ffMethod = method;
    this._ffUrl = url;
    this._ffStart = Date.now();
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('loadend', () => {
      window.parent.postMessage({
        type: 'RUNNER_NETWORK',
        method: this._ffMethod || 'GET',
        url: this._ffUrl || '',
        status: this.status,
        statusText: this.statusText,
        duration: Date.now() - (this._ffStart || Date.now()),
        timestamp: Date.now()
      }, '*');
    });
    return originalXHRSend.apply(this, args);
  };

  // Global error handler
  window.addEventListener('error', (e) => {
    notify('error', [e.message + (e.filename ? ' at ' + e.filename + ':' + e.lineno : '')]);
  });

  // Unhandled promise rejection
  window.addEventListener('unhandledrejection', (e) => {
    notify('error', ['Unhandled Promise Rejection: ' + (e.reason?.message || e.reason || 'Unknown')]);
  });
})();
`;

// Vite plugin to inject devtools script
const DEVTOOLS_PLUGIN = `
    {
      name: 'fluidflow-devtools',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          '<script src="/__fluidflow_devtools__.js"><\\/script></head>'
        );
      },
      configureServer(server) {
        server.middlewares.use('/__fluidflow_devtools__.js', (_req, res) => {
          res.setHeader('Content-Type', 'application/javascript');
          res.end(\`${DEVTOOLS_SCRIPT.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);
        });
      }
    }`;

/**
 * Ensure vite.config.ts has COEP headers, devtools plugin, and resolve aliases
 * This allows the running app to be displayed in FluidFlow's RunnerPanel iframe,
 * enables console/network interception, and fixes bare specifier imports
 */
function ensureViteDevtoolsConfig(filesDir: string): void {
  const viteConfigPath = path.join(filesDir, 'vite.config.ts');

  if (!existsSync(viteConfigPath)) {
    console.log('[Runner] No vite.config.ts found, skipping config injection');
    return;
  }

  try {
    let content = readFileSync(viteConfigPath, 'utf-8');
    let modified = false;

    // Check if features are already present
    const hasDevtools = content.includes('fluidflow-devtools');
    const hasCoep = content.includes('Cross-Origin-Embedder-Policy');
    // Check for any existing resolve.alias config (various formats)
    const hasResolveAlias = /resolve\s*:\s*\{[\s\S]*?alias\s*:/m.test(content);

    if (hasDevtools && hasCoep && hasResolveAlias) {
      console.log('[Runner] vite.config.ts already has FluidFlow config');
      return;
    }

    // Inject devtools plugin into plugins array
    if (!hasDevtools) {
      // Find plugins array - look for plugins: [ or plugins:[
      const pluginsMatch = content.match(/plugins\s*:\s*\[/);
      if (pluginsMatch && pluginsMatch.index !== undefined) {
        const insertPos = pluginsMatch.index + pluginsMatch[0].length;
        content = content.substring(0, insertPos) + DEVTOOLS_PLUGIN + ',' + content.substring(insertPos);
        modified = true;
        console.log('[Runner] Injected devtools plugin into vite.config.ts');
      }
    }

    // Inject COEP headers and resolve aliases into config
    const defineConfigMatch = content.match(/defineConfig\s*\(\s*\{/);
    if (defineConfigMatch) {
      const lastBracketIndex = content.lastIndexOf('})');
      if (lastBracketIndex > 0) {
        let insertions = '';
        const beforeBracket = content.substring(0, lastBracketIndex).trimEnd();
        const needsComma = !beforeBracket.endsWith(',') && !beforeBracket.endsWith('{');

        // Add COEP headers if missing
        if (!hasCoep) {
          insertions += (needsComma || insertions ? ',' : '') + COEP_HEADERS_CONFIG;
          console.log('[Runner] Injected COEP headers into vite.config.ts');
        }

        // Add resolve aliases if missing (fixes bare specifier imports)
        if (!hasResolveAlias) {
          insertions += (needsComma || insertions ? ',' : '') + RESOLVE_ALIAS_CONFIG;

          // Also add the required import at the top of the file if not present
          if (!content.includes('fileURLToPath')) {
            // Find the first import statement or the start of the file
            const firstImportMatch = content.match(/^(import\s+)/m);
            if (firstImportMatch && firstImportMatch.index !== undefined) {
              content = content.substring(0, firstImportMatch.index) +
                RESOLVE_ALIAS_IMPORT + '\n' +
                content.substring(firstImportMatch.index);
            } else {
              // No imports found, add at the very beginning
              content = RESOLVE_ALIAS_IMPORT + '\n' + content;
            }
          }

          console.log('[Runner] Injected resolve aliases into vite.config.ts');
        }

        if (insertions) {
          content = content.substring(0, lastBracketIndex) + insertions + '\n' + content.substring(lastBracketIndex);
          modified = true;
        }
      }
    }

    if (modified) {
      writeFileSync(viteConfigPath, content, 'utf-8');
    }
  } catch (err) {
    console.error('[Runner] Failed to inject config:', err);
  }
}

// Node.js built-in modules (should not be added to package.json)
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys',
  'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  // Node.js prefixed versions
  'node:assert', 'node:buffer', 'node:child_process', 'node:cluster', 'node:console',
  'node:crypto', 'node:dgram', 'node:dns', 'node:events', 'node:fs', 'node:http',
  'node:https', 'node:module', 'node:net', 'node:os', 'node:path', 'node:perf_hooks',
  'node:process', 'node:querystring', 'node:readline', 'node:stream', 'node:string_decoder',
  'node:timers', 'node:tls', 'node:tty', 'node:url', 'node:util', 'node:v8', 'node:vm',
  'node:wasi', 'node:worker_threads', 'node:zlib'
]);

// Common React/Vite packages that are typically devDependencies
const DEV_DEPENDENCY_PATTERNS = [
  /^@types\//,
  /^@vitejs\//,
  /^@tailwindcss\//,
  /^vite$/,
  /^typescript$/,
  /^eslint/,
  /^prettier/,
  /^tailwindcss$/
];

/**
 * Recursively find all source files in a directory
 */
function findSourceFiles(dir: string, files: string[] = []): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          findSourceFiles(fullPath, files);
        }
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }
  return files;
}

/**
 * Extract package names from import statements in source files
 */
function extractImportedPackages(filesDir: string): Set<string> {
  const packages = new Set<string>();
  const sourceFiles = findSourceFiles(filesDir);

  // Regex patterns for import statements
  // Matches: import X from "package", import "package", import("package"), require("package")
  const importPatterns = [
    /import\s+(?:[\w\s{},*]+\s+from\s+)?["']([^"'./][^"']*)["']/g,
    /import\s*\(\s*["']([^"'./][^"']*)["']\s*\)/g,
    /require\s*\(\s*["']([^"'./][^"']*)["']\s*\)/g
  ];

  for (const filePath of sourceFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');

      for (const pattern of importPatterns) {
        let match;
        // Reset lastIndex for global regex
        pattern.lastIndex = 0;
        while ((match = pattern.exec(content)) !== null) {
          let packageName = match[1] ?? '';

          // Handle scoped packages (@org/package)
          if (packageName.startsWith('@')) {
            const parts = packageName.split('/');
            if (parts.length >= 2) {
              packageName = `${parts[0]}/${parts[1]}`;
            }
          } else {
            // Handle regular packages (get only the package name, not subpaths)
            packageName = packageName.split('/')[0] ?? packageName;
          }

          // Skip Node.js built-ins and relative imports
          if (!NODE_BUILTINS.has(packageName) && !packageName.startsWith('.')) {
            packages.add(packageName);
          }
        }
      }
    } catch {
      // File not readable, skip
    }
  }

  return packages;
}

/**
 * Ensure all imported packages are in package.json
 * This fixes the common issue where AI generates code using packages
 * that aren't listed in package.json
 */
function ensureMissingDependencies(filesDir: string): string[] {
  const packageJsonPath = path.join(filesDir, 'package.json');
  const autoInstallEnabled = process.env.FF_AUTO_INSTALL_MISSING_DEPS === 'true';

  if (!existsSync(packageJsonPath)) {
    console.log('[Runner] No package.json found, skipping dependency check');
    return [];
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const existingDeps = new Set([
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.devDependencies || {}),
      ...Object.keys(packageJson.peerDependencies || {})
    ]);

    const importedPackages = extractImportedPackages(filesDir);
    const missingPackages: string[] = [];

    for (const pkg of importedPackages) {
      if (!existingDeps.has(pkg)) {
        missingPackages.push(pkg);
      }
    }

    if (missingPackages.length > 0) {
      console.log(`[Runner] Found ${missingPackages.length} missing packages:`, missingPackages);

      if (!autoInstallEnabled) {
        console.warn('[Runner] Auto-install of missing dependencies is disabled. Set FF_AUTO_INSTALL_MISSING_DEPS=true to enable it.');
        return [];
      }

      // Add missing packages to dependencies
      if (!packageJson.dependencies) {
        packageJson.dependencies = {};
      }

      for (const pkg of missingPackages) {
        // Check if it should be a devDependency
        const isDevDep = DEV_DEPENDENCY_PATTERNS.some(pattern => pattern.test(pkg));

        if (isDevDep) {
          if (!packageJson.devDependencies) {
            packageJson.devDependencies = {};
          }
          packageJson.devDependencies[pkg] = '*';
        } else {
          packageJson.dependencies[pkg] = '*';
        }
      }

      // Write updated package.json
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
      console.log('[Runner] Updated package.json with missing dependencies');
    }

    return missingPackages;
  } catch (err) {
    console.error('[Runner] Failed to check dependencies:', err);
    return [];
  }
}

// List all running projects
router.get('/', (req, res) => {
  const projects = Array.from(runningProjects.entries()).map(([_id, info]) => ({
    projectId: info.projectId,
    port: info.port,
    status: info.status,
    url: info.url,
    startedAt: info.startedAt,
    logsCount: info.logs.length,
    errorLogsCount: info.errorLogs.length
  }));

  return res.json(projects);
});

// Get specific running project status
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const running = runningProjects.get(id);

  if (!running) {
    return res.json({ status: 'stopped', running: false });
  }

  return res.json({
    projectId: running.projectId,
    port: running.port,
    status: running.status,
    url: running.url,
    startedAt: running.startedAt,
    running: running.status === 'running' || running.status === 'installing' || running.status === 'starting',
    logs: running.logs.slice(-100), // Last 100 logs
    errorLogs: running.errorLogs.slice(-50) // Last 50 error logs
  });
});

// Start a project
// Accepts optional 'files' in body to sync VFS to disk before running
router.post('/:id/start', async (req, res) => {
  const { id } = req.params;
  const { files } = req.body as { files?: FileSystem };

  // Special case: "_temp" project ID for running uncommitted VFS files
  const isTempRun = id === '_temp';

  // Validate project ID to prevent path traversal (skip for temp)
  if (!isTempRun && !isValidProjectId(id)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }

  // Determine target directory
  const filesDir = isTempRun ? TEMP_RUN_DIR : getFilesDir(id);

  // If files provided, sync them to disk first
  if (files && Object.keys(files).length > 0) {
    try {
      syncFilesToDisk(filesDir, files);
    } catch (err) {
      console.error('[Runner] Failed to sync files:', err);
      return res.status(500).json({ error: 'Failed to sync files to disk' });
    }
  }

  // Check if project/files exist
  if (!existsSync(filesDir)) {
    return res.status(404).json({ error: 'Project not found. Provide files in request body for temp runs.' });
  }

  // Check if already running
  const existingProject = runningProjects.get(id);
  if (existingProject) {
    if (existingProject.status === 'running' || existingProject.status === 'installing' || existingProject.status === 'starting') {
      return res.json({
        message: 'Project is already running',
        port: existingProject.port,
        url: existingProject.url,
        status: existingProject.status
      });
    }
    // Clean up old entry
    runningProjects.delete(id);
  }

  // RUN-002 fix: Find and reserve port atomically
  const port = findAndReservePort();
  if (port === null) {
    return res.status(503).json({ error: 'No available ports. Stop some running projects first.' });
  }

  // Check if package.json exists
  const packageJsonPath = path.join(filesDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    // RUN-002 fix: Release port on error
    releasePort(port);
    return res.status(400).json({ error: 'No package.json found in project' });
  }

  // Create running project entry
  // BUG-F01 FIX: Process is initially null and will be set when installation/start begins
  // Create EventEmitter with max listeners limit for SSE streaming
  // Set to 50 to prevent memory leak warnings from reconnection loops while still allowing multiple clients
  const logEmitter = new EventEmitter();
  logEmitter.setMaxListeners(50);

  const runningProject: RunningProject = {
    projectId: id,
    port,
    process: null, // Will be set below when spawn is called
    status: 'installing',
    logs: new CircularBuffer<string>(MAX_LOG_ENTRIES),
    errorLogs: new CircularBuffer<string>(MAX_LOG_ENTRIES),
    startedAt: Date.now(),
    url: `http://localhost:${port}`,
    logEmitter
  };

  runningProjects.set(id, runningProject);

  // RUN-002 fix: Release reservation once properly registered
  releasePort(port);

  // Ensure vite.config.ts has COEP headers for iframe embedding
  ensureViteDevtoolsConfig(filesDir);

  // Check for missing dependencies and add them to package.json
  const missingPackages = ensureMissingDependencies(filesDir);

  // Check if node_modules exists or if we added new packages
  const nodeModulesPath = path.join(filesDir, 'node_modules');
  const needsInstall = !existsSync(nodeModulesPath) || missingPackages.length > 0;

  console.log(`[Runner] Starting project ${id} on port ${port}${needsInstall ? ' (installing dependencies first)' : ''}`);

  // Function to start the dev server
  const startDevServer = () => {
    runningProject.status = 'starting';
    pushLog(runningProject, `[${new Date().toISOString()}] Starting dev server on port ${port}...`);

    // Spawn vite dev server with specific port
    // Note: shell: false (default) is safer - prevents command injection
    const devProcess = spawn('npx', ['vite', '--port', String(port), '--host'], {
      cwd: filesDir,
      shell: process.platform === 'win32', // Only use shell on Windows for npx compatibility
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    runningProject.process = devProcess;

    devProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      pushLog(runningProject, output);

      // Detect when server is ready
      if (output.includes('Local:') || output.includes('ready in')) {
        runningProject.status = 'running';
        console.log(`[Runner] Project ${id} is running on port ${port}`);
      }
    });

    devProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      // Vite outputs to stderr sometimes even for non-errors
      pushLog(runningProject, output, true);
    });

    devProcess.on('error', (err) => {
      runningProject.status = 'error';
      pushLog(runningProject, `Process error: ${err.message}`, true);
      console.error(`[Runner] Project ${id} error:`, err);
    });

    devProcess.on('exit', (code) => {
      runningProject.status = 'stopped';
      pushLog(runningProject, `[${new Date().toISOString()}] Process exited with code ${code}`);
      console.log(`[Runner] Project ${id} stopped (exit code: ${code})`);
    });
  };

  // Install dependencies if needed
  if (needsInstall) {
    pushLog(runningProject, `[${new Date().toISOString()}] Installing dependencies...`);

    // VF-05 fix: Add --ignore-scripts to prevent RCE from malicious package.json lifecycle scripts
    const installProcess = spawn('npm', ['install', '--ignore-scripts'], {
      cwd: filesDir,
      shell: process.platform === 'win32', // Only use shell on Windows for npm compatibility
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    runningProject.process = installProcess;

    installProcess.stdout?.on('data', (data) => {
      pushLog(runningProject, data.toString());
    });

    installProcess.stderr?.on('data', (data) => {
      // npm install outputs a lot to stderr even on success
      pushLog(runningProject, data.toString());
    });

    installProcess.on('error', (err) => {
      runningProject.status = 'error';
      pushLog(runningProject, `Install error: ${err.message}`, true);
      console.error(`[Runner] Project ${id} install error:`, err);
      // BUG-019 FIX: Clean up process reference on error
      runningProject.process = null;
    });

    installProcess.on('exit', (code) => {
      if (code === 0) {
        pushLog(runningProject, `[${new Date().toISOString()}] Dependencies installed successfully`);
        try {
          startDevServer();
        } catch (err) {
          runningProject.status = 'error';
          pushLog(runningProject, `Failed to start dev server: ${err}`, true);
          console.error(`[Runner] Project ${id} failed to start dev server:`, err);
        }
      } else {
        runningProject.status = 'error';
        pushLog(runningProject, `npm install failed with code ${code}`, true);
        console.error(`[Runner] Project ${id} npm install failed with code ${code}`);
        // BUG-019 FIX: Clean up process reference on failed install
        runningProject.process = null;
      }
    });
  } else {
    // Start immediately if node_modules exists
    try {
      startDevServer();
    } catch (err) {
      runningProject.status = 'error';
      pushLog(runningProject, `Failed to start dev server: ${err}`, true);
      console.error(`[Runner] Project ${id} failed to start dev server:`, err);
    }
  }

  return res.json({
    message: needsInstall ? 'Installing dependencies...' : 'Starting dev server...',
    port,
    url: runningProject.url,
    status: runningProject.status
  });
});

// Stop a project
router.post('/:id/stop', (req, res) => {
  const { id } = req.params;
  const running = runningProjects.get(id);

  if (!running) {
    return res.json({ message: 'Project is not running', status: 'stopped' });
  }

  console.log(`[Runner] Stopping project ${id}...`);

  // Kill the process
  if (running.process && !running.process.killed) {
    // On Windows, we need to kill the whole process tree
    if (process.platform === 'win32') {
      // Use spawnSync without shell for safety (pid is from Node's ChildProcess, so it's a safe number)
      spawnSync('taskkill', ['/pid', String(running.process.pid), '/f', '/t'], { stdio: 'ignore' });
    } else {
      running.process.kill('SIGTERM');
    }
  }

  running.status = 'stopped';
  pushLog(running, `[${new Date().toISOString()}] Stopped by user`);

  // BUG-FIX (MED-S04): Store startedAt to prevent deleting a restarted project entry
  // If user restarts the project within 5 seconds, this closure's startedAt won't match
  const stoppedEntryStartedAt = running.startedAt;

  // Clean up after a delay
  setTimeout(() => {
    const currentEntry = runningProjects.get(id);
    // Only delete if the entry is the same one we stopped (same startedAt timestamp)
    if (currentEntry && currentEntry.startedAt === stoppedEntryStartedAt) {
      runningProjects.delete(id);
    }
  }, 5000);

  return res.json({ message: 'Project stopped', status: 'stopped' });
});

// Get logs for a project (streaming-friendly)
router.get('/:id/logs', (req, res) => {
  const { id } = req.params;
  const { since } = req.query;
  const running = runningProjects.get(id);

  if (!running) {
    return res.json({ logs: [], errorLogs: [], status: 'stopped' });
  }

  // If 'since' is provided, only return logs after that index
  const sinceIndex = since ? parseInt(since as string, 10) : 0;

  return res.json({
    logs: running.logs.slice(sinceIndex),
    errorLogs: running.errorLogs,
    status: running.status,
    totalLogs: running.logs.length
  });
});

// SSE endpoint for real-time log streaming
router.get('/:id/logs/stream', (req, res) => {
  const { id } = req.params;
  const running = runningProjects.get(id);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  if (!running) {
    // Send stopped status and close
    res.write(`data: ${JSON.stringify({ type: 'status', status: 'stopped' })}\n\n`);
    res.end();
    return;
  }

  // Send initial logs (catch-up)
  res.write(`data: ${JSON.stringify({ type: 'init', logs: running.logs, status: running.status })}\n\n`);

  // Listen for new logs
  const onLog = (data: { entry: string; isError: boolean; timestamp: number }) => {
    res.write(`data: ${JSON.stringify({ type: 'log', ...data })}\n\n`);
  };

  // Listen for status changes
  const originalStatus = running.status;
  const statusCheckInterval = setInterval(() => {
    const current = runningProjects.get(id);
    if (!current) {
      res.write(`data: ${JSON.stringify({ type: 'status', status: 'stopped' })}\n\n`);
      cleanup();
      res.end();
    } else if (current.status !== originalStatus) {
      res.write(`data: ${JSON.stringify({ type: 'status', status: current.status })}\n\n`);
    }
  }, 1000);

  running.logEmitter.on('log', onLog);

  // Cleanup on client disconnect
  const cleanup = () => {
    running.logEmitter.off('log', onLog);
    clearInterval(statusCheckInterval);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
});

// Stop all running projects (cleanup endpoint)
router.post('/stop-all', (req, res) => {
  const stopped: string[] = [];

  for (const [id, running] of runningProjects.entries()) {
    if (running.process && !running.process.killed) {
      if (process.platform === 'win32') {
        // Use spawnSync without shell for safety
        spawnSync('taskkill', ['/pid', String(running.process.pid), '/f', '/t'], { stdio: 'ignore' });
      } else {
        running.process.kill('SIGTERM');
      }
      stopped.push(id);
    }
  }

  runningProjects.clear();

  // Also cleanup any orphan processes not in our map
  cleanupOrphanProcesses();

  console.log(`[Runner] Stopped all projects: ${stopped.join(', ')}`);
  return res.json({ message: `Stopped ${stopped.length} projects`, stopped });
});

// Cleanup orphans endpoint (manual trigger)
router.post('/cleanup', (req, res) => {
  cleanupOrphanProcesses();
  return res.json({ message: 'Orphan processes cleaned up' });
});

/**
 * Cleanup all running projects - used for graceful shutdown
 * Returns the number of projects stopped
 */
function cleanupAllRunningProjects(): number {
  let stopped = 0;

  for (const [id, running] of runningProjects.entries()) {
    if (running.process && !running.process.killed) {
      try {
        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/pid', String(running.process.pid), '/f', '/t'], { stdio: 'ignore' });
        } else {
          running.process.kill('SIGTERM');
        }
        stopped++;
        console.log(`[Runner] Stopped project: ${id}`);
      } catch (err) {
        console.error(`[Runner] Failed to stop project ${id}:`, err);
      }
    }
  }

  runningProjects.clear();
  cleanupOrphanProcesses();

  return stopped;
}

/**
 * Get health status of running projects
 */
function getRunnerHealth(): { running: number; healthy: number; unhealthy: string[] } {
  let healthy = 0;
  const unhealthy: string[] = [];

  for (const [id, running] of runningProjects.entries()) {
    if (running.status === 'running' && running.process && !running.process.killed) {
      healthy++;
    } else if (running.status === 'error' || (running.process && running.process.killed)) {
      unhealthy.push(id);
    }
  }

  return {
    running: runningProjects.size,
    healthy,
    unhealthy
  };
}

export { router as runnerRouter, cleanupAllRunningProjects, getRunnerHealth };
