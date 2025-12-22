// ESLint 9.x flat config (BUG-013 fix: migrate from .eslintrc.js)
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'projects', 'coverage', '*.config.js', '*.config.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React specific rules
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // General rules
      'no-console': ['warn', { allow: ['warn', 'error', 'debug', 'log'] }],
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always'],
    },
  },
  // Server-specific configuration
  {
    files: ['server/**/*.ts'],
    rules: {
      'no-console': 'off', // Server code can use console
    },
  },
  // Test-specific configuration
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  // Context providers need to export hooks alongside components
  {
    files: ['components/Toast/ToastContext.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // Error boundaries export utilities alongside the component
  {
    files: ['components/ErrorBoundary/index.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // Context menu exports provider, hooks, and utilities
  {
    files: ['components/ContextMenu/index.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // ConfirmDialog exports re-exported components and types
  {
    files: ['components/ConfirmDialog/index.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  }
);
