/**
 * AI Usage Analytics Storage Service
 *
 * Tracks and persists AI usage data using IndexedDB.
 * Records provider, model, token counts, costs, and timing for each AI call.
 */

import { ANALYTICS_DB_NAME, ANALYTICS_DB_VERSION, ANALYTICS_STORE_NAME } from '@/constants';
import { UsageRecord, UsageStats } from '@/types';
import { calculateCost } from './tokenCostEstimator';

// Write lock to prevent concurrent IndexedDB writes
let analyticsWriteLock: Promise<void> = Promise.resolve();

/**
 * Generate a unique ID for usage records
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Open the Analytics IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ANALYTICS_DB_NAME, ANALYTICS_DB_VERSION);

    request.onerror = () => {
      console.error('[Analytics] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(ANALYTICS_STORE_NAME)) {
        const store = db.createObjectStore(ANALYTICS_STORE_NAME, { keyPath: 'id' });
        // Create indexes for efficient querying
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('provider', 'provider', { unique: false });
        store.createIndex('model', 'model', { unique: false });
        store.createIndex('category', 'category', { unique: false });
      }
    };
  });
}

/**
 * Add a usage record to the database
 */
export async function addUsageRecord(
  data: Omit<UsageRecord, 'id' | 'inputCost' | 'outputCost' | 'totalCost' | 'currency' | 'totalTokens'>
): Promise<UsageRecord> {
  // Calculate costs
  const costEstimate = calculateCost(data.model, data.inputTokens, data.outputTokens);

  const record: UsageRecord = {
    id: generateId(),
    ...data,
    totalTokens: data.inputTokens + data.outputTokens,
    inputCost: costEstimate.inputCost,
    outputCost: costEstimate.outputCost,
    totalCost: costEstimate.totalCost,
    currency: costEstimate.currency,
  };

  // Use lock to prevent concurrent operations
  const previousLock = analyticsWriteLock;
  let releaseLock: () => void = () => {};
  analyticsWriteLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousLock;
    const db = await openDatabase();
    const tx = db.transaction(ANALYTICS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(ANALYTICS_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onerror = () => {
        console.error('[Analytics] Failed to add record:', request.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        console.log('[Analytics] Usage recorded:', {
          provider: record.provider,
          model: record.model,
          tokens: record.totalTokens,
          cost: `$${record.totalCost.toFixed(4)}`,
        });
        resolve(record);
      };
    });
  } catch (err) {
    console.error('[Analytics] addUsageRecord failed:', err);
    throw err;
  } finally {
    releaseLock();
  }
}

/**
 * Get all usage records
 */
export async function getAllRecords(): Promise<UsageRecord[]> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(ANALYTICS_STORE_NAME, 'readonly');
    const store = tx.objectStore(ANALYTICS_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => {
        console.error('[Analytics] Failed to get records:', request.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        // Sort by timestamp descending (most recent first)
        const records = request.result as UsageRecord[];
        records.sort((a, b) => b.timestamp - a.timestamp);
        resolve(records);
      };
    });
  } catch (err) {
    console.error('[Analytics] getAllRecords failed:', err);
    return [];
  }
}

/**
 * Get records within a date range
 */
export async function getRecordsByDateRange(
  startDate: Date,
  endDate: Date
): Promise<UsageRecord[]> {
  const records = await getAllRecords();
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  return records.filter((r) => r.timestamp >= startTime && r.timestamp <= endTime);
}

/**
 * Get records for today
 */
export async function getTodayRecords(): Promise<UsageRecord[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getRecordsByDateRange(today, tomorrow);
}

/**
 * Get records for the last N days
 */
export async function getRecentRecords(days: number = 30): Promise<UsageRecord[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  return getRecordsByDateRange(startDate, endDate);
}

/**
 * Clear all usage records
 */
export async function clearAllRecords(): Promise<void> {
  const previousLock = analyticsWriteLock;
  let releaseLock: () => void = () => {};
  analyticsWriteLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousLock;
    const db = await openDatabase();
    const tx = db.transaction(ANALYTICS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(ANALYTICS_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onerror = () => {
        console.error('[Analytics] Failed to clear records:', request.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        console.log('[Analytics] All records cleared');
        resolve();
      };
    });
  } catch (err) {
    console.error('[Analytics] clearAllRecords failed:', err);
  } finally {
    releaseLock();
  }
}

/**
 * Delete records older than N days
 */
export async function deleteOldRecords(daysToKeep: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffTime = cutoffDate.getTime();

  const records = await getAllRecords();
  const toDelete = records.filter((r) => r.timestamp < cutoffTime);

  if (toDelete.length === 0) return 0;

  const previousLock = analyticsWriteLock;
  let releaseLock: () => void = () => {};
  analyticsWriteLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousLock;
    const db = await openDatabase();
    const tx = db.transaction(ANALYTICS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(ANALYTICS_STORE_NAME);

    for (const record of toDelete) {
      store.delete(record.id);
    }

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        console.log(`[Analytics] Deleted ${toDelete.length} old records`);
        resolve(toDelete.length);
      };
      tx.onerror = () => {
        console.error('[Analytics] Failed to delete old records');
        resolve(0);
      };
    });
  } finally {
    releaseLock();
  }
}

/**
 * Calculate usage statistics from records
 */
export function calculateStats(records: UsageRecord[]): UsageStats {
  const stats: UsageStats = {
    totalRequests: records.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    successRate: 0,
    avgDuration: 0,
    byProvider: {},
    byModel: {},
    byCategory: {},
    byDay: {},
  };

  if (records.length === 0) return stats;

  let totalDuration = 0;
  let successCount = 0;

  for (const record of records) {
    // Totals
    stats.totalInputTokens += record.inputTokens;
    stats.totalOutputTokens += record.outputTokens;
    stats.totalTokens += record.totalTokens;
    stats.totalCost += record.totalCost;
    totalDuration += record.duration;
    if (record.success) successCount++;

    // By Provider
    if (!stats.byProvider[record.provider]) {
      stats.byProvider[record.provider] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        avgDuration: 0,
      };
    }
    const providerStats = stats.byProvider[record.provider];
    providerStats.requests++;
    providerStats.inputTokens += record.inputTokens;
    providerStats.outputTokens += record.outputTokens;
    providerStats.totalCost += record.totalCost;
    providerStats.avgDuration =
      (providerStats.avgDuration * (providerStats.requests - 1) + record.duration) /
      providerStats.requests;

    // By Model
    if (!stats.byModel[record.model]) {
      stats.byModel[record.model] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        avgDuration: 0,
        provider: record.provider,
      };
    }
    const modelStats = stats.byModel[record.model];
    modelStats.requests++;
    modelStats.inputTokens += record.inputTokens;
    modelStats.outputTokens += record.outputTokens;
    modelStats.totalCost += record.totalCost;
    modelStats.avgDuration =
      (modelStats.avgDuration * (modelStats.requests - 1) + record.duration) /
      modelStats.requests;

    // By Category
    if (!stats.byCategory[record.category]) {
      stats.byCategory[record.category] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
      };
    }
    const catStats = stats.byCategory[record.category];
    catStats.requests++;
    catStats.inputTokens += record.inputTokens;
    catStats.outputTokens += record.outputTokens;
    catStats.totalCost += record.totalCost;

    // By Day
    const dayKey = new Date(record.timestamp).toISOString().split('T')[0];
    if (!stats.byDay[dayKey]) {
      stats.byDay[dayKey] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
      };
    }
    const dayStats = stats.byDay[dayKey];
    dayStats.requests++;
    dayStats.inputTokens += record.inputTokens;
    dayStats.outputTokens += record.outputTokens;
    dayStats.totalCost += record.totalCost;
  }

  stats.successRate = (successCount / records.length) * 100;
  stats.avgDuration = totalDuration / records.length;

  return stats;
}

/**
 * Get usage statistics for a date range
 */
export async function getStats(days: number = 30): Promise<UsageStats> {
  const records = await getRecentRecords(days);
  return calculateStats(records);
}

/**
 * Get today's usage summary
 */
export async function getTodayStats(): Promise<UsageStats> {
  const records = await getTodayRecords();
  return calculateStats(records);
}

/**
 * Export all records as JSON
 */
export async function exportRecords(): Promise<string> {
  const records = await getAllRecords();
  return JSON.stringify(records, null, 2);
}

/**
 * Import records from JSON
 */
export async function importRecords(jsonData: string): Promise<number> {
  try {
    const records = JSON.parse(jsonData) as UsageRecord[];

    const previousLock = analyticsWriteLock;
    let releaseLock: () => void = () => {};
    analyticsWriteLock = new Promise((resolve) => {
      releaseLock = resolve;
    });

    try {
      await previousLock;
      const db = await openDatabase();
      const tx = db.transaction(ANALYTICS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(ANALYTICS_STORE_NAME);

      for (const record of records) {
        store.put(record);
      }

      return new Promise((resolve) => {
        tx.oncomplete = () => {
          console.log(`[Analytics] Imported ${records.length} records`);
          resolve(records.length);
        };
        tx.onerror = () => {
          console.error('[Analytics] Failed to import records');
          resolve(0);
        };
      });
    } finally {
      releaseLock();
    }
  } catch (err) {
    console.error('[Analytics] importRecords failed:', err);
    return 0;
  }
}

// Re-export cost utilities
export { calculateCost, formatCost, getModelPricing } from './tokenCostEstimator';
