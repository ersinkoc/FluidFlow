/**
 * useExport Hook
 *
 * Handles project export functionality including ZIP download
 * and GitHub push operations.
 * Extracted from PreviewPanel to reduce complexity.
 */

import { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FileSystem, PushResult } from '../types';
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
} from '../utils/exportConfig';

export interface UseExportOptions {
  files: FileSystem;
  appCode: string | undefined;
}

export interface UseExportReturn {
  // Export modal
  showExportModal: boolean;
  setShowExportModal: (show: boolean) => void;
  isDownloading: boolean;
  downloadAsZip: () => Promise<void>;

  // GitHub modal
  showGithubModal: boolean;
  setShowGithubModal: (show: boolean) => void;
  githubToken: string;
  setGithubToken: (token: string) => void;
  repoName: string;
  setRepoName: (name: string) => void;
  isPushing: boolean;
  pushResult: PushResult | null;
  setPushResult: (result: PushResult | null) => void;
  pushToGithub: () => Promise<void>;
}

export function useExport(options: UseExportOptions): UseExportReturn {
  const { files, appCode } = options;

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // GitHub modal state
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [repoName, setRepoName] = useState('fluidflow-app');
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);

  /**
   * Download project as ZIP file
   */
  const downloadAsZip = useCallback(async () => {
    if (!appCode) return;
    setIsDownloading(true);
    try {
      const zip = new JSZip();

      // Add standard files
      zip.file('package.json', JSON.stringify(getPackageJson(repoName), null, 2));
      zip.file('vite.config.ts', getViteConfig());
      zip.file('tsconfig.json', JSON.stringify(getTsConfig(), null, 2));
      zip.file('tailwind.config.js', getTailwindConfig());
      zip.file('postcss.config.js', getPostcssConfig());
      zip.file('index.html', getIndexHtml());
      zip.file('src/main.tsx', getMainTsx());
      zip.file('src/index.css', files['src/index.css'] || getTailwindCss());
      zip.file('README.md', getReadme());

      // Add .gitignore if not exists
      if (!files['.gitignore']) {
        zip.file(
          '.gitignore',
          `# Dependencies
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
`
        );
      }

      // Generate .env.example from .env
      if (files['.env']) {
        const envExample = files['.env']
          .split('\n')
          .map((line) => {
            if (!line.trim() || line.startsWith('#')) return line;
            const match = line.match(/^([A-Z_][A-Z0-9_]*)=/i);
            if (match) return `${match[1]}=your_${match[1].toLowerCase()}_here`;
            return line;
          })
          .join('\n');
        zip.file('.env.example', envExample);
      }

      // Add all project files
      for (const [path, content] of Object.entries(files) as [string, string][]) {
        if (path === 'src/index.css') continue;
        const fixedContent = content
          .replace(/from ['"]src\//g, "from './")
          .replace(/import ['"]src\//g, "import './");
        zip.file(path, fixedContent);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, 'fluidflow-app.zip');
    } catch (error) {
      console.error(error);
    } finally {
      setIsDownloading(false);
      setShowExportModal(false);
    }
  }, [appCode, files, repoName]);

  /**
   * Push project to GitHub
   */
  const pushToGithub = useCallback(async () => {
    if (!githubToken || !repoName || !appCode) return;
    setIsPushing(true);
    setPushResult(null);

    try {
      // Create repository
      const createRepoRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `token ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: repoName,
          description: 'Generated with FluidFlow',
          private: false,
          auto_init: true,
        }),
      });

      if (!createRepoRes.ok) {
        const errorData = await createRepoRes.json();
        throw new Error(errorData.message);
      }

      const repoData = await createRepoRes.json();

      // Get user info for commit
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${githubToken}` },
      });
      const userData = await userRes.json();

      // Wait for repo to be ready
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get default branch ref
      const refRes = await fetch(
        `https://api.github.com/repos/${userData.login}/${repoName}/git/ref/heads/main`,
        {
          headers: { Authorization: `token ${githubToken}` },
        }
      );

      if (!refRes.ok) {
        throw new Error('Failed to get repository reference');
      }

      const refData = await refRes.json();
      const baseSha = refData.object.sha;

      // Create blobs for all files
      const filesToPush = [
        { path: 'package.json', content: JSON.stringify(getPackageJson(repoName), null, 2) },
        { path: 'vite.config.ts', content: getViteConfig() },
        { path: 'tsconfig.json', content: JSON.stringify(getTsConfig(), null, 2) },
        { path: 'tailwind.config.js', content: getTailwindConfig() },
        { path: 'postcss.config.js', content: getPostcssConfig() },
        { path: 'index.html', content: getIndexHtml() },
        { path: 'src/main.tsx', content: getMainTsx() },
        { path: 'src/index.css', content: files['src/index.css'] || getTailwindCss() },
        ...Object.entries(files)
          .filter(([p]) => p !== 'src/index.css')
          .map(([path, content]) => ({
            path,
            content: (content as string)
              .replace(/from ['"]src\//g, "from './")
              .replace(/import ['"]src\//g, "import './"),
          })),
      ];

      // Create tree entries
      const treeEntries = await Promise.all(
        filesToPush.map(async (file) => {
          const blobRes = await fetch(
            `https://api.github.com/repos/${userData.login}/${repoName}/git/blobs`,
            {
              method: 'POST',
              headers: {
                Authorization: `token ${githubToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                content: file.content,
                encoding: 'utf-8',
              }),
            }
          );
          const blobData = await blobRes.json();
          return {
            path: file.path,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: blobData.sha,
          };
        })
      );

      // Create tree
      const treeRes = await fetch(
        `https://api.github.com/repos/${userData.login}/${repoName}/git/trees`,
        {
          method: 'POST',
          headers: {
            Authorization: `token ${githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            base_tree: baseSha,
            tree: treeEntries,
          }),
        }
      );
      const treeData = await treeRes.json();

      // Create commit
      const commitRes = await fetch(
        `https://api.github.com/repos/${userData.login}/${repoName}/git/commits`,
        {
          method: 'POST',
          headers: {
            Authorization: `token ${githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'Initial commit from FluidFlow',
            tree: treeData.sha,
            parents: [baseSha],
          }),
        }
      );
      const commitData = await commitRes.json();

      // Update ref
      await fetch(
        `https://api.github.com/repos/${userData.login}/${repoName}/git/refs/heads/main`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `token ${githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sha: commitData.sha,
          }),
        }
      );

      setPushResult({ success: true, url: repoData.html_url });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to push to GitHub';
      setPushResult({ success: false, error: msg });
    } finally {
      setIsPushing(false);
    }
  }, [githubToken, repoName, appCode, files]);

  return {
    // Export modal
    showExportModal,
    setShowExportModal,
    isDownloading,
    downloadAsZip,

    // GitHub modal
    showGithubModal,
    setShowGithubModal,
    githubToken,
    setGithubToken,
    repoName,
    setRepoName,
    isPushing,
    pushResult,
    setPushResult,
    pushToGithub,
  };
}
