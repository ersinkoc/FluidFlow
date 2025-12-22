import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings2, Download, Upload, RotateCcw } from 'lucide-react';
import { ConfirmModal } from '../ContextIndicator/ConfirmModal';
import { SettingsSidebar } from './SettingsSidebar';
import { AIProvidersPanel } from './panels/AIProvidersPanel';
import { ContextManagerPanel } from './panels/ContextManagerPanel';
import { TechStackPanel } from './panels/TechStackPanel';
import { ProjectsPanel } from './panels/ProjectsPanel';
import { EditorPanel } from './panels/EditorPanel';
import { AppearancePanel } from './panels/AppearancePanel';
import { DebugPanel } from './panels/DebugPanel';
import { AdvancedPanel } from './panels/AdvancedPanel';
import {
  MegaSettingsModalProps,
  SettingsCategory,
  STORAGE_KEYS,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_DEBUG_SETTINGS
} from './types';

export const MegaSettingsModal: React.FC<MegaSettingsModalProps> = ({
  isOpen,
  onClose,
  initialCategory = 'ai-providers',
  onProviderChange
}) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory);
  const [importExportMessage, setImportExportMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Update active category when initialCategory changes
  useEffect(() => {
    if (isOpen && initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [isOpen, initialCategory]);

  // Handle escape key - only add listener when modal is open to prevent accumulation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Export all settings
  const handleExportSettings = () => {
    try {
      const settings: Record<string, unknown> = {};

      // Gather all settings from localStorage
      Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
        const value = localStorage.getItem(storageKey);
        if (value) {
          try {
            settings[key] = JSON.parse(value);
          } catch {
            settings[key] = value;
          }
        }
      });

      // Also get tech stack and other existing keys
      const techStack = localStorage.getItem('fluidflow-tech-stack');
      if (techStack) settings.techStack = JSON.parse(techStack);

      const config = localStorage.getItem('fluidflow_config');
      if (config) settings.fluidflowConfig = JSON.parse(config);

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluidflow-settings-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setImportExportMessage({ type: 'success', message: 'Settings exported successfully!' });
      setTimeout(() => setImportExportMessage(null), 3000);
    } catch (_error) {
      setImportExportMessage({ type: 'error', message: 'Failed to export settings' });
      setTimeout(() => setImportExportMessage(null), 3000);
    }
  };

  // Import settings from file
  const handleImportSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const settings = JSON.parse(text);

        // Restore settings to localStorage
        Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
          if (settings[key]) {
            localStorage.setItem(storageKey, JSON.stringify(settings[key]));
          }
        });

        if (settings.techStack) {
          localStorage.setItem('fluidflow-tech-stack', JSON.stringify(settings.techStack));
        }

        if (settings.fluidflowConfig) {
          localStorage.setItem('fluidflow_config', JSON.stringify(settings.fluidflowConfig));
        }

        setImportExportMessage({ type: 'success', message: 'Settings imported! Refresh to apply.' });
        setTimeout(() => setImportExportMessage(null), 3000);
      } catch (_error) {
        setImportExportMessage({ type: 'error', message: 'Failed to import settings' });
        setTimeout(() => setImportExportMessage(null), 3000);
      }
    };
    input.click();
  };

  // Reset current section to defaults
  const handleResetSection = () => {
    // Only editor and debug have resettable settings
    if (activeCategory !== 'editor' && activeCategory !== 'debug') {
      return;
    }

    setShowResetConfirm(true);
  };

  const performReset = () => {
    switch (activeCategory) {
      case 'editor':
        localStorage.setItem(STORAGE_KEYS.EDITOR_SETTINGS, JSON.stringify(DEFAULT_EDITOR_SETTINGS));
        window.dispatchEvent(new CustomEvent('editorSettingsChanged'));
        break;
      case 'debug':
        localStorage.setItem(STORAGE_KEYS.DEBUG_SETTINGS, JSON.stringify(DEFAULT_DEBUG_SETTINGS));
        break;
      default:
        return;
    }

    setImportExportMessage({ type: 'success', message: 'Settings reset to defaults!' });
    setTimeout(() => setImportExportMessage(null), 3000);
    // Force re-render by toggling category
    setActiveCategory('ai-providers');
    setTimeout(() => setActiveCategory(activeCategory), 0);
    setShowResetConfirm(false);
  };

  // Check if current panel has resettable settings
  const canResetSection = activeCategory === 'editor' || activeCategory === 'debug';

  const renderPanel = () => {
    switch (activeCategory) {
      case 'ai-providers':
        return <AIProvidersPanel onProviderChange={onProviderChange} />;
      case 'context-manager':
        return <ContextManagerPanel />;
      case 'tech-stack':
        return <TechStackPanel />;
      case 'projects':
        return <ProjectsPanel />;
      case 'editor':
        return <EditorPanel />;
      case 'appearance':
        return <AppearancePanel />;
      case 'debug':
        return <DebugPanel />;
      case 'advanced':
        return <AdvancedPanel />;
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[90vw] max-w-6xl h-[85vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Settings2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Settings</h2>
              <p className="text-xs text-slate-400">Configure FluidFlow preferences</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {importExportMessage && (
              <span className={`text-xs px-3 py-1 rounded-lg ${
                importExportMessage.type === 'success'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {importExportMessage.message}
              </span>
            )}
            <button
              onClick={handleExportSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Export Settings"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={handleImportSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Import Settings"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <SettingsSidebar
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />

          {/* Panel Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              {renderPanel()}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/5 bg-slate-950/50 flex items-center justify-between">
              {canResetSection ? (
                <button
                  onClick={handleResetSection}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Section
                </button>
              ) : (
                <div />
              )}
              <div className="text-xs text-slate-600">
                Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Esc</kbd> to close
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={performReset}
        title={`Reset ${activeCategory} settings`}
        message="This will reset all settings in this section to their default values. This action cannot be undone."
        confirmText="Reset"
        confirmVariant="danger"
      />
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default MegaSettingsModal;
