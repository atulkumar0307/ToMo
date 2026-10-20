const { ActivityStatus, ChatMessageType, ParticipantStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const env = require('../../config/env');
const { AppError } = require('../../utils/errors');
const { formatActivityCode } = require('../../utils/activityAid');
const { removeUploadPaths } = require('../../utils/uploads');
const realtime = require('../../services/realtime');

const PAGE_DEFAULT = 30;
const PAGE_MAX = 100;
const DELTA_MAX = 200;

const SENDER_SELECT = { id: true, uid: true, fullName: true, profileImagePath: true, isProfileVerified: true };

const MESSAGE_SELECT = {
  id: true,
  activityId: true,
  userId: true,
  type: true,
  text: true,
  imagePath: true,
  clientId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: SENDER_SELECT },
};

const ACTIVITY_CHAT_SELECT = {
  id: true,
  aid: true,
  title: true,
  category: true,
  status: true,
  hostId: true,
  startTime: true,
  endTime: true,
  completedAt: true,
};

const formatMessage = (message, viewerId) => ({
  id: message.id,
  activityId: message.activityId,
  type: message.type,
  text: message.deletedAt ? null : message.text,
  imageUrl: message.deletedAt ? null : message.imagePath,
  clientId: message.clientId,
  isDeleted: Boolean(message.deletedAt),
  isMine: Boolean(viewerId) && message.userId === viewerId,
  createdAt: message.createdAt,
  updatedAt: message.updatedAt,
  sender: message.user,
});

/** Members can message while it is open or running, and for a while after it ends. */
const canSendIn = (activity, now = new Date()) => {
  if ([ActivityStatus.PUBLISHED, ActivityStatus.ACTIVE].includes(activity.status)) return true;
  if (activity.status === ActivityStatus.COMPLETED) {
    return now.getTime() < activity.endTime.getTime() + env.chat.afterEndHours * 60 * 60 * 1000;
  }
  return false;
};

const fetchActivityOrThrow = async (activityId) => {
  const activity = await prisma.activity.findUnique({ where: { id: activityId }, select: ACTIVITY_CHAT_SELECT });
  if (!activity || activity.status === ActivityStatus.DELETED) {
    throw new AppError('Activity not found', 404);
  }
  return activity;
};

/** The chat belongs to the host and approved members. */
const assertMember = async (activity, userId) => {
  if (activity.hostId === userId) return;

  const membership = await prisma.activityParticipant.findUnique({
    where: { activityId_userId: { activityId: activity.id, userId } },
    select: { status: true },
  });

  if (membership?.status !== ParticipantStatus.APPROVED) {
    throw new AppError('Only the host and approved members can use this chat', 403);
  }
};

const parseLimit = (value, fallback = PAGE_DEFAULT) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 1 ? fallback : Math.min(parsed, PAGE_MAX);
};

/**
 * Message pages.
 * - default / `before=<messageId>`: newest page (or the page older than that message), oldest-first in the array.
 * - `after=<ISO time>`: everything created *or deleted* since then (delta sync after a push).
 */
// Delta cursors overlap by a few seconds so a message committed just as a sync
// ran is never skipped; clients de-duplicate by message id.
const SYNC_OVERLAP_MS = 5000;

const listMessagesFor = async (activity, viewerId, query = {}) => {
  const now = new Date();
  const serverTime = new Date(now.getTime() - SYNC_OVERLAP_MS);

  if (query.after) {
    const after = new Date(query.after);
    if (Number.isNaN(after.getTime())) throw new AppError('after must be an ISO date-time', 400);

    const changed = await prisma.chatMessage.findMany({
      where: { activityId: activity.id, updatedAt: { gt: after } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: DELTA_MAX,
      select: MESSAGE_SELECT,
    });

    return {
      messages: changed.map((m) => formatMessage(m, viewerId)),
      // More than one delta page means the client should reload the latest page instead.
      truncated: changed.length === DELTA_MAX,
      serverTime,
      canSend: canSendIn(activity, now),
      viewerIsHost: Boolean(viewerId) && activity.hostId === viewerId,
    };
  }

  const limit = parseLimit(query.limit);
  let cursorFilter = {};

  if (query.before) {
    const cursor = await prisma.chatMessage.findFirst({
      where: { id: String(query.before), activityId: activity.id },
      select: { id: true, createdAt: true },
    });
    if (!cursor) throw new AppError('Unknown message cursor', 400);
    cursorFilter = {
      OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
    };
  }

  const page = await prisma.chatMessage.findMany({
    where: { activityId: activity.id, ...cursorFilter },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: MESSAGE_SELECT,
  });

  const hasMore = page.length > limit;
  const messages = page.slice(0, limit).reverse();

  return {
    messages: messages.map((m) => formatMessage(m, viewerId)),
    hasMore,
    nextBefore: hasMore ? messages[0].id : null,
    serverTime,
    canSend: canSendIn(activity, now),
    viewerIsHost: Boolean(viewerId) && activity.hostId === viewerId,
  };
};

const assertChatAccess = async (userId, activityId) => {
  const activity = await fetchActivityOrThrow(activityId);
  await assertMember(activity, userId);
  return activity;
};

const listMessages = async (userId, activityId, query) => {
  const activity = await assertChatAccess(userId, activityId);
  return listMessagesFor(activity, userId, query);
};

const markRead = (userId, activityId, at = new Date()) =>
  prisma.chatReadState.upsert({
    where: { activityId_userId: { activityId, userId } },
    create: { activityId, userId, lastReadAt: at },
    update: { lastReadAt: at },
  });

/** Text and/or one image. `clientId` makes retries safe: the same id returns the same message. */
const sendMessage = async (sender, activityId, { text, clientId }, file) => {
  const imagePath = file ? `/uploads/chat-images/${file.filename}` : null;

  try {
    const activity = await fetchActivityOrThrow(activityId);
    await assertMember(activity, sender.id);

    if (!canSendIn(activity)) {
      throw new AppError('This chat is closed. Messages can be sent until 24 hours after the activity ends.', 403);
    }

    if (clientId) {
      const existing = await prisma.chatMessage.findUnique({
        where: { userId_clientId: { userId: sender.id, clientId } },
        select: MESSAGE_SELECT,
      });
      if (existing) {
        if (imagePath) removeUploadPaths([imagePath]);
        return { message: formatMessage(existing, sender.id), activity, duplicate: true };
      }
    }

    const created = await prisma.chatMessage.create({
      data: {
        activityId,
        userId: sender.id,
        type: imagePath ? ChatMessageType.IMAGE : ChatMessageType.TEXT,
        text: text || null,
        imagePath,
        clientId: clientId || null,
      },
      select: MESSAGE_SELECT,
    });

    await markRead(sender.id, activityId, created.createdAt);
    realtime.chatMessage(created, activity, sender);

    return { message: formatMessage(created, sender.id), activity, duplicate: false };
  } catch (err) {
    if (imagePath) removeUploadPaths([imagePath]);
    // Two identical retries racing: the unique (userId, clientId) index picks one winner.
    if (err.code === 'P2002' && clientId) {
      const existing = await prisma.chatMessage.findUnique({
        where: { userId_clientId: { userId: sender.id, clientId } },
        select: MESSAGE_SELECT,
      });
      if (existing) return { message: formatMessage(existing, sender.id), duplicate: true };
    }
    throw err;
  }
};

const softDelete = async (message) => {
  const deleted = await prisma.chatMessage.update({
    where: { id: message.id },
    data: { deletedAt: new Date(), text: null, imagePath: null },
    select: MESSAGE_SELECT,
  });
  if (message.imagePath) removeUploadPaths([message.imagePath]);
  realtime.chatMessageDeleted(deleted, message.activityId);
  return deleted;
};

/** Authors delete their own messages; the host can remove any message in their chat. */
const deleteMessage = async (userId, activityId, messageId) => {
  const activity = await fetchActivityOrThrow(activityId);
  await assertMember(activity, userId);

  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, activityId },
    select: { id: true, activityId: true, userId: true, imagePath: true, deletedAt: true, type: true },
  });

  if (!message || message.deletedAt) throw new AppError('Message not found', 404);
  if (message.type === ChatMessageType.SYSTEM) throw new AppError('System messages cannot be deleted', 400);
  if (message.userId !== userId && activity.hostId !== userId) {
    throw new AppError('You can only delete your own messages', 403);
  }

  return { message: formatMessage(await softDelete(message), userId), activity };
};

/** Timeline entries such as "Diya joined". Never throws: chat is secondary to the action. */
const postSystemMessage = async (activityId, text) => {
  try {
    const activity = await prisma.activity.findUnique({ where: { id: activityId }, select: ACTIVITY_CHAT_SELECT });
    if (!activity) return null;
    const message = await prisma.chatMessage.create({
      data: { activityId, type: ChatMessageType.SYSTEM, text },
      select: MESSAGE_SELECT,
    });
    realtime.chatMessage(message, activity, null);
    return message;
  } catch (err) {
    console.error('System chat message failed:', err.message);
    return null;
  }
};

/**
 * Every chat the user belongs to, newest message first, with unread counts.
 * Three queries regardless of how many chats.
 */
const listThreads = async (userId) => {
  const memberships = await prisma.activityParticipant.findMany({
    where: {
      userId,
      status: ParticipantStatus.APPROVED,
      activity: { status: { not: ActivityStatus.DELETED } },
    },
    select: { activity: { select: ACTIVITY_CHAT_SELECT } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const activities = memberships.map((m) => m.activity);
  const ids = activities.map((a) => a.id);
  if (!ids.length) return { threads: [], totalUnread: 0 };

  const [lastMessages, unreadRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT DISTINCT ON (m."activityId") m."id", m."activityId", m."type", m."text", m."deletedAt", m."createdAt", m."userId",
             u."fullName" AS "senderName"
        FROM "ChatMessage" m
        LEFT JOIN "User" u ON u."id" = m."userId"
       WHERE m."activityId" = ANY(${ids})
       ORDER BY m."activityId", m."createdAt" DESC, m."id" DESC`,
    prisma.$queryRaw`
      SELECT m."activityId", COUNT(*)::int AS "unread"
        FROM "ChatMessage" m
        LEFT JOIN "ChatReadState" r ON r."activityId" = m."activityId" AND r."userId" = ${userId}
       WHERE m."activityId" = ANY(${ids})
         AND m."deletedAt" IS NULL
         AND m."type" <> 'SYSTEM'
         AND (m."userId" IS NULL OR m."userId" <> ${userId})
         AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
       GROUP BY m."activityId"`,
  ]);

  const lastById = new Map(lastMessages.map((row) => [row.activityId, row]));
  const unreadById = new Map(unreadRows.map((row) => [row.activityId, row.unread]));
  const now = new Date();

  const threads = activities
    .map((activity) => {
      const last = lastById.get(activity.id);
      return {
        activity: { ...activity, activityCode: formatActivityCode(activity.aid) },
        lastMessage: last
          ? {
              id: last.id,
              type: last.type,
              text: last.deletedAt ? null : last.text,
              isDeleted: Boolean(last.deletedAt),
              senderName: last.senderName,
              isMine: last.userId === userId,
              createdAt: last.createdAt,
            }
          : null,
        unreadCount: unreadById.get(activity.id) || 0,
        canSend: canSendIn(activity, now),
      };
    })
    .sort((a, b) => {
      const at = a.lastMessage?.createdAt || a.activity.startTime;
      const bt = b.lastMessage?.createdAt || b.activity.startTime;
      return new Date(bt) - new Date(at);
    });

  return { threads, totalUnread: threads.reduce((sum, t) => sum + t.unreadCount, 0) };
};

// ---------------------------------------------------------------------------
// Admin moderation
// ---------------------------------------------------------------------------

const adminListMessages = async (activityId, query) => {
  const activity = await prisma.activity.findUnique({ where: { id: activityId }, select: ACTIVITY_CHAT_SELECT });
  if (!activity) throw new AppError('Activity not found', 404);
  const result = await listMessagesFor(activity, null, query);
  const total = await prisma.chatMessage.count({ where: { activityId } });
  return { ...result, total };
};

const adminDeleteMessage = async (activityId, messageId) => {
  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, activityId },
    select: { id: true, activityId: true, userId: true, imagePath: true, deletedAt: true, type: true, text: true },
  });
  if (!message || message.deletedAt) throw new AppError('Message not found', 404);
  const deleted = await softDelete(message);
  return { message: formatMessage(deleted, null), original: message };
};

module.exports = {
  assertChatAccess,
  listMessages,
  sendMessage,
  deleteMessage,
  markRead,
  postSystemMessage,
  listThreads,
  adminListMessages,
  adminDeleteMessage,
  canSendIn,
};
