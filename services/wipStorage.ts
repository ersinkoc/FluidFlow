/**
 * WIP Storage Service
 *
 * Work In Progress (WIP) storage using IndexedDB.
 * WIP data survives page refreshes and allows users to continue where they left off.
 * Files only sync to backend on COMMIT (git-centric approach).
 */

import { WIP_DB_NAME, WIP_DB_VERSION, WIP_STORE_NAME } from '@/constants';
import { FileSystem } from '@/types';

/**
 * WIP data structure stored in IndexedDB
 */
export interface WIPData {
  /** Project ID (used as key in IndexedDB) */
  id: string;
  /** Current file system state */
  files: FileSystem;
  /** Currently active file path */
  activeFile: string;
  /** Currently active tab */
  activeTab: string;
  /** Timestamp when WIP was saved */
  savedAt: number;
  /** Version for conflict detection */
  version?: number;
}

// Simple lock to prevent concurrent IndexedDB writes
let wipWriteLock: Promise<void> = Promise.resolve();

/**
 * Open the WIP IndexedDB database
 * Creates the object store if it doesn't exist
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WIP_DB_NAME, WIP_DB_VERSION);

    request.onerror = () => {
      console.error('[WIPStorage] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(WIP_STORE_NAME)) {
        db.createObjectStore(WIP_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Get WIP data for a project
 *
 * @param projectId - The project ID to retrieve WIP for
 * @returns WIP data or null if not found
 */
export async function getWIP(projectId: string): Promise<WIPData | null> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(WIP_STORE_NAME, 'readonly');
    const store = tx.objectStore(WIP_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(projectId);
      request.onerror = () => {
        console.error('[WIPStorage] Failed to get WIP data:', request.error);
        reject(request.error);
      };
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (err) {
    console.error('[WIPStorage] getWIP failed:', err);
    return null;
  }
}

/**
 * Save WIP data for a project
 * Uses a write lock to prevent concurrent operations
 *
 * @param data - WIP data to save
 */
export async function saveWIP(data: WIPData): Promise<void> {
  // Use lock to prevent concurrent operations
  const previousLock = wipWriteLock;
  let releaseLock: () => void = () => {};
  wipWriteLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousLock; // Wait for previous operation
    const db = await openDatabase();
    const tx = db.transaction(WIP_STORE_NAME, 'readwrite');
    const store = tx.objectStore(WIP_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onerror = () => {
        console.error('[WIPStorage] Failed to save WIP:', request.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        console.log('[WIPStorage] WIP saved for project:', data.id);
        resolve();
      };
    });
  } catch (err) {
    console.error('[WIPStorage] saveWIP failed:', err);
    throw err;
  } finally {
    releaseLock();
  }
}

/**
 * Clear WIP data for a project
 * Uses a write lock to prevent concurrent operations
 *
 * @param projectId - The project ID to clear WIP for
 */
export async function clearWIP(projectId: string): Promise<void> {
  // Use lock to prevent concurrent operations
  const previousLock = wipWriteLock;
  let releaseLock: () => void = () => {};
  wipWriteLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousLock; // Wait for previous operation
    const db = await openDatabase();
    const tx = db.transaction(WIP_STORE_NAME, 'readwrite');
    const store = tx.objectStore(WIP_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(projectId);
      request.onerror = () => {
        console.warn('[WIPStorage] Failed to clear:', request.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        console.log('[WIPStorage] Cleared WIP for project:', projectId);
        resolve();
      };
    });
  } catch (err) {
    console.warn('[WIPStorage] clearWIP failed:', err);
  } finally {
    releaseLock();
  }
}

/**
 * Check if WIP exists for a project
 *
 * @param projectId - The project ID to check
 * @returns true if WIP exists with files
 */
export async function hasWIP(projectId: string): Promise<boolean> {
  const wip = await getWIP(projectId);
  return wip !== null && wip.files !== null && Object.keys(wip.files).length > 0;
}

/**
 * Create WIP data object
 * Helper to create properly structured WIP data
 *
 * @param projectId - Project ID
 * @param files - Current file system state
 * @param activeFile - Currently active file
 * @param activeTab - Currently active tab
 * @returns WIPData object ready for saving
 */
export function createWIPData(
  projectId: string,
  files: FileSystem,
  activeFile: string,
  activeTab: string
): WIPData {
  return {
    id: projectId,
    files,
    activeFile,
    activeTab,
    savedAt: Date.now(),
  };
}
