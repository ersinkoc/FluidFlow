import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { isValidProjectId, isValidFilePath, sanitizeFilePath } from '../utils/validation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Projects directory - use process.cwd() for reliability
const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// PROJ-002 fix: File size limits to prevent memory exhaustion
const MAX_SINGLE_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_TOTAL_PROJECT_SIZE = 50 * 1024 * 1024; // 50MB total per project

// Ensure projects dir exists
if (!existsSync(PROJECTS_DIR)) {
  mkdirSync(PROJECTS_DIR, { recursive: true });
}

interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  description?: string;
  gitInitialized?: boolean;
  githubRepo?: string;
}

interface ProjectFile {
  path: string;
  content: string;
}

interface Project extends ProjectMeta {
  files: Record<string, string>;
}

// Helper to get project path
const getProjectPath = (id: string) => path.join(PROJECTS_DIR, id);
const getMetaPath = (id: string) => path.join(getProjectPath(id), 'project.json');
const getFilesDir = (id: string) => path.join(getProjectPath(id), 'files');
const getContextPath = (id: string) => path.join(getProjectPath(id), 'context.json');

// Per-project locks to prevent concurrent file updates
// PROJ-001/PROJ-004 fix: Track lock metadata for proper cleanup
interface LockEntry {
  promise: Promise<void>;
  resolve: () => void;
  timestamp: number;
}
const projectLocks = new Map<string, LockEntry>();

// PROJ-004 fix: Periodic cleanup of stale locks (locks older than 5 minutes)
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [projectId, lock] of projectLocks.entries()) {
    if (now - lock.timestamp > LOCK_TIMEOUT_MS) {
      console.warn(`[Projects] Cleaning up stale lock for project ${projectId}`);
      lock.resolve(); // Release the lock
      projectLocks.delete(projectId);
    }
  }
}, 60 * 1000); // Check every minute

async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing lock on this project
  const existingLock = projectLocks.get(projectId);
  if (existingLock) {
    await existingLock.promise;
  }

  // Create new lock with metadata
  let resolveLock: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  const lockEntry: LockEntry = {
    promise: lockPromise,
    resolve: resolveLock,
    timestamp: Date.now()
  };
  projectLocks.set(projectId, lockEntry);

  try {
    return await fn();
  } finally {
    resolveLock();
    // PROJ-001 fix: Only clean up if it's still our lock (atomic check-and-delete)
    const currentLock = projectLocks.get(projectId);
    if (currentLock && currentLock.promise === lockPromise) {
      projectLocks.delete(projectId);
    }
  }
}

// Project context structure (version history + UI state)
interface HistoryEntry {
  files: Record<string, string>;
  label: string;
  timestamp: number;
  type: 'auto' | 'manual' | 'snapshot';
  changedFiles?: string[];
}

interface AIHistoryEntry {
  id: string;
  timestamp: number;
  prompt: string;
  model: string;
  provider: string;
  hasSketch: boolean;
  hasBrand: boolean;
  isUpdate: boolean;
  rawResponse: string;
  responseChars: number;
  responseChunks: number;
  durationMs: number;
  success: boolean;
  error?: string;
  truncated?: boolean;
  filesGenerated?: string[];
  explanation?: string;
  templateType?: 'auto-fix' | 'inspect-edit' | 'prompt-template' | 'chat' | 'checkpoint';
}

interface ProjectContext {
  // Version history
  history: HistoryEntry[];
  currentIndex: number;

  // UI state
  activeFile?: string;
  activeTab?: string;

  // AI generation history
  aiHistory?: AIHistoryEntry[];

  // Saved at timestamp
  savedAt: number;
}

// List all projects
router.get('/', async (req, res) => {
  try {
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
    const projects: ProjectMeta[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metaPath = getMetaPath(entry.name);
        try {
          const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
          projects.push(meta);
        } catch {
          // Skip invalid projects
        }
      }
    }

    // Sort by updatedAt descending
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Get single project
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const projectPath = getProjectPath(id);

    if (!existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const meta: ProjectMeta = JSON.parse(await fs.readFile(getMetaPath(id), 'utf-8'));
    const filesDir = getFilesDir(id);
    const files: Record<string, string> = {};

    // Read all files recursively (excluding .git and other system folders)
    const IGNORED_FOLDERS = ['.git', 'node_modules', '.next', '.nuxt', 'dist', 'build', '.cache'];
    const IGNORED_FILES = ['.DS_Store', 'Thumbs.db'];
    let totalSize = 0;

    async function readFilesRecursively(dir: string, basePath: string = '') {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip ignored folders and files
        if (IGNORED_FOLDERS.includes(entry.name) || IGNORED_FILES.includes(entry.name)) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          await readFilesRecursively(fullPath, relativePath);
        } else {
          // PROJ-002 fix: Check file size before reading
          const stat = await fs.stat(fullPath);
          if (stat.size > MAX_SINGLE_FILE_SIZE) {
            console.warn(`[Projects] Skipping large file: ${relativePath} (${stat.size} bytes)`);
            continue; // Skip files larger than limit
          }
          totalSize += stat.size;
          if (totalSize > MAX_TOTAL_PROJECT_SIZE) {
            console.warn(`[Projects] Project size limit exceeded, stopping read`);
            return; // Stop if total size exceeds limit
          }
          files[relativePath] = await fs.readFile(fullPath, 'utf-8');
        }
      }
    }

    if (existsSync(filesDir)) {
      await readFilesRecursively(filesDir);
    }

    res.json({ ...meta, files });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// Helper to validate all file paths in a files object
function validateFilePaths(files: Record<string, unknown>): { valid: boolean; invalidPath?: string } {
  for (const filePath of Object.keys(files)) {
    if (!isValidFilePath(filePath)) {
      return { valid: false, invalidPath: filePath };
    }
  }
  return { valid: true };
}

// PROJ-002 fix: Helper to validate file sizes
function validateFileSizes(files: Record<string, unknown>): { valid: boolean; error?: string; totalSize?: number } {
  let totalSize = 0;
  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content === 'string') {
      const fileSize = Buffer.byteLength(content, 'utf-8');
      if (fileSize > MAX_SINGLE_FILE_SIZE) {
        return {
          valid: false,
          error: `File "${filePath}" exceeds maximum size (${Math.round(fileSize / 1024 / 1024)}MB > ${MAX_SINGLE_FILE_SIZE / 1024 / 1024}MB)`
        };
      }
      totalSize += fileSize;
    }
  }
  if (totalSize > MAX_TOTAL_PROJECT_SIZE) {
    return {
      valid: false,
      error: `Total project size exceeds maximum (${Math.round(totalSize / 1024 / 1024)}MB > ${MAX_TOTAL_PROJECT_SIZE / 1024 / 1024}MB)`,
      totalSize
    };
  }
  return { valid: true, totalSize };
}

// Create new project
router.post('/', async (req, res) => {
  try {
    const { name, description, files } = req.body;
    const id = uuidv4();
    const projectPath = getProjectPath(id);
    const filesDir = getFilesDir(id);

    // Validate file paths to prevent path traversal attacks
    if (files && typeof files === 'object') {
      const pathValidation = validateFilePaths(files);
      if (!pathValidation.valid) {
        return res.status(400).json({
          error: 'Invalid file path detected',
          invalidPath: pathValidation.invalidPath
        });
      }

      // PROJ-002 fix: Validate file sizes
      const sizeValidation = validateFileSizes(files);
      if (!sizeValidation.valid) {
        return res.status(400).json({ error: sizeValidation.error });
      }
    }

    // Create directories
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(filesDir, { recursive: true });

    // Create meta file
    const meta: ProjectMeta = {
      id,
      name: name || 'Untitled Project',
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      gitInitialized: false
    };

    await fs.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2));

    // Save files (paths already validated above)
    if (files && typeof files === 'object') {
      for (const [filePath, content] of Object.entries(files)) {
        const safePath = sanitizeFilePath(filePath);
        const fullPath = path.join(filesDir, safePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content as string);
      }
    }

    res.status(201).json({ ...meta, files: files || {} });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project (auto-save endpoint)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, files, force } = req.body;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Validate file paths to prevent path traversal attacks
    if (files && typeof files === 'object') {
      const pathValidation = validateFilePaths(files);
      if (!pathValidation.valid) {
        return res.status(400).json({
          error: 'Invalid file path detected',
          invalidPath: pathValidation.invalidPath
        });
      }

      // PROJ-002 fix: Validate file sizes
      const sizeValidation = validateFileSizes(files);
      if (!sizeValidation.valid) {
        return res.status(400).json({ error: sizeValidation.error });
      }
    }

    const projectPath = getProjectPath(id);

    if (!existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Use lock to prevent concurrent updates to the same project
    const result = await withProjectLock(id, async () => {
      // Update meta
      const meta: ProjectMeta = JSON.parse(await fs.readFile(getMetaPath(id), 'utf-8'));
    if (name) meta.name = name;
    if (description !== undefined) meta.description = description;
    meta.updatedAt = Date.now();

    await fs.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2));

    // Update files if provided
    if (files && typeof files === 'object') {
      const fileCount = Object.keys(files).length;
      const filesDir = getFilesDir(id);

      // Count existing files to detect suspicious updates (excluding .git, node_modules, etc.)
      const IGNORED_FOLDERS = ['.git', 'node_modules', '.next', '.nuxt', 'dist', 'build', '.cache'];
      const IGNORED_FILES = ['.DS_Store', 'Thumbs.db'];

      let existingFileCount = 0;
      if (existsSync(filesDir)) {
        async function countFiles(dir: string): Promise<number> {
          let count = 0;
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              // Skip ignored folders and files
              if (IGNORED_FOLDERS.includes(entry.name) || IGNORED_FILES.includes(entry.name)) {
                continue;
              }
              if (entry.isDirectory()) {
                count += await countFiles(path.join(dir, entry.name));
              } else {
                count++;
              }
            }
          } catch {
            // Ignore errors
          }
          return count;
        }
        existingFileCount = await countFiles(filesDir);
      }

      // CRITICAL: Never delete all files if incoming files is empty!
      // This prevents accidental data loss from race conditions or bugs
      if (fileCount === 0) {
        console.warn(`[Projects API] BLOCKED empty files update for project ${id} - would delete ${existingFileCount} files!`);
        // Don't update files at all if empty - return warning but success
        return {
          meta,
          message: 'Empty update blocked',
          warning: 'Cannot sync empty file set - this would delete all project files',
          blocked: true,
          existingFileCount,
          newFileCount: fileCount
        };
      } else if (!force && existingFileCount > 5 && fileCount < existingFileCount * 0.3) {
        // If we have more than 5 files and new update has less than 30% of them, ask for confirmation
        // Unless force=true is passed (user confirmed)
        console.warn(`[Projects API] Suspicious update for project ${id} - would reduce files from ${existingFileCount} to ${fileCount}. Requesting confirmation.`);
        return {
          meta,
          confirmationRequired: true,
          message: `This update will reduce files from ${existingFileCount} to ${fileCount}. Are you sure?`,
          existingFileCount,
          newFileCount: fileCount,
          warning: 'Significant file reduction detected'
        };
      } else {
        // Safe to update (or force=true was passed)
        if (force && existingFileCount > 5 && fileCount < existingFileCount * 0.3) {
          console.log(`[Projects API] FORCE update for project ${id} - reducing files from ${existingFileCount} to ${fileCount} (user confirmed)`);
        }

        // IMPORTANT: Don't delete entire directory - preserve .git!
        // Instead: delete old files, write new files, keep .git intact

        if (existsSync(filesDir)) {
          // Get list of current files (excluding .git)
          async function getFilePaths(dir: string, basePath: string = ''): Promise<string[]> {
            const paths: string[] = [];
            try {
              const entries = await fs.readdir(dir, { withFileTypes: true });
              for (const entry of entries) {
                // Skip .git and other preserved folders
                if (IGNORED_FOLDERS.includes(entry.name)) continue;

                const fullPath = path.join(dir, entry.name);
                const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

                if (entry.isDirectory()) {
                  paths.push(...await getFilePaths(fullPath, relativePath));
                } else {
                  if (!IGNORED_FILES.includes(entry.name)) {
                    paths.push(relativePath);
                  }
                }
              }
            } catch {
              // Ignore errors
            }
            return paths;
          }

          const existingPaths = await getFilePaths(filesDir);
          const newPaths = new Set(Object.keys(files));

          // Delete files that are no longer in the new set
          for (const oldPath of existingPaths) {
            if (!newPaths.has(oldPath)) {
              const fullPath = path.join(filesDir, oldPath);
              try {
                await fs.unlink(fullPath);
              } catch {
                // File might already be gone
              }
            }
          }

          // Clean up empty directories (except .git)
          async function cleanEmptyDirs(dir: string): Promise<void> {
            try {
              const entries = await fs.readdir(dir, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isDirectory() && !IGNORED_FOLDERS.includes(entry.name)) {
                  const subDir = path.join(dir, entry.name);
                  await cleanEmptyDirs(subDir);
                  // Try to remove if empty
                  try {
                    await fs.rmdir(subDir);
                  } catch {
                    // Not empty, that's fine
                  }
                }
              }
            } catch {
              // Ignore errors
            }
          }
          await cleanEmptyDirs(filesDir);
        } else {
          await fs.mkdir(filesDir, { recursive: true });
        }

        // Write new/updated files (paths already validated above)
        for (const [filePath, content] of Object.entries(files)) {
          const safePath = sanitizeFilePath(filePath);
          const fullPath = path.join(filesDir, safePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content as string);
        }

        console.log(`[Projects API] Updated ${fileCount} files for project ${id} (was ${existingFileCount})`);
        }
      }

      return { meta, message: 'Project updated' };
    });

    // Handle special responses from inside the lock
    if ('confirmationRequired' in result || 'blocked' in result || 'warning' in result) {
      return res.json({ ...result.meta, ...result });
    }

    res.json({ ...result.meta, message: result.message });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal attacks
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const projectPath = getProjectPath(id);

    if (!existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await fs.rm(projectPath, { recursive: true });
    res.json({ message: 'Project deleted', id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Duplicate project
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Validate project ID to prevent path traversal attacks
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const sourcePath = getProjectPath(id);

    if (!existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get source project
    const sourceMeta: ProjectMeta = JSON.parse(await fs.readFile(getMetaPath(id), 'utf-8'));

    // Create new project
    const newId = uuidv4();
    const newPath = getProjectPath(newId);

    // Copy directory
    await fs.cp(sourcePath, newPath, { recursive: true });

    // Update meta
    const newMeta: ProjectMeta = {
      ...sourceMeta,
      id: newId,
      name: name || `${sourceMeta.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      gitInitialized: false,
      githubRepo: undefined
    };

    await fs.writeFile(getMetaPath(newId), JSON.stringify(newMeta, null, 2));

    // Remove .git if exists
    const gitDir = path.join(newPath, '.git');
    if (existsSync(gitDir)) {
      await fs.rm(gitDir, { recursive: true });
    }

    res.status(201).json(newMeta);
  } catch (error) {
    res.status(500).json({ error: 'Failed to duplicate project' });
  }
});

// ============ PROJECT CONTEXT (VERSION HISTORY + UI STATE) ============

// Get project context
router.get('/:id/context', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const projectPath = getProjectPath(id);

    if (!existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const contextPath = getContextPath(id);

    if (existsSync(contextPath)) {
      const context = JSON.parse(await fs.readFile(contextPath, 'utf-8'));
      res.json(context);
    } else {
      // Return empty context if not exists
      res.json({
        history: [],
        currentIndex: -1,
        savedAt: 0
      });
    }
  } catch (error) {
    console.error('Get context error:', error);
    res.status(500).json({ error: 'Failed to get project context' });
  }
});

// Save project context (PUT for normal requests, POST for sendBeacon)
router.put('/:id/context', async (req, res) => {
  try {
    const { id } = req.params;
    const { history, currentIndex, activeFile, activeTab, aiHistory } = req.body;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const projectPath = getProjectPath(id);

    if (!existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Load existing context to merge with (for partial updates like aiHistory-only)
    const contextPath = getContextPath(id);
    let existingContext: Partial<ProjectContext> = {};
    if (existsSync(contextPath)) {
      try {
        existingContext = JSON.parse(await fs.readFile(contextPath, 'utf-8'));
      } catch {
        // Ignore parse errors
      }
    }

    // Validate and limit history size (max 30 entries to avoid huge files)
    const MAX_HISTORY = 30;
    let limitedHistory = history ?? existingContext.history ?? [];
    if (limitedHistory.length > MAX_HISTORY) {
      // Keep most recent entries, but preserve snapshots
      const snapshots = limitedHistory.filter((h: HistoryEntry) => h.type === 'snapshot');
      const nonSnapshots = limitedHistory.filter((h: HistoryEntry) => h.type !== 'snapshot');

      // Keep all snapshots + most recent non-snapshots
      const keepNonSnapshots = nonSnapshots.slice(-Math.max(0, MAX_HISTORY - snapshots.length));
      limitedHistory = [...snapshots, ...keepNonSnapshots]
        .sort((a: HistoryEntry, b: HistoryEntry) => a.timestamp - b.timestamp);
    }

    // Limit AI history to 100 entries
    const MAX_AI_HISTORY = 100;
    let limitedAiHistory = aiHistory ?? existingContext.aiHistory ?? [];
    if (limitedAiHistory.length > MAX_AI_HISTORY) {
      limitedAiHistory = limitedAiHistory.slice(0, MAX_AI_HISTORY);
    }

    const context: ProjectContext = {
      history: limitedHistory,
      currentIndex: Math.min(currentIndex ?? existingContext.currentIndex ?? 0, Math.max(0, limitedHistory.length - 1)),
      activeFile: activeFile ?? existingContext.activeFile,
      activeTab: activeTab ?? existingContext.activeTab,
      aiHistory: limitedAiHistory,
      savedAt: Date.now()
    };

    await fs.writeFile(contextPath, JSON.stringify(context, null, 2));

    // Also update project meta updatedAt
    const metaPath = getMetaPath(id);
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    meta.updatedAt = Date.now();
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));

    res.json({ message: 'Context saved', savedAt: context.savedAt });
  } catch (error) {
    console.error('Save context error:', error);
    res.status(500).json({ error: 'Failed to save project context' });
  }
});

// Save project context via POST (for sendBeacon on page unload)
router.post('/:id/context', async (req, res) => {
  try {
    const { id } = req.params;
    const { history, currentIndex, activeFile, activeTab, aiHistory } = req.body;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const projectPath = getProjectPath(id);

    if (!existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Load existing context to merge with (for partial updates like aiHistory-only)
    const contextPath = getContextPath(id);
    let existingContext: Partial<ProjectContext> = {};
    if (existsSync(contextPath)) {
      try {
        existingContext = JSON.parse(await fs.readFile(contextPath, 'utf-8'));
      } catch {
        // Ignore parse errors
      }
    }

    // Validate and limit history size (max 30 entries to avoid huge files)
    const MAX_HISTORY = 30;
    let limitedHistory = history ?? existingContext.history ?? [];
    if (limitedHistory.length > MAX_HISTORY) {
      // Keep most recent entries, but preserve snapshots
      const snapshots = limitedHistory.filter((h: HistoryEntry) => h.type === 'snapshot');
      const nonSnapshots = limitedHistory.filter((h: HistoryEntry) => h.type !== 'snapshot');

      // Keep all snapshots + most recent non-snapshots
      const keepNonSnapshots = nonSnapshots.slice(-Math.max(0, MAX_HISTORY - snapshots.length));
      limitedHistory = [...snapshots, ...keepNonSnapshots]
        .sort((a: HistoryEntry, b: HistoryEntry) => a.timestamp - b.timestamp);
    }

    // Limit AI history to 100 entries
    const MAX_AI_HISTORY = 100;
    let limitedAiHistory = aiHistory ?? existingContext.aiHistory ?? [];
    if (limitedAiHistory.length > MAX_AI_HISTORY) {
      limitedAiHistory = limitedAiHistory.slice(0, MAX_AI_HISTORY);
    }

    const context: ProjectContext = {
      history: limitedHistory,
      currentIndex: Math.min(currentIndex ?? existingContext.currentIndex ?? 0, Math.max(0, limitedHistory.length - 1)),
      activeFile: activeFile ?? existingContext.activeFile,
      activeTab: activeTab ?? existingContext.activeTab,
      aiHistory: limitedAiHistory,
      savedAt: Date.now()
    };

    await fs.writeFile(contextPath, JSON.stringify(context, null, 2));

    // Also update project meta updatedAt
    const metaPath = getMetaPath(id);
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    meta.updatedAt = Date.now();
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));

    res.json({ message: 'Context saved', savedAt: context.savedAt });
  } catch (error) {
    console.error('Save context error:', error);
    res.status(500).json({ error: 'Failed to save project context' });
  }
});

// Clear project context (useful for reset)
router.delete('/:id/context', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const contextPath = getContextPath(id);

    if (existsSync(contextPath)) {
      await fs.unlink(contextPath);
    }

    res.json({ message: 'Context cleared' });
  } catch (error) {
    console.error('Clear context error:', error);
    res.status(500).json({ error: 'Failed to clear project context' });
  }
});

export { router as projectsRouter };
