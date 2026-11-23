/**
 * Small bounded in-memory Least-Recently-Used (LRU) cache with optional TTL
 * and explicit invalidation support for hot catalog queries.
 */
export interface LruCacheOptions {
  maxEntries?: number;
  ttlMs?: number;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number | null;
}

export interface LruCacheStats {
  size: number;
  maxEntries: number;
  hits: number;
  misses: number;
  evictions: number;
}

export class LruCache<V> {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly map = new Map<string, CacheEntry<V>>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: LruCacheOptions = {}) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 250));
    this.ttlMs = Math.max(0, Math.floor(options.ttlMs ?? 60_000));
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.map.delete(key);
      this.misses += 1;
      return undefined;
    }
    // Promote to most-recently-used
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  set(key: string, value: V, customTtlMs?: number): void {
    const ttl = customTtlMs ?? this.ttlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : null;
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
        this.evictions += 1;
      }
    }
    this.map.set(key, { value, expiresAt });
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  getStats(): LruCacheStats {
    return {
      size: this.map.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }
}
