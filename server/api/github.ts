import { Router, Request, Response, NextFunction } from 'express';
import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { safeReadJson } from '../utils/safeJson';

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

// Push to backup branch (for auto-backup feature)
router.post('/:id/backup-push', rateLimitMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { branch = 'backup/auto', token } = req.body;
    const projectDir = getProjectPath(id);
    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = simpleGit(filesDir);

    // Check if remote exists
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin) {
      return res.status(400).json({ error: 'No remote origin configured. Push to GitHub first.' });
    }

    // === NEW: Copy metadata files to .fluidflow/ for backup ===
    const fluidflowDir = path.join(filesDir, '.fluidflow');
    try {
      // Create .fluidflow directory if it doesn't exist
      if (!existsSync(fluidflowDir)) {
        await fs.mkdir(fluidflowDir, { recursive: true });
      }

      // Copy project.json and context.json
      const projectJsonPath = path.join(projectDir, 'project.json');
      const contextJsonPath = path.join(projectDir, 'context.json');

      if (existsSync(projectJsonPath)) {
        await fs.copyFile(projectJsonPath, path.join(fluidflowDir, 'project.json'));
      }
      if (existsSync(contextJsonPath)) {
        await fs.copyFile(contextJsonPath, path.join(fluidflowDir, 'context.json'));
      }

      // Stage and commit metadata changes if any
      await git.add('.fluidflow/*');
      const status = await git.status();
      if (status.staged.length > 0) {
        await git.commit('chore: sync FluidFlow metadata for backup');
      }
    } catch (metaError) {
      console.warn('Warning: Could not sync metadata files:', metaError);
      // Continue with backup even if metadata sync fails
    }

    // Get latest commit (might be new if we just committed metadata)
    const log = await git.log({ maxCount: 1 });
    const latestCommit = log.latest?.hash;

    if (!latestCommit) {
      return res.status(400).json({ error: 'No commits found' });
    }

    // Configure remote URL with token if provided
    const originalUrl = origin.refs.push || origin.refs.fetch;
    let tokenizedUrl = originalUrl;

    if (token && isValidGitHubToken(token)) {
      // Insert token into URL for authentication
      // https://github.com/user/repo.git -> https://token@github.com/user/repo.git
      tokenizedUrl = originalUrl.replace('https://', `https://${token}@`);
      await git.remote(['set-url', 'origin', tokenizedUrl]);
    }

    try {
      // Create/update backup branch pointing to current HEAD
      // First, try to delete remote backup branch if it exists (to allow force push)
      try {
        await git.push('origin', `:refs/heads/${branch}`);
      } catch {
        // Branch might not exist, that's fine
      }

      // Push current HEAD to backup branch
      await git.push('origin', `HEAD:refs/heads/${branch}`, ['--force']);

      // Restore original URL if we modified it
      if (token && tokenizedUrl !== originalUrl) {
        await git.remote(['set-url', 'origin', originalUrl]);
      }

      res.json({
        success: true,
        message: `Backed up to ${branch}`,
        branch,
        commit: latestCommit.substring(0, 7),
        timestamp: Date.now()
      });
    } catch (pushError) {
      // Restore original URL on error
      if (token && tokenizedUrl !== originalUrl) {
        await git.remote(['set-url', 'origin', originalUrl]);
      }
      throw pushError;
    }
  } catch (error: unknown) {
    console.error('Backup push error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Authentication') || errorMessage.includes('403') || errorMessage.includes('401')) {
      return res.status(401).json({
        error: 'Authentication failed. Please check your GitHub token.'
      });
    }

    res.status(500).json({ error: 'Failed to push backup' });
  }
});

// Push to remote (GH-002 fix: rate limited)
router.post('/:id/push', rateLimitMiddleware, async (req, res) => {
  const { id } = req.params;
  const { remote = 'origin', branch, force = false, setUpstream = true, token, includeContext = false } = req.body;
  const projectDir = getProjectPath(id);
  const filesDir = getFilesDir(id);

  console.log(`[Push] Project: ${id}, Remote: ${remote}, Force: ${force}, HasToken: ${!!token}, IncludeContext: ${includeContext}`);

  if (!existsSync(filesDir)) {
    console.log(`[Push] Project not found: ${filesDir}`);
    return res.status(404).json({ error: 'Project not found' });
  }

  if (!isOwnGitRepo(filesDir)) {
    console.log(`[Push] Git not initialized in: ${filesDir}`);
    return res.status(400).json({ error: 'Git not initialized' });
  }

  const git: SimpleGit = simpleGit(filesDir);
  let originalRemoteUrl: string | null = null;

  try {
    // === Sync metadata files to .fluidflow/ for portability ===
    const fluidflowDir = path.join(filesDir, '.fluidflow');
    try {
      // Create .fluidflow directory if it doesn't exist
      if (!existsSync(fluidflowDir)) {
        await fs.mkdir(fluidflowDir, { recursive: true });
      }

      // Copy project.json and context.json from project root
      const projectJsonPath = path.join(projectDir, 'project.json');
      const contextJsonPath = path.join(projectDir, 'context.json');

      if (existsSync(projectJsonPath)) {
        await fs.copyFile(projectJsonPath, path.join(fluidflowDir, 'project.json'));
        console.log(`[Push] Synced project.json to .fluidflow/`);
      }
      // Only include context.json if explicitly requested (for privacy)
      if (includeContext && existsSync(contextJsonPath)) {
        await fs.copyFile(contextJsonPath, path.join(fluidflowDir, 'context.json'));
        console.log(`[Push] Synced context.json to .fluidflow/`);
      }

      // Stage metadata changes
      await git.add('.fluidflow/*');
      const status = await git.status();
      if (status.staged.length > 0) {
        await git.commit('chore: sync FluidFlow metadata');
        console.log(`[Push] Committed metadata sync`);
      }
    } catch (metaError) {
      console.warn('[Push] Warning: Could not sync metadata files:', metaError);
      // Continue with push even if metadata sync fails
    }

    // Get current branch if not specified
    const branchInfo = await git.branchLocal();
    let currentBranch = branch || branchInfo.current;
    console.log(`[Push] Current branch: ${currentBranch}, All branches: ${branchInfo.all.join(', ')}`);

    // Check if current branch looks like a commit hash (detached HEAD state)
    const isDetachedHead = /^[0-9a-f]{7,40}$/.test(currentBranch);
    if (isDetachedHead) {
      console.log(`[Push] Detected detached HEAD state, attempting to fix...`);
      // Try to find or create a proper branch
      if (branchInfo.all.includes('main')) {
        await git.checkout('main');
        currentBranch = 'main';
      } else if (branchInfo.all.includes('master')) {
        await git.checkout('master');
        currentBranch = 'master';
      } else {
        // Create main branch from current HEAD
        console.log(`[Push] Creating 'main' branch from current HEAD`);
        await git.checkoutLocalBranch('main');
        currentBranch = 'main';
      }
      console.log(`[Push] Now on branch: ${currentBranch}`);
    }

    // Check if we have any commits
    const log = await git.log({ maxCount: 1 }).catch(() => null);
    if (!log || log.total === 0) {
      console.log(`[Push] No commits found`);
      return res.status(400).json({ error: 'No commits to push. Please make a commit first.' });
    }
    console.log(`[Push] Latest commit: ${log.latest?.hash?.substring(0, 7)} - ${log.latest?.message}`);

    // If token is provided, temporarily update remote URL with authentication
    if (token) {
      const remotes = await git.getRemotes(true);
      console.log(`[Push] Remotes found: ${remotes.map(r => r.name).join(', ')}`);
      const remoteInfo = remotes.find(r => r.name === remote);
      if (remoteInfo?.refs?.push) {
        originalRemoteUrl = remoteInfo.refs.push;
        console.log(`[Push] Original remote URL: ${originalRemoteUrl}`);
        // Convert https://github.com/user/repo.git to https://token@github.com/user/repo.git
        const authenticatedUrl = originalRemoteUrl.replace(
          /^https:\/\/(.*@)?github\.com\//,
          `https://${token.substring(0, 4)}****@github.com/`
        );
        console.log(`[Push] Setting authenticated URL: ${authenticatedUrl}`);
        // Actually set URL with full token
        const realAuthUrl = originalRemoteUrl.replace(
          /^https:\/\/(.*@)?github\.com\//,
          `https://${token}@github.com/`
        );
        await git.remote(['set-url', remote, realAuthUrl]);
      } else {
        console.log(`[Push] No push URL found for remote: ${remote}`);
      }
    } else {
      console.log(`[Push] No token provided, using existing credentials`);
    }

    // Build push options
    const pushOptions: string[] = [];
    if (setUpstream) pushOptions.push('-u');
    if (force) pushOptions.push('--force');

    console.log(`[Push] Pushing to ${remote}/${currentBranch} with options: ${pushOptions.join(', ') || 'none'}`);
    await git.push(remote, currentBranch, pushOptions);
    console.log(`[Push] Push successful!`);

    // Restore original remote URL before sending response
    if (originalRemoteUrl) {
      await git.remote(['set-url', remote, originalRemoteUrl]);
    }

    res.json({
      message: `Pushed to ${remote}/${currentBranch}`,
      remote,
      branch: currentBranch
    });
  } catch (error: unknown) {
    // Restore original remote URL (without token) for security
    if (originalRemoteUrl) {
      try {
        await git.remote(['set-url', remote, originalRemoteUrl]);
      } catch (restoreErr) {
        console.error('Failed to restore remote URL:', restoreErr);
      }
    }

    // BUG-005 FIX: Log full error server-side, return sanitized message to client
    console.error('Push error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for authentication error
    if (errorMessage.includes('Authentication') || errorMessage.includes('403') || errorMessage.includes('could not read Username')) {
      return res.status(401).json({
        error: 'Authentication failed. Make sure your GitHub token is valid and has repo permissions.'
      });
    }
    // Check for rejected push (non-fast-forward)
    if (errorMessage.includes('rejected') || errorMessage.includes('non-fast-forward')) {
      return res.status(409).json({
        error: 'Push rejected: Remote contains work that you do not have locally. Try pulling first or use force push.'
      });
    }
    // Check for no upstream branch
    if (errorMessage.includes('no upstream branch') || errorMessage.includes('has no upstream')) {
      return res.status(400).json({
        error: 'No upstream branch configured. The push will set up tracking automatically.'
      });
    }
    res.status(500).json({ error: `Push failed: ${errorMessage}` });
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
  } catch (error: unknown) {
    // BUG-005 FIX: Log full error server-side, return sanitized message to client
    console.error('Pull error:', error);
    res.status(500).json({ error: 'Failed to pull from remote repository' });
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
  } catch (error: unknown) {
    // BUG-005 FIX: Log full error server-side, return sanitized message to client
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch from remote repository' });
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
  } catch (error: unknown) {
    // BUG-005 FIX: Log full error server-side, return sanitized message to client
    console.error('Clone error:', error);
    res.status(500).json({ error: 'Failed to clone repository' });
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
  } catch (error: unknown) {
    // BUG-005 FIX: Log full error server-side, return sanitized message to client
    console.error('Create repo error:', error);
    res.status(500).json({ error: 'Failed to create GitHub repository' });
  }
});

// Verify GitHub token (BUG-001 FIX: Add rate limiting to prevent credential stuffing)
router.post('/verify-token', rateLimitMiddleware, async (req, res) => {
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

// Import FluidFlow project from GitHub (supports private repos and restores metadata)
router.post('/import', rateLimitMiddleware, async (req, res) => {
  try {
    const { url, token, branch = 'backup/auto', name } = req.body;

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

    // Validate token if provided
    if (token && !isValidGitHubToken(token)) {
      return res.status(400).json({ error: 'Invalid GitHub token format' });
    }

    // Generate project ID
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    const projectPath = getProjectPath(id);
    const filesDir = getFilesDir(id);

    // Create project directory
    await fs.mkdir(projectPath, { recursive: true });

    // Prepare clone URL with token if provided (for private repos)
    let cloneUrl = url;
    if (token) {
      cloneUrl = url.replace('https://', `https://${token}@`);
    }

    // Clone repository
    const git: SimpleGit = simpleGit();

    // Clone specific branch if it exists, otherwise clone default
    try {
      await git.clone(cloneUrl, filesDir, ['--branch', branch, '--single-branch']);
    } catch {
      // If branch doesn't exist, clone default branch
      await git.clone(cloneUrl, filesDir);
    }

    // Remove token from remote URL for security
    if (token) {
      const gitInDir = simpleGit(filesDir);
      await gitInDir.remote(['set-url', 'origin', url]);
    }

    // Check for .fluidflow/ metadata and restore it
    const fluidflowDir = path.join(filesDir, '.fluidflow');
    let restoredMeta = null;
    let restoredContext = false;

    if (existsSync(fluidflowDir)) {
      // Restore project.json
      const backupProjectJson = path.join(fluidflowDir, 'project.json');
      if (existsSync(backupProjectJson)) {
        const backupMeta = await safeReadJson<Record<string, unknown> | null>(backupProjectJson, null);
        if (backupMeta) {
          // Update ID to new one but keep other metadata
          restoredMeta = {
            ...backupMeta,
            id,
            name: name || backupMeta.name || 'Imported Project',
            updatedAt: Date.now(),
            importedFrom: url,
            importedAt: Date.now()
          };
        }
      }

      // Restore context.json (conversation history)
      const backupContextJson = path.join(fluidflowDir, 'context.json');
      if (existsSync(backupContextJson)) {
        try {
          await fs.copyFile(backupContextJson, path.join(projectPath, 'context.json'));
          restoredContext = true;
        } catch {
          console.warn('Could not restore context.json');
        }
      }
    }

    // Create or use restored meta file
    const meta = restoredMeta || {
      id,
      name: name || url.split('/').pop()?.replace('.git', '') || 'Imported Project',
      description: `Imported from ${url}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      gitInitialized: true,
      githubRepo: url
    };

    await fs.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2));

    res.status(201).json({
      message: 'Project imported successfully',
      project: meta,
      restored: {
        metadata: !!restoredMeta,
        context: restoredContext
      }
    });
  } catch (error: unknown) {
    console.error('Import error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check for common error types
    if (message.includes('Authentication failed') || message.includes('401')) {
      return res.status(401).json({ error: 'Authentication failed. Check your GitHub token.' });
    }
    if (message.includes('not found') || message.includes('404')) {
      return res.status(404).json({ error: 'Repository not found. Check the URL or your access permissions.' });
    }

    res.status(500).json({ error: 'Failed to import repository' });
  }
});

// List user's GitHub repos (for import picker)
router.get('/repos', rateLimitMiddleware, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(400).json({ error: 'GitHub token required' });
    }

    if (!isValidGitHubToken(token)) {
      return res.status(400).json({ error: 'Invalid GitHub token format' });
    }

    // Fetch user's repos
    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch repositories' });
    }

    interface GitHubRepo {
      id: number;
      name: string;
      full_name: string;
      description: string | null;
      html_url: string;
      clone_url: string;
      private: boolean;
      updated_at: string;
      default_branch: string;
    }

    const repos: GitHubRepo[] = await response.json();

    // Check which repos have backup/auto branch (FluidFlow backups)
    const reposWithInfo = await Promise.all(
      repos.map(async (repo) => {
        let hasBackupBranch = false;
        try {
          const branchResponse = await fetch(
            `https://api.github.com/repos/${repo.full_name}/branches/backup/auto`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
              }
            }
          );
          hasBackupBranch = branchResponse.ok;
        } catch {
          // Ignore errors checking branch
        }

        return {
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          cloneUrl: repo.clone_url,
          private: repo.private,
          updatedAt: repo.updated_at,
          defaultBranch: repo.default_branch,
          hasFluidFlowBackup: hasBackupBranch
        };
      })
    );

    res.json({ repos: reposWithInfo });
  } catch (error) {
    console.error('List repos error:', error);
    res.status(500).json({ error: 'Failed to list repositories' });
  }
});

export { router as githubRouter };
