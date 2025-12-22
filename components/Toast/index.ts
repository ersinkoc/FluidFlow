/**
 * Toast Notification System
 *
 * Usage:
 * ```tsx
 * import { useToast } from '@/components/Toast';
 *
 * function MyComponent() {
 *   const { toast } = useToast();
 *
 *   const handleClick = () => {
 *     toast.success('Operation completed!');
 *     toast.error('Something went wrong', { title: 'Error', duration: 10000 });
 *   };
 *
 *   return <button onClick={handleClick}>Show Toast</button>;
 * }
 * ```
 */

export { ToastProvider, useToast } from './ToastContext';
export { ToastContainer } from './ToastContainer';
export { ToastItem } from './Toast';
export type { Toast, ToastType, ToastContextValue } from './types';
