import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderManager, loadProvidersFromLocalStorage, saveProvidersToLocalStorage, getActiveProviderIdFromLocalStorage, setActiveProviderIdInLocalStorage, getProviderManager } from '../../services/ai';
import type { ProviderConfig } from '../../services/ai';

describe('ProviderManager', () => {
  let manager: InstanceType<typeof ProviderManager>;

  beforeEach(() => {
    localStorage.clear();
    manager = new ProviderManager();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('LocalStorage functions', () => {
    it('should load providers from localStorage', async () => {
      const providers: ProviderConfig[] = [
        {
          id: 'test-1',
          type: 'gemini',
          name: 'Test Provider',
          baseUrl: 'https://test.com',
          apiKey: 'test-key',
          models: [{ id: 'model-1', name: 'Model 1', description: 'Test', supportsVision: true, supportsStreaming: true }],
          defaultModel: 'model-1'
        }
      ];

      await saveProvidersToLocalStorage(providers);
      const loaded = await loadProvidersFromLocalStorage();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('test-1');
    });

    it('should return default provider when localStorage is empty', async () => {
      const loaded = await loadProvidersFromLocalStorage();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].type).toBe('gemini');
    });

    it('should save and load active provider ID', () => {
      setActiveProviderIdInLocalStorage('test-provider');
      const activeId = getActiveProviderIdFromLocalStorage();
      expect(activeId).toBe('test-provider');
    });

    it('should return default active provider ID when not set', () => {
      const activeId = getActiveProviderIdFromLocalStorage();
      expect(activeId).toBe('default-gemini');
    });
  });

  describe('ProviderManager instance', () => {
    it('should get configs', () => {
      const configs = manager.getConfigs();
      expect(Array.isArray(configs)).toBe(true);
    });

    it('should get active provider ID', () => {
      const id = manager.getActiveProviderId();
      expect(typeof id).toBe('string');
    });

    it('should get active config', () => {
      const config = manager.getActiveConfig();
      if (config) {
        expect(config).toHaveProperty('id');
        expect(config).toHaveProperty('type');
      }
    });
  });

  describe('Provider operations', () => {
    it('should add provider', async () => {
      const newProvider: ProviderConfig = {
        id: 'test-new',
        type: 'openai',
        name: 'New Provider',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
        models: [{ id: 'gpt-4', name: 'GPT-4', description: 'Test', supportsVision: true, supportsStreaming: true }],
        defaultModel: 'gpt-4'
      };

      await manager.addProvider(newProvider);
      const configs = manager.getConfigs();
      const found = configs.find(c => c.id === 'test-new');
      expect(found).toBeDefined();
    });

    it('should update provider', async () => {
      const newProvider: ProviderConfig = {
        id: 'test-update',
        type: 'openai',
        name: 'Update Test',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
        models: [{ id: 'gpt-4', name: 'GPT-4', description: 'Test', supportsVision: true, supportsStreaming: true }],
        defaultModel: 'gpt-4'
      };

      await manager.addProvider(newProvider);
      await manager.updateProvider('test-update', { name: 'Updated Name' });

      const config = manager.getConfig('test-update');
      expect(config?.name).toBe('Updated Name');
    });

    it('should delete provider', async () => {
      const newProvider: ProviderConfig = {
        id: 'test-delete',
        type: 'openai',
        name: 'Delete Test',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
        models: [{ id: 'gpt-4', name: 'GPT-4', description: 'Test', supportsVision: true, supportsStreaming: true }],
        defaultModel: 'gpt-4'
      };

      await manager.addProvider(newProvider);
      await manager.deleteProvider('test-delete');

      const config = manager.getConfig('test-delete');
      expect(config).toBeUndefined();
    });
  });

  describe('getProviderManager singleton', () => {
    it('should return same instance', () => {
      const instance1 = getProviderManager();
      const instance2 = getProviderManager();
      expect(instance1).toBe(instance2);
    });
  });
});
