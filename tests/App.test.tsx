/**
 * Main App Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import App from '../App';

vi.mock('../contexts/AppContext', () => ({
  AppProvider: ({ children }: any) => children,
  useAppContext: () => ({
    files: {},
    currentProject: null,
  }),
}));

vi.mock('../contexts/UIContext', () => ({
  UIProvider: ({ children }: any) => children,
  useUI: () => ({
    activeTab: 'editor',
    isGenerating: false,
  }),
}));

vi.mock('../contexts/ThemeContext', () => ({
  ThemeProvider: ({ children }: any) => children,
  useTheme: () => ({
    theme: 'light',
  }),
}));

describe('App', () => {
  it('should be defined', () => {
    expect(App).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof App).toBe('function');
  });
});
