import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3100,
      host: '0.0.0.0',
      // HTTPS is handled by basicSsl plugin for WebContainer API
      watch: {
        // Ignore projects folder - file changes there shouldn't trigger HMR
        ignored: ['**/projects/**', '**/node_modules/**', '**/.git/**'],
      },
      headers: {
        // Required for WebContainer API (SharedArrayBuffer support)
        // Using 'credentialless' instead of 'require-corp' for better compatibility
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
      proxy: {
        // Proxy API requests to HTTP backend to avoid mixed content issues
        '/api': {
          target: 'http://localhost:3200',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [
      react(),
      basicSsl(), // Self-signed cert for local HTTPS
    ],
    css: {
      postcss: './postcss.config.js',
    },
    // SEC-004 fix: API keys are NOT exposed in frontend bundle
    // Users must configure their API keys through Settings UI, which stores them
    // securely (encrypted) in localStorage and backend. For development, set
    // GEMINI_API_KEY in .env and the backend will automatically configure the default provider.
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    optimizeDeps: {
      exclude: [
        '@typescript-eslint/typescript-estree',
        '@typescript-eslint/parser',
        'acorn',
        'acorn-walk',
        'glob',
        'fs',
        'path',
        'os'
      ]
    },
    build: {
      rollupOptions: {
        external: [
          '@typescript-eslint/typescript-estree',
          '@typescript-eslint/parser',
          'acorn',
          'acorn-walk',
          'glob',
          'fs',
          'path',
          'os'
        ]
      }
    }
  };
});
