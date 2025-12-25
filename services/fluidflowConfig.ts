/**
 * FluidFlow Project Configuration Manager
 *
 * Manages .fluidflow folder structure and configuration files.
 *
 * @module services/fluidflowConfig
 *
 * Structure:
 * - services/fluidflow/types.ts    - Type definitions
 * - services/fluidflow/defaults.ts - Default configurations
 */

// Import and re-export types from fluidflow module
import type {
  AIResponseFormat,
  FluidFlowConfig,
  AgentConfig,
  ContextSettings,
  CompactionLog,
} from './fluidflow/types';

import {
  DEFAULT_CONFIG,
  DEFAULT_CONTEXT_SETTINGS,
  STORAGE_KEYS,
  MAX_COMPACTION_LOGS,
} from './fluidflow/defaults';

export type { AIResponseFormat, FluidFlowConfig, AgentConfig, ContextSettings, CompactionLog };

// ============================================================================
// FluidFlowConfigManager Class
// ============================================================================

class FluidFlowConfigManager {
  private config: FluidFlowConfig;
  private compactionLogs: CompactionLog[] = [];

  constructor() {
    this.config = this.loadConfig();
    this.compactionLogs = this.loadCompactionLogs();
  }

  // ============================================================================
  // Storage Operations
  // ============================================================================

  private loadConfig(): FluidFlowConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('[FluidFlow] Failed to load config:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    } catch (e) {
      console.error('[FluidFlow] Failed to save config:', e);
    }
  }

  private loadCompactionLogs(): CompactionLog[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.COMPACTION_LOGS);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('[FluidFlow] Failed to load compaction logs:', e);
    }
    return [];
  }

  private saveCompactionLogs(): void {
    try {
      // Keep only last N logs
      const logsToSave = this.compactionLogs.slice(-MAX_COMPACTION_LOGS);
      localStorage.setItem(STORAGE_KEYS.COMPACTION_LOGS, JSON.stringify(logsToSave));
    } catch (e) {
      console.error('[FluidFlow] Failed to save compaction logs:', e);
    }
  }

  // ============================================================================
  // Config Getters/Setters
  // ============================================================================

  getConfig(): FluidFlowConfig {
    return { ...this.config };
  }

  getRules(): string {
    return this.config.rules || '';
  }

  setRules(rules: string): void {
    this.config.rules = rules;
    this.saveConfig();
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  getAgents(): AgentConfig[] {
    return this.config.agents || [];
  }

  getEnabledAgents(): AgentConfig[] {
    return (this.config.agents || []).filter((a) => a.enabled);
  }

  updateAgent(id: string, updates: Partial<AgentConfig>): void {
    const agents = this.config.agents || [];
    const index = agents.findIndex((a) => a.id === id);
    if (index >= 0) {
      agents[index] = { ...agents[index], ...updates };
      this.config.agents = agents;
      this.saveConfig();
    }
  }

  addAgent(agent: AgentConfig): void {
    this.config.agents = [...(this.config.agents || []), agent];
    this.saveConfig();
  }

  // ============================================================================
  // Context Settings
  // ============================================================================

  getContextSettings(): ContextSettings {
    return this.config.contextSettings ?? DEFAULT_CONTEXT_SETTINGS;
  }

  updateContextSettings(settings: Partial<ContextSettings>): void {
    this.config.contextSettings = {
      ...this.getContextSettings(),
      ...settings,
    };
    this.saveConfig();
  }

  // ============================================================================
  // Response Format
  // ============================================================================

  getResponseFormat(): AIResponseFormat {
    return this.config.responseFormat || 'marker';
  }

  setResponseFormat(format: AIResponseFormat): void {
    this.config.responseFormat = format;
    this.saveConfig();
    console.log('[FluidFlow] Response format set to:', format);
  }

  // ============================================================================
  // Compaction Logs
  // ============================================================================

  addCompactionLog(log: Omit<CompactionLog, 'id' | 'timestamp'>): CompactionLog {
    const fullLog: CompactionLog = {
      ...log,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    this.compactionLogs.push(fullLog);
    this.saveCompactionLogs();
    console.log('[FluidFlow] Compaction logged:', fullLog);
    return fullLog;
  }

  getCompactionLogs(contextId?: string): CompactionLog[] {
    if (contextId) {
      return this.compactionLogs.filter((l) => l.contextId === contextId);
    }
    return [...this.compactionLogs];
  }

  clearCompactionLogs(): void {
    this.compactionLogs = [];
    this.saveCompactionLogs();
  }

  // ============================================================================
  // File Export/Import
  // ============================================================================

  /**
   * Export configuration as .fluidflow folder content
   */
  exportAsFiles(): Record<string, string> {
    const files: Record<string, string> = {};

    // rules.md
    files['.fluidflow/rules.md'] = this.config.rules || '';

    // agents.json
    files['.fluidflow/agents.json'] = JSON.stringify(this.config.agents || [], null, 2);

    // settings.json
    files['.fluidflow/settings.json'] = JSON.stringify(
      {
        contextSettings: this.config.contextSettings,
      },
      null,
      2
    );

    // compaction-logs.json (if enabled)
    if (this.config.contextSettings?.saveCompactionLogs) {
      files['.fluidflow/logs/compaction-logs.json'] = JSON.stringify(this.compactionLogs, null, 2);
    }

    // .gitignore for the folder
    files['.fluidflow/.gitignore'] = `# FluidFlow local files
logs/
*.local.json
`;

    return files;
  }

  /**
   * Import configuration from files
   */
  importFromFiles(files: Record<string, string>): void {
    // Parse rules.md
    if (files['.fluidflow/rules.md']) {
      this.config.rules = files['.fluidflow/rules.md'];
    }

    // Parse agents.json
    if (files['.fluidflow/agents.json']) {
      try {
        this.config.agents = JSON.parse(files['.fluidflow/agents.json']);
      } catch (e) {
        console.error('[FluidFlow] Failed to parse agents.json:', e);
      }
    }

    // Parse settings.json
    if (files['.fluidflow/settings.json']) {
      try {
        const settings = JSON.parse(files['.fluidflow/settings.json']);
        this.config.contextSettings = settings.contextSettings;
      } catch (e) {
        console.error('[FluidFlow] Failed to parse settings.json:', e);
      }
    }

    this.saveConfig();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let configManagerInstance: FluidFlowConfigManager | null = null;

export function getFluidFlowConfig(): FluidFlowConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new FluidFlowConfigManager();
  }
  return configManagerInstance;
}

export default FluidFlowConfigManager;
