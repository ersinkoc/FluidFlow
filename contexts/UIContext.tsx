/**
 * UIContext - High-frequency UI state management
 *
 * Separated from AppContext to prevent unnecessary re-renders.
 * Components that only need UI state (like isGenerating, activeTab)
 * won't re-render when files or project state changes.
 *
 * This context handles:
 * - Generation state (isGenerating)
 * - Tab state (activeTab)
 * - Model selection (selectedModel)
 * - Preferences (autoAcceptChanges, diffModeEnabled)
 * - Suggestions
 */
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { TabType } from '../types';
import { getProviderManager } from '../services/ai';

// ============ Types ============

export interface UIContextValue {
  // Tab state
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;

  // Generation state
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;

  // Model selection
  selectedModel: string;
  setSelectedModel: (model: string) => void;

  // Suggestions
  suggestions: string[] | null;
  setSuggestions: (suggestions: string[] | null) => void;

  // Preferences
  autoAcceptChanges: boolean;
  setAutoAcceptChanges: (accept: boolean) => void;
  diffModeEnabled: boolean;
  setDiffModeEnabled: (enabled: boolean) => void;
  autoCommitEnabled: boolean;
  setAutoCommitEnabled: (enabled: boolean) => void;

  // Reset
  resetUIState: () => void;
  /** Counter that increments on each reset - components can listen to clear their state */
  resetCounter: number;

  // Left panel visibility
  leftPanelVisible: boolean;
  setLeftPanelVisible: (visible: boolean) => void;
  toggleLeftPanel: () => void;
}

// ============ Context ============

const UIContext = createContext<UIContextValue | null>(null);

// ============ Provider ============

interface UIProviderProps {
  children: React.ReactNode;
}

export function UIProvider({ children }: UIProviderProps) {
  // Tab state - default to debug panel for visibility during development
  const [activeTab, setActiveTab] = useState<TabType>('debug');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);

  // Model selection - initialize from ProviderManager
  const [selectedModel, setSelectedModel] = useState(() => {
    const pm = getProviderManager();
    const config = pm.getActiveConfig();
    return config?.defaultModel || 'models/gemini-2.5-flash';
  });

  // Sync selectedModel with ProviderManager on mount (after async init)
  useEffect(() => {
    const pm = getProviderManager();
    pm.waitForInit().then(() => {
      const config = pm.getActiveConfig();
      if (config?.defaultModel) {
        setSelectedModel(config.defaultModel);
      }
    });
  }, []);

  // Suggestions
  const [suggestions, setSuggestions] = useState<string[] | null>(null);

  // Preferences - persisted to localStorage
  const [autoAcceptChanges, setAutoAcceptChanges] = useState(false);
  const [diffModeEnabled, setDiffModeEnabled] = useState(() => {
    return localStorage.getItem('diffModeEnabled') === 'true';
  });
  const [autoCommitEnabled, setAutoCommitEnabled] = useState(() => {
    return localStorage.getItem('autoCommitEnabled') === 'true';
  });

  // Reset counter - increments on each reset, components can listen to this
  const [resetCounter, setResetCounter] = useState(0);

  // Left panel visibility - default visible
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const toggleLeftPanel = useCallback(() => {
    setLeftPanelVisible(prev => !prev);
  }, []);

  // Persist diffModeEnabled to localStorage
  useEffect(() => {
    localStorage.setItem('diffModeEnabled', String(diffModeEnabled));
  }, [diffModeEnabled]);

  // Persist autoCommitEnabled to localStorage
  useEffect(() => {
    localStorage.setItem('autoCommitEnabled', String(autoCommitEnabled));
  }, [autoCommitEnabled]);

  // Auto-open left panel when generation starts (only once, not continuously)
  const prevIsGeneratingRef = useRef(false);
  useEffect(() => {
    // Only open when isGenerating transitions from false to true
    if (isGenerating && !prevIsGeneratingRef.current && !leftPanelVisible) {
      setLeftPanelVisible(true);
    }
    prevIsGeneratingRef.current = isGenerating;
  }, [isGenerating, leftPanelVisible]);

  // Reset function - also increments resetCounter to signal components
  const resetUIState = useCallback(() => {
    setSuggestions(null);
    setIsGenerating(false);
    setResetCounter(c => c + 1);
  }, []);

  // Memoized context value
  const value = useMemo<UIContextValue>(() => ({
    activeTab,
    setActiveTab,
    isGenerating,
    setIsGenerating,
    selectedModel,
    setSelectedModel,
    suggestions,
    setSuggestions,
    autoAcceptChanges,
    setAutoAcceptChanges,
    diffModeEnabled,
    setDiffModeEnabled,
    autoCommitEnabled,
    setAutoCommitEnabled,
    resetUIState,
    resetCounter,
    leftPanelVisible,
    setLeftPanelVisible,
    toggleLeftPanel,
  }), [
    activeTab,
    isGenerating,
    selectedModel,
    suggestions,
    autoAcceptChanges,
    diffModeEnabled,
    autoCommitEnabled,
    resetUIState,
    resetCounter,
    leftPanelVisible,
    toggleLeftPanel,
  ]);

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}

// ============ Hooks ============

/**
 * Use all UI state
 */
// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function useUI(): UIContextValue {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}

/**
 * Use only generation-related state
 * For components that only care about isGenerating
 */
// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function useGenerationState() {
  const { isGenerating, setIsGenerating } = useUI();
  return { isGenerating, setIsGenerating };
}

/**
 * Use only tab state
 * For components that only care about activeTab
 */
// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function useTabState() {
  const { activeTab, setActiveTab } = useUI();
  return { activeTab, setActiveTab };
}

/**
 * Use only model state
 * For components that only care about selectedModel
 */
// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function useModelState() {
  const { selectedModel, setSelectedModel } = useUI();
  return { selectedModel, setSelectedModel };
}

/**
 * Use only preferences
 * For settings components
 */
// eslint-disable-next-line react-refresh/only-export-components -- Context hook pattern
export function usePreferences() {
  const { autoAcceptChanges, setAutoAcceptChanges, diffModeEnabled, setDiffModeEnabled, autoCommitEnabled, setAutoCommitEnabled } = useUI();
  return { autoAcceptChanges, setAutoAcceptChanges, diffModeEnabled, setDiffModeEnabled, autoCommitEnabled, setAutoCommitEnabled };
}
