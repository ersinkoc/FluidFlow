/**
 * Toast Context Provider
 *
 * Manages toast state and provides add/remove functions
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Toast, ToastContextValue } from './types';
import { ToastContainer } from './ToastContainer';

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastProviderProps {
  children: React.ReactNode;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxToasts?: number;
}

export function ToastProvider({
  children,
  position = 'bottom-right',
  maxToasts = 5,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = uuidv4();
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000,
    };

    setToasts(prev => {
      const updated = [newToast, ...prev];
      // Keep only the most recent toasts
      return updated.slice(0, maxToasts);
    });

    return id;
  }, [maxToasts]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods for different toast types
  const toastHelpers = useMemo(
    () => ({
      success: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
        addToast({ type: 'success', message, ...options }),
      error: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
        addToast({ type: 'error', message, ...options }),
      warning: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
        addToast({ type: 'warning', message, ...options }),
      info: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) =>
        addToast({ type: 'info', message, ...options }),
    }),
    [addToast]
  );

  const value: ToastContextValue = useMemo(
    () => ({
      toasts,
      addToast,
      removeToast,
      clearToasts,
      ...toastHelpers,
    }),
    [toasts, addToast, removeToast, clearToasts, toastHelpers]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} position={position} />
    </ToastContext.Provider>
  );
}

export default ToastProvider;
