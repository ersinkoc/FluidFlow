import { Router, Request, Response, NextFunction } from 'express';
import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

// BUG-016 FIX: Safe JSON parsing helper to prevent crashes on corrupted files
function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error('[GitHub API] JSON parse error:', error instanceof Error ? error.message : error);
    return fallback;
  }
}

// BUG-016 FIX: Safe file read + JSON parse helper
async function safeReadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return safeJsonParse(content, fallback);
  } catch (error) {
    console.error(`[GitHub API] Failed to read JSON from ${filePath}:`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Projects directory - use process.cwd() for reliability
const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// GH-002 fix: Simple in-memory rate limiter for expensive operations
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 requests per minute for expensive ops

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

// GH-002 fix: Rate limiting middleware for expensive operations
function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  // Use IP or a fixed key for simplicity (no auth in this app)
  const clientKey = req.ip || 'anonymous';
  const now = Date.now();

  let entry = rateLimitMap.get(clientKey);

  if (!entry || now > entry.resetTime) {
    // Reset or create new entry
    entry = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(clientKey, entry);
    return next();
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter
    });
  }

  entry.count++;
  return next();
}

// Helper to get project paths
const getProjectPath = (id: string) => path.join(PROJECTS_DIR, id);
const getFilesDir = (id: string) => path.join(getProjectPath(id), 'files');
const getMetaPath = (id: string) => path.join(getProjectPath(id), 'project.json');

// Check if directory has its own .git folder (not inherited from parent)
const isOwnGitRepo = (dir: string): boolean => {
  return existsSync(path.join(dir, '.git'));
};

// GH-001 fix: Validate GitHub token format to prevent invalid API calls
const isValidGitHubToken = (token: string): boolean => {
  if (!token || typeof token !== 'string') return false;

  // Classic Personal Access Token: ghp_ followed by 36 alphanumeric chars
  if (/^ghp_[a-zA-Z0-9]{36}$/.test(token)) return true;

  // Fine-grained Personal Access Token: github_pat_ prefix
  if (/^github_pat_[a-zA-Z0-9_]{22,}$/.test(token)) return true;

  // OAuth token: 40 hex characters
  if (/^gho_[a-zA-Z0-9]{36}$/.test(token)) return true;

  // GitHub App installation token
  if (/^ghs_[a-zA-Z0-9]{36}$/.test(token)) return true;

  // Legacy OAuth tokens (40 hex chars)
  if (/^[a-f0-9]{40}$/i.test(token)) return true;

  return false;
};

// Set remote origin
router.post('/:id/remote', async (req, res) => {
  try {
    const { id } = req.params;
    const { url, name = 'origin' } = req.body;
    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!url) {
      return res.status(400).json({ error: 'Remote URL required' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = simpleGit(filesDir);

    // Check if remote exists
    const remotes = await git.getRemotes();
    const existingRemote = remotes.find(r => r.name === name);

    if (existingRemote) {
      await git.remote(['set-url', name, url]);
    } else {
      await git.addRemote(name, url);
    }

    // Update meta - BUG-016 FIX: Use safe JSON parsing
    const meta = await safeReadJson<{ githubRepo?: string; updatedAt?: number } | null>(getMetaPath(id), null);
    if (meta) {
      meta.githubRepo = url;
      meta.updatedAt = Date.now();
      await fs.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2));
    }

    res.json({ message: `Remote '${name}' set to ${url}` });
  } catch (error) {
    console.error('Set remote error:', error);
    res.status(500).json({ error: 'Failed to set remote' });
  }
});

// Get remotes
router.get('/:id/remote', async (req, res) => {
  try {
    const { id } = req.params;
    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.json({ initialized: false, remotes: [] });
    }

    const git: SimpleGit = simpleGit(filesDir);
    const remotes = await git.getRemotes(true);

    res.json({
      initialized: true,
      remotes: remotes.map(r => ({
        name: r.name,
        fetch: r.refs.fetch,
        push: r.refs.push
      }))
    });
  } catch (error) {
    console.error('Get remotes error:', error);
    res.status(500).json({ error: 'Failed to get remotes' });
  }
});

// Push to remote (GH-002 fix: rate limited)
router.post('/:id/push', rateLimitMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { remote = 'origin', branch, force = false, setUpstream = true } = req.body;
    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = simpleGit(filesDir);

    // Get current branch if not specified
    const currentBranch = branch || (await git.branchLocal()).current;

    // Build push options
    const pushOptions: string[] = [];
    if (setUpstream) pushOptions.push('-u');
    if (force) pushOptions.push('--force');

    await git.push(remote, currentBranch, pushOptions);

    res.json({
      message: `Pushed to ${remote}/${currentBranch}`,
      remote,
      branch: currentBranch
    });
  } catch (error: any) {
    console.error('Push error:', error);
    // Check for authentication error
    if (error.message?.includes('Authentication') || error.message?.includes('403')) {
      return res.status(401).json({
        error: 'Authentication failed. Make sure you have configured git credentials or use a personal access token.',
        details: error.message
      });
    }
    res.status(500).json({ error: 'Failed to push', details: error.message });
  }
});

// Pull from remote
router.post('/:id/pull', async (req, res) => {
  try {
    const { id } = req.params;
    const { remote = 'origin', branch } = req.body;
    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = simpleGit(filesDir);
    const currentBranch = branch || (await git.branchLocal()).current;
    const result = await git.pull(remote, currentBranch);

    res.json({
      message: 'Pulled successfully',
      summary: result.summary
    });
  } catch (error: any) {
    console.error('Pull error:', error);
    res.status(500).json({ error: 'Failed to pull', details: error.message });
  }
});

// Fetch from remote
router.post('/:id/fetch', async (req, res) => {
  try {
    const { id } = req.params;
    const { remote = 'origin', prune = false } = req.body;
    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = simpleGit(filesDir);
    const fetchOptions = prune ? ['--prune'] : [];
    await git.fetch(remote, undefined, fetchOptions);

    res.json({ message: `Fetched from ${remote}` });
  } catch (error: any) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch', details: error.message });
  }
});

// Validate git clone URL to prevent SSRF and malicious cloning
const isValidGitUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;

  // Allow HTTPS URLs from trusted git hosting providers
  const trustedHosts = [
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/,
    /^https:\/\/gitlab\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/,
    /^https:\/\/bitbucket\.org\/[\w.-]+\/[\w.-]+(?:\.git)?$/,
    /^https:\/\/[\w.-]+\.github\.io\/[\w.-]+(?:\.git)?$/,
  ];

  // Check if URL matches any trusted pattern
  for (const pattern of trustedHosts) {
    if (pattern.test(url)) return true;
  }

  // Also allow generic HTTPS git URLs but validate structure
  const genericHttpsPattern = /^https:\/\/[\w.-]+(?::\d+)?\/[\w./-]+(?:\.git)?$/;
  if (genericHttpsPattern.test(url)) {
    // Block localhost, internal IPs, and private networks
    const blocked = [
      /localhost/i,
      /127\.\d+\.\d+\.\d+/,
      /10\.\d+\.\d+\.\d+/,
      /172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
      /192\.168\.\d+\.\d+/,
      /0\.0\.0\.0/,
      /\[::1\]/,
      /\.local\b/i,
      /\.internal\b/i,
    ];
    for (const pattern of blocked) {
      if (pattern.test(url)) return false;
    }
    return true;
  }

  return false;
};

// Clone a repository (GH-002 fix: rate limited)
router.post('/clone', rateLimitMiddleware, async (req, res) => {
  try {
    const { url, name } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Repository URL required' });
    }

    // Validate URL to prevent SSRF attacks
    if (!isValidGitUrl(url)) {
      return res.status(400).json({
        error: 'Invalid repository URL',
        details: 'Only HTTPS URLs from trusted git hosting providers are allowed'
      });
    }

    // Generate project ID
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    const projectPath = getProjectPath(id);
    const filesDir = getFilesDir(id);

    // Create project directory
    await fs.mkdir(projectPath, { recursive: true });

    // Clone repository
    const git: SimpleGit = simpleGit();
    await git.clone(url, filesDir);

    // Extract repo name from URL if not provided
    const repoName = name || url.split('/').pop()?.replace('.git', '') || 'Cloned Project';

    // Create meta file
    const meta = {
      id,
      name: repoName,
      description: `Cloned from ${url}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      gitInitialized: true,
      githubRepo: url
    };

    await fs.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2));

    res.status(201).json({
      message: 'Repository cloned successfully',
      project: meta
    });
  } catch (error: any) {
    console.error('Clone error:', error);
    res.status(500).json({ error: 'Failed to clone repository', details: error.message });
  }
});

// Create GitHub repository (requires token) (GH-002 fix: rate limited)
router.post('/:id/create-repo', rateLimitMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { token, name, description, isPrivate = false } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'GitHub token required' });
    }

    // GH-001 fix: Validate token format
    if (!isValidGitHubToken(token)) {
      return res.status(400).json({ error: 'Invalid GitHub token format' });
    }

    const filesDir = getFilesDir(id);
    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get project meta for default name - BUG-016 FIX: Use safe JSON parsing
    interface ProjectMeta {
      name?: string;
      description?: string;
      gitInitialized?: boolean;
      githubRepo?: string;
      updatedAt?: number;
    }
    const meta = await safeReadJson<ProjectMeta | null>(getMetaPath(id), null);
    if (!meta && !name) {
      return res.status(500).json({ error: 'Project metadata corrupted and no name provided' });
    }
    const repoName = name || (meta?.name?.replace(/\s+/g, '-').toLowerCase() || 'untitled-project');

    // Create repo via GitHub API
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: repoName,
        description: description || meta?.description || `Created with FluidFlow`,
        private: isPrivate,
        auto_init: false
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({
        error: 'Failed to create GitHub repository',
        details: error.message || error.errors?.[0]?.message
      });
    }

    const repo = await response.json();

    // Initialize git if needed
    const git: SimpleGit = simpleGit(filesDir);

    if (!isOwnGitRepo(filesDir)) {
      await git.init();
      await fs.writeFile(path.join(filesDir, '.gitignore'), 'node_modules/\n.env\ndist/\n');
      await git.add('.');
      await git.commit('Initial commit - Created with FluidFlow');
    }

    // Set remote
    const remotes = await git.getRemotes();
    if (remotes.find(r => r.name === 'origin')) {
      await git.remote(['set-url', 'origin', repo.clone_url]);
    } else {
      await git.addRemote('origin', repo.clone_url);
    }

    // Update meta - BUG-016 FIX: Handle null meta case
    if (meta) {
      meta.gitInitialized = true;
      meta.githubRepo = repo.html_url;
      meta.updatedAt = Date.now();
      await fs.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2));
    }

    res.status(201).json({
      message: 'GitHub repository created',
      repository: {
        name: repo.name,
        url: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        private: repo.private
      }
    });
  } catch (error: any) {
    console.error('Create repo error:', error);
    res.status(500).json({ error: 'Failed to create repository', details: error.message });
  }
});

// Verify GitHub token
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    // GH-001 fix: Validate token format before API call
    if (!isValidGitHubToken(token)) {
      return res.status(400).json({ valid: false, error: 'Invalid token format' });
    }

    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      return res.status(401).json({ valid: false, error: 'Invalid token' });
    }

    const user = await response.json();

    res.json({
      valid: true,
      user: {
        login: user.login,
        name: user.name,
        avatar: user.avatar_url,
        url: user.html_url
      }
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

export { router as githubRouter };
