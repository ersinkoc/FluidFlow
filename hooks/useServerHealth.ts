/**
 * useServerHealth Hook
 *
 * Monitors backend server health status with periodic checks.
 * Extracted from useProject for better separation of concerns.
 */

import { useState, useEffect, useCallback } from 'react';
import { checkServerHealth } from '@/services/projectApi';

const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

export interface ServerHealthState {
  isServerOnline: boolean;
  lastCheckedAt: number | null;
}

export interface UseServerHealthReturn extends ServerHealthState {
  /** Force an immediate health check */
  checkNow: () => Promise<boolean>;
}

/**
 * Hook to monitor server health status
 *
 * @example
 * ```tsx
 * const { isServerOnline, checkNow } = useServerHealth();
 *
 * if (!isServerOnline) {
 *   return <OfflineMessage onRetry={checkNow} />;
 * }
 * ```
 */
export function useServerHealth(): UseServerHealthReturn {
  const [state, setState] = useState<ServerHealthState>({
    isServerOnline: false,
    lastCheckedAt: null,
  });

  const checkNow = useCallback(async (): Promise<boolean> => {
    const isOnline = await checkServerHealth();
    setState({
      isServerOnline: isOnline,
      lastCheckedAt: Date.now(),
    });
    return isOnline;
  }, []);

  // Check on mount and set up interval
  useEffect(() => {
    checkNow();

    const interval = setInterval(checkNow, HEALTH_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [checkNow]);

  return {
    ...state,
    checkNow,
  };
}

export default useServerHealth;
