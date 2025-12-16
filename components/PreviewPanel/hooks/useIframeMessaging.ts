/**
 * useIframeMessaging - Handles all iframe postMessage communication
 *
 * Handles:
 * - Console log/error messages
 * - Network request logging
 * - Inspect mode events (hover, select, scroll)
 * - URL navigation events
 */

import { useState, useEffect, useRef, useCallback, Dispatch, SetStateAction } from 'react';
import { LogEntry, NetworkRequest, TerminalTab } from '@/types';
import { InspectedElement } from '../ComponentInspector';

interface UseIframeMessagingOptions {
  isInspectEditing: boolean;
  onProcessError: (message: string, stack?: string) => void;
  // External logs state (for useAutoFix compatibility)
  logs: LogEntry[];
  setLogs: Dispatch<SetStateAction<LogEntry[]>>;
}

export function useIframeMessaging({
  isInspectEditing,
  onProcessError,
  logs,
  setLogs,
}: UseIframeMessagingOptions) {
  // Console state (logs are external)
  const [networkLogs, setNetworkLogs] = useState<NetworkRequest[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [activeTerminalTab, setActiveTerminalTab] = useState<TerminalTab>('console');

  // Inspect mode state
  const [hoveredElement, setHoveredElement] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [inspectedElement, setInspectedElement] = useState<InspectedElement | null>(null);

  // URL state
  const [currentUrl, setCurrentUrl] = useState('/');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Iframe ref
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Message handler
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      switch (event.data.type) {
        case 'CONSOLE_LOG': {
          const logEntry: LogEntry = {
            id: crypto.randomUUID(),
            type: event.data.logType,
            message: event.data.message,
            timestamp: new Date(event.data.timestamp).toLocaleTimeString([], { hour12: false })
          };

          setLogs(prev => [...prev, logEntry]);

          if (event.data.logType === 'error') {
            setIsConsoleOpen(true);
            setActiveTerminalTab('console');
            onProcessError(event.data.message, event.data.stack);
          }
          break;
        }

        case 'NETWORK_REQUEST': {
          setNetworkLogs(prev => [...prev, {
            id: crypto.randomUUID(),
            method: event.data.req.method,
            url: event.data.req.url,
            status: event.data.req.status,
            duration: event.data.req.duration,
            timestamp: new Date(event.data.timestamp).toLocaleTimeString([], { hour12: false })
          }]);
          break;
        }

        case 'INSPECT_HOVER': {
          if (!isInspectEditing) {
            setHoveredElement(event.data.rect);
          }
          break;
        }

        case 'INSPECT_SELECT': {
          if (!isInspectEditing) {
            setInspectedElement(event.data.element);
            setHoveredElement(null);
          }
          break;
        }

        case 'INSPECT_LEAVE': {
          if (!isInspectEditing) {
            setHoveredElement(null);
          }
          break;
        }

        case 'INSPECT_SCROLL': {
          if (!isInspectEditing) {
            setInspectedElement(prev => prev ? { ...prev, rect: event.data.rect } : null);
          }
          break;
        }

        case 'URL_CHANGE': {
          setCurrentUrl(event.data.url || '/');
          setCanGoBack(event.data.canGoBack || false);
          setCanGoForward(event.data.canGoForward || false);
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isInspectEditing, onProcessError, setLogs]);

  // Navigation helpers
  const navigateToUrl = useCallback((url: string) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'NAVIGATE', url }, '*');
    }
  }, []);

  const goBack = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'GO_BACK' }, '*');
    }
  }, []);

  const goForward = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'GO_FORWARD' }, '*');
    }
  }, []);

  // Clear functions
  const clearLogs = useCallback(() => setLogs([]), [setLogs]);
  const clearNetworkLogs = useCallback(() => setNetworkLogs([]), []);
  const clearInspectedElement = useCallback(() => {
    setInspectedElement(null);
    setHoveredElement(null);
  }, []);

  return {
    // Console
    logs,
    setLogs,
    networkLogs,
    setNetworkLogs,
    isConsoleOpen,
    setIsConsoleOpen,
    activeTerminalTab,
    setActiveTerminalTab,
    clearLogs,
    clearNetworkLogs,

    // Inspect mode
    hoveredElement,
    inspectedElement,
    setInspectedElement,
    clearInspectedElement,

    // URL
    currentUrl,
    canGoBack,
    canGoForward,
    navigateToUrl,
    goBack,
    goForward,

    // Iframe ref
    iframeRef,
  };
}
