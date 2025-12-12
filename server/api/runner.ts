import { Router } from 'express';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { isValidProjectId, isValidInteger } from '../utils/validation';

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
          const port = parseInt(match[1], 10);
          const pid = match[2];
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

interface RunningProject {
  projectId: string;
  port: number;
  process: ChildProcess;
  status: 'installing' | 'starting' | 'running' | 'error' | 'stopped';
  logs: string[];
  errorLogs: string[];
  startedAt: number;
  url: string;
}

const runningProjects: Map<string, RunningProject> = new Map();

// RUN-002 fix: Track reserved ports to prevent race condition
// Ports are reserved when a start request begins and released when fully registered or on error
const reservedPorts: Set<number> = new Set();

// Helper to push logs with size limit (prevents memory leak)
function pushLog(logs: string[], entry: string): void {
  logs.push(entry);
  // Remove oldest entries if over limit
  while (logs.length > MAX_LOG_ENTRIES) {
    logs.shift();
  }
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

// List all running projects
router.get('/', (req, res) => {
  const projects = Array.from(runningProjects.entries()).map(([id, info]) => ({
    projectId: info.projectId,
    port: info.port,
    status: info.status,
    url: info.url,
    startedAt: info.startedAt,
    logsCount: info.logs.length,
    errorLogsCount: info.errorLogs.length
  }));

  res.json(projects);
});

// Get specific running project status
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const running = runningProjects.get(id);

  if (!running) {
    return res.json({ status: 'stopped', running: false });
  }

  res.json({
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
router.post('/:id/start', async (req, res) => {
  const { id } = req.params;

  // Validate project ID to prevent path traversal
  if (!isValidProjectId(id)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }

  const filesDir = getFilesDir(id);

  // Check if project exists
  if (!existsSync(filesDir)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Check if already running
  if (runningProjects.has(id)) {
    const running = runningProjects.get(id)!;
    if (running.status === 'running' || running.status === 'installing' || running.status === 'starting') {
      return res.json({
        message: 'Project is already running',
        port: running.port,
        url: running.url,
        status: running.status
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
  const runningProject: RunningProject = {
    projectId: id,
    port,
    process: null as any, // Will be set below
    status: 'installing',
    logs: [],
    errorLogs: [],
    startedAt: Date.now(),
    url: `http://localhost:${port}`
  };

  runningProjects.set(id, runningProject);

  // RUN-002 fix: Release reservation once properly registered
  releasePort(port);

  // Check if node_modules exists
  const nodeModulesPath = path.join(filesDir, 'node_modules');
  const needsInstall = !existsSync(nodeModulesPath);

  console.log(`[Runner] Starting project ${id} on port ${port}${needsInstall ? ' (installing dependencies first)' : ''}`);

  // Function to start the dev server
  const startDevServer = () => {
    runningProject.status = 'starting';
    pushLog(runningProject.logs,`[${new Date().toISOString()}] Starting dev server on port ${port}...`);

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
      pushLog(runningProject.logs,output);

      // Detect when server is ready
      if (output.includes('Local:') || output.includes('ready in')) {
        runningProject.status = 'running';
        console.log(`[Runner] Project ${id} is running on port ${port}`);
      }
    });

    devProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      pushLog(runningProject.errorLogs,output);
      // Vite outputs to stderr sometimes even for non-errors
      pushLog(runningProject.logs,output);
    });

    devProcess.on('error', (err) => {
      runningProject.status = 'error';
      pushLog(runningProject.errorLogs,`Process error: ${err.message}`);
      console.error(`[Runner] Project ${id} error:`, err);
    });

    devProcess.on('exit', (code) => {
      runningProject.status = 'stopped';
      pushLog(runningProject.logs,`[${new Date().toISOString()}] Process exited with code ${code}`);
      console.log(`[Runner] Project ${id} stopped (exit code: ${code})`);
    });
  };

  // Install dependencies if needed
  if (needsInstall) {
    pushLog(runningProject.logs,`[${new Date().toISOString()}] Installing dependencies...`);

    const installProcess = spawn('npm', ['install'], {
      cwd: filesDir,
      shell: process.platform === 'win32', // Only use shell on Windows for npm compatibility
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    runningProject.process = installProcess;

    installProcess.stdout?.on('data', (data) => {
      pushLog(runningProject.logs,data.toString());
    });

    installProcess.stderr?.on('data', (data) => {
      // npm install outputs a lot to stderr even on success
      pushLog(runningProject.logs,data.toString());
    });

    installProcess.on('error', (err) => {
      runningProject.status = 'error';
      pushLog(runningProject.errorLogs,`Install error: ${err.message}`);
      console.error(`[Runner] Project ${id} install error:`, err);
    });

    installProcess.on('exit', (code) => {
      if (code === 0) {
        pushLog(runningProject.logs,`[${new Date().toISOString()}] Dependencies installed successfully`);
        startDevServer();
      } else {
        runningProject.status = 'error';
        pushLog(runningProject.errorLogs,`npm install failed with code ${code}`);
        console.error(`[Runner] Project ${id} npm install failed with code ${code}`);
      }
    });
  } else {
    // Start immediately if node_modules exists
    startDevServer();
  }

  res.json({
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
  pushLog(running.logs,`[${new Date().toISOString()}] Stopped by user`);

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

  res.json({ message: 'Project stopped', status: 'stopped' });
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

  res.json({
    logs: running.logs.slice(sinceIndex),
    errorLogs: running.errorLogs,
    status: running.status,
    totalLogs: running.logs.length
  });
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
  res.json({ message: `Stopped ${stopped.length} projects`, stopped });
});

// Cleanup orphans endpoint (manual trigger)
router.post('/cleanup', (req, res) => {
  cleanupOrphanProcesses();
  res.json({ message: 'Orphan processes cleaned up' });
});

export { router as runnerRouter };
