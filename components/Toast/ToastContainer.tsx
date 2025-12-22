/**
 * Toast Container
 *
 * Displays all active toast notifications
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { ToastItem } from './Toast';
import { Toast } from './types';

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

const POSITION_STYLES: Record<string, string> = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onRemove,
  position = 'bottom-right',
}) => {
  if (toasts.length === 0) return null;

  const container = (
    <div className={`fixed z-[9999] flex flex-col gap-2 max-w-screen w-80 ${POSITION_STYLES[position]}`}>
      {toasts.map(toast => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );

  // Use portal to render outside of any parent components
  return createPortal(container, document.body);
};

export default ToastContainer;
