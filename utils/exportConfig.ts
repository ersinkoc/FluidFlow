/**
 * Export Configuration Generators
 *
 * Helper functions for generating project configuration files
 * for ZIP export and GitHub push functionality.
 */

/**
 * Generate package.json content
 */
export function getPackageJson(name: string): object {
  return {
    name,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^18.3.0',
      'react-dom': '^18.3.0',
      'lucide-react': '^0.400.0',
    },
    devDependencies: {
      '@vitejs/plugin-react': '^4.3.0',
      vite: '^5.4.0',
      typescript: '^5.5.0',
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.0',
      tailwindcss: '^3.4.0',
      postcss: '^8.4.0',
      autoprefixer: '^10.4.0',
    },
  };
}

/**
 * Generate vite.config.ts content
 */
export function getViteConfig(): string {
  return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({ plugins: [react()] })`;
}

/**
 * Generate tsconfig.json content
 */
export function getTsConfig(): object {
  return {
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
      strict: true,
    },
    include: ['src'],
  };
}

/**
 * Generate tailwind.config.js content
 */
export function getTailwindConfig(): string {
  return `export default { content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] }`;
}

/**
 * Generate postcss.config.js content
 */
export function getPostcssConfig(): string {
  return `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`;
}

/**
 * Generate index.html content
 */
export function getIndexHtml(): string {
  return `<!DOCTYPE html>
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
</html>`;
}

/**
 * Generate src/main.tsx content
 */
export function getMainTsx(): string {
  return `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)`;
}

/**
 * Generate default Tailwind CSS content
 */
export function getTailwindCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;`;
}

/**
 * Generate README.md content
 */
export function getReadme(): string {
  return `# FluidFlow App

Generated with FluidFlow - Sketch to App

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\``;
}

/**
 * Generate default .gitignore content
 */
export function getGitignore(): string {
  return `# Dependencies
node_modules/

# Environment
.env
.env.local
.env.*.local

# Build
dist/
build/

# IDE
.idea/
.vscode/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
`;
}
