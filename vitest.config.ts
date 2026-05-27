/**
 * Vitest configuration
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 40,
        functions: 19,
        branches: 30,
        statements: 39
      },
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        'coverage/',
        '.coverage-tmp/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      '@utils': path.resolve(__dirname, 'utils'),
      '@components': path.resolve(__dirname, 'components'),
      '@services': path.resolve(__dirname, 'services'),
      '@hooks': path.resolve(__dirname, 'hooks'),
      '@types': path.resolve(__dirname, 'types'),
      '@server': path.resolve(__dirname, 'server'),
    },
  },
});