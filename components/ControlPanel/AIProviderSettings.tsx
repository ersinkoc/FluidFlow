import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Check, X, Loader2,
  ChevronDown, ChevronRight, Eye, EyeOff, RefreshCw,
  ExternalLink, AlertCircle, CheckCircle2, Pencil,
  Download
} from 'lucide-react';
import {
  ProviderConfig, ProviderType, DEFAULT_PROVIDERS, ModelOption,
  getProviderManager
} from '../../services/ai';
import { ProviderIcon } from '../shared/ProviderIcon';

interface AIProviderSettingsProps {
  onProviderChange?: (providerId: string, modelId: string) => void;
}

export const AIProviderSettings: React.FC<AIProviderSettingsProps> = ({ onProviderChange }) => {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>('');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { status: 'idle' | 'testing' | 'success' | 'error'; message?: string }>>({});
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderType, setNewProviderType] = useState<ProviderType>('openai');
  const [editingModels, setEditingModels] = useState<string | null>(null);
  const [showAddModel, setShowAddModel] = useState<string | null>(null);
  const [newModel, setNewModel] = useState<Partial<ModelOption>>({ id: '', name: '', description: '' });
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [customModelInput, setCustomModelInput] = useState<Record<string, string>>({});

  // Load providers on mount
  useEffect(() => {
    const manager = getProviderManager();
    setProviders(manager.getConfigs());
    setActiveProviderId(manager.getActiveProviderId());
  }, []);

  const _saveProviders = (newProviders: ProviderConfig[], newActiveId?: string) => {
    const manager = getProviderManager();
    newProviders.forEach(p => manager.addProvider(p));
    if (newActiveId) {
      manager.setActiveProvider(newActiveId);
      setActiveProviderId(newActiveId);
    }
    setProviders(manager.getConfigs());
  };

  const updateProvider = (id: string, updates: Partial<ProviderConfig>) => {
    const manager = getProviderManager();
    manager.updateProvider(id, updates);
    setProviders(manager.getConfigs());
  };

  const deleteProvider = (id: string) => {
    if (providers.length <= 1) return; // Keep at least one

    const manager = getProviderManager();
    manager.deleteProvider(id);
    setProviders(manager.getConfigs());
    setActiveProviderId(manager.getActiveProviderId());
  };

  const testConnection = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: { status: 'testing' } }));

    const manager = getProviderManager();
    const result = await manager.testProvider(id);

    setTestResults(prev => ({
      ...prev,
      [id]: {
        status: result.success ? 'success' : 'error',
        message: result.error
      }
    }));
  };

  const addProvider = () => {
    const defaults = DEFAULT_PROVIDERS[newProviderType];
    const newProvider: ProviderConfig = {
      id: `${newProviderType}-${Date.now()}`,
      ...defaults,
      apiKey: '',
    };

    const manager = getProviderManager();
    manager.addProvider(newProvider);
    setProviders(manager.getConfigs());
    setExpandedProvider(newProvider.id);
    setShowAddProvider(false);
  };

  const setActiveProvider = (id: string) => {
    const manager = getProviderManager();
    manager.setActiveProvider(id);
    setActiveProviderId(id);

    const config = manager.getConfig(id);
    if (config && onProviderChange) {
      onProviderChange(id, config.defaultModel);
    }
  };

  const addModel = (providerId: string) => {
    if (!newModel.id || !newModel.name) return;

    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const modelToAdd: ModelOption = {
      id: newModel.id,
      name: newModel.name,
      description: newModel.description || '',
      supportsVision: newModel.supportsVision || false,
      supportsStreaming: newModel.supportsStreaming !== false,
      contextWindow: newModel.contextWindow || 128000
    };

    updateProvider(providerId, {
      models: [...provider.models, modelToAdd]
    });

    setNewModel({ id: '', name: '', description: '' });
    setShowAddModel(null);
  };

  const updateModelInProvider = (providerId: string, modelId: string, updates: Partial<ModelOption>) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const updatedModels = provider.models.map(m =>
      m.id === modelId ? { ...m, ...updates } : m
    );

    updateProvider(providerId, { models: updatedModels });
  };

  const deleteModel = (providerId: string, modelId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider || provider.models.length <= 1) return;

    const updatedModels = provider.models.filter(m => m.id !== modelId);

    // If we're deleting the default model, set a new default
    const updates: Partial<ProviderConfig> = { models: updatedModels };
    if (provider.defaultModel === modelId) {
      updates.defaultModel = updatedModels[0].id;
    }

    updateProvider(providerId, updates);
  };

  // Fetch models from provider API (for local providers and OpenRouter)
  const fetchModels = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    setFetchingModels(prev => ({ ...prev, [providerId]: true }));

    try {
      const manager = getProviderManager();
      const providerInstance = manager.getProvider(providerId);

      if (providerInstance?.listModels) {
        const models = await providerInstance.listModels();
        if (models.length > 0) {
          // Merge with existing models, avoiding duplicates
          const existingIds = new Set(provider.models.map(m => m.id));
          const newModels = models.filter(m => !existingIds.has(m.id));
          const mergedModels = [...provider.models, ...newModels];

          updateProvider(providerId, {
            models: mergedModels,
            defaultModel: provider.defaultModel || mergedModels[0].id
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setFetchingModels(prev => ({ ...prev, [providerId]: false }));
    }
  };

  // Add custom model by name (for local providers)
  const addCustomModel = (providerId: string) => {
    const modelName = customModelInput[providerId]?.trim();
    if (!modelName) return;

    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    // Check if model already exists
    if (provider.models.some(m => m.id === modelName)) {
      setCustomModelInput(prev => ({ ...prev, [providerId]: '' }));
      return;
    }

    const newModelOption: ModelOption = {
      id: modelName,
      name: modelName,
      description: 'Custom model',
      supportsVision: false,
      supportsStreaming: true,
    };

    updateProvider(providerId, {
      models: [...provider.models, newModelOption],
      defaultModel: provider.defaultModel || modelName
    });

    setCustomModelInput(prev => ({ ...prev, [providerId]: '' }));
  };

  const activeConfig = providers.find(p => p.id === activeProviderId);

  return (
    <div className="space-y-4">
      {/* Active Provider Summary */}
      <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-white/5">
        <div className="flex items-center gap-2">
          {activeConfig && <ProviderIcon type={activeConfig.type} />}
          <div>
            <div className="text-sm font-medium text-white">{activeConfig?.name || 'No provider'}</div>
            <div className="text-[10px] text-slate-500">{activeConfig?.defaultModel}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeProviderId}
            onChange={(e) => setActiveProvider(e.target.value)}
            className="bg-slate-700 text-xs text-white rounded px-2 py-1 outline-none"
          >
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Provider List */}
      <div className="space-y-2">
        {providers.map(provider => {
          const isExpanded = expandedProvider === provider.id;
          const isActive = activeProviderId === provider.id;
          const testResult = testResults[provider.id];

          return (
            <div
              key={provider.id}
              className={`border rounded-lg overflow-hidden transition-colors ${
                isActive ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/5 bg-slate-800/30'
              }`}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                  <ProviderIcon type={provider.type} />
                  <span className="text-sm text-white">{provider.name}</span>
                  {provider.isLocal && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">LOCAL</span>
                  )}
                  {isActive && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">ACTIVE</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {testResult?.status === 'testing' && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                  {testResult?.status === 'success' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                  {testResult?.status === 'error' && <AlertCircle className="w-3 h-3 text-red-400" />}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-white/5 space-y-3">
                  {/* API Key */}
                  {!provider.isLocal && (
                    <div className="pt-3">
                      <label className="text-[10px] text-slate-500 uppercase tracking-wide">API Key</label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type={showApiKey[provider.id] ? 'text' : 'password'}
                          value={provider.apiKey || ''}
                          onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                          placeholder={`Enter your ${provider.name} API key`}
                          className="flex-1 px-2 py-1.5 bg-slate-900 border border-white/10 rounded text-xs text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
                        />
                        <button
                          onClick={() => setShowApiKey(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                          className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        >
                          {showApiKey[provider.id] ? <EyeOff className="w-3.5 h-3.5 text-slate-400" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Base URL */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wide">Base URL</label>
                    <input
                      type="text"
                      value={provider.baseUrl || ''}
                      onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                      placeholder="https://api.example.com"
                      className="w-full mt-1 px-2 py-1.5 bg-slate-900 border border-white/10 rounded text-xs text-white placeholder-slate-600 outline-none focus:border-blue-500/50 font-mono"
                    />
                  </div>

                  {/* Default Model */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-slate-500 uppercase tracking-wide">Default Model</label>
                      {/* Fetch Models button for local providers and OpenRouter */}
                      {(provider.isLocal || provider.type === 'openrouter') && (
                        <button
                          onClick={() => fetchModels(provider.id)}
                          disabled={fetchingModels[provider.id]}
                          className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors disabled:opacity-50"
                          title="Fetch available models from server"
                        >
                          {fetchingModels[provider.id] ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          ) : (
                            <Download className="w-2.5 h-2.5" />
                          )}
                          Fetch Models
                        </button>
                      )}
                    </div>
                    <select
                      value={provider.defaultModel}
                      onChange={(e) => updateProvider(provider.id, { defaultModel: e.target.value })}
                      className="w-full mt-1 px-2 py-1.5 bg-slate-900 border border-white/10 rounded text-xs text-white outline-none focus:border-blue-500/50"
                    >
                      {provider.models.map(m => (
                        <option key={m.id} value={m.id}>{m.name} - {m.description}</option>
                      ))}
                    </select>

                    {/* Custom Model Input for local providers */}
                    {provider.isLocal && (
                      <div className="mt-2">
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={customModelInput[provider.id] || ''}
                            onChange={(e) => setCustomModelInput(prev => ({ ...prev, [provider.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addCustomModel(provider.id)}
                            placeholder="Enter model name (e.g., llama3.2, mistral)"
                            className="flex-1 px-2 py-1.5 bg-slate-900 border border-white/10 rounded text-xs text-white placeholder-slate-600 outline-none focus:border-blue-500/50 font-mono"
                          />
                          <button
                            onClick={() => addCustomModel(provider.id)}
                            disabled={!customModelInput[provider.id]?.trim()}
                            className="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[10px] rounded transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-[9px] text-slate-500 mt-1">
                          Type model name and press Enter or click + to add
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Models List */}
                  <div className="pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] text-slate-500 uppercase tracking-wide">Models ({provider.models.length})</label>
                      <button
                        onClick={() => setEditingModels(editingModels === provider.id ? null : provider.id)}
                        className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors ${
                          editingModels === provider.id
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'hover:bg-white/10 text-slate-400'
                        }`}
                      >
                        <Pencil className="w-2.5 h-2.5" />
                        {editingModels === provider.id ? 'Done' : 'Edit'}
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {provider.models.map(model => (
                        <div
                          key={model.id}
                          className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                            provider.defaultModel === model.id
                              ? 'bg-blue-500/10 border-blue-500/30'
                              : 'bg-slate-900/50 border-white/5'
                          }`}
                        >
                          {editingModels === provider.id ? (
                            <div className="flex-1 space-y-1.5">
                              <div className="text-[9px] text-slate-500 font-mono px-1">{model.id}</div>
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  value={model.name}
                                  onChange={(e) => updateModelInProvider(provider.id, model.id, { name: e.target.value })}
                                  placeholder="Name"
                                  className="flex-1 px-1.5 py-0.5 bg-slate-800 border border-white/10 rounded text-[10px] text-white outline-none"
                                />
                                <input
                                  type="text"
                                  value={model.description || ''}
                                  onChange={(e) => updateModelInProvider(provider.id, model.id, { description: e.target.value })}
                                  placeholder="Description"
                                  className="flex-1 px-1.5 py-0.5 bg-slate-800 border border-white/10 rounded text-[10px] text-slate-400 outline-none"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] text-white truncate">{model.name}</div>
                              <div className="text-[9px] text-slate-500 font-mono truncate">{model.id}</div>
                            </div>
                          )}
                          <div className="flex items-center gap-1 ml-2">
                            {model.supportsVision && (
                              <span className="text-[8px] px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded">👁</span>
                            )}
                            {editingModels === provider.id && provider.models.length > 1 && (
                              <button
                                onClick={() => deleteModel(provider.id, model.id)}
                                className="p-1 hover:bg-red-500/20 rounded transition-colors"
                                title="Delete model"
                              >
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Model */}
                    {editingModels === provider.id && (
                      showAddModel === provider.id ? (
                        <div className="mt-2 p-2 bg-slate-800/50 rounded-lg border border-white/10 space-y-2">
                          <input
                            type="text"
                            value={newModel.id || ''}
                            onChange={(e) => setNewModel(prev => ({ ...prev, id: e.target.value }))}
                            placeholder="Model ID (e.g., gpt-4o)"
                            className="w-full px-2 py-1 bg-slate-900 border border-white/10 rounded text-[10px] text-white font-mono outline-none focus:border-blue-500/50"
                          />
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newModel.name || ''}
                              onChange={(e) => setNewModel(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Display Name"
                              className="flex-1 px-2 py-1 bg-slate-900 border border-white/10 rounded text-[10px] text-white outline-none focus:border-blue-500/50"
                            />
                            <input
                              type="text"
                              value={newModel.description || ''}
                              onChange={(e) => setNewModel(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Description"
                              className="flex-1 px-2 py-1 bg-slate-900 border border-white/10 rounded text-[10px] text-slate-400 outline-none focus:border-blue-500/50"
                            />
                          </div>
                          <div className="flex items-center gap-3 text-[10px]">
                            <label className="flex items-center gap-1 text-slate-400">
                              <input
                                type="checkbox"
                                checked={newModel.supportsVision || false}
                                onChange={(e) => setNewModel(prev => ({ ...prev, supportsVision: e.target.checked }))}
                                className="w-3 h-3 rounded"
                              />
                              Vision
                            </label>
                            <label className="flex items-center gap-1 text-slate-400">
                              <input
                                type="checkbox"
                                checked={newModel.supportsStreaming !== false}
                                onChange={(e) => setNewModel(prev => ({ ...prev, supportsStreaming: e.target.checked }))}
                                className="w-3 h-3 rounded"
                              />
                              Streaming
                            </label>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => addModel(provider.id)}
                              disabled={!newModel.id || !newModel.name}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[10px] rounded transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              Add
                            </button>
                            <button
                              onClick={() => {
                                setShowAddModel(null);
                                setNewModel({ id: '', name: '', description: '' });
                              }}
                              className="px-2 py-1 hover:bg-white/10 text-slate-400 text-[10px] rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowAddModel(provider.id)}
                          className="w-full mt-2 flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white text-[10px] rounded-lg border border-dashed border-white/10 hover:border-white/20 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add Model
                        </button>
                      )
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => testConnection(provider.id)}
                        disabled={testResult?.status === 'testing'}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded transition-colors"
                      >
                        {testResult?.status === 'testing' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Test Connection
                      </button>
                      {!isActive && (
                        <button
                          onClick={() => setActiveProvider(provider.id)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          Set Active
                        </button>
                      )}
                    </div>
                    {providers.length > 1 && (
                      <button
                        onClick={() => deleteProvider(provider.id)}
                        className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                        title="Delete provider"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </div>

                  {/* Test Result Message */}
                  {testResult?.message && (
                    <div className={`text-[10px] px-2 py-1 rounded ${
                      testResult.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                    }`}>
                      {testResult.status === 'error' ? testResult.message : 'Connection successful!'}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Provider */}
      {showAddProvider ? (
        <div className="p-3 bg-slate-800/50 rounded-lg border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white">Add Provider</span>
            <button onClick={() => setShowAddProvider(false)} className="p-1 hover:bg-white/10 rounded">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(DEFAULT_PROVIDERS) as [ProviderType, typeof DEFAULT_PROVIDERS.gemini][]).map(([type, config]) => (
              <button
                key={type}
                onClick={() => setNewProviderType(type)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                  newProviderType === type
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-white/5 hover:border-white/20 bg-slate-900/50'
                }`}
              >
                <ProviderIcon type={type} className="w-5 h-5" />
                <span className="text-[10px] text-slate-300">{config.name}</span>
              </button>
            ))}
          </div>
          <button
            onClick={addProvider}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add {DEFAULT_PROVIDERS[newProviderType].name}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddProvider(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white text-xs rounded-lg border border-dashed border-white/10 hover:border-white/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Provider
        </button>
      )}

      {/* Help Links */}
      <div className="pt-2 border-t border-white/5">
        <div className="text-[10px] text-slate-500 mb-2">Get API Keys:</div>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'Google AI', url: 'https://aistudio.google.com/apikey' },
            { name: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
            { name: 'Anthropic', url: 'https://console.anthropic.com/settings/keys' },
            { name: 'OpenRouter', url: 'https://openrouter.ai/keys' },
          ].map(link => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              {link.name}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
