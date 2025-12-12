import React, { useState, useEffect } from 'react';
import {
  X, Plus, Trash2, Check, Loader2, Server, Settings2,
  Eye, EyeOff, RefreshCw,
  ExternalLink, AlertCircle, CheckCircle2, Pencil, Download,
  Zap, Key, Link2
} from 'lucide-react';
import {
  ProviderConfig, ProviderType, DEFAULT_PROVIDERS, ModelOption,
  getProviderManager
} from '../services/ai';
import { ProviderIcon } from './shared/ProviderIcon';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProviderChange?: (providerId: string, modelId: string) => void;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({ isOpen, onClose, onProviderChange }) => {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>('');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { status: 'idle' | 'testing' | 'success' | 'error'; message?: string }>>({});
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderType, setNewProviderType] = useState<ProviderType>('openai');
  const [editingModels, setEditingModels] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModel, setNewModel] = useState<Partial<ModelOption>>({ id: '', name: '', description: '' });
  const [fetchingModels, setFetchingModels] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');

  // Load providers on mount
  useEffect(() => {
    if (isOpen) {
      const manager = getProviderManager();
      setProviders(manager.getConfigs());
      const activeId = manager.getActiveProviderId();
      setActiveProviderId(activeId);
      setSelectedProviderId(activeId);
    }
  }, [isOpen]);

  const selectedProvider = providers.find(p => p.id === selectedProviderId);

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
    if (providers.length <= 1) return;
    const manager = getProviderManager();
    manager.deleteProvider(id);
    setProviders(manager.getConfigs());
    const newActiveId = manager.getActiveProviderId();
    setActiveProviderId(newActiveId);
    if (selectedProviderId === id) {
      setSelectedProviderId(newActiveId);
    }
  };

  const testConnection = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: { status: 'testing' } }));
    const manager = getProviderManager();
    const result = await manager.testProvider(id);
    setTestResults(prev => ({
      ...prev,
      [id]: { status: result.success ? 'success' : 'error', message: result.error }
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
    setSelectedProviderId(newProvider.id);
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

  const addModel = () => {
    if (!newModel.id || !newModel.name || !selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return;

    const modelToAdd: ModelOption = {
      id: newModel.id,
      name: newModel.name,
      description: newModel.description || '',
      supportsVision: newModel.supportsVision || false,
      supportsStreaming: newModel.supportsStreaming !== false,
      contextWindow: newModel.contextWindow || 128000
    };

    updateProvider(selectedProviderId, { models: [...provider.models, modelToAdd] });
    setNewModel({ id: '', name: '', description: '' });
    setShowAddModel(false);
  };

  const updateModelInProvider = (modelId: string, updates: Partial<ModelOption>) => {
    if (!selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return;
    const updatedModels = provider.models.map(m => m.id === modelId ? { ...m, ...updates } : m);
    updateProvider(selectedProviderId, { models: updatedModels });
  };

  const deleteModel = (modelId: string) => {
    if (!selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider || provider.models.length <= 1) return;
    const updatedModels = provider.models.filter(m => m.id !== modelId);
    const updates: Partial<ProviderConfig> = { models: updatedModels };
    if (provider.defaultModel === modelId) {
      updates.defaultModel = updatedModels[0].id;
    }
    updateProvider(selectedProviderId, updates);
  };

  const fetchModels = async () => {
    if (!selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return;

    setFetchingModels(true);
    try {
      const manager = getProviderManager();
      const providerInstance = manager.getProvider(selectedProviderId);
      if (providerInstance?.listModels) {
        const models = await providerInstance.listModels();
        if (models.length > 0) {
          const existingIds = new Set(provider.models.map(m => m.id));
          const newModels = models.filter(m => !existingIds.has(m.id));
          const mergedModels = [...provider.models, ...newModels];
          updateProvider(selectedProviderId, {
            models: mergedModels,
            defaultModel: provider.defaultModel || mergedModels[0].id
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setFetchingModels(false);
    }
  };

  const addCustomModel = () => {
    if (!customModelInput.trim() || !selectedProviderId) return;
    const provider = providers.find(p => p.id === selectedProviderId);
    if (!provider) return;
    if (provider.models.some(m => m.id === customModelInput)) {
      setCustomModelInput('');
      return;
    }

    const newModelOption: ModelOption = {
      id: customModelInput,
      name: customModelInput,
      description: 'Custom model',
      supportsVision: false,
      supportsStreaming: true,
    };

    updateProvider(selectedProviderId, {
      models: [...provider.models, newModelOption],
      defaultModel: provider.defaultModel || customModelInput
    });
    setCustomModelInput('');
  };

  if (!isOpen) return null;

  const testResult = selectedProviderId ? testResults[selectedProviderId] : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-5xl max-h-[90vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Settings2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI Provider Settings</h2>
              <p className="text-xs text-slate-400">Configure AI providers, models, and API keys</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Provider List - Left Sidebar */}
          <div className="w-64 border-r border-white/5 flex flex-col bg-slate-950/50">
            <div className="p-3 border-b border-white/5">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Providers</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {providers.map(provider => (
                <button
                  key={provider.id}
                  onClick={() => setSelectedProviderId(provider.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                    selectedProviderId === provider.id
                      ? 'bg-blue-500/20 border border-blue-500/30'
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <ProviderIcon type={provider.type} />
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm text-white truncate">{provider.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{provider.defaultModel}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {activeProviderId === provider.id && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">ACTIVE</span>
                    )}
                    {provider.isLocal ? (
                      <Server className="w-3 h-3 text-purple-400" />
                    ) : provider.apiKey ? (
                      <Key className="w-3 h-3 text-green-400" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-amber-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Add Provider */}
            <div className="p-2 border-t border-white/5">
              {showAddProvider ? (
                <div className="p-3 bg-slate-800/50 rounded-lg space-y-2">
                  <div className="grid grid-cols-2 gap-1">
                    {(Object.entries(DEFAULT_PROVIDERS) as [ProviderType, typeof DEFAULT_PROVIDERS.gemini][]).map(([type, config]) => (
                      <button
                        key={type}
                        onClick={() => setNewProviderType(type)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                          newProviderType === type
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-white/5 hover:border-white/20'
                        }`}
                      >
                        <ProviderIcon type={type} className="w-4 h-4" />
                        <span className="text-[9px] text-slate-400">{config.name.split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={addProvider}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setShowAddProvider(false)}
                      className="px-3 py-1.5 hover:bg-white/10 text-slate-400 text-xs rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddProvider(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Provider
                </button>
              )}
            </div>
          </div>

          {/* Provider Details - Main Content */}
          {selectedProvider ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Provider Header */}
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ProviderIcon type={selectedProvider.type} className="w-8 h-8" />
                  <div>
                    <h3 className="text-lg font-medium text-white">{selectedProvider.name}</h3>
                    <p className="text-xs text-slate-500">
                      {selectedProvider.isLocal ? 'Local Provider' : 'Cloud Provider'} • {selectedProvider.models.length} models
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => testConnection(selectedProvider.id)}
                    disabled={testResult?.status === 'testing'}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                  >
                    {testResult?.status === 'testing' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Test Connection
                  </button>
                  {activeProviderId !== selectedProvider.id && (
                    <button
                      onClick={() => setActiveProvider(selectedProvider.id)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Set Active
                    </button>
                  )}
                  {providers.length > 1 && (
                    <button
                      onClick={() => deleteProvider(selectedProvider.id)}
                      className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                      title="Delete provider"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                </div>
              </div>

              {/* Test Result */}
              {testResult && testResult.status !== 'idle' && (
                <div className={`mx-4 mt-4 px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${
                  testResult.status === 'testing' ? 'bg-blue-500/10 text-blue-400' :
                  testResult.status === 'success' ? 'bg-green-500/10 text-green-400' :
                  'bg-red-500/10 text-red-400'
                }`}>
                  {testResult.status === 'testing' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {testResult.status === 'success' && <CheckCircle2 className="w-4 h-4" />}
                  {testResult.status === 'error' && <AlertCircle className="w-4 h-4" />}
                  {testResult.status === 'testing' ? 'Testing connection...' :
                   testResult.status === 'success' ? 'Connection successful!' :
                   testResult.message || 'Connection failed'}
                </div>
              )}

              {/* Provider Settings */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Connection Settings */}
                <div className="grid grid-cols-2 gap-4">
                  {/* API Key */}
                  {!selectedProvider.isLocal && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <Key className="w-4 h-4" />
                        API Key
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type={showApiKey[selectedProvider.id] ? 'text' : 'password'}
                          value={selectedProvider.apiKey || ''}
                          onChange={(e) => updateProvider(selectedProvider.id, { apiKey: e.target.value })}
                          placeholder={`Enter your ${selectedProvider.name} API key`}
                          className="flex-1 px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                        />
                        <button
                          onClick={() => setShowApiKey(prev => ({ ...prev, [selectedProvider.id]: !prev[selectedProvider.id] }))}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                          {showApiKey[selectedProvider.id] ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Base URL */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <Link2 className="w-4 h-4" />
                      Base URL
                    </label>
                    <input
                      type="text"
                      value={selectedProvider.baseUrl || ''}
                      onChange={(e) => updateProvider(selectedProvider.id, { baseUrl: e.target.value })}
                      placeholder="https://api.example.com"
                      className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50 font-mono"
                    />
                  </div>
                </div>

                {/* Default Model */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <Zap className="w-4 h-4" />
                      Default Model
                    </label>
                    {(selectedProvider.isLocal || selectedProvider.type === 'openrouter') && (
                      <button
                        onClick={fetchModels}
                        disabled={fetchingModels}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors disabled:opacity-50"
                      >
                        {fetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        Fetch from Server
                      </button>
                    )}
                  </div>
                  <select
                    value={selectedProvider.defaultModel}
                    onChange={(e) => updateProvider(selectedProvider.id, { defaultModel: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-500/50"
                  >
                    {[...selectedProvider.models].sort((a, b) => a.name.localeCompare(b.name)).map(m => (
                      <option key={m.id} value={m.id}>{m.name} - {m.description}</option>
                    ))}
                  </select>

                  {/* Custom Model Input for Local */}
                  {selectedProvider.isLocal && (
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addCustomModel()}
                        placeholder="Enter custom model name..."
                        className="flex-1 px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50 font-mono"
                      />
                      <button
                        onClick={addCustomModel}
                        disabled={!customModelInput.trim()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Models List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-slate-300">
                      Available Models ({selectedProvider.models.length})
                    </h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingModels(!editingModels)}
                        className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
                          editingModels ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10 text-slate-400'
                        }`}
                      >
                        <Pencil className="w-3 h-3" />
                        {editingModels ? 'Done Editing' : 'Edit Models'}
                      </button>
                      {editingModels && (
                        <button
                          onClick={() => setShowAddModel(true)}
                          className="flex items-center gap-1.5 px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add Model
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Add Model Form */}
                  {showAddModel && (
                    <div className="p-4 bg-slate-800/50 rounded-lg border border-white/10 space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <input
                          type="text"
                          value={newModel.id || ''}
                          onChange={(e) => setNewModel(prev => ({ ...prev, id: e.target.value }))}
                          placeholder="Model ID (e.g., gpt-4o)"
                          className="px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-sm text-white font-mono outline-none focus:border-blue-500/50"
                        />
                        <input
                          type="text"
                          value={newModel.name || ''}
                          onChange={(e) => setNewModel(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Display Name"
                          className="px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-500/50"
                        />
                        <input
                          type="text"
                          value={newModel.description || ''}
                          onChange={(e) => setNewModel(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Description"
                          className="px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-sm text-slate-400 outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm text-slate-400">
                            <input
                              type="checkbox"
                              checked={newModel.supportsVision || false}
                              onChange={(e) => setNewModel(prev => ({ ...prev, supportsVision: e.target.checked }))}
                              className="w-4 h-4 rounded"
                            />
                            Vision Support
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-400">
                            <input
                              type="checkbox"
                              checked={newModel.supportsStreaming !== false}
                              onChange={(e) => setNewModel(prev => ({ ...prev, supportsStreaming: e.target.checked }))}
                              className="w-4 h-4 rounded"
                            />
                            Streaming Support
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setShowAddModel(false); setNewModel({ id: '', name: '', description: '' }); }}
                            className="px-3 py-1.5 hover:bg-white/10 text-slate-400 text-sm rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={addModel}
                            disabled={!newModel.id || !newModel.name}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                          >
                            Add Model
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Models Grid */}
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                    {[...selectedProvider.models].sort((a, b) => a.name.localeCompare(b.name)).map(model => (
                      <div
                        key={model.id}
                        className={`p-3 rounded-lg border transition-colors ${
                          selectedProvider.defaultModel === model.id
                            ? 'bg-blue-500/10 border-blue-500/30'
                            : 'bg-slate-800/50 border-white/5 hover:border-white/10'
                        }`}
                      >
                        {editingModels ? (
                          <div className="space-y-2">
                            <div className="text-xs text-slate-500 font-mono">{model.id}</div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={model.name}
                                onChange={(e) => updateModelInProvider(model.id, { name: e.target.value })}
                                className="flex-1 px-2 py-1 bg-slate-900 border border-white/10 rounded text-sm text-white outline-none"
                              />
                              <input
                                type="text"
                                value={model.description || ''}
                                onChange={(e) => updateModelInProvider(model.id, { description: e.target.value })}
                                className="flex-1 px-2 py-1 bg-slate-900 border border-white/10 rounded text-sm text-slate-400 outline-none"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 text-xs">
                                <label className="flex items-center gap-1 text-slate-400">
                                  <input
                                    type="checkbox"
                                    checked={model.supportsVision || false}
                                    onChange={(e) => updateModelInProvider(model.id, { supportsVision: e.target.checked })}
                                    className="w-3 h-3"
                                  />
                                  Vision
                                </label>
                                <label className="flex items-center gap-1 text-slate-400">
                                  <input
                                    type="checkbox"
                                    checked={model.supportsStreaming !== false}
                                    onChange={(e) => updateModelInProvider(model.id, { supportsStreaming: e.target.checked })}
                                    className="w-3 h-3"
                                  />
                                  Stream
                                </label>
                              </div>
                              {selectedProvider.models.length > 1 && (
                                <button
                                  onClick={() => deleteModel(model.id)}
                                  className="p-1 hover:bg-red-500/20 rounded transition-colors"
                                >
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-white truncate">{model.name}</div>
                              <div className="text-xs text-slate-500 font-mono truncate">{model.id}</div>
                              {model.description && (
                                <div className="text-xs text-slate-400 mt-1">{model.description}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                              {model.supportsVision && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">Vision</span>
                              )}
                              {model.supportsStreaming && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">Stream</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Help Links Footer */}
              <div className="p-4 border-t border-white/5 bg-slate-950/50">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">Get API Keys:</div>
                  <div className="flex gap-4">
                    {[
                      { name: 'Google AI Studio', url: 'https://aistudio.google.com/apikey' },
                      { name: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
                      { name: 'Anthropic', url: 'https://console.anthropic.com/settings/keys' },
                      { name: 'Z.AI', url: 'https://z.ai' },
                      { name: 'OpenRouter', url: 'https://openrouter.ai/keys' },
                    ].map(link => (
                      <a
                        key={link.name}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {link.name}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              Select a provider to configure
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
