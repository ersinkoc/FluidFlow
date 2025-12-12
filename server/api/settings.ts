import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { safeJsonParse, safeJsonStringify } from '../../utils/safeJson';
import { encryptProviderConfig, decryptProviderConfig } from '../utils/encryption';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Settings directory (separate from projects) - use process.cwd() for reliability
const SETTINGS_DIR = path.join(process.cwd(), 'settings');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'global.json');

// Ensure settings dir exists
if (!existsSync(SETTINGS_DIR)) {
  mkdirSync(SETTINGS_DIR, { recursive: true });
}

// SET-001/SET-002 fix: Validation constants for settings
const MAX_PROVIDERS = 50;
const MAX_SNIPPETS = 200;
const MAX_SNIPPET_CODE_LENGTH = 100000; // 100KB per snippet
const MAX_SNIPPET_NAME_LENGTH = 200;
const MAX_PROVIDER_NAME_LENGTH = 100;

// SET-001 fix: Validate custom snippet structure
function isValidSnippet(snippet: unknown): snippet is { name: string; code: string; category?: string } {
  if (!snippet || typeof snippet !== 'object') return false;
  const s = snippet as Record<string, unknown>;

  // Required fields with type checks
  if (typeof s.name !== 'string' || s.name.length === 0 || s.name.length > MAX_SNIPPET_NAME_LENGTH) return false;
  if (typeof s.code !== 'string' || s.code.length > MAX_SNIPPET_CODE_LENGTH) return false;

  // Optional category must be a string if present
  if (s.category !== undefined && typeof s.category !== 'string') return false;

  // Check for XSS/injection in name (basic check)
  if (/<script|javascript:|on\w+=/i.test(s.name)) return false;

  return true;
}

// SET-002 fix: Validate array sizes
function validateArraySizes(settings: Partial<GlobalSettings>): { valid: boolean; error?: string } {
  if (settings.aiProviders && settings.aiProviders.length > MAX_PROVIDERS) {
    return { valid: false, error: `Too many providers (max ${MAX_PROVIDERS})` };
  }
  if (settings.customSnippets && settings.customSnippets.length > MAX_SNIPPETS) {
    return { valid: false, error: `Too many snippets (max ${MAX_SNIPPETS})` };
  }
  return { valid: true };
}

// Global settings structure
interface ProviderConfig {
  id: string;
  name: string;
  type: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  models?: string[];
  isLocal?: boolean;
}

interface CustomSnippet {
  id: string;
  name: string;
  code: string;
  category: string;
  createdAt: number;
}

interface WebContainerSettings {
  enabled: boolean;
  clientId: string;
  scope: string;
}

interface GlobalSettings {
  // AI Provider settings
  aiProviders: ProviderConfig[];
  activeProviderId: string;

  // Custom code snippets
  customSnippets: CustomSnippet[];

  // WebContainer settings
  webContainer: WebContainerSettings;

  // Metadata
  updatedAt: number;
}

const DEFAULT_WEBCONTAINER_SETTINGS: WebContainerSettings = {
  enabled: false,
  clientId: '',
  scope: '',
};

const DEFAULT_SETTINGS: GlobalSettings = {
  aiProviders: [],
  activeProviderId: 'default-gemini',
  customSnippets: [],
  webContainer: DEFAULT_WEBCONTAINER_SETTINGS,
  updatedAt: 0
};

// SEC-004 fix: Initialize default provider from .env for development convenience
// This runs once on server startup if no providers are configured
async function initializeDefaultProvider(): Promise<void> {
  try {
    // Check if settings file exists
    if (existsSync(SETTINGS_FILE)) {
      const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
      const settings = safeJsonParse(data, {}) as GlobalSettings;
      // If providers already configured, don't overwrite
      if (settings.aiProviders && settings.aiProviders.length > 0) {
        return;
      }
    }

    // Check for GEMINI_API_KEY in environment
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.log('[Settings] No GEMINI_API_KEY found in .env - users must configure via Settings UI');
      return;
    }

    // Create default provider with key from .env
    const defaultProvider: ProviderConfig = {
      id: 'default-gemini',
      name: 'Google Gemini',
      type: 'gemini',
      apiKey: geminiKey,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      defaultModel: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-pro'],
    };

    // Encrypt and save
    const encryptedProvider = await encryptProviderConfig(defaultProvider);
    const settings: GlobalSettings = {
      ...DEFAULT_SETTINGS,
      aiProviders: [encryptedProvider],
      activeProviderId: 'default-gemini',
      updatedAt: Date.now(),
    };

    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    console.log('[Settings] Initialized default Gemini provider from GEMINI_API_KEY');
  } catch (error) {
    console.error('[Settings] Failed to initialize default provider:', error);
  }
}

// Run initialization on module load
initializeDefaultProvider();

// BUG-008 fix: Proper mutex pattern to prevent TOCTOU race condition
// Using a queue-based approach where each request waits for the previous one
let settingsLockQueue: Promise<void> = Promise.resolve();

async function withSettingsLock<T>(fn: () => Promise<T>): Promise<T> {
  // Each call chains onto the previous lock, ensuring sequential execution
  // This eliminates the TOCTOU race between checking and acquiring the lock
  let releaseLock: () => void;
  const myLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  // Chain our lock onto the queue - wait for all previous operations
  const previousLock = settingsLockQueue;
  settingsLockQueue = myLock;

  try {
    // Wait for the previous operation to complete
    await previousLock;
    // Now execute our function
    return await fn();
  } finally {
    // Release our lock so the next operation can proceed
    releaseLock!();
  }
}

// Helper to load settings (decrypts API keys)
async function loadSettings(): Promise<GlobalSettings> {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
      const settings = { ...DEFAULT_SETTINGS, ...safeJsonParse(data, {}) } as GlobalSettings;

      // Decrypt API keys in provider configs
      if (settings.aiProviders && settings.aiProviders.length > 0) {
        settings.aiProviders = await Promise.all(
          settings.aiProviders.map(provider => decryptProviderConfig(provider))
        );
      }

      return settings;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

// Helper to save settings (encrypts API keys)
async function saveSettings(settings: GlobalSettings): Promise<void> {
  settings.updatedAt = Date.now();

  // Create a copy with encrypted API keys
  const settingsToSave = { ...settings };
  if (settingsToSave.aiProviders && settingsToSave.aiProviders.length > 0) {
    settingsToSave.aiProviders = await Promise.all(
      settingsToSave.aiProviders.map(provider => encryptProviderConfig(provider))
    );
  }

  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settingsToSave, null, 2));
}

// ============ SETTINGS API ============

// Get all settings
router.get('/', async (req, res) => {
  try {
    const settings = await loadSettings();
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update all settings
router.put('/', async (req, res) => {
  try {
    const { aiProviders, activeProviderId, customSnippets } = req.body;

    // SET-002 fix: Validate array sizes
    const sizeValidation = validateArraySizes({ aiProviders, customSnippets });
    if (!sizeValidation.valid) {
      return res.status(400).json({ error: sizeValidation.error });
    }

    // SET-001 fix: Validate snippets if provided
    if (customSnippets !== undefined && Array.isArray(customSnippets)) {
      for (const snippet of customSnippets) {
        if (!isValidSnippet(snippet)) {
          return res.status(400).json({
            error: 'Invalid snippet',
            details: `Each snippet must have name (max ${MAX_SNIPPET_NAME_LENGTH} chars) and code (max ${MAX_SNIPPET_CODE_LENGTH} chars)`
          });
        }
      }
    }

    // Validate providers if provided
    if (aiProviders !== undefined && Array.isArray(aiProviders)) {
      for (const provider of aiProviders) {
        if (!provider || typeof provider !== 'object') {
          return res.status(400).json({ error: 'Invalid provider configuration' });
        }
        if (typeof provider.name === 'string' && provider.name.length > MAX_PROVIDER_NAME_LENGTH) {
          return res.status(400).json({ error: `Provider name too long (max ${MAX_PROVIDER_NAME_LENGTH} chars)` });
        }
      }
    }

    const updatedAt = await withSettingsLock(async () => {
      const settings = await loadSettings();

      if (aiProviders !== undefined) settings.aiProviders = aiProviders;
      if (activeProviderId !== undefined) settings.activeProviderId = activeProviderId;
      if (customSnippets !== undefined) settings.customSnippets = customSnippets;

      await saveSettings(settings);
      return settings.updatedAt;
    });

    res.json({ message: 'Settings saved', updatedAt });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ============ AI PROVIDERS ============

// Get AI providers
router.get('/ai-providers', async (req, res) => {
  try {
    const settings = await loadSettings();
    res.json({
      providers: settings.aiProviders,
      activeId: settings.activeProviderId
    });
  } catch (error) {
    console.error('Get AI providers error:', error);
    res.status(500).json({ error: 'Failed to get AI providers' });
  }
});

// Save AI providers
router.put('/ai-providers', async (req, res) => {
  try {
    const { providers, activeId } = req.body;

    // SET-002 fix: Validate providers array size
    if (providers !== undefined) {
      if (!Array.isArray(providers)) {
        return res.status(400).json({ error: 'Providers must be an array' });
      }
      if (providers.length > MAX_PROVIDERS) {
        return res.status(400).json({ error: `Too many providers (max ${MAX_PROVIDERS})` });
      }
      // Validate each provider
      for (const provider of providers) {
        if (!provider || typeof provider !== 'object') {
          return res.status(400).json({ error: 'Invalid provider configuration' });
        }
        if (typeof provider.name === 'string' && provider.name.length > MAX_PROVIDER_NAME_LENGTH) {
          return res.status(400).json({ error: `Provider name too long (max ${MAX_PROVIDER_NAME_LENGTH} chars)` });
        }
      }
    }

    const updatedAt = await withSettingsLock(async () => {
      const settings = await loadSettings();

      if (providers !== undefined) settings.aiProviders = providers;
      if (activeId !== undefined) settings.activeProviderId = activeId;

      await saveSettings(settings);
      return settings.updatedAt;
    });

    res.json({ message: 'AI providers saved', updatedAt });
  } catch (error) {
    console.error('Save AI providers error:', error);
    res.status(500).json({ error: 'Failed to save AI providers' });
  }
});

// ============ CUSTOM SNIPPETS ============

// Get custom snippets
router.get('/snippets', async (req, res) => {
  try {
    const settings = await loadSettings();
    res.json(settings.customSnippets);
  } catch (error) {
    console.error('Get snippets error:', error);
    res.status(500).json({ error: 'Failed to get snippets' });
  }
});

// Save custom snippets
router.put('/snippets', async (req, res) => {
  try {
    const { snippets } = req.body;

    // SET-001/SET-002 fix: Validate snippets array
    if (snippets !== undefined) {
      if (!Array.isArray(snippets)) {
        return res.status(400).json({ error: 'Snippets must be an array' });
      }
      if (snippets.length > MAX_SNIPPETS) {
        return res.status(400).json({ error: `Too many snippets (max ${MAX_SNIPPETS})` });
      }
      // Validate each snippet
      for (const snippet of snippets) {
        if (!isValidSnippet(snippet)) {
          return res.status(400).json({
            error: 'Invalid snippet in array',
            details: `Each snippet must have name (max ${MAX_SNIPPET_NAME_LENGTH} chars) and code (max ${MAX_SNIPPET_CODE_LENGTH} chars)`
          });
        }
      }
    }

    const updatedAt = await withSettingsLock(async () => {
      const settings = await loadSettings();
      settings.customSnippets = snippets || [];
      await saveSettings(settings);
      return settings.updatedAt;
    });

    res.json({ message: 'Snippets saved', updatedAt });
  } catch (error) {
    console.error('Save snippets error:', error);
    res.status(500).json({ error: 'Failed to save snippets' });
  }
});

// Add single snippet
router.post('/snippets', async (req, res) => {
  try {
    const { name, code, category } = req.body;

    // SET-001 fix: Validate snippet structure
    if (!isValidSnippet({ name, code, category })) {
      return res.status(400).json({
        error: 'Invalid snippet',
        details: `Name (max ${MAX_SNIPPET_NAME_LENGTH} chars) and code (max ${MAX_SNIPPET_CODE_LENGTH} chars) are required`
      });
    }

    const newSnippet = await withSettingsLock(async () => {
      const settings = await loadSettings();

      // SET-002 fix: Check array size limit
      if (settings.customSnippets.length >= MAX_SNIPPETS) {
        throw new Error(`Maximum snippets limit reached (${MAX_SNIPPETS})`);
      }

      const snippet: CustomSnippet = {
        id: `custom-${Date.now()}`,
        name,
        code,
        category: category || 'Custom',
        createdAt: Date.now()
      };

      settings.customSnippets.push(snippet);
      await saveSettings(settings);
      return snippet;
    });

    res.status(201).json(newSnippet);
  } catch (error: any) {
    console.error('Add snippet error:', error);
    res.status(error.message?.includes('limit') ? 400 : 500).json({ error: error.message || 'Failed to add snippet' });
  }
});

// Delete snippet
router.delete('/snippets/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await withSettingsLock(async () => {
      const settings = await loadSettings();
      settings.customSnippets = settings.customSnippets.filter(s => s.id !== id);
      await saveSettings(settings);
    });

    res.json({ message: 'Snippet deleted' });
  } catch (error) {
    console.error('Delete snippet error:', error);
    res.status(500).json({ error: 'Failed to delete snippet' });
  }
});

// ============ WEBCONTAINER SETTINGS ============

// Get WebContainer settings
router.get('/webcontainer', async (req, res) => {
  try {
    const settings = await loadSettings();
    res.json(settings.webContainer || DEFAULT_WEBCONTAINER_SETTINGS);
  } catch (error) {
    console.error('Get WebContainer settings error:', error);
    res.status(500).json({ error: 'Failed to get WebContainer settings' });
  }
});

// Save WebContainer settings
router.put('/webcontainer', async (req, res) => {
  try {
    const { enabled, clientId, scope } = req.body;

    const updatedAt = await withSettingsLock(async () => {
      const settings = await loadSettings();

      settings.webContainer = {
        enabled: enabled ?? settings.webContainer?.enabled ?? false,
        clientId: clientId ?? settings.webContainer?.clientId ?? '',
        scope: scope ?? settings.webContainer?.scope ?? '',
      };

      await saveSettings(settings);
      return settings.updatedAt;
    });

    res.json({ message: 'WebContainer settings saved', updatedAt });
  } catch (error) {
    console.error('Save WebContainer settings error:', error);
    res.status(500).json({ error: 'Failed to save WebContainer settings' });
  }
});

export { router as settingsRouter };
