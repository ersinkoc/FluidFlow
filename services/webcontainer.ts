/**
 * WebContainer Service
 * Manages WebContainer API instance for in-browser Node.js runtime
 * Note: Auth is only needed for private npm packages. For public packages, just boot() works.
 */

import { WebContainer, FileSystemTree, WebContainerProcess } from '@webcontainer/api';
import type { FileSystem } from '@/types';
import type { WebContainerSettings } from '@/types';

export type WebContainerStatus =
  | 'idle'
  | 'initializing'
  | 'booting'
  | 'ready'
  | 'installing'
  | 'starting'
  | 'running'
  | 'error'
  | 'stopped'
  | 'syncing';

export interface WebContainerState {
  status: WebContainerStatus;
  error?: string;
  serverUrl?: string;
  logs: string[];
}

type StateListener = (state: WebContainerState) => void;

const STORAGE_KEY = 'fluidflow_webcontainer_settings';
const API_BASE = '/api/settings';

class WebContainerService {
  private instance: WebContainer | null = null;
  private bootPromise: Promise<WebContainer> | null = null;
  private serverProcess: WebContainerProcess | null = null;
  private state: WebContainerState = {
    status: 'idle',
    logs: [],
  };
  private listeners: Set<StateListener> = new Set();
  private settings: WebContainerSettings | null = null;
  private settingsLoaded = false;

  /**
   * Load settings from backend API (with localStorage cache)
   */
  async loadSettingsAsync(): Promise<WebContainerSettings | null> {
    try {
      const response = await fetch(`${API_BASE}/webcontainer`);
      if (response.ok) {
        const settings = await response.json();
        this.settings = settings;
        // Cache to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        this.settingsLoaded = true;
        return settings;
      }
    } catch (e) {
      console.error('[WebContainer] Failed to load settings from API:', e);
    }
    // Fallback to localStorage
    return this.loadSettingsFromCache();
  }

  /**
   * Load settings from localStorage cache (sync)
   */
  private loadSettingsFromCache(): WebContainerSettings | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.settings = JSON.parse(stored);
        return this.settings;
      }
    } catch (e) {
      console.error('[WebContainer] Failed to load settings from cache:', e);
    }
    return null;
  }

  /**
   * Save settings to backend API and localStorage
   */
  async saveSettings(settings: WebContainerSettings): Promise<void> {
    this.settings = settings;
    // Cache immediately
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

    try {
      await fetch(`${API_BASE}/webcontainer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } catch (e) {
      console.error('[WebContainer] Failed to save settings to API:', e);
    }
  }

  /**
   * Get current settings (sync - uses cache)
   */
  getSettings(): WebContainerSettings | null {
    if (!this.settings) {
      this.loadSettingsFromCache();
    }
    return this.settings;
  }

  /**
   * Initialize settings from backend (call on app start)
   */
  async initSettings(): Promise<void> {
    if (!this.settingsLoaded) {
      await this.loadSettingsAsync();
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update state and notify listeners
   */
  private updateState(partial: Partial<WebContainerState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener(this.state));
  }

  /**
   * Add log entry
   */
  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    this.updateState({
      logs: [...this.state.logs, logEntry],
    });
    console.log(`[WebContainer] ${message}`);
  }

  /**
   * Boot WebContainer instance
   * Note: No auth needed for public npm packages
   */
  async boot(): Promise<WebContainer> {
    // Return existing instance if already booted
    if (this.instance) {
      return this.instance;
    }

    // Return pending boot if in progress
    if (this.bootPromise) {
      return this.bootPromise;
    }

    this.updateState({ status: 'booting', error: undefined });
    this.log('Booting WebContainer...');

    this.bootPromise = WebContainer.boot({
      coep: 'credentialless', // More permissive than require-corp
    })
      .then((instance) => {
        this.instance = instance;
        this.updateState({ status: 'ready' });
        this.log('WebContainer booted successfully');
        return instance;
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Boot failed';
        this.updateState({ status: 'error', error: errorMessage });
        this.log(`Boot failed: ${errorMessage}`);
        this.bootPromise = null;
        throw error;
      });

    return this.bootPromise;
  }

  /**
   * Convert FileSystem to WebContainer FileSystemTree
   */
  private convertToFileSystemTree(files: FileSystem): FileSystemTree {
    const tree: FileSystemTree = {};

    for (const [path, content] of Object.entries(files)) {
      // Remove leading slash if present
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      const parts = normalizedPath.split('/');

      let current = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = { directory: {} };
        }
        const node = current[part];
        if ('directory' in node) {
          current = node.directory;
        }
      }

      const fileName = parts[parts.length - 1];
      current[fileName] = {
        file: { contents: content },
      };
    }

    return tree;
  }

  /**
   * Mount files to WebContainer
   */
  async mountFiles(files: FileSystem): Promise<void> {
    if (!this.instance) {
      throw new Error('WebContainer not booted');
    }

    this.log(`Mounting ${Object.keys(files).length} files...`);
    const tree = this.convertToFileSystemTree(files);
    await this.instance.mount(tree);
    this.log('Files mounted successfully');
  }

  /**
   * Spawn a process in WebContainer
   */
  async spawn(command: string, args: string[] = []): Promise<WebContainerProcess> {
    if (!this.instance) {
      throw new Error('WebContainer not booted');
    }

    this.log(`Spawning: ${command} ${args.join(' ')}`);
    return this.instance.spawn(command, args);
  }

  /**
   * Run npm install
   */
  async install(): Promise<boolean> {
    if (!this.instance) {
      throw new Error('WebContainer not booted');
    }

    this.updateState({ status: 'installing' });
    this.log('Running npm install...');

    const installProcess = await this.instance.spawn('npm', ['install']);

    // Stream output
    installProcess.output.pipeTo(
      new WritableStream({
        write: (data) => {
          this.log(data);
        },
      })
    );

    const exitCode = await installProcess.exit;
    if (exitCode !== 0) {
      this.updateState({ status: 'error', error: `npm install failed with code ${exitCode}` });
      this.log(`npm install failed with code ${exitCode}`);
      return false;
    }

    this.log('npm install completed successfully');
    return true;
  }

  /**
   * Start development server
   */
  async startDevServer(): Promise<string | null> {
    if (!this.instance) {
      throw new Error('WebContainer not booted');
    }

    this.updateState({ status: 'starting' });
    this.log('Starting dev server...');

    // Kill existing server if running
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }

    this.serverProcess = await this.instance.spawn('npm', ['run', 'dev']);

    // Stream output
    this.serverProcess.output.pipeTo(
      new WritableStream({
        write: (data) => {
          this.log(data);
        },
      })
    );

    // Wait for server to be ready
    return new Promise((resolve) => {
      const _unsubscribe = this.instance!.on('server-ready', (port, url) => {
        this.updateState({ status: 'running', serverUrl: url });
        this.log(`Dev server ready at ${url} (port ${port})`);
        resolve(url);
      });

      // Timeout after 60 seconds
      setTimeout(() => {
        if (this.state.status === 'starting') {
          this.updateState({ status: 'error', error: 'Dev server timeout' });
          this.log('Dev server start timeout');
          resolve(null);
        }
      }, 60000);
    });
  }

  /**
   * Stop dev server
   */
  async stopDevServer(): Promise<void> {
    if (this.serverProcess) {
      this.log('Stopping dev server...');
      this.serverProcess.kill();
      this.serverProcess = null;
      this.updateState({ status: 'ready', serverUrl: undefined });
      this.log('Dev server stopped');
    }
  }

  /**
   * Full startup: boot, mount files, install deps, start server
   */
  async start(files: FileSystem): Promise<string | null> {
    try {
      await this.boot();
      await this.mountFiles(files);

      const installed = await this.install();
      if (!installed) {
        return null;
      }

      return await this.startDevServer();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateState({ status: 'error', error: errorMessage });
      this.log(`Start failed: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Get current state
   */
  getState(): WebContainerState {
    return this.state;
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.updateState({ logs: [] });
  }

  /**
   * Destroy WebContainer instance
   */
  async destroy(): Promise<void> {
    await this.stopDevServer();

    if (this.instance) {
      this.instance.teardown();
      this.instance = null;
      this.bootPromise = null;
    }

    this.updateState({
      status: 'idle',
      error: undefined,
      serverUrl: undefined,
      logs: [],
    });
    this.log('WebContainer destroyed');
  }

  /**
   * Sync files to running WebContainer (without reinstalling)
   * Use this when files change (e.g., after commit, AI generation)
   */
  async syncFiles(files: FileSystem): Promise<void> {
    if (!this.instance) {
      this.log('Cannot sync: WebContainer not booted');
      return;
    }

    const previousStatus = this.state.status;
    this.updateState({ status: 'syncing' });
    this.log('Syncing files to WebContainer...');

    try {
      // Write each file individually to preserve existing node_modules
      for (const [filePath, content] of Object.entries(files)) {
        const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

        // Ensure directory exists
        const dirPath = normalizedPath.split('/').slice(0, -1).join('/');
        if (dirPath) {
          try {
            await this.instance.fs.mkdir(dirPath, { recursive: true });
          } catch {
            // Directory might already exist
          }
        }

        // Write file
        await this.instance.fs.writeFile(normalizedPath, content);
      }

      this.log(`Synced ${Object.keys(files).length} files`);

      // Restore previous status (running or ready)
      this.updateState({ status: previousStatus === 'running' ? 'running' : 'ready' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      this.updateState({ status: 'error', error: errorMessage });
      this.log(`Sync failed: ${errorMessage}`);
    }
  }

  /**
   * Check if WebContainer is running
   */
  isRunning(): boolean {
    return this.state.status === 'running';
  }

  /**
   * Check if WebContainer is booted (ready or running)
   */
  isBooted(): boolean {
    return this.instance !== null && ['ready', 'running', 'syncing'].includes(this.state.status);
  }
}

// Singleton instance
export const webContainerService = new WebContainerService();
