const { ParticipantStatus } = require('@prisma/client');
const prisma = require('../config/database');
const { notifyUsers } = require('./push');

/**
 * Silent push events the app listens for. Every payload has `type`; the app
 * refreshes the matching data (and shows a local notification for chat).
 */
const EVENTS = {
  ACTIVITY_UPDATED: 'activity.updated',
  JOIN_REQUESTED: 'activity.join_requested',
  PARTICIPANT_UPDATED: 'activity.participant_updated',
  CHAT_MESSAGE: 'chat.message',
  CHAT_MESSAGE_DELETED: 'chat.message_deleted',
  HIGHLIGHT_CREATED: 'highlight.created',
  VERIFICATION_REVIEWED: 'verification.reviewed',
  PROFILE_UPDATED: 'profile.updated',
  ACCOUNT_BLOCKED: 'account.blocked',
};

/** Host + approved members (+ pending requesters when asked). */
const activityMemberIds = async (activityId, { includePending = false } = {}) => {
  const rows = await prisma.activityParticipant.findMany({
    where: {
      activityId,
      status: { in: includePending ? [ParticipantStatus.APPROVED, ParticipantStatus.PENDING] : [ParticipantStatus.APPROVED] },
    },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
};

const without = (ids, excluded) => ids.filter((id) => !excluded.includes(id));

/** Runs the recipient lookup off the request path; errors are logged only. */
const later = (task) =>
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((err) => console.error('Realtime event failed:', err.message));
  });

const activityUpdated = (activity, reason, { exclude = [] } = {}) =>
  later(async () => {
    const ids = await activityMemberIds(activity.id, { includePending: true });
    notifyUsers(
      without(ids, exclude),
      { type: EVENTS.ACTIVITY_UPDATED, activityId: activity.id, status: activity.status, reason },
      { collapseKey: `activity-${activity.id}` }
    );
  });

const joinRequested = (activity, requester) =>
  notifyUsers(
    [activity.hostId],
    {
      type: EVENTS.JOIN_REQUESTED,
      activityId: activity.id,
      activityTitle: activity.title,
      userId: requester.id,
      userName: requester.fullName || 'Someone',
    },
    { urgent: true }
  );

const participantUpdated = (activity, participantUserId, status, { notifyHost = false } = {}) =>
  notifyUsers(
    notifyHost ? [participantUserId, activity.hostId] : [participantUserId],
    {
      type: EVENTS.PARTICIPANT_UPDATED,
      activityId: activity.id,
      activityTitle: activity.title,
      userId: participantUserId,
      status,
    },
    { urgent: status === ParticipantStatus.APPROVED }
  );

const chatMessage = (message, activity, sender) =>
  later(async () => {
    const ids = await activityMemberIds(activity.id);
    notifyUsers(
      without(ids, [sender?.id].filter(Boolean)),
      {
        type: EVENTS.CHAT_MESSAGE,
        activityId: activity.id,
        activityTitle: activity.title,
        messageId: message.id,
        messageType: message.type,
        senderId: sender?.id,
        senderName: sender?.fullName || 'Someone',
        text: message.type === 'IMAGE' ? '📷 Photo' : (message.text || '').slice(0, 140),
        createdAt: message.createdAt.toISOString(),
      },
      { urgent: message.type !== 'SYSTEM', ttlSeconds: 6 * 60 * 60 }
    );
  });

const chatMessageDeleted = (message, activityId) =>
  later(async () => {
    const ids = await activityMemberIds(activityId);
    notifyUsers(ids, { type: EVENTS.CHAT_MESSAGE_DELETED, activityId, messageId: message.id }, { collapseKey: `chat-del-${activityId}` });
  });

const highlightCreated = (highlight) =>
  later(async () => {
    const ids = await activityMemberIds(highlight.activityId);
    notifyUsers(without(ids, [highlight.userId]), {
      type: EVENTS.HIGHLIGHT_CREATED,
      activityId: highlight.activityId,
      highlightId: highlight.id,
      title: highlight.title,
    });
  });

const verificationReviewed = (userId, status, remark) =>
  notifyUsers([userId], { type: EVENTS.VERIFICATION_REVIEWED, status, remark: remark || '' }, { urgent: true });

const profileUpdated = (userId) => notifyUsers([userId], { type: EVENTS.PROFILE_UPDATED }, { collapseKey: 'profile' });

const accountBlocked = (userId) => notifyUsers([userId], { type: EVENTS.ACCOUNT_BLOCKED }, { urgent: true });

module.exports = {
  EVENTS,
  activityMemberIds,
  activityUpdated,
  joinRequested,
  participantUpdated,
  chatMessage,
  chatMessageDeleted,
  highlightCreated,
  verificationReviewed,
  profileUpdated,
  accountBlocked,
};
