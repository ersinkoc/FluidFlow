/**
 * Prompt History Service
 *
 * Manages user's sent prompt history with localStorage persistence
 */

export interface PromptHistoryItem {
  id: string;
  prompt: string;
  timestamp: number;
  responsePreview?: string; // First 200 chars of AI response
  tokensUsed?: number;
  model?: string;
  projectContext?: {
    projectId?: string;
    fileCount?: number;
  };
  tags?: string[];
  favorite?: boolean;
}

export interface PromptHistoryStats {
  totalPrompts: number;
  favoriteCount: number;
  thisWeekCount: number;
  mostUsedTags: string[];
}

const STORAGE_KEY = 'fluidflow_prompt_history';
const MAX_HISTORY_ITEMS = 500;
const MAX_PREVIEW_LENGTH = 200;

/**
 * Get all prompt history from localStorage
 */
export function getPromptHistory(): PromptHistoryItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save prompt history to localStorage
 */
function savePromptHistory(history: PromptHistoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save prompt history:', error);
  }
}

/**
 * Add a prompt to history
 */
export function addPromptToHistory(item: Omit<PromptHistoryItem, 'id' | 'timestamp'>): string {
  const history = getPromptHistory();

  const newItem: PromptHistoryItem = {
    ...item,
    id: `prompt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: Date.now(),
  };

  // Add to beginning (most recent first)
  history.unshift(newItem);

  // Limit history size
  if (history.length > MAX_HISTORY_ITEMS) {
    history.splice(MAX_HISTORY_ITEMS);
  }

  savePromptHistory(history);
  return newItem.id;
}

/**
 * Update a prompt history item
 */
export function updatePromptHistory(id: string, updates: Partial<PromptHistoryItem>): boolean {
  const history = getPromptHistory();
  const index = history.findIndex(item => item.id === id);

  if (index === -1) return false;

  history[index] = { ...history[index], ...updates };
  savePromptHistory(history);
  return true;
}

/**
 * Delete a prompt from history
 */
export function deletePromptFromHistory(id: string): boolean {
  const history = getPromptHistory();
  const filtered = history.filter(item => item.id !== id);

  if (filtered.length === history.length) return false;

  savePromptHistory(filtered);
  return true;
}

/**
 * Clear all prompt history
 */
export function clearPromptHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Toggle favorite status
 */
export function togglePromptFavorite(id: string): boolean | null {
  const history = getPromptHistory();
  const item = history.find(i => i.id === id);

  if (!item) return null;

  item.favorite = !item.favorite;
  savePromptHistory(history);
  return item.favorite;
}

/**
 * Search prompt history
 */
export function searchPromptHistory(query: string): PromptHistoryItem[] {
  const history = getPromptHistory();
  const lowerQuery = query.toLowerCase();

  return history.filter(item =>
    item.prompt.toLowerCase().includes(lowerQuery) ||
    item.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get favorite prompts
 */
export function getFavoritePrompts(): PromptHistoryItem[] {
  return getPromptHistory().filter(item => item.favorite);
}

/**
 * Get prompts from the last N days
 */
export function getRecentPrompts(days: number = 7): PromptHistoryItem[] {
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  return getPromptHistory().filter(item => item.timestamp >= cutoff);
}

/**
 * Get prompt statistics
 */
export function getPromptHistoryStats(): PromptHistoryStats {
  const history = getPromptHistory();
  const now = Date.now();
  const weekAgo = now - (7 * 24 * 60 * 60 * 1000);

  // Count prompts from this week
  const thisWeekCount = history.filter(item => item.timestamp >= weekAgo).length;

  // Count favorites
  const favoriteCount = history.filter(item => item.favorite).length;

  // Extract all tags
  const allTags = history.flatMap(item => item.tags || []);
  const tagCounts = new Map<string, number>();

  for (const tag of allTags) {
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }

  // Get top 5 most used tags
  const mostUsedTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  return {
    totalPrompts: history.length,
    favoriteCount,
    thisWeekCount,
    mostUsedTags,
  };
}

/**
 * Get response preview (first N chars)
 */
export function getResponsePreview(response: string): string {
  if (!response) return '';
  return response.substring(0, MAX_PREVIEW_LENGTH);
}

/**
 * Export prompt history as JSON
 */
export function exportPromptHistory(): string {
  const history = getPromptHistory();
  return JSON.stringify(history, null, 2);
}

/**
 * Import prompt history from JSON
 */
export function importPromptHistory(json: string): { success: boolean; imported: number; error?: string } {
  try {
    const imported = JSON.parse(json) as PromptHistoryItem[];

    if (!Array.isArray(imported)) {
      return { success: false, imported: 0, error: 'Invalid format: expected array' };
    }

    // Validate items
    const validItems = imported.filter(item =>
      item.prompt && typeof item.prompt === 'string'
    );

    if (validItems.length === 0) {
      return { success: false, imported: 0, error: 'No valid prompts found' };
    }

    // Generate new IDs and add to history
    const currentHistory = getPromptHistory();
    let addedCount = 0;

    for (const item of validItems) {
      // Generate new ID to avoid conflicts
      const newItem: PromptHistoryItem = {
        ...item,
        id: `prompt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${addedCount}`,
      };
      currentHistory.unshift(newItem);
      addedCount++;
    }

    // Trim if necessary
    if (currentHistory.length > MAX_HISTORY_ITEMS) {
      currentHistory.splice(MAX_HISTORY_ITEMS);
    }

    savePromptHistory(currentHistory);
    return { success: true, imported: addedCount };
  } catch (error) {
    return {
      success: false,
      imported: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
