/**
 * PromptConfirmationContext
 *
 * Global context for intercepting AI prompts before they are sent.
 * When enabled, shows a confirmation modal with prompt details.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { STORAGE_KEYS } from '../constants/storage';

// ============================================================================
// Types
// ============================================================================

export interface PromptDetails {
  prompt: string;
  systemInstruction?: string;
  model: string;
  provider?: string;
  category?: string;
  contextTokens?: number;
  estimatedTokens?: number;
  attachments?: Array<{ type: string; size: number }>;
}

export interface PromptConfirmationRequest {
  id: string;
  details: PromptDetails;
  resolve: (confirmed: boolean) => void;
}

interface PromptConfirmationContextType {
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => void;
  pendingRequest: PromptConfirmationRequest | null;
  confirmPrompt: (details: PromptDetails) => Promise<boolean>;
  handleConfirm: () => void;
  handleCancel: () => void;
}

// ============================================================================
// Context
// ============================================================================

const PromptConfirmationContext = createContext<PromptConfirmationContextType | null>(null);

// ============================================================================
// Global Interceptor (for non-React code like ProviderManager)
// ============================================================================

type PromptInterceptor = (details: PromptDetails) => Promise<boolean>;
let globalInterceptor: PromptInterceptor | null = null;
let isConfirmationEnabled = false;

// Load initial state from localStorage
try {
  isConfirmationEnabled = localStorage.getItem(STORAGE_KEYS.PROMPT_CONFIRMATION) === 'true';
} catch {
  // Ignore localStorage errors
}

/**
 * Set the global prompt interceptor (called by PromptConfirmationProvider)
 */
export function setGlobalPromptInterceptor(interceptor: PromptInterceptor | null): void {
  globalInterceptor = interceptor;
  console.log('[PromptConfirmation] Interceptor set:', !!interceptor, 'enabled:', isConfirmationEnabled);
}

/**
 * Check if prompt confirmation is enabled
 */
export function isPromptConfirmationEnabled(): boolean {
  return isConfirmationEnabled;
}

/**
 * Set whether prompt confirmation is enabled (for use outside React)
 */
export function setPromptConfirmationEnabled(enabled: boolean): void {
  isConfirmationEnabled = enabled;
}

/**
 * Request prompt confirmation (called from ProviderManager)
 * Returns true if confirmed, false if cancelled
 * If confirmation is disabled or no interceptor, returns true immediately
 */
export async function requestPromptConfirmation(details: PromptDetails): Promise<boolean> {
  console.log('[PromptConfirmation] Request received:', {
    enabled: isConfirmationEnabled,
    hasInterceptor: !!globalInterceptor,
    category: details.category,
    model: details.model,
  });

  if (!isConfirmationEnabled || !globalInterceptor) {
    console.log('[PromptConfirmation] Skipping - enabled:', isConfirmationEnabled, 'interceptor:', !!globalInterceptor);
    return true; // No confirmation needed
  }

  console.log('[PromptConfirmation] Showing modal...');
  return globalInterceptor(details);
}

// ============================================================================
// Provider Component
// ============================================================================

export const PromptConfirmationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isEnabled, setIsEnabled] = useState(isConfirmationEnabled);
  const [pendingRequest, setPendingRequest] = useState<PromptConfirmationRequest | null>(null);
  const requestIdRef = useRef(0);

  // Sync enabled state with localStorage and global flag
  const setEnabled = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    isConfirmationEnabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEYS.PROMPT_CONFIRMATION, enabled ? 'true' : 'false');
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // The confirmation function that will be called by the global interceptor
  const confirmPrompt = useCallback((details: PromptDetails): Promise<boolean> => {
    return new Promise((resolve) => {
      const id = `prompt-${++requestIdRef.current}-${Date.now()}`;
      setPendingRequest({
        id,
        details,
        resolve,
      });
    });
  }, []);

  // Handle user confirmation
  const handleConfirm = useCallback(() => {
    if (pendingRequest) {
      pendingRequest.resolve(true);
      setPendingRequest(null);
    }
  }, [pendingRequest]);

  // Handle user cancellation
  const handleCancel = useCallback(() => {
    if (pendingRequest) {
      pendingRequest.resolve(false);
      setPendingRequest(null);
    }
  }, [pendingRequest]);

  // Register the global interceptor
  useEffect(() => {
    setGlobalPromptInterceptor(confirmPrompt);
    return () => {
      setGlobalPromptInterceptor(null);
    };
  }, [confirmPrompt]);

  // Sync initial state
  useEffect(() => {
    isConfirmationEnabled = isEnabled;
  }, [isEnabled]);

  return (
    <PromptConfirmationContext.Provider
      value={{
        isEnabled,
        setEnabled,
        pendingRequest,
        confirmPrompt,
        handleConfirm,
        handleCancel,
      }}
    >
      {children}
    </PromptConfirmationContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

export function usePromptConfirmation(): PromptConfirmationContextType {
  const context = useContext(PromptConfirmationContext);
  if (!context) {
    throw new Error('usePromptConfirmation must be used within PromptConfirmationProvider');
  }
  return context;
}

export default PromptConfirmationContext;
