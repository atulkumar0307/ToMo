const prisma = require('../config/database');
const { USER_SELECT } = require('../constants/userSelect');
const { TtlCache } = require('./cache');

// Every authenticated request needs the user row (block check, verified flag).
// Caching it briefly removes most of those reads; writes below invalidate it.
const cache = new TtlCache({ ttlMs: 30 * 1000, maxEntries: 10000 });

const getAuthUser = (userId) =>
  cache.wrap(userId, () => prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT }));

/** Call after any change to a user's row (profile, block, verification, deletion). */
const invalidateUser = (userId) => {
  if (userId) cache.delete(userId);
};

module.exports = { getAuthUser, invalidateUser };
