/**
 * Snippet Library Service
 *
 * Manages reusable code snippets with localStorage persistence
 */

export interface Snippet {
  id: string;
  name: string;
  description: string;
  code: string;
  language: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
}

export interface SnippetStats {
  totalSnippets: number;
  favoriteCount: number;
  mostUsedTags: string[];
  languageCount: Record<string, number>;
}

const STORAGE_KEY = 'fluidflow_snippets';
const MAX_SNIPPETS = 200;

/**
 * Get all snippets from localStorage
 */
export function getSnippets(): Snippet[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save snippets to localStorage
 */
function saveSnippets(snippets: Snippet[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
  } catch (error) {
    console.error('Failed to save snippets:', error);
  }
}

/**
 * Add a new snippet
 */
export function addSnippet(snippet: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>): string {
  const snippets = getSnippets();

  const newSnippet: Snippet = {
    ...snippet,
    id: `snippet-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  snippets.unshift(newSnippet);

  // Limit number of snippets
  if (snippets.length > MAX_SNIPPETS) {
    snippets.splice(MAX_SNIPPETS);
  }

  saveSnippets(snippets);
  return newSnippet.id;
}

/**
 * Update an existing snippet
 */
export function updateSnippet(id: string, updates: Partial<Snippet>): boolean {
  const snippets = getSnippets();
  const index = snippets.findIndex(s => s.id === id);

  if (index === -1) return false;

  snippets[index] = {
    ...snippets[index],
    ...updates,
    id: snippets[index].id, // Preserve ID
    createdAt: snippets[index].createdAt, // Preserve creation date
    updatedAt: Date.now(),
  };

  saveSnippets(snippets);
  return true;
}

/**
 * Delete a snippet
 */
export function deleteSnippet(id: string): boolean {
  const snippets = getSnippets();
  const filtered = snippets.filter(s => s.id !== id);

  if (filtered.length === snippets.length) return false;

  saveSnippets(filtered);
  return true;
}

/**
 * Toggle favorite status
 */
export function toggleSnippetFavorite(id: string): boolean | null {
  const snippets = getSnippets();
  const snippet = snippets.find(s => s.id === id);

  if (!snippet) return null;

  snippet.favorite = !snippet.favorite;
  snippet.updatedAt = Date.now();
  saveSnippets(snippets);
  return snippet.favorite;
}

/**
 * Search snippets by name, description, code, or tags
 */
export function searchSnippets(query: string): Snippet[] {
  const snippets = getSnippets();
  const lowerQuery = query.toLowerCase();

  return snippets.filter(snippet =>
    snippet.name.toLowerCase().includes(lowerQuery) ||
    snippet.description.toLowerCase().includes(lowerQuery) ||
    snippet.code.toLowerCase().includes(lowerQuery) ||
    snippet.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get favorite snippets
 */
export function getFavoriteSnippets(): Snippet[] {
  return getSnippets().filter(s => s.favorite);
}

/**
 * Get snippets by language
 */
export function getSnippetsByLanguage(language: string): Snippet[] {
  return getSnippets().filter(s => s.language === language);
}

/**
 * Get snippets by tag
 */
export function getSnippetsByTag(tag: string): Snippet[] {
  return getSnippets().filter(s => s.tags.includes(tag));
}

/**
 * Get snippet statistics
 */
export function getSnippetStats(): SnippetStats {
  const snippets = getSnippets();

  // Count favorites
  const favoriteCount = snippets.filter(s => s.favorite).length;

  // Extract all tags
  const allTags = snippets.flatMap(s => s.tags);
  const tagCounts = new Map<string, number>();

  for (const tag of allTags) {
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }

  // Get top 5 most used tags
  const mostUsedTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // Count by language
  const languageCount: Record<string, number> = {};
  for (const snippet of snippets) {
    languageCount[snippet.language] = (languageCount[snippet.language] || 0) + 1;
  }

  return {
    totalSnippets: snippets.length,
    favoriteCount,
    mostUsedTags,
    languageCount,
  };
}

/**
 * Export snippets as JSON
 */
export function exportSnippets(): string {
  const snippets = getSnippets();
  return JSON.stringify(snippets, null, 2);
}

/**
 * Import snippets from JSON
 */
export function importSnippets(json: string): { success: boolean; imported: number; error?: string } {
  try {
    const imported = JSON.parse(json) as Snippet[];

    if (!Array.isArray(imported)) {
      return { success: false, imported: 0, error: 'Invalid format: expected array' };
    }

    // Validate items
    const validItems = imported.filter(item =>
      item.name && typeof item.name === 'string' &&
      item.code && typeof item.code === 'string'
    );

    if (validItems.length === 0) {
      return { success: false, imported: 0, error: 'No valid snippets found' };
    }

    // Generate new IDs and add to library
    const currentSnippets = getSnippets();
    let addedCount = 0;

    for (const item of validItems) {
      // Generate new ID to avoid conflicts
      const newSnippet: Snippet = {
        ...item,
        id: `snippet-${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${addedCount}`,
        createdAt: item.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      currentSnippets.unshift(newSnippet);
      addedCount++;
    }

    // Trim if necessary
    if (currentSnippets.length > MAX_SNIPPETS) {
      currentSnippets.splice(MAX_SNIPPETS);
    }

    saveSnippets(currentSnippets);
    return { success: true, imported: addedCount };
  } catch (error) {
    return {
      success: false,
      imported: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get default snippets for new users
 */
export function getDefaultSnippets(): Snippet[] {
  return [
    {
      id: 'default-react-component',
      name: 'React Component',
      description: 'Basic React functional component with TypeScript',
      code: `import React from 'react';

interface Props {
  title: string;
  onAction?: () => void;
}

export const Component: React.FC<Props> = ({ title, onAction }) => {
  return (
    <div>
      <h1>{title}</h1>
      {onAction && <button onClick={onAction}>Action</button>}
    </div>
  );
};

export default Component;`,
      language: 'typescript',
      tags: ['react', 'component', 'typescript'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      favorite: false,
    },
    {
      id: 'default-useeffect',
      name: 'useEffect Hook',
      description: 'Common useEffect patterns',
      code: `import { useEffect, useState } from 'react';

export function useData(url: string) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(url)
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [url]);

  return { data, loading, error };
}`,
      language: 'typescript',
      tags: ['react', 'hooks', 'fetch'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      favorite: false,
    },
    {
      id: 'default-tailwind-button',
      name: 'Tailwind Button',
      description: 'Styled button component with Tailwind CSS',
      code: `interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  children,
  onClick
}: ButtonProps) => {
  const baseClasses = 'rounded-lg font-medium transition-colors';
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-slate-200 hover:bg-slate-300 text-slate-900',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      onClick={onClick}
      className={\`\${baseClasses} \${variantClasses[variant]} \${sizeClasses[size]}\`}
    >
      {children}
    </button>
  );
};`,
      language: 'typescript',
      tags: ['react', 'tailwind', 'component'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      favorite: false,
    },
  ];
}

/**
 * Initialize with default snippets if library is empty
 */
export function initializeDefaultSnippets(): void {
  const current = getSnippets();
  if (current.length === 0) {
    saveSnippets(getDefaultSnippets());
  }
}
