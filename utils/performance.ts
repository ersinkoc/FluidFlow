/**
 * Performance optimization utilities
 * Includes memoization, debouncing, and performance monitoring
 */

export interface PerformanceMetrics {
  renderTime: number;
  componentCount: number;
  reRenderCount: number;
  memoryUsage?: number;
}

/**
 * Memoization utility for expensive functions
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);

    // Limit cache size
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    return result;
  }) as T;
}

/**
 * Debounce utility for rate limiting
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle utility for rate limiting
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Performance monitor for React components
 */
export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private observers: PerformanceObserver[] = [];

  constructor() {
    if (typeof window !== 'undefined' && window.performance) {
      this.setupObserver();
    }
  }

  private setupObserver() {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            this.recordMetric(entry.name, entry.duration);
          }
        }
      });

      observer.observe({ entryTypes: ['measure'] });
      this.observers.push(observer);
    }
  }

  startMeasure(name: string) {
    if (typeof window !== 'undefined' && window.performance) {
      window.performance.mark(`${name}-start`);
    }
  }

  endMeasure(name: string): number {
    if (typeof window !== 'undefined' && window.performance) {
      window.performance.mark(`${name}-end`);
      window.performance.measure(name, `${name}-start`, `${name}-end`);

      const measures = window.performance.getEntriesByName(name, 'measure');
      return measures[measures.length - 1]?.duration || 0;
    }
    return 0;
  }

  private recordMetric(name: string, duration: number) {
    const existing = this.metrics.get(name) || {
      renderTime: 0,
      componentCount: 0,
      reRenderCount: 0,
    };

    existing.renderTime += duration;
    existing.reRenderCount++;

    this.metrics.set(name, existing);
  }

  getMetrics(name?: string): PerformanceMetrics | Map<string, PerformanceMetrics> {
    if (name) {
      return this.metrics.get(name) || {
        renderTime: 0,
        componentCount: 0,
        reRenderCount: 0,
      };
    }
    return this.metrics;
  }

  reset() {
    this.metrics.clear();
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

/**
 * Memory usage tracker
 */
export function trackMemoryUsage(): number | null {
  if (typeof window !== 'undefined' && 'memory' in window.performance) {
    const memory = (window.performance as any).memory;
    return memory.usedJSHeapSize;
  }
  return null;
}

/**
 * Virtual scrolling utility for large lists
 */
export function calculateVisibleItems<T>(
  items: T[],
  containerHeight: number,
  itemHeight: number,
  scrollTop: number,
  buffer: number = 5
): {
  visibleItems: T[];
  startIndex: number;
  endIndex: number;
  offsetY: number;
} {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
  const visibleCount = Math.ceil(containerHeight / itemHeight) + buffer * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  return {
    visibleItems: items.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    offsetY: startIndex * itemHeight,
  };
}

/**
 * Image lazy loading utility
 */
export function createLazyImageLoader() {
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      }
    });
  });

  return {
    observe: (element: HTMLImageElement) => {
      imageObserver.observe(element);
    },
    disconnect: () => {
      imageObserver.disconnect();
    },
  };
}

/**
 * Bundle size analyzer
 */
export interface BundleAnalysis {
  totalSize: number;
  gzippedSize: number;
  chunks: Array<{
    name: string;
    size: number;
    gzippedSize: number;
  }>;
}

export async function analyzeBundleSize(): Promise<BundleAnalysis | null> {
  // This would integrate with webpack-bundle-analyzer in a real setup
  // For now, return placeholder
  return null;
}

/**
 * Cache utility for API responses
 */
export class APICache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  set(key: string, data: any, ttl: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Global cache instance
export const apiCache = new APICache();

// Clean up cache periodically
setInterval(() => apiCache.cleanup(), 60 * 1000);