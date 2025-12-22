import React, { useState, useEffect } from 'react';
import { Bug, Trash2, AlertTriangle, Info } from 'lucide-react';
import { ConfirmModal } from '../../ContextIndicator/ConfirmModal';
import { SettingsSection, SettingsToggle, SettingsSelect, SettingsSlider } from '../shared';
import { DebugSettings, DEFAULT_DEBUG_SETTINGS, STORAGE_KEYS } from '../types';
import { useDebugStore } from '../../../hooks/useDebugStore';

export const DebugPanel: React.FC = () => {
  const [settings, setSettings] = useState<DebugSettings>(DEFAULT_DEBUG_SETTINGS);
  const debugState = useDebugStore();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.DEBUG_SETTINGS);
    if (saved) {
      try {
        setSettings({ ...DEFAULT_DEBUG_SETTINGS, ...JSON.parse(saved) });
      } catch {
        setSettings(DEFAULT_DEBUG_SETTINGS);
      }
    }
    // Sync with debug store
    setSettings(prev => ({ ...prev, enabled: debugState.enabled }));
  }, [debugState.enabled]);

  const updateSettings = (updates: Partial<DebugSettings>) => {
    const updated = { ...settings, ...updates };
    setSettings(updated);
    localStorage.setItem(STORAGE_KEYS.DEBUG_SETTINGS, JSON.stringify(updated));

    // Sync enabled state with debug store
    if ('enabled' in updates) {
      if (updates.enabled) {
        localStorage.setItem('fluidflow_debug_enabled', 'true');
      } else {
        localStorage.removeItem('fluidflow_debug_enabled');
      }
      window.location.reload(); // Refresh to apply debug mode change
    }
  };

  const clearLogs = () => {
    setShowClearConfirm(true);
  };

  const performClearLogs = () => {
    debugState.clearLogs();
    setShowClearConfirm(false);
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-500/20 rounded-lg">
          <Bug className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Debug & Monitoring</h2>
          <p className="text-xs text-slate-400">Configure debugging and logging options</p>
        </div>
      </div>

      {/* Warning */}
      {settings.enabled && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-slate-300">
            <p className="font-medium text-amber-400 mb-1">Debug Mode Active</p>
            <p className="text-slate-400">
              Debug mode logs all API requests and responses. This may impact performance
              and will consume additional memory. Disable when not needed.
            </p>
          </div>
        </div>
      )}

      {/* Main Toggle */}
      <SettingsSection
        title="Debug Mode"
        description="Enable or disable debug logging"
      >
        <SettingsToggle
          label="Enable Debug Mode"
          description="Log all AI API calls, responses, and errors (requires refresh)"
          checked={settings.enabled}
          onChange={(checked) => updateSettings({ enabled: checked })}
        />
      </SettingsSection>

      {/* Log Settings */}
      <SettingsSection
        title="Logging"
        description="Configure what gets logged"
      >
        <SettingsSelect
          label="Log Level"
          description="Minimum severity level to log"
          value={settings.logLevel}
          options={[
            { value: 'error', label: 'Error only' },
            { value: 'warn', label: 'Warnings and errors' },
            { value: 'info', label: 'Info, warnings, and errors' },
            { value: 'debug', label: 'Everything (verbose)' }
          ]}
          onChange={(value) => updateSettings({ logLevel: value as 'error' | 'warn' | 'info' | 'debug' })}
          disabled={!settings.enabled}
        />

        <SettingsSlider
          label="Max Log Entries"
          description="Maximum number of log entries to keep in memory"
          value={settings.maxLogs}
          onChange={(value) => updateSettings({ maxLogs: value })}
          min={100}
          max={2000}
          step={100}
          disabled={!settings.enabled}
        />

        <SettingsToggle
          label="Persist Logs"
          description="Keep logs after page refresh (stored in localStorage)"
          checked={settings.persistLogs}
          onChange={(checked) => updateSettings({ persistLogs: checked })}
          disabled={!settings.enabled}
        />
      </SettingsSection>

      {/* Display Settings */}
      <SettingsSection
        title="Display"
        description="What to show in the UI"
      >
        <SettingsToggle
          label="Show Token Usage"
          description="Display token counts for AI requests"
          checked={settings.showTokenUsage}
          onChange={(checked) => updateSettings({ showTokenUsage: checked })}
        />

        <SettingsToggle
          label="Show Generation Time"
          description="Display how long AI generation takes"
          checked={settings.showGenerationTime}
          onChange={(checked) => updateSettings({ showGenerationTime: checked })}
        />

        <SettingsToggle
          label="Show Network Requests"
          description="Log network requests in console panel"
          checked={settings.showNetworkRequests}
          onChange={(checked) => updateSettings({ showNetworkRequests: checked })}
        />
      </SettingsSection>

      {/* Log Management */}
      <SettingsSection
        title="Log Management"
        description={`Currently storing ${debugState.logs.length} log entries`}
      >
        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
          <div>
            <div className="text-sm text-white">{debugState.logs.length} entries</div>
            <div className="text-xs text-slate-500">
              {debugState.logs.filter(l => l.type === 'error').length} errors,{' '}
              {debugState.logs.filter(l => l.type === 'request').length} requests
            </div>
          </div>
          <button
            onClick={clearLogs}
            disabled={debugState.logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Logs
          </button>
        </div>
      </SettingsSection>

      {/* Info */}
      <div className="p-4 bg-slate-800/50 rounded-lg">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm text-slate-300 font-medium">Debug Panel Access</div>
            <div className="text-xs text-slate-500 mt-1">
              When debug mode is enabled, you can view detailed logs in the Debug tab
              of the preview panel. Use this to inspect AI requests, responses, and
              troubleshoot issues.
            </div>
          </div>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={performClearLogs}
        title="Clear Debug Logs"
        message="This will permanently delete all debug logs. This action cannot be undone."
        confirmText="Clear Logs"
        confirmVariant="danger"
      />
    </div>
  );
};

export default DebugPanel;
