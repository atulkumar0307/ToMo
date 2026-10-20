/**
 * Tiny in-process TTL cache with a size cap (oldest entries evicted first).
 * Used to avoid repeating identical database reads within a few seconds.
 */
class TtlCache {
  constructor({ ttlMs, maxEntries = 5000 }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.map.size >= this.maxEntries) {
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  /** Returns the cached value, or computes and caches it. Concurrent callers share one computation. */
  async wrap(key, compute, ttlMs) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const pendingKey = `__pending:${key}`;
    const pending = this.map.get(pendingKey);
    if (pending) return pending.value;

    const promise = Promise.resolve()
      .then(compute)
      .then((value) => {
        this.map.delete(pendingKey);
        this.set(key, value, ttlMs);
        return value;
      })
      .catch((err) => {
        this.map.delete(pendingKey);
        throw err;
      });

    this.map.set(pendingKey, { value: promise, expiresAt: Number.MAX_SAFE_INTEGER });
    return promise;
  }
}

module.exports = { TtlCache };
