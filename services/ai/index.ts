// AI Service - Provider Management
import { AIProvider, ProviderConfig, DEFAULT_PROVIDERS, GenerationRequest, GenerationResponse, StreamChunk } from './types';
import { GeminiProvider, OpenAIProvider, AnthropicProvider, OllamaProvider, LMStudioProvider, ZAIProvider, CerebrasProvider } from './providers';
import { settingsApi } from '../projectApi';
import { encryptProviderConfigs, decryptProviderConfigs } from '../../utils/clientEncryption';
import { debugLog } from '../../hooks/useDebugStore';

export * from './types';
export * from './providers';
export * from './utils/schemas';
export * from './utils/jsonOutput';

// Provider factory
export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.type) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'openai':
    case 'openrouter':
    case 'custom':
      // OpenAI-compatible API
      return new OpenAIProvider(config);
    case 'zai':
      // Z.AI GLM - special handling
      return new ZAIProvider(config);
    case 'cerebras':
      // Cerebras - ultra-fast inference
      return new CerebrasProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    case 'lmstudio':
      return new LMStudioProvider(config);
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

// Storage key for provider configurations (localStorage fallback)
const STORAGE_KEY = 'fluidflow_ai_providers';
const ACTIVE_PROVIDER_KEY = 'fluidflow_active_provider';

// Load saved providers from localStorage (fallback) - decrypts API keys
export async function loadProvidersFromLocalStorage(): Promise<ProviderConfig[]> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const providers = JSON.parse(saved) as ProviderConfig[];
      // Decrypt API keys
      return await decryptProviderConfigs(providers);
    }
  } catch (e) {
    console.error('Failed to load providers from localStorage:', e);
  }

  // SEC-004 fix: Return default Gemini config without embedded API key
  // Users must configure their API key through Settings UI
  // For development, backend seeds default provider from .env
  const defaultConfig: ProviderConfig = {
    id: 'default-gemini',
    ...DEFAULT_PROVIDERS.gemini,
    apiKey: '', // Key must be configured through settings
  };

  return [defaultConfig];
}

// Synchronous load for initial fast startup (may return encrypted keys that need async decryption)
export function loadProvidersFromLocalStorageSync(): ProviderConfig[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load providers from localStorage:', e);
  }

  // SEC-004 fix: Return default Gemini config without embedded API key
  // Users must configure their API key through Settings UI
  const defaultConfig: ProviderConfig = {
    id: 'default-gemini',
    ...DEFAULT_PROVIDERS.gemini,
    apiKey: '', // Key must be configured through settings
  };

  return [defaultConfig];
}

// Save providers to localStorage (fallback) - encrypts API keys
export async function saveProvidersToLocalStorage(providers: ProviderConfig[]): Promise<void> {
  try {
    // Encrypt API keys before saving
    const encryptedProviders = await encryptProviderConfigs(providers);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(encryptedProviders));
  } catch (e) {
    console.error('Failed to save providers to localStorage:', e);
  }
}

// Get active provider ID from localStorage
export function getActiveProviderIdFromLocalStorage(): string {
  return localStorage.getItem(ACTIVE_PROVIDER_KEY) || 'default-gemini';
}

// Set active provider ID in localStorage
export function setActiveProviderIdInLocalStorage(id: string): void {
  localStorage.setItem(ACTIVE_PROVIDER_KEY, id);
}

// Legacy exports for backwards compatibility (now async)
export const loadProviders = loadProvidersFromLocalStorage;
export const saveProviders = saveProvidersToLocalStorage;
export const getActiveProviderId = getActiveProviderIdFromLocalStorage;
export const setActiveProviderId = setActiveProviderIdInLocalStorage;
// Sync version for fast startup
export const loadProvidersSync = loadProvidersFromLocalStorageSync;

// Provider Manager class for easier state management
export class ProviderManager {
  private providers: Map<string, ProviderConfig> = new Map();
  private instances: Map<string, AIProvider> = new Map();
  private activeProviderId: string = '';
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  // Thread-safe save state
  private isSaving: boolean = false;
  private pendingSave: boolean = false;

  constructor() {
    // Load from localStorage immediately for fast startup (sync, may have encrypted keys)
    this.loadFromLocalStorageSync();
    // Then async load from backend to get latest (includes decryption)
    this.initPromise = this.initializeAsync();
  }

  private loadFromLocalStorageSync(): void {
    // Use sync version for immediate startup - keys may still be encrypted
    const configs = loadProvidersFromLocalStorageSync();
    configs.forEach(c => this.providers.set(c.id, c));
    this.activeProviderId = getActiveProviderIdFromLocalStorage();

    // Ensure active provider exists
    if (!this.providers.has(this.activeProviderId) && this.providers.size > 0) {
      this.activeProviderId = this.providers.keys().next().value || '';
    }
  }

  private async initializeAsync(): Promise<void> {
    // First decrypt localStorage keys
    await this.decryptLocalStorageKeys();
    // Then load from backend (which may override with fresh data)
    await this.loadFromBackend();
  }

  private async decryptLocalStorageKeys(): Promise<void> {
    try {
      // Reload with async decryption
      const decryptedConfigs = await loadProvidersFromLocalStorage();
      decryptedConfigs.forEach(c => this.providers.set(c.id, c));
    } catch (e) {
      console.warn('[AI] Failed to decrypt localStorage keys:', e);
    }
  }

  private async loadFromBackend(): Promise<void> {
    try {
      const { providers, activeId } = await settingsApi.getAIProviders();
      if (providers && providers.length > 0) {
        // Build new providers map without clearing existing first
        const newProviders = new Map<string, ProviderConfig>();

        // BUG FIX: Backend returns masked API keys (e.g., "AIza****B848") for security.
        // We need to preserve the real keys from localStorage/memory when backend sends masked ones.
        (providers as unknown as ProviderConfig[]).forEach((backendConfig) => {
          const existingConfig = this.providers.get(backendConfig.id);

          // Check if backend key is masked (contains ****)
          const isMaskedKey = backendConfig.apiKey && backendConfig.apiKey.includes('****');

          // If key is masked and we have an existing real key, preserve it
          if (isMaskedKey && existingConfig?.apiKey && !existingConfig.apiKey.includes('****')) {
            newProviders.set(backendConfig.id, {
              ...backendConfig,
              apiKey: existingConfig.apiKey, // Preserve real key from memory/localStorage
              defaultModel: existingConfig.defaultModel || backendConfig.defaultModel, // Preserve user's defaultModel selection
            });
          } else {
            // Always preserve existing defaultModel if it exists in the models list
            const models = backendConfig.models || [];
            const defaultModelId = existingConfig?.defaultModel && models.some(m => m.id === existingConfig.defaultModel)
              ? existingConfig.defaultModel
              : backendConfig.defaultModel;

            newProviders.set(backendConfig.id, {
              ...backendConfig,
              defaultModel: defaultModelId,
            });
          }
        });

        // Only clear instances for providers whose config changed (excluding masked key differences)
        for (const [id, oldConfig] of this.providers) {
          const newConfig = newProviders.get(id);
          if (!newConfig) {
            this.instances.delete(id);
          } else {
            // Compare configs without apiKey to avoid clearing on masked key differences
            const oldCompare = { ...oldConfig, apiKey: undefined };
            const newCompare = { ...newConfig, apiKey: undefined };
            if (JSON.stringify(oldCompare) !== JSON.stringify(newCompare)) {
              this.instances.delete(id);
            }
            // Also clear if apiKey actually changed (not just masking)
            if (oldConfig.apiKey !== newConfig.apiKey &&
                !oldConfig.apiKey?.includes('****') &&
                !newConfig.apiKey?.includes('****')) {
              this.instances.delete(id);
            }
          }
        }

        // Remove instances for deleted providers
        for (const id of this.instances.keys()) {
          if (!newProviders.has(id)) {
            this.instances.delete(id);
          }
        }

        // Atomically swap the providers map
        this.providers = newProviders;
        this.activeProviderId = activeId || this.activeProviderId;

        // Sync to localStorage with real keys preserved (also needs cast)
        saveProvidersToLocalStorage(Array.from(newProviders.values()));
        setActiveProviderIdInLocalStorage(this.activeProviderId);

        console.log('[AI] Loaded providers from backend:', providers.length);
      }
    } catch (_e) {
      console.log('[AI] Backend not available, using localStorage');
    }
    this.isInitialized = true;
  }

  // Wait for initialization (useful for ensuring backend data is loaded)
  async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private save(): void {
    // Save to localStorage (async encryption, but do not await)
    saveProvidersToLocalStorage(Array.from(this.providers.values()))
      .catch(e => console.warn('[AI] Failed to save to localStorage:', e));
    setActiveProviderIdInLocalStorage(this.activeProviderId);

    // Async save to backend
    this.saveToBackend();
  }

  private async saveToBackend(): Promise<void> {
    // If already saving, mark pending and return
    if (this.isSaving) {
      this.pendingSave = true;
      console.log('[AI] Save queued (another save in progress)');
      return;
    }

    this.isSaving = true;

    try {
      // Cast to storage type for API call
      const providers = Array.from(this.providers.values()) as unknown as import('../projectApi').StoredProviderConfig[];
      await settingsApi.saveAIProviders(providers, this.activeProviderId);
      console.log('[AI] Saved providers to backend');
    } catch (e) {
      console.warn('[AI] Failed to save providers to backend:', e);
    } finally {
      this.isSaving = false;
      // Process any queued save
      if (this.pendingSave) {
        this.pendingSave = false;
        // Use setTimeout to avoid stack overflow on rapid saves
        setTimeout(() => this.saveToBackend(), 0);
      }
    }
  }

  getConfigs(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  getConfig(id: string): ProviderConfig | undefined {
    return this.providers.get(id);
  }

  getActiveConfig(): ProviderConfig | undefined {
    return this.providers.get(this.activeProviderId);
  }

  getActiveProviderId(): string {
    return this.activeProviderId;
  }

  // AI-007 fix: Wait for init before modifications to prevent race conditions
  async setActiveProvider(id: string): Promise<void> {
    await this.waitForInit();
    if (this.providers.has(id)) {
      this.activeProviderId = id;
      this.save();
    }
  }

  async addProvider(config: ProviderConfig): Promise<void> {
    await this.waitForInit();
    this.providers.set(config.id, config);
    this.instances.delete(config.id); // Clear cached instance
    this.save();
  }

  async updateProvider(id: string, updates: Partial<ProviderConfig>): Promise<void> {
    await this.waitForInit();
    const existing = this.providers.get(id);
    if (existing) {
      this.providers.set(id, { ...existing, ...updates });
      this.instances.delete(id);
      this.save();
    }
  }

  async deleteProvider(id: string): Promise<void> {
    await this.waitForInit();
    this.providers.delete(id);
    this.instances.delete(id);

    // Switch to another provider if active was deleted
    if (this.activeProviderId === id) {
      const firstId = this.providers.keys().next().value;
      this.activeProviderId = firstId || '';
    }

    this.save();
  }

  getProvider(id?: string): AIProvider | null {
    const targetId = id || this.activeProviderId;
    const config = this.providers.get(targetId);
    if (!config) return null;

    // Return cached instance or create new one
    let instance = this.instances.get(targetId);
    if (!instance) {
      instance = createProvider(config);
      this.instances.set(targetId, instance);
    }

    return instance;
  }

  async testProvider(id: string): Promise<{ success: boolean; error?: string }> {
    const provider = this.getProvider(id);
    if (!provider) return { success: false, error: 'Provider not found' };
    return provider.testConnection();
  }

  // Convenience method for generation (with debug logging)
  async generate(request: GenerationRequest, modelId?: string): Promise<GenerationResponse> {
    const provider = this.getProvider();
    if (!provider) throw new Error('No active provider');

    const config = this.getActiveConfig();
    const model = modelId || config?.defaultModel || '';
    const category = request.debugCategory || 'generation';
    const startTime = Date.now();

    // Log request
    const requestId = debugLog.request(category, {
      prompt: request.prompt,
      systemInstruction: request.systemInstruction,
      model,
      provider: config?.name,
      attachments: request.images?.map(img => ({
        type: img.mimeType,
        size: Math.ceil(img.data.length * 0.75), // Base64 to bytes approximation
      })),
      metadata: {
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        responseFormat: request.responseFormat,
      },
    });

    try {
      const response = await provider.generate(request, model);

      // Log response
      debugLog.response(category, {
        id: `${requestId}-response`,
        response: response.text,
        model,
        provider: config?.name,
        duration: Date.now() - startTime,
        tokenCount: response.usage ? {
          input: response.usage.inputTokens,
          output: response.usage.outputTokens,
          isEstimated: response.usage.isEstimated,
        } : undefined,
      });

      return response;
    } catch (error) {
      // Log error
      debugLog.error(category, error instanceof Error ? error.message : String(error), {
        id: `${requestId}-error`,
        model,
        provider: config?.name,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  // Streaming generation with debug logging (stream entry updated in-place)
  async generateStream(
    request: GenerationRequest,
    onChunk: (chunk: StreamChunk) => void,
    modelId?: string
  ): Promise<GenerationResponse> {
    const provider = this.getProvider();
    if (!provider) throw new Error('No active provider');

    const config = this.getActiveConfig();
    const model = modelId || config?.defaultModel || '';
    const category = request.debugCategory || 'generation';
    const startTime = Date.now();

    // Log request
    const requestId = debugLog.request(category, {
      prompt: request.prompt,
      systemInstruction: request.systemInstruction,
      model,
      provider: config?.name,
      attachments: request.images?.map(img => ({
        type: img.mimeType,
        size: Math.ceil(img.data.length * 0.75),
      })),
      metadata: {
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        responseFormat: request.responseFormat,
        streaming: true,
      },
    });

    // Create stream entry that will be updated
    const streamId = `${requestId}-stream`;
    let streamedText = '';
    let chunkCount = 0;

    debugLog.stream(category, {
      id: streamId,
      model,
      provider: config?.name,
      response: '',
      streamProgress: {
        chars: 0,
        chunks: 0,
        isComplete: false,
      },
    });

    // Wrap onChunk to update stream log
    const wrappedOnChunk = (chunk: StreamChunk) => {
      if (chunk.text) {
        streamedText += chunk.text;
        chunkCount++;

        // Update stream log (debounced internally)
        debugLog.streamUpdate(streamId, {
          response: streamedText,
          streamProgress: {
            chars: streamedText.length,
            chunks: chunkCount,
            isComplete: chunk.done,
          },
        }, chunk.done); // notifyNow when complete
      }
      // Forward to original callback
      onChunk(chunk);
    };

    try {
      const response = await provider.generateStream(request, model, wrappedOnChunk);

      // Final update with complete status
      debugLog.streamUpdate(streamId, {
        response: response.text,
        duration: Date.now() - startTime,
        tokenCount: response.usage ? {
          input: response.usage.inputTokens,
          output: response.usage.outputTokens,
          isEstimated: response.usage.isEstimated,
        } : undefined,
        streamProgress: {
          chars: response.text.length,
          chunks: chunkCount,
          isComplete: true,
        },
      }, true); // Immediate update

      return response;
    } catch (error) {
      // Log error
      debugLog.error(category, error instanceof Error ? error.message : String(error), {
        id: `${requestId}-error`,
        model,
        provider: config?.name,
        duration: Date.now() - startTime,
        response: streamedText, // Include partial response
        streamProgress: {
          chars: streamedText.length,
          chunks: chunkCount,
          isComplete: false,
        },
      });
      throw error;
    }
  }
}

// Singleton instance
let providerManagerInstance: ProviderManager | null = null;

export function getProviderManager(): ProviderManager {
  if (!providerManagerInstance) {
    providerManagerInstance = new ProviderManager();
  }
  return providerManagerInstance;
}
