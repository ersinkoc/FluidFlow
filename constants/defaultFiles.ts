/**
 * Default project files for new projects
 *
 * These files are used when:
 * - No project is open
 * - Creating a new project without initial files
 * - Resetting the app
 */

import type { FileSystem } from '@/types';

export const DEFAULT_FILES: FileSystem = {
  'package.json': JSON.stringify({
    name: "fluidflow-app",
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview"
    },
    dependencies: {
      "react": "^18.3.0",
      "react-dom": "^18.3.0",
      "lucide-react": "^0.400.0"
    },
    devDependencies: {
      "@vitejs/plugin-react": "^4.3.0",
      "vite": "^5.4.0",
      "typescript": "^5.5.0",
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
      "@types/node": "^20.0.0",
      "tailwindcss": "^3.4.0",
      "postcss": "^8.4.0",
      "autoprefixer": "^10.4.0"
    }
  }, null, 2),
  'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'src': path.resolve(__dirname, './src')
    }
  }
})`,
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: "ES2020",
      useDefineForClassFields: true,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: "react-jsx",
      strict: true,
      baseUrl: ".",
      paths: {
        "@/*": ["src/*"],
        "src/*": ["src/*"]
      }
    },
    include: ["src"]
  }, null, 2),
  'tailwind.config.js': `export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: []
}`,
  'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}`,
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FluidFlow App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`,
  'src/main.tsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)`,
  'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;`,
  'src/App.tsx': `export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">Welcome to FluidFlow</h1>
        <p className="text-slate-400">Upload a sketch to get started</p>
      </div>
    </div>
  )
}`
};
