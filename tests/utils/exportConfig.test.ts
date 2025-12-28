/**
 * Export Config Utils - Comprehensive Tests
 */

import { describe, it, expect } from 'vitest';
import {
  getPackageJson,
  getViteConfig,
  getTsConfig,
  getTailwindConfig,
  getPostcssConfig,
  getIndexHtml,
  getMainTsx,
  getTailwindCss,
  getReadme,
  getGitignore,
} from '../../utils/exportConfig';

describe('Export Config', () => {
  describe('getPackageJson', () => {
    it('should return valid package.json object', () => {
      const pkg = getPackageJson('test-app');

      expect(pkg).toBeDefined();
      expect(pkg).toHaveProperty('name', 'test-app');
      expect(pkg).toHaveProperty('version', '1.0.0');
      expect(pkg).toHaveProperty('private', true);
      expect(pkg).toHaveProperty('type', 'module');
    });

    it('should include required scripts', () => {
      const pkg = getPackageJson('my-app') as any;

      expect(pkg.scripts).toBeDefined();
      expect(pkg.scripts.dev).toBe('vite');
      expect(pkg.scripts.build).toBe('vite build');
      expect(pkg.scripts.preview).toBe('vite preview');
    });

    it('should include React dependencies', () => {
      const pkg = getPackageJson('app') as any;

      expect(pkg.dependencies).toBeDefined();
      expect(pkg.dependencies.react).toBeDefined();
      expect(pkg.dependencies['react-dom']).toBeDefined();
      expect(pkg.dependencies['lucide-react']).toBeDefined();
    });

    it('should include dev dependencies', () => {
      const pkg = getPackageJson('app') as any;

      expect(pkg.devDependencies).toBeDefined();
      expect(pkg.devDependencies.vite).toBeDefined();
      expect(pkg.devDependencies.typescript).toBeDefined();
      expect(pkg.devDependencies['@vitejs/plugin-react']).toBeDefined();
      expect(pkg.devDependencies.tailwindcss).toBeDefined();
    });
  });

  describe('getViteConfig', () => {
    it('should return valid Vite config string', () => {
      const config = getViteConfig();

      expect(config).toBeDefined();
      expect(typeof config).toBe('string');
      expect(config).toContain('defineConfig');
      expect(config).toContain('@vitejs/plugin-react');
      expect(config).toContain('plugins: [react()]');
    });

    it('should be valid JavaScript', () => {
      const config = getViteConfig();

      expect(config).toContain('import');
      expect(config).toContain('export default');
    });
  });

  describe('getTsConfig', () => {
    it('should return valid tsconfig object', () => {
      const config = getTsConfig() as any;

      expect(config).toBeDefined();
      expect(config.compilerOptions).toBeDefined();
      expect(config.include).toBeDefined();
    });

    it('should have correct compiler options', () => {
      const config = getTsConfig() as any;
      const opts = config.compilerOptions;

      expect(opts.target).toBe('ES2020');
      expect(opts.module).toBe('ESNext');
      expect(opts.jsx).toBe('react-jsx');
      expect(opts.strict).toBe(true);
      expect(opts.noEmit).toBe(true);
    });

    it('should include src directory', () => {
      const config = getTsConfig() as any;

      expect(config.include).toContain('src');
    });
  });

  describe('getTailwindConfig', () => {
    it('should return valid Tailwind config string', () => {
      const config = getTailwindConfig();

      expect(config).toBeDefined();
      expect(typeof config).toBe('string');
      expect(config).toContain('content');
      expect(config).toContain('theme');
      expect(config).toContain('plugins');
    });

    it('should include correct content paths', () => {
      const config = getTailwindConfig();

      expect(config).toContain('./index.html');
      expect(config).toContain('./src/**/*.{js,ts,jsx,tsx}');
    });
  });

  describe('getPostcssConfig', () => {
    it('should return valid PostCSS config string', () => {
      const config = getPostcssConfig();

      expect(config).toBeDefined();
      expect(typeof config).toBe('string');
      expect(config).toContain('plugins');
      expect(config).toContain('tailwindcss');
      expect(config).toContain('autoprefixer');
    });
  });

  describe('getIndexHtml', () => {
    it('should return valid HTML string', () => {
      const html = getIndexHtml();

      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('should have correct meta tags', () => {
      const html = getIndexHtml();

      expect(html).toContain('charset="UTF-8"');
      expect(html).toContain('viewport');
      expect(html).toContain('<title>FluidFlow App</title>');
    });

    it('should have root div and script', () => {
      const html = getIndexHtml();

      expect(html).toContain('<div id="root"></div>');
      expect(html).toContain('src="/src/main.tsx"');
      expect(html).toContain('type="module"');
    });
  });

  describe('getMainTsx', () => {
    it('should return valid main.tsx content', () => {
      const main = getMainTsx();

      expect(main).toBeDefined();
      expect(typeof main).toBe('string');
    });

    it('should import React and ReactDOM', () => {
      const main = getMainTsx();

      expect(main).toContain('import React from');
      expect(main).toContain('import ReactDOM from');
      expect(main).toContain('import App from');
      expect(main).toContain('import \'./index.css\'');
    });

    it('should render App in root element', () => {
      const main = getMainTsx();

      expect(main).toContain('ReactDOM.createRoot');
      expect(main).toContain('document.getElementById(\'root\')');
      expect(main).toContain('<App />');
      expect(main).toContain('React.StrictMode');
    });
  });

  describe('getTailwindCss', () => {
    it('should return valid Tailwind CSS', () => {
      const css = getTailwindCss();

      expect(css).toBeDefined();
      expect(typeof css).toBe('string');
    });

    it('should include Tailwind directives', () => {
      const css = getTailwindCss();

      expect(css).toContain('@tailwind base');
      expect(css).toContain('@tailwind components');
      expect(css).toContain('@tailwind utilities');
    });
  });

  describe('getReadme', () => {
    it('should return valid README content', () => {
      const readme = getReadme();

      expect(readme).toBeDefined();
      expect(typeof readme).toBe('string');
    });

    it('should have title and description', () => {
      const readme = getReadme();

      expect(readme).toContain('# FluidFlow App');
      expect(readme).toContain('Generated with FluidFlow');
    });

    it('should have getting started section', () => {
      const readme = getReadme();

      expect(readme).toContain('## Getting Started');
      expect(readme).toContain('npm install');
      expect(readme).toContain('npm run dev');
    });
  });

  describe('getGitignore', () => {
    it('should return valid .gitignore content', () => {
      const gitignore = getGitignore();

      expect(gitignore).toBeDefined();
      expect(typeof gitignore).toBe('string');
    });

    it('should ignore node_modules', () => {
      const gitignore = getGitignore();

      expect(gitignore).toContain('node_modules/');
    });

    it('should ignore environment files', () => {
      const gitignore = getGitignore();

      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('.env.local');
    });

    it('should ignore build directories', () => {
      const gitignore = getGitignore();

      expect(gitignore).toContain('dist/');
      expect(gitignore).toContain('build/');
    });

    it('should ignore IDE and OS files', () => {
      const gitignore = getGitignore();

      expect(gitignore).toContain('.idea/');
      expect(gitignore).toContain('.vscode/');
      expect(gitignore).toContain('.DS_Store');
      expect(gitignore).toContain('Thumbs.db');
    });

    it('should ignore log files', () => {
      const gitignore = getGitignore();

      expect(gitignore).toContain('*.log');
    });
  });
});
