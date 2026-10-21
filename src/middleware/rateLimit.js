const { sendError } = require('../utils/response');

const buckets = new Map();

// Drop expired windows every minute so memory stays bounded.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60 * 1000);
sweep.unref();

/**
 * Counts one hit for `key`; returns how long to wait (ms) when over `max`, else 0.
 * Fixed window per key; in-process (one counter per server instance).
 */
const hit = (key, { windowMs, max }) => {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  return bucket.count > max ? bucket.resetAt - now : 0;
};

/** Milliseconds until the window resets when `key` is already at `max` (without counting a hit). */
const peek = (key, max) => {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return 0;
  return bucket.count >= max ? bucket.resetAt - Date.now() : 0;
};

const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

const resolve = (value) => (typeof value === 'function' ? value() : value);

/**
 * Express middleware. `rules`: [{ name, windowMs, max, key: (req) => string|null, message }]
 * `windowMs`, `max` and `message` may be functions, read on every request
 * (so limits edited in the admin Configuration apply immediately).
 * A rule whose key returns null is skipped (e.g. no mobile in the body yet);
 * a window of 0 disables the rule. `onlyFailures: true` counts only requests
 * that end in an error (e.g. wrong passwords), so successful use is never limited.
 */
const rateLimit = (rules) => (req, res, next) => {
  for (const rule of rules) {
    const key = rule.key(req);
    if (key === null || key === undefined) continue;

    const windowMs = resolve(rule.windowMs);
    if (!windowMs || windowMs <= 0) continue;

    const bucketKey = `${rule.name}:${key}`;
    const max = resolve(rule.max);
    let waitMs;

    if (rule.onlyFailures) {
      waitMs = peek(bucketKey, max);
      if (!waitMs) {
        res.on('finish', () => {
          if (res.statusCode >= 400 && res.statusCode !== 429) hit(bucketKey, { windowMs, max });
        });
      }
    } else {
      waitMs = hit(bucketKey, { windowMs, max });
    }

    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000);
      res.set('Retry-After', String(seconds));
      return sendError(res, resolve(rule.message) || `Too many requests. Try again in ${seconds} seconds.`, 429);
    }
  }

  next();
};

module.exports = { rateLimit, clientIp, hit };
