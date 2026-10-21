const { ParticipantStatus } = require('@prisma/client');
const prisma = require('../config/database');
const { notifyUsers } = require('./push');
const { notify } = require('./notifications');

/**
 * Real-time events. Every push is a silent FCM data message with a `type`;
 * the app refreshes the matching screen. Events worth telling the user about
 * also land in the notification inbox and carry `title`/`body`, which the app
 * shows as a local notification.
 */
const EVENTS = {
  ACTIVITY_UPDATED: 'activity.updated',
  JOIN_REQUESTED: 'activity.join_requested',
  PARTICIPANT_UPDATED: 'activity.participant_updated',
  CHAT_MESSAGE: 'chat.message',
  CHAT_MESSAGE_DELETED: 'chat.message_deleted',
  HIGHLIGHT_CREATED: 'highlight.created',
  HIGHLIGHT_LIKED: 'highlight.liked',
  HIGHLIGHT_COMMENTED: 'highlight.commented',
  VERIFICATION_REVIEWED: 'verification.reviewed',
  PROFILE_UPDATED: 'profile.updated',
  ACCOUNT_BLOCKED: 'account.blocked',
};

const quoted = (title) => (title ? `“${title}”` : 'your vibe');
const nameOf = (user) => user?.fullName?.trim() || 'Someone';

/** Host + approved members (+ pending requesters when asked). */
const activityMemberIds = async (activityId, { includePending = false } = {}) => {
  const rows = await prisma.activityParticipant.findMany({
    where: {
      activityId,
      status: { in: includePending ? [ParticipantStatus.APPROVED, ParticipantStatus.PENDING] : [ParticipantStatus.APPROVED] },
    },
    select: { userId: true, status: true },
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

/** Inbox wording for status changes; null = refresh only. */
const ACTIVITY_NOTICES = {
  cancelled: (a) => ({ title: 'Vibe cancelled', body: `${quoted(a.title)} was cancelled.` }),
  started: (a) => ({ title: 'Your vibe has started', body: `${quoted(a.title)} just started — see you there!` }),
  completed: (a) => ({ title: 'Share your highlights', body: `${quoted(a.title)} is complete. Post your photos and videos!` }),
  deleted: (a) => ({ title: 'Vibe removed', body: `${quoted(a.title)} is no longer available.` }),
  reopened: (a) => ({ title: 'Vibe is back on', body: `${quoted(a.title)} is open again.` }),
};

const ADMIN_STATUS_REASON = { CANCELLED: 'cancelled', ACTIVE: 'started', COMPLETED: 'completed', DELETED: 'deleted', PUBLISHED: 'reopened' };

/**
 * Activity changed (start/complete/cancel/delete/expire/edit). Members get an
 * inbox entry for meaningful changes; pending requesters just refresh.
 */
const activityUpdated = (activity, reason, { exclude = [] } = {}) =>
  later(async () => {
    const normalized = reason?.startsWith('status:') ? ADMIN_STATUS_REASON[reason.slice(7)] || reason : reason;
    const rows = await prisma.activityParticipant.findMany({
      where: { activityId: activity.id, status: { in: [ParticipantStatus.APPROVED, ParticipantStatus.PENDING] } },
      select: { userId: true, status: true },
    });
    const data = { activityId: activity.id, activityTitle: activity.title, status: activity.status, reason: normalized };
    const notice = ACTIVITY_NOTICES[normalized]?.(activity);
    const members = without(rows.filter((r) => r.status === ParticipantStatus.APPROVED).map((r) => r.userId), exclude);
    const pending = without(rows.filter((r) => r.status === ParticipantStatus.PENDING).map((r) => r.userId), exclude);

    if (notice) {
      await notify(members.map((userId) => ({ userId, type: EVENTS.ACTIVITY_UPDATED, ...notice, data })));
    } else {
      notifyUsers(members, { type: EVENTS.ACTIVITY_UPDATED, ...data }, { collapseKey: `activity-${activity.id}` });
    }
    notifyUsers(pending, { type: EVENTS.ACTIVITY_UPDATED, ...data }, { collapseKey: `activity-${activity.id}` });
  });

const joinRequested = (activity, requester) =>
  later(() =>
    notify(
      [
        {
          userId: activity.hostId,
          type: EVENTS.JOIN_REQUESTED,
          title: 'New join request',
          body: `${nameOf(requester)} wants to join ${quoted(activity.title)}`,
          data: { activityId: activity.id, activityTitle: activity.title, userId: requester.id, userName: nameOf(requester) },
        },
      ],
      { urgent: true }
    )
  );

const PARTICIPANT_NOTICES = {
  APPROVED: (a) => ({ title: "You're in! 🎉", body: `Your request to join ${quoted(a.title)} was approved.` }),
  REJECTED: (a) => ({ title: 'Request declined', body: `The host declined your request for ${quoted(a.title)}.` }),
  REMOVED: (a) => ({ title: 'Removed from a vibe', body: `You are no longer part of ${quoted(a.title)}.` }),
};

/**
 * A participant's status changed. The participant hears about approvals,
 * rejections and removals; with `notifyHost`, the host hears when someone leaves.
 */
const participantUpdated = (activity, participantUserId, status, { notifyHost = false, participantName } = {}) =>
  later(async () => {
    const data = { activityId: activity.id, activityTitle: activity.title, userId: participantUserId, status };
    const notice = PARTICIPANT_NOTICES[status]?.(activity);

    if (notice) {
      await notify([{ userId: participantUserId, type: EVENTS.PARTICIPANT_UPDATED, ...notice, data }], {
        urgent: status === ParticipantStatus.APPROVED,
      });
    } else {
      notifyUsers([participantUserId], { type: EVENTS.PARTICIPANT_UPDATED, ...data });
    }

    if (notifyHost && activity.hostId && activity.hostId !== participantUserId) {
      if (status === ParticipantStatus.WITHDRAWN && participantName) {
        await notify([
          {
            userId: activity.hostId,
            type: EVENTS.PARTICIPANT_UPDATED,
            title: 'Someone left your vibe',
            body: `${participantName} left ${quoted(activity.title)}.`,
            data,
          },
        ]);
      } else {
        notifyUsers([activity.hostId], { type: EVENTS.PARTICIPANT_UPDATED, ...data });
      }
    }
  });

/** Chat: urgent silent push (the app shows it unless that chat is open). Not stored in the inbox. */
const chatMessage = (message, activity, sender) =>
  later(async () => {
    const ids = await activityMemberIds(activity.id);
    const preview = message.type === 'IMAGE' ? '📷 Photo' : (message.text || '').slice(0, 140);
    notifyUsers(
      without(ids, [sender?.id].filter(Boolean)),
      {
        type: EVENTS.CHAT_MESSAGE,
        activityId: activity.id,
        activityTitle: activity.title,
        messageId: message.id,
        messageType: message.type,
        senderId: sender?.id,
        senderName: nameOf(sender),
        text: preview,
        title: activity.title || 'New message',
        body: sender ? `${nameOf(sender)}: ${preview}` : preview,
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
    const [ids, activity] = await Promise.all([
      activityMemberIds(highlight.activityId),
      prisma.activity.findUnique({ where: { id: highlight.activityId }, select: { title: true } }),
    ]);
    const author = highlight.author?.fullName || 'A member';
    const data = { activityId: highlight.activityId, highlightId: highlight.id, activityTitle: activity?.title || '' };
    await notify(
      without(ids, [highlight.userId]).map((userId) => ({
        userId,
        type: EVENTS.HIGHLIGHT_CREATED,
        title: 'New highlight',
        body: `${author} shared “${highlight.title}” from ${quoted(activity?.title)}.`,
        data,
      }))
    );
  });

const highlightLiked = (highlight, liker) =>
  later(() =>
    notify(
      [
        {
          userId: highlight.userId,
          type: EVENTS.HIGHLIGHT_LIKED,
          title: 'New like ❤️',
          body: `${nameOf(liker)} liked your highlight “${highlight.title}”.`,
          data: { highlightId: highlight.id, activityId: highlight.activityId },
        },
      ],
      { collapseKey: `like-${highlight.id}` }
    )
  );

const highlightCommented = (highlight, commenter, text) =>
  later(() =>
    notify([
      {
        userId: highlight.userId,
        type: EVENTS.HIGHLIGHT_COMMENTED,
        title: 'New comment',
        body: `${nameOf(commenter)}: ${text.slice(0, 140)}`,
        data: { highlightId: highlight.id, activityId: highlight.activityId },
      },
    ])
  );

const verificationReviewed = (userId, status, remark) =>
  later(() =>
    notify(
      [
        {
          userId,
          type: EVENTS.VERIFICATION_REVIEWED,
          title: status === 'APPROVED' ? "You're verified ✅" : 'Verification needs another try',
          body: status === 'APPROVED' ? 'You can now host and join vibes.' : remark || 'Open the app to see why.',
          data: { status, remark: remark || '' },
        },
      ],
      { urgent: true }
    )
  );

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
  highlightLiked,
  highlightCommented,
  verificationReviewed,
  profileUpdated,
  accountBlocked,
};
