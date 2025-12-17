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
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { TabType } from '../types';

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
}

// ============ Context ============

const UIContext = createContext<UIContextValue | null>(null);

// ============ Provider ============

interface UIProviderProps {
  children: React.ReactNode;
}

export function UIProvider({ children }: UIProviderProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('preview');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);

  // Model selection
  const [selectedModel, setSelectedModel] = useState('models/gemini-2.5-flash');

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

  // Persist diffModeEnabled to localStorage
  useEffect(() => {
    localStorage.setItem('diffModeEnabled', String(diffModeEnabled));
  }, [diffModeEnabled]);

  // Persist autoCommitEnabled to localStorage
  useEffect(() => {
    localStorage.setItem('autoCommitEnabled', String(autoCommitEnabled));
  }, [autoCommitEnabled]);

  // Reset function
  const resetUIState = useCallback(() => {
    setSuggestions(null);
    setIsGenerating(false);
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
  }), [
    activeTab,
    isGenerating,
    selectedModel,
    suggestions,
    autoAcceptChanges,
    diffModeEnabled,
    autoCommitEnabled,
    resetUIState,
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
