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

const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

/**
 * Express middleware. `rules`: [{ name, windowMs, max, key: (req) => string|null, message }]
 * A rule whose key returns null is skipped (e.g. no mobile in the body yet).
 */
const rateLimit = (rules) => (req, res, next) => {
  for (const rule of rules) {
    const key = rule.key(req);
    if (key === null || key === undefined) continue;

    const waitMs = hit(`${rule.name}:${key}`, rule);
    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000);
      res.set('Retry-After', String(seconds));
      return sendError(res, rule.message || `Too many requests. Try again in ${seconds} seconds.`, 429);
    }
  }

  next();
};

module.exports = { rateLimit, clientIp, hit };
