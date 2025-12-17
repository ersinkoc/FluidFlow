/**
 * Sandbox HTML Generator
 *
 * Generates the complete HTML document for the iframe preview sandbox.
 * Includes React, Babel transpilation, router emulation, and console forwarding.
 */

import type { FileSystem } from '@/types';
import { KNOWN_LUCIDE_ICONS_LIST } from './importMappings';

/**
 * Build the complete HTML document for the iframe sandbox preview.
 * This includes:
 * - React and React DOM via ESM
 * - Babel transpilation
 * - Custom router emulation for React Router compatibility
 * - Console/error forwarding to parent window
 * - Inspect mode support
 */
export function buildIframeHtml(files: FileSystem, isInspectMode: boolean = false): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="about:blank">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { font-family: 'Inter', sans-serif; background-color: #ffffff; color: #1a1a1a; min-height: 100vh; margin: 0; }
    #root { min-height: 100vh; }
    .sandbox-loading { display: flex; flex-direction: column; align-items: center; justify-center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .sandbox-loading .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; }
    .sandbox-error { padding: 20px; background: #fee2e2; color: #dc2626; border-radius: 8px; margin: 20px; font-family: monospace; font-size: 14px; white-space: pre-wrap; }
    @keyframes spin { to { transform: rotate(360deg); } }
    ${isInspectMode ? `
    .inspect-highlight { outline: 2px solid #3b82f6 !important; outline-offset: 2px; background-color: rgba(59, 130, 246, 0.1) !important; cursor: crosshair !important; }
    .inspect-selected { outline: 3px solid #8b5cf6 !important; outline-offset: 2px; background-color: rgba(139, 92, 246, 0.1) !important; }
    * { cursor: crosshair !important; }
    ` : ''}
  </style>
</head>
<body>
  <div id="root">
    <div class="sandbox-loading">
      <div class="spinner"></div>
      <p style="margin-top: 16px; font-size: 14px;">Loading app...</p>
    </div>
  </div>
  <script>
    // Sandbox environment setup
    window.process = { env: { NODE_ENV: 'development' } };
    window.__SANDBOX_READY__ = false;

    // XSS-safe error display helper - escapes HTML entities
    const escapeHtmlForError = (text) => {
      const div = document.createElement('div');
      div.textContent = String(text || 'Unknown error');
      return div.innerHTML;
    };

    // Safe error display - prevents XSS via error messages
    const showSafeError = (prefix, err) => {
      const root = document.getElementById('root');
      if (root) {
        root.textContent = ''; // Clear safely
        const errorDiv = document.createElement('div');
        errorDiv.className = 'sandbox-error';
        errorDiv.textContent = prefix + ': ' + (err && err.message ? err.message : String(err || 'Unknown error'));
        root.appendChild(errorDiv);
      }
    };

    // Console forwarding with error filtering
    const notify = (type, msg) => window.parent.postMessage({ type: 'CONSOLE_LOG', logType: type, message: typeof msg === 'object' ? JSON.stringify(msg) : String(msg), timestamp: Date.now() }, '*');

    // Filter transient/harmless errors that shouldn't trigger auto-fix
    // IMPORTANT: Do NOT ignore fixable errors like "is not defined", "is not a function"
    const isIgnorableError = (msg) => {
      if (!msg) return true;
      const str = String(msg).toLowerCase();

      // These are truly transient/unfixable errors
      const ignorePatterns = [
        'resizeobserver',
        'script error',
        'loading chunk',
        'dynamically imported module',
        'failed to fetch',
        'network error',
        'hydrat',
        'unmounted component',
        'memory leak',
        'perform a react state update',
        'maximum update depth exceeded',
        'each child in a list should have a unique',
        'validatedomnesting',
        'received true for a non-boolean',
        'received false for a non-boolean',
        'unknown prop',
        'invalid prop',
        'failed prop type',
        'minified react error',
        'suspended while rendering',
        '__esmodule',
        'cannot redefine property'
      ];

      // These errors ARE fixable - do NOT ignore them
      // - "X is not defined" → missing import/declaration
      // - "X is not a function" → wrong import or missing export
      // - "cannot read properties of null/undefined" → null check needed
      // - "nothing was returned from render" → missing return statement

      return ignorePatterns.some(p => str.includes(p));
    };

    console.log = (...args) => { notify('log', args.join(' ')); };
    console.warn = (...args) => { notify('warn', args.join(' ')); };
    console.error = (...args) => {
      const msg = args.join(' ');
      // Still log to console but mark as ignorable for auto-fix
      notify('error', isIgnorableError(msg) ? '[TRANSIENT] ' + msg : msg);
    };
    window.onerror = function(msg) {
      notify('error', isIgnorableError(msg) ? '[TRANSIENT] ' + msg : msg);
      return false;
    };

    // Patch URL constructor FIRST - before any library loads
    (function() {
      var OriginalURL = window.URL;
      window.URL = function URL(url, base) {
        // Handle various edge cases
        if (url === undefined || url === null || url === '') {
          url = '/';
        }
        url = String(url);
        // If url is relative, provide default base
        if ((url.startsWith('/') || !url.includes('://')) && !base) {
          base = 'http://localhost';
        }
        try {
          return new OriginalURL(url, base);
        } catch (e) {
          // Last resort fallback
          return new OriginalURL('http://localhost' + (url.startsWith('/') ? url : '/' + url));
        }
      };
      window.URL.prototype = OriginalURL.prototype;
      window.URL.createObjectURL = OriginalURL.createObjectURL;
      window.URL.revokeObjectURL = OriginalURL.revokeObjectURL;
      window.URL.canParse = OriginalURL.canParse;
    })();

    // Inspect Mode
    window.__INSPECT_MODE__ = ${isInspectMode};
    ${isInspectMode ? getInspectModeScript() : ''}

    // Enhanced in-memory router state with full URL support
    window.__SANDBOX_ROUTER__ = {
      currentPath: '/',
      currentState: null,
      search: '',
      hash: '',
      listeners: [],

      navigate: function(path, state, skipNotify) {
        if (state === undefined) state = null;
        // Ensure path is a string
        path = String(path || '/');
        if (!path.startsWith('/')) path = '/' + path;

        // Parse URL manually (URL constructor is unreliable in sandbox)
        var pathname = path;
        var search = '';
        var hash = '';

        // Extract hash
        var hashIndex = path.indexOf('#');
        if (hashIndex >= 0) {
          hash = path.substring(hashIndex);
          pathname = path.substring(0, hashIndex);
        }

        // Extract search/query
        var searchIndex = pathname.indexOf('?');
        if (searchIndex >= 0) {
          search = pathname.substring(searchIndex);
          pathname = pathname.substring(0, searchIndex);
        }

        this.currentPath = pathname || '/';
        this.search = search;
        this.hash = hash;
        this.currentState = state;

        const location = this.getLocation();
        this.listeners.forEach(fn => fn(location));
        console.log('[Router] Navigated to: ' + this.currentPath + this.search + this.hash);

        // Notify parent of URL change (unless skipped for internal operations)
        if (!skipNotify) {
          this.notifyParent();
        }
      },

      notifyParent: function() {
        var historyInfo = window.__HISTORY_INFO__ || { index: 0, length: 1 };
        window.parent.postMessage({
          type: 'URL_CHANGE',
          url: this.currentPath + this.search + this.hash,
          canGoBack: historyInfo.index > 0,
          canGoForward: historyInfo.index < historyInfo.length - 1
        }, '*');
      },

      getLocation: function() {
        return {
          pathname: this.currentPath,
          search: this.search,
          hash: this.hash,
          state: this.currentState,
          key: Math.random().toString(36).substring(2, 8)
        };
      },

      subscribe: function(fn) {
        this.listeners.push(fn);
        return function() {
          window.__SANDBOX_ROUTER__.listeners = window.__SANDBOX_ROUTER__.listeners.filter(function(l) { return l !== fn; });
        };
      },

      getPath: function() { return this.currentPath; }
    };

    ${getHistoryEmulationScript()}
    ${getLinkInterceptionScript()}
    ${getLocationOverrideScript()}
    ${getSandboxHooksScript()}
  </script>
  <script type="text/babel" data-presets="react,typescript">
    ${getBootstrapScript(files)}
  </script>
</body>
</html>`;
}

/**
 * Generate the inspect mode script for element selection
 */
function getInspectModeScript(): string {
  return `
    (function() {
      let highlightedEl = null;
      let selectedEl = null;

      // Try to get React component name from fiber
      function getComponentName(element) {
        // Try to find React fiber
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let fiber = element[fiberKey];
          while (fiber) {
            if (fiber.type && typeof fiber.type === 'function') {
              return fiber.type.displayName || fiber.type.name || null;
            }
            if (fiber.type && typeof fiber.type === 'string') {
              // This is a DOM element, go up to parent
            }
            fiber = fiber.return;
          }
        }
        return null;
      }

      // Get parent component chain
      function getParentComponents(element) {
        const parents = [];
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let fiber = element[fiberKey];
          while (fiber) {
            if (fiber.type && typeof fiber.type === 'function') {
              const name = fiber.type.displayName || fiber.type.name;
              if (name && !parents.includes(name)) {
                parents.push(name);
              }
            }
            fiber = fiber.return;
          }
        }
        return parents.slice(0, 5); // Limit to 5 parents
      }

      document.addEventListener('mouseover', function(e) {
        if (e.target === document.body || e.target === document.documentElement || e.target.id === 'root') return;

        if (highlightedEl && highlightedEl !== e.target) {
          highlightedEl.classList.remove('inspect-highlight');
        }

        e.target.classList.add('inspect-highlight');
        highlightedEl = e.target;

        const rect = e.target.getBoundingClientRect();
        window.parent.postMessage({
          type: 'INSPECT_HOVER',
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        }, '*');
      }, true);

      document.addEventListener('mouseout', function(e) {
        if (highlightedEl) {
          highlightedEl.classList.remove('inspect-highlight');
        }
        window.parent.postMessage({ type: 'INSPECT_LEAVE' }, '*');
      }, true);

      document.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const target = e.target;
        const rect = target.getBoundingClientRect();
        const componentName = getComponentName(target);
        const parentComponents = getParentComponents(target);

        // Remove highlight from hovered element
        if (highlightedEl) {
          highlightedEl.classList.remove('inspect-highlight');
        }

        // Remove selected class from previously selected element
        if (selectedEl && selectedEl !== target) {
          selectedEl.classList.remove('inspect-selected');
        }

        target.classList.add('inspect-selected');
        selectedEl = target;

        window.parent.postMessage({
          type: 'INSPECT_SELECT',
          element: {
            tagName: target.tagName,
            className: target.className.replace('inspect-highlight', '').replace('inspect-selected', '').trim(),
            id: target.id || null,
            textContent: target.textContent?.slice(0, 200) || null,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
            componentName: componentName,
            parentComponents: parentComponents.length > 0 ? parentComponents : null,
            ffGroup: target.getAttribute('data-ff-group') || null,
            ffId: target.getAttribute('data-ff-id') || null
          }
        }, '*');
      }, true);

      // Update selection rect on scroll
      document.addEventListener('scroll', function() {
        if (selectedEl) {
          const rect = selectedEl.getBoundingClientRect();
          window.parent.postMessage({
            type: 'INSPECT_SCROLL',
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          }, '*');
        }
      }, true);

      // Also listen to window scroll for cases where body doesn't scroll
      window.addEventListener('scroll', function() {
        if (selectedEl) {
          const rect = selectedEl.getBoundingClientRect();
          window.parent.postMessage({
            type: 'INSPECT_SCROLL',
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          }, '*');
        }
      }, true);
    })();
    `;
}

/**
 * Generate the history API emulation script
 */
function getHistoryEmulationScript(): string {
  return `
    // History API emulation for React Router compatibility
    (function() {
      var historyStack = [{ state: null, title: '', url: '/' }];
      var historyIndex = 0;

      // Update global history info for URL bar
      function updateHistoryInfo() {
        window.__HISTORY_INFO__ = {
          index: historyIndex,
          length: historyStack.length
        };
      }
      updateHistoryInfo();

      // Store our custom history implementation
      var customHistory = {
        get length() { return historyStack.length; },
        get state() { return historyStack[historyIndex] ? historyStack[historyIndex].state : null; },
        get scrollRestoration() { return 'auto'; },
        set scrollRestoration(val) { /* noop */ },

        pushState: function(state, title, url) {
          historyStack = historyStack.slice(0, historyIndex + 1);
          historyStack.push({ state: state, title: title, url: url || '/' });
          historyIndex = historyStack.length - 1;
          updateHistoryInfo();
          window.__SANDBOX_ROUTER__.navigate(url || '/', state);
          // Dispatch popstate to trigger React Router re-render
          window.dispatchEvent(new PopStateEvent('popstate', { state: state }));
        },

        replaceState: function(state, title, url) {
          historyStack[historyIndex] = { state: state, title: title, url: url || '/' };
          updateHistoryInfo();
          window.__SANDBOX_ROUTER__.navigate(url || '/', state);
          // Dispatch popstate to trigger React Router re-render
          window.dispatchEvent(new PopStateEvent('popstate', { state: state }));
        },

        back: function() {
          if (historyIndex > 0) {
            historyIndex--;
            updateHistoryInfo();
            var entry = historyStack[historyIndex];
            window.__SANDBOX_ROUTER__.navigate(entry.url, entry.state);
            window.dispatchEvent(new PopStateEvent('popstate', { state: entry.state }));
          }
        },

        forward: function() {
          if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            updateHistoryInfo();
            var entry = historyStack[historyIndex];
            window.__SANDBOX_ROUTER__.navigate(entry.url, entry.state);
            window.dispatchEvent(new PopStateEvent('popstate', { state: entry.state }));
          }
        },

        go: function(delta) {
          var newIndex = historyIndex + delta;
          if (newIndex >= 0 && newIndex < historyStack.length) {
            historyIndex = newIndex;
            updateHistoryInfo();
            var entry = historyStack[historyIndex];
            window.__SANDBOX_ROUTER__.navigate(entry.url, entry.state);
            window.dispatchEvent(new PopStateEvent('popstate', { state: entry.state }));
          }
        }
      };

      // Make it globally accessible
      window.__SANDBOX_HISTORY__ = customHistory;

      // Try to override native history methods (safer approach)
      try {
        var nativeHistory = window.history;
        Object.defineProperty(window, 'history', {
          get: function() { return customHistory; },
          configurable: true
        });
        console.log('[Sandbox] History API fully overridden');
      } catch (e) {
        // If we can't override window.history, at least override its methods
        try {
          window.history.pushState = customHistory.pushState;
          window.history.replaceState = customHistory.replaceState;
          window.history.back = customHistory.back;
          window.history.forward = customHistory.forward;
          window.history.go = customHistory.go;
          console.log('[Sandbox] History methods overridden');
        } catch (e2) {
          console.warn('[Sandbox] Could not override history API, using fallback');
        }
      }

      // Listen for navigation commands from parent window
      window.addEventListener('message', function(event) {
        if (!event.data || !event.data.type) return;

        if (event.data.type === 'NAVIGATE') {
          customHistory.pushState(null, '', event.data.url);
        } else if (event.data.type === 'GO_BACK') {
          customHistory.back();
        } else if (event.data.type === 'GO_FORWARD') {
          customHistory.forward();
        }
      });

      console.log('[Sandbox] History API emulation initialized');
    })();
  `;
}

/**
 * Generate the link interception script
 */
function getLinkInterceptionScript(): string {
  return `
    // Intercept all link clicks to prevent navigation outside sandbox
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (link) {
        const href = link.getAttribute('href');
        if (href) {
          e.preventDefault();
          e.stopPropagation();

          // Handle different link types
          if (href.startsWith('http://') || href.startsWith('https://')) {
            // External links - open in new tab
            window.open(href, '_blank', 'noopener,noreferrer');
            console.log('[Sandbox] External link opened in new tab: ' + href);
          } else if (href.startsWith('mailto:') || href.startsWith('tel:')) {
            // Allow mailto/tel links
            window.open(href, '_self');
          } else if (href.startsWith('#')) {
            // Hash navigation - scroll to element and update hash
            const id = href.substring(1);
            const el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
            // Use our custom history for proper history tracking
            window.__SANDBOX_HISTORY__.pushState(null, '', href);
          } else {
            // Internal navigation - use our custom history
            window.__SANDBOX_HISTORY__.pushState(null, '', href);
          }
        }
      }
    }, true);

    // Intercept form submissions
    document.addEventListener('submit', function(e) {
      const form = e.target;
      if (form.tagName === 'FORM') {
        e.preventDefault();
        const action = form.getAttribute('action') || '/';
        const method = form.getAttribute('method') || 'GET';
        console.log('[Sandbox] Form submitted: ' + method + ' ' + action);
        // Use our custom history
        window.__SANDBOX_HISTORY__.pushState(null, '', action);
      }
    }, true);
  `;
}

/**
 * Generate the location override script
 */
function getLocationOverrideScript(): string {
  return `
    // Override window.location for React Router to read correct pathname
    // Note: SecurityError occurs when navigating, not reading - so we use our custom history for writes
    (function() {
      var fakeLocation = {
        get href() { return 'http://localhost' + window.__SANDBOX_ROUTER__.currentPath + window.__SANDBOX_ROUTER__.search + window.__SANDBOX_ROUTER__.hash; },
        get pathname() { return window.__SANDBOX_ROUTER__.currentPath; },
        get search() { return window.__SANDBOX_ROUTER__.search; },
        get hash() { return window.__SANDBOX_ROUTER__.hash; },
        get origin() { return 'http://localhost'; },
        get host() { return 'localhost'; },
        get hostname() { return 'localhost'; },
        get port() { return ''; },
        get protocol() { return 'http:'; },
        assign: function(url) { window.__SANDBOX_HISTORY__.pushState(null, '', url); },
        replace: function(url) { window.__SANDBOX_HISTORY__.replaceState(null, '', url); },
        reload: function() { console.log('[Sandbox] Reload blocked'); },
        toString: function() { return this.href; }
      };

      try {
        Object.defineProperty(window, 'location', {
          get: function() { return fakeLocation; },
          set: function(url) { window.__SANDBOX_HISTORY__.pushState(null, '', url); },
          configurable: true
        });
        console.log('[Sandbox] Location override successful');
      } catch (e) {
        console.warn('[Sandbox] Could not override location:', e.message);
      }
    })();
  `;
}

/**
 * Generate the sandbox hooks script for React Router compatibility
 */
function getSandboxHooksScript(): string {
  return `
    // Provide useLocation and useNavigate hooks for React Router-like experience
    window.__SANDBOX_HOOKS__ = {
      useLocation: function() {
        const React = window.React;
        if (!React) return window.__SANDBOX_ROUTER__.getLocation();
        const [location, setLocation] = React.useState(window.__SANDBOX_ROUTER__.getLocation());
        React.useEffect(function() {
          return window.__SANDBOX_ROUTER__.subscribe(function(loc) {
            setLocation(loc);
          });
        }, []);
        return location;
      },
      useNavigate: function() {
        return function(to, options) {
          var hist = window.__SANDBOX_HISTORY__;
          if (options && options.replace) {
            hist.replaceState(options.state || null, '', to);
          } else {
            hist.pushState(options && options.state || null, '', to);
          }
        };
      },
      useParams: function() {
        // Basic params extraction - apps should use React Router for full functionality
        return {};
      },
      useSearchParams: function() {
        const React = window.React;
        const location = window.__SANDBOX_HOOKS__.useLocation();
        const searchParams = new URLSearchParams(location.search);
        const setSearchParams = function(params) {
          const newSearch = '?' + new URLSearchParams(params).toString();
          window.__SANDBOX_HISTORY__.pushState(null, '', location.pathname + newSearch + location.hash);
        };
        return [searchParams, setSearchParams];
      },
      Link: function(props) {
        const React = window.React;
        return React.createElement('a', {
          ...props,
          href: props.to || props.href,
          onClick: function(e) {
            e.preventDefault();
            var hist = window.__SANDBOX_HISTORY__;
            if (props.replace) {
              hist.replaceState(props.state || null, '', props.to || props.href);
            } else {
              hist.pushState(props.state || null, '', props.to || props.href);
            }
            if (props.onClick) props.onClick(e);
          }
        }, props.children);
      },
      NavLink: function(props) {
        const React = window.React;
        const location = window.__SANDBOX_HOOKS__.useLocation();
        const isActive = location.pathname === props.to;
        const className = typeof props.className === 'function'
          ? props.className({ isActive: isActive })
          : (isActive && props.activeClassName) || props.className;
        return React.createElement('a', {
          ...props,
          className: className,
          href: props.to || props.href,
          'aria-current': isActive ? 'page' : undefined,
          onClick: function(e) {
            e.preventDefault();
            window.__SANDBOX_HISTORY__.pushState(props.state || null, '', props.to || props.href);
            if (props.onClick) props.onClick(e);
          }
        }, props.children);
      }
    };
  `;
}

/**
 * Generate the bootstrap script that compiles and runs the user's code
 */
function getBootstrapScript(files: FileSystem): string {
  return `
    (async () => {
      const files = JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(files))}"));
      // Create a custom react-router-dom wrapper that makes BrowserRouter work in sandbox
      const routerShimCode = \`
        import * as ReactRouterDom from 'https://esm.sh/react-router-dom@6.28.0?external=react,react-dom';
        import React from 'https://esm.sh/react@19.0.0';

        // Re-export everything from react-router-dom
        export * from 'https://esm.sh/react-router-dom@6.28.0?external=react,react-dom';

        // Custom BrowserRouter that uses MemoryRouter internally for sandbox compatibility
        export function BrowserRouter({ children, ...props }) {
          const [location, setLocation] = React.useState(window.__SANDBOX_ROUTER__.getLocation());

          React.useEffect(() => {
            return window.__SANDBOX_ROUTER__.subscribe((loc) => {
              setLocation({ ...loc });
            });
          }, []);

          return React.createElement(
            ReactRouterDom.MemoryRouter,
            {
              initialEntries: [location.pathname + location.search + location.hash],
              ...props
            },
            React.createElement(SandboxRouterSync, { location }, children)
          );
        }

        // Internal component to sync MemoryRouter with our sandbox router
        function SandboxRouterSync({ location, children }) {
          const navigate = ReactRouterDom.useNavigate();
          const routerLocation = ReactRouterDom.useLocation();

          React.useEffect(() => {
            const fullPath = location.pathname + location.search + location.hash;
            const currentPath = routerLocation.pathname + routerLocation.search + routerLocation.hash;
            if (fullPath !== currentPath) {
              navigate(fullPath, { replace: true });
            }
          }, [location, navigate, routerLocation]);

          return children;
        }

        // Override useNavigate to use our sandbox history
        const originalUseNavigate = ReactRouterDom.useNavigate;
        export function useNavigate() {
          const memoryNavigate = originalUseNavigate();
          return (to, options) => {
            // Update our sandbox router
            if (typeof to === 'string') {
              if (options?.replace) {
                window.__SANDBOX_HISTORY__.replaceState(options?.state || null, '', to);
              } else {
                window.__SANDBOX_HISTORY__.pushState(options?.state || null, '', to);
              }
            } else if (typeof to === 'number') {
              window.__SANDBOX_HISTORY__.go(to);
            }
          };
        }
      \`;
      const routerShimUrl = URL.createObjectURL(new Blob([routerShimCode], { type: 'application/javascript' }));

      const importMap = {
        imports: {
          // React core
          "react": "https://esm.sh/react@19.0.0",
          "react/jsx-runtime": "https://esm.sh/react@19.0.0/jsx-runtime",
          "react/jsx-dev-runtime": "https://esm.sh/react@19.0.0/jsx-dev-runtime",
          "react-dom": "https://esm.sh/react-dom@19.0.0",
          "react-dom/client": "https://esm.sh/react-dom@19.0.0/client",
          // React Router - using our custom shim for sandbox compatibility
          "react-router-dom": routerShimUrl,
          "react-router": "https://esm.sh/react-router@6.28.0?external=react",
          // Icons
          "lucide-react": "https://esm.sh/lucide-react@0.469.0",
          // Utilities
          "clsx": "https://esm.sh/clsx@2.1.1",
          "classnames": "https://esm.sh/classnames@2.5.1",
          "tailwind-merge": "https://esm.sh/tailwind-merge@2.5.4",
          // Animation
          "framer-motion": "https://esm.sh/framer-motion@11.11.17?external=react,react-dom",
          "motion": "https://esm.sh/motion@12.0.0?external=react,react-dom",
          "motion/react": "https://esm.sh/motion@12.0.0/react?external=react,react-dom",
          // Date handling
          "date-fns": "https://esm.sh/date-fns@4.1.0",
          // State management (lightweight)
          "zustand": "https://esm.sh/zustand@5.0.1?external=react",
          // Form handling
          "react-hook-form": "https://esm.sh/react-hook-form@7.53.2?external=react"
        }
      };

      // Helper to resolve relative paths to absolute
      function resolvePath(fromFile, importPath) {
        if (!importPath.startsWith('.')) return importPath;
        const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
        const parts = fromDir.split('/').filter(Boolean);
        const importParts = importPath.split('/');

        for (const part of importParts) {
          if (part === '.') continue;
          if (part === '..') parts.pop();
          else parts.push(part);
        }
        return parts.join('/');
      }

      // Helper to find actual file (handles missing extensions)
      function findFile(path) {
        if (files[path]) return path;
        const extensions = ['.tsx', '.ts', '.jsx', '.js'];
        for (const ext of extensions) {
          if (files[path + ext]) return path + ext;
        }
        // Try index files
        for (const ext of extensions) {
          if (files[path + '/index' + ext]) return path + '/index' + ext;
        }
        return null;
      }

      ${getKnownLucideIconsScript()}

      // Transform lucide-react imports to replace unknown icons with HelpCircle
      function transformLucideImports(code) {
        return code.replace(
          /import\\s*{([^}]+)}\\s*from\\s*['"]lucide-react['"]/g,
          (match, imports) => {
            const iconList = imports.split(',').map(s => s.trim()).filter(Boolean);
            const transformed = iconList.map(icon => {
              // Handle 'as' aliasing like "Star as StarIcon"
              const [iconName, alias] = icon.split(/\\s+as\\s+/).map(s => s.trim());
              if (KNOWN_LUCIDE_ICONS.has(iconName)) {
                return icon; // Keep as is
              }
              // Replace unknown icon with HelpCircle
              console.warn('[Lucide] Unknown icon "' + iconName + '" replaced with HelpCircle');
              return alias ? 'HelpCircle as ' + alias : 'HelpCircle as ' + iconName;
            });
            return 'import { ' + transformed.join(', ') + " } from 'lucide-react'";
          }
        );
      }

      // Transform imports in code to use absolute paths
      function transformImports(code, fromFile) {
        // First transform lucide imports
        code = transformLucideImports(code);
        return code.replace(
          /(import\\s+(?:[\\w{},\\s*]+\\s+from\\s+)?['"])([^'"]+)(['"])/g,
          (match, prefix, importPath, suffix) => {
            if (importPath.startsWith('.')) {
              const resolved = resolvePath(fromFile, importPath);
              const actualFile = findFile(resolved);
              if (actualFile) {
                return prefix + actualFile + suffix;
              }
              return prefix + resolved + suffix;
            }
            return match;
          }
        ).replace(
          /(export\\s+(?:[\\w{},\\s*]+\\s+from\\s+)?['"])([^'"]+)(['"])/g,
          (match, prefix, importPath, suffix) => {
            if (importPath.startsWith('.')) {
              const resolved = resolvePath(fromFile, importPath);
              const actualFile = findFile(resolved);
              if (actualFile) {
                return prefix + actualFile + suffix;
              }
              return prefix + resolved + suffix;
            }
            return match;
          }
        );
      }

      // Process all files
      const errors = [];
      console.log('[Sandbox] Processing ' + Object.keys(files).length + ' files...');

      for (const [filename, content] of Object.entries(files)) {
        if (/\\.(tsx|ts|jsx|js)$/.test(filename)) {
          try {
            // Transform relative imports to absolute before transpiling
            const transformedContent = transformImports(content, filename);
            const transpiled = Babel.transform(transformedContent, {
              presets: ['react', ['env', { modules: false }], 'typescript'],
              filename
            }).code;
            const url = URL.createObjectURL(new Blob([transpiled], { type: 'application/javascript' }));

            // Add multiple import map entries for flexibility
            importMap.imports[filename] = url;
            importMap.imports[filename.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;

            // Also add relative-style entries from src
            if (filename.startsWith('src/')) {
              const relativePath = './' + filename.substring(4);
              importMap.imports[relativePath] = url;
              importMap.imports[relativePath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;

              // Also support imports without src/ prefix
              const withoutSrc = filename.substring(4);
              importMap.imports[withoutSrc] = url;
              importMap.imports[withoutSrc.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
            }

            // Support component folder imports (e.g., 'components/Header' -> 'src/components/Header.tsx')
            if (filename.includes('/components/')) {
              const componentPath = filename.split('/components/')[1];
              if (componentPath) {
                importMap.imports['components/' + componentPath] = url;
                importMap.imports['components/' + componentPath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
                importMap.imports['./components/' + componentPath] = url;
                importMap.imports['./components/' + componentPath.replace(/\\.(tsx|ts|jsx|js)$/, '')] = url;
              }
            }

            console.log('[Sandbox] Compiled: ' + filename);
          } catch (err) {
            console.error('[Sandbox] Transpilation failed for ' + filename + ': ' + err.message);
            errors.push({ file: filename, error: err.message });
          }
        } else if (/\\.css$/.test(filename)) {
          // Handle CSS files - inject as style tag
          const style = document.createElement('style');
          style.textContent = content;
          style.setAttribute('data-file', filename);
          document.head.appendChild(style);
          // Create dummy module for CSS imports
          const cssModule = 'export default {};';
          const url = URL.createObjectURL(new Blob([cssModule], { type: 'application/javascript' }));
          importMap.imports[filename] = url;
          importMap.imports[filename.replace(/\\.css$/, '')] = url;
          console.log('[Sandbox] Loaded CSS: ' + filename);
        } else if (/\\.json$/.test(filename)) {
          // Handle JSON files
          try {
            const jsonModule = 'export default ' + content + ';';
            const url = URL.createObjectURL(new Blob([jsonModule], { type: 'application/javascript' }));
            importMap.imports[filename] = url;
            importMap.imports[filename.replace(/\\.json$/, '')] = url;
          } catch (err) {
            console.error('[Sandbox] JSON parse failed for ' + filename);
          }
        }
      }

      if (errors.length > 0) {
        console.warn('[Sandbox] ' + errors.length + ' file(s) failed to compile');
      }

      const mapScript = document.createElement('script');
      mapScript.type = "importmap";
      mapScript.textContent = JSON.stringify(importMap);
      document.head.appendChild(mapScript);

      // Bootstrap code that makes React hooks globally available
      const bootstrapCode = \`
        import * as React from 'react';
        import { createRoot } from 'react-dom/client';
        import App from 'src/App.tsx';

        // Make React and hooks globally available
        window.React = React;
        window.useState = React.useState;
        window.useEffect = React.useEffect;
        window.useCallback = React.useCallback;
        window.useMemo = React.useMemo;
        window.useRef = React.useRef;
        window.useContext = React.useContext;
        window.useReducer = React.useReducer;
        window.useLayoutEffect = React.useLayoutEffect;
        window.createContext = React.createContext;
        window.forwardRef = React.forwardRef;
        window.memo = React.memo;
        window.Fragment = React.Fragment;

        // Render the app
        try {
          const root = createRoot(document.getElementById('root'));
          root.render(React.createElement(React.StrictMode, null, React.createElement(App)));
          window.__SANDBOX_READY__ = true;
          console.log('[Sandbox] App mounted successfully');
        } catch (err) {
          console.error('[Sandbox] Failed to mount app:', err.message);
          showSafeError('Error', err);
        }
      \`;

      const script = document.createElement('script');
      script.type = 'module';
      try {
        const transpiledBootstrap = Babel.transform(bootstrapCode, {
          presets: ['react', ['env', { modules: false }], 'typescript'],
          filename: 'bootstrap.tsx'
        }).code;
        script.src = URL.createObjectURL(new Blob([transpiledBootstrap], { type: 'application/javascript' }));
        document.body.appendChild(script);
      } catch (err) {
        console.error('[Sandbox] Bootstrap transpilation failed:', err.message);
        showSafeError('Bootstrap Error', err);
      }
    })().catch(err => {
      console.error('[Sandbox] Initialization failed:', err.message);
      showSafeError('Init Error', err);
    });
  `;
}

/**
 * Generate the known Lucide icons set script
 * Uses centralized KNOWN_LUCIDE_ICONS_LIST from importMappings.ts
 */
function getKnownLucideIconsScript(): string {
  // Generate JavaScript Set from the centralized icon list
  const iconListStr = KNOWN_LUCIDE_ICONS_LIST.map(icon => `'${icon}'`).join(', ');
  return `
      // Known lucide-react icons (from importMappings.ts)
      const KNOWN_LUCIDE_ICONS = new Set([${iconListStr}]);
  `;
}
