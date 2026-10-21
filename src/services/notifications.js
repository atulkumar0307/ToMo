const prisma = require('../config/database');
const { notifyUsers } = require('./push');

/**
 * The in-app inbox (bell). Every alert-worthy event is stored per recipient
 * and pushed (silently) with the same title/body, so the phone's
 * notification and the inbox always say the same thing.
 */

const MAX_TEXT = 300;

/**
 * entries: [{ userId, type, title, body, data }]; pushData extra fields go into
 * the FCM payload too. Never throws.
 */
const notify = async (entries, pushOptions = {}) => {
  const rows = entries.filter((e) => e.userId);
  if (!rows.length) return;

  try {
    await prisma.notification.createMany({
      data: rows.map((e) => ({
        userId: e.userId,
        type: e.type,
        title: String(e.title).slice(0, 120),
        body: String(e.body).slice(0, MAX_TEXT),
        data: e.data || undefined,
      })),
    });
  } catch (err) {
    console.error('Saving notifications failed:', err.message);
  }

  for (const e of rows) {
    notifyUsers([e.userId], { ...e.data, type: e.type, title: e.title, body: e.body }, pushOptions);
  }
};

const PAGE_DEFAULT = 30;

const list = async (userId, { before, limit } = {}) => {
  const take = Math.min(Math.max(parseInt(limit, 10) || PAGE_DEFAULT, 1), 100);
  let cursor = {};

  if (before) {
    const ref = await prisma.notification.findFirst({ where: { id: String(before), userId }, select: { id: true, createdAt: true } });
    if (ref) cursor = { OR: [{ createdAt: { lt: ref.createdAt } }, { createdAt: ref.createdAt, id: { lt: ref.id } }] };
  }

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...cursor },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: { id: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  const hasMore = rows.length > take;
  const notifications = rows.slice(0, take);
  return { notifications, unreadCount, hasMore, nextBefore: hasMore ? notifications.at(-1).id : null };
};

const unreadCount = (userId) => prisma.notification.count({ where: { userId, readAt: null } });

/** Marks the given ids (or everything) as read. */
const markRead = async (userId, ids) => {
  const where = { userId, readAt: null, ...(Array.isArray(ids) && ids.length ? { id: { in: ids.map(String) } } : {}) };
  await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return { unreadCount: await unreadCount(userId) };
};

module.exports = { notify, list, unreadCount, markRead };
