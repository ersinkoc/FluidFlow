/**
 * BaseModal Component
 *
 * Reusable modal component that provides consistent styling and behavior
 * across all modals in the application. Reduces boilerplate by ~60%.
 */

import React from 'react';
import { X } from 'lucide-react';

/**
 * Modal size presets
 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
  full: 'max-w-[95vw]',
};

export interface BaseModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Modal size preset */
  size?: ModalSize;
  /** Modal content */
  children: React.ReactNode;
  /** Optional footer content */
  footer?: React.ReactNode;
  /** Optional header icon */
  icon?: React.ReactNode;
  /** Header icon background color class */
  iconBg?: string;
  /** Show close button in header */
  showCloseButton?: boolean;
  /** Close modal when clicking overlay */
  closeOnOverlayClick?: boolean;
  /** Additional class for modal container */
  className?: string;
  /** Max height class (default: max-h-[90vh]) */
  maxHeight?: string;
  /** Z-index class (default: z-[100]) */
  zIndex?: string;
}

/**
 * Base modal component with consistent styling
 */
export function BaseModal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'lg',
  children,
  footer,
  icon,
  iconBg = 'bg-blue-500/20',
  showCloseButton = true,
  closeOnOverlayClick = true,
  className = '',
  maxHeight = 'max-h-[90vh]',
  zIndex = 'z-[100]',
}: BaseModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150`}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={`w-full ${SIZE_CLASSES[size]} ${maxHeight} bg-slate-900 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-slate-950/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            {icon && (
              <div className={`p-2 rounded-lg ${iconBg}`}>
                {icon}
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              {subtitle && (
                <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-5 py-4 border-t border-white/5 bg-slate-950/30 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Modal content wrapper with consistent padding
 */
export function ModalContent({
  children,
  className = '',
  noPadding = false,
}: {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <div className={`${noPadding ? '' : 'p-5'} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Modal footer with standard button layout
 */
export function ModalFooter({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-end gap-3 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Button variant types
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20',
  secondary: 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
  success: 'bg-green-600 hover:bg-green-500 text-white',
  ghost: 'text-slate-400 hover:text-white hover:bg-white/5',
};

/**
 * Modal button with consistent styling
 */
export function ModalButton({
  variant = 'secondary',
  children,
  className = '',
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Confirmation modal helper - simpler API for confirm/cancel modals
 */
export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  icon,
  isLoading = false,
}: ConfirmModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={icon}
      iconBg={variant === 'danger' ? 'bg-red-500/20' : 'bg-blue-500/20'}
      size="sm"
      footer={
        <ModalFooter>
          <ModalButton variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </ModalButton>
          <ModalButton
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmText}
          </ModalButton>
        </ModalFooter>
      }
    >
      <ModalContent>
        {typeof message === 'string' ? (
          <p className="text-slate-300">{message}</p>
        ) : (
          message
        )}
      </ModalContent>
    </BaseModal>
  );
}
