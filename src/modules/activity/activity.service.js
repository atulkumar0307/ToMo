const { ActivityStatus, ParticipantStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { setting } = require('../../services/settings');
const { AppError } = require('../../utils/errors');
const {
  ACTIVITY_SELECT,
  DISCOVERY_STATUSES,
  JOINER_SCHEDULE_BLOCKING_STATUSES,
  HOST_SCHEDULE_BLOCKING_STATUSES,
  activityLimits,
  PARTICIPANT_SELECT,
} = require('./activity.constants');
const { getNextActivityAid, formatActivityCode } = require('../../utils/activityAid');
const { logSystemActions, describeActivity } = require('../../utils/audit');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../../constants/auditActions');
const { loadParticipantCounts, loadHighlightCounts, countsFor } = require('./activity.stats');

const MINUTE_MS = 60 * 1000;

const assertVerifiedProfile = (user) => {
  if (user.isBlocked) {
    throw new AppError('Your account has been blocked', 403);
  }

  if (!user.isProfileVerified) {
    throw new AppError('Only verified profiles can use activities', 403);
  }
};

const fetchVerifiedUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isBlocked: true,
      isProfileVerified: true,
    },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  assertVerifiedProfile(user);
  return user;
};

const REJOINABLE_STATUSES = [
  ParticipantStatus.REJECTED,
  ParticipantStatus.WITHDRAWN,
  ParticipantStatus.EXPIRED,
];

/** Statuses a member can leave from. Leaving after the end makes no difference. */
const LEAVABLE_ACTIVITY_STATUSES = [ActivityStatus.PUBLISHED, ActivityStatus.ACTIVE];

/**
 * Serialises joins/approvals on one activity: concurrent requests wait here,
 * so two people can never both take the last spot.
 */
const lockActivity = (tx, activityId) => tx.$queryRaw`SELECT id FROM "Activity" WHERE id = ${activityId} FOR UPDATE`;

const getApprovedCount = async (activityId, tx = prisma) => {
  return tx.activityParticipant.count({
    where: {
      activityId,
      status: ParticipantStatus.APPROVED,
    },
  });
};

const shapeActivity = (activity, participantCounts, highlightCounts) => {
  const counts = countsFor(participantCounts, activity.id);
  return {
    ...activity,
    activityCode: formatActivityCode(activity.aid),
    approvedCount: counts.approved,
    pendingCount: counts.pending,
    spotsLeft: Math.max(activity.maxParticipants - counts.approved, 0),
    highlightCount: highlightCounts.get(activity.id) || 0,
  };
};

/** Adds counts to many activities with two grouped queries in total (not per activity). */
const formatActivityList = async (activities, tx = prisma) => {
  const ids = activities.map((activity) => activity.id);
  const [participantCounts, highlightCounts] = await Promise.all([
    loadParticipantCounts(ids, tx),
    loadHighlightCounts(ids, tx),
  ]);
  return activities.map((activity) => shapeActivity(activity, participantCounts, highlightCounts));
};

const formatActivityResponse = async (activity, tx = prisma) => (await formatActivityList([activity], tx))[0];

const fetchActivityForHost = async (activityId, hostId) => {
  const activity = await prisma.activity.findFirst({
    where: { id: activityId, hostId },
    select: ACTIVITY_SELECT,
  });

  if (!activity) {
    throw new AppError('Activity not found', 404);
  }

  return activity;
};

const fetchActivityById = async (activityId, tx = prisma) => {
  const activity = await tx.activity.findUnique({
    where: { id: activityId },
    select: ACTIVITY_SELECT,
  });

  if (!activity) {
    throw new AppError('Activity not found', 404);
  }

  return activity;
};

const getParticipantMembership = async (activityId, userId) => {
  return prisma.activityParticipant.findUnique({
    where: {
      activityId_userId: {
        activityId,
        userId,
      },
    },
    select: {
      status: true,
      isHost: true,
    },
  });
};

const getNonHostParticipantCounts = async (activityId) => {
  const counts = countsFor(await loadParticipantCounts([activityId]), activityId);
  // `approved` from the loader includes the host; callers here want joiners only.
  const hostApproved = await prisma.activityParticipant.count({
    where: { activityId, isHost: true, status: ParticipantStatus.APPROVED },
  });
  return { pending: counts.pending, approved: counts.approved - hostApproved };
};

const assertNoHostTimeOverlap = async (hostId, startTime, endTime, excludeActivityId = null) => {
  const overlapping = await prisma.activity.findFirst({
    where: {
      hostId,
      status: { in: HOST_SCHEDULE_BLOCKING_STATUSES },
      ...(excludeActivityId ? { id: { not: excludeActivityId } } : {}),
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true },
  });

  if (overlapping) {
    throw new AppError('You already have an activity during this time', 409);
  }
};

const assertNoJoinerTimeOverlap = async (
  userId,
  startTime,
  endTime,
  excludeActivityId = null,
  tx = prisma
) => {
  const overlapping = await tx.activityParticipant.findFirst({
    where: {
      userId,
      isHost: false,
      status: ParticipantStatus.APPROVED,
      activity: {
        status: { in: JOINER_SCHEDULE_BLOCKING_STATUSES },
        ...(excludeActivityId ? { id: { not: excludeActivityId } } : {}),
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    },
    select: { activityId: true },
  });

  if (overlapping) {
    throw new AppError(
      'You are already approved for another activity during this time',
      409
    );
  }
};

const assertCanViewActivity = async (activity, userId) => {
  if (activity.hostId === userId) {
    return;
  }

  if (activity.status === ActivityStatus.PUBLISHED) {
    return;
  }

  if (activity.status === ActivityStatus.DELETED) {
    throw new AppError('Activity not found', 404);
  }

  const membership = await getParticipantMembership(activity.id, userId);

  if (
    membership &&
    !membership.isHost &&
    [ParticipantStatus.PENDING, ParticipantStatus.APPROVED].includes(membership.status)
  ) {
    return;
  }

  if (
    membership &&
    !membership.isHost &&
    [ActivityStatus.CANCELLED, ActivityStatus.EXPIRED].includes(activity.status) &&
    [
      ParticipantStatus.PENDING,
      ParticipantStatus.APPROVED,
      ParticipantStatus.REJECTED,
      ParticipantStatus.WITHDRAWN,
      ParticipantStatus.EXPIRED,
    ].includes(membership.status)
  ) {
    return;
  }

  throw new AppError('Activity not found', 404);
};

const assertJoinableActivity = (activity) => {
  if (activity.status !== ActivityStatus.PUBLISHED) {
    throw new AppError('Only published activities accept join requests', 400);
  }

  const now = new Date();

  if (now >= activity.endTime) {
    throw new AppError('This activity has ended', 400);
  }
};

/** Expires pending requests that can no longer be answered (activity started or closed). */
const expirePendingRequests = (activityId, tx = prisma) =>
  tx.activityParticipant.updateMany({
    where: { activityId, isHost: false, status: ParticipantStatus.PENDING },
    data: { status: ParticipantStatus.EXPIRED },
  });

const createActivity = async (hostId, data) => {
  const host = await prisma.user.findUnique({
    where: { id: hostId },
    select: {
      id: true,
      isBlocked: true,
      isProfileVerified: true,
    },
  });

  if (!host) {
    throw new AppError('User not found', 404);
  }

  assertVerifiedProfile(host);
  await assertNoHostTimeOverlap(hostId, data.startTime, data.endTime);

  const activity = await prisma.$transaction(async (tx) => {
    const aid = await getNextActivityAid(tx);

    const createdActivity = await tx.activity.create({
      data: {
        hostId,
        aid,
        ...data,
      },
      select: ACTIVITY_SELECT,
    });

    await tx.activityParticipant.create({
      data: {
        activityId: createdActivity.id,
        userId: hostId,
        status: ParticipantStatus.APPROVED,
        isHost: true,
      },
    });

    return createdActivity;
  });

  return formatActivityResponse(activity);
};

const updateActivity = async (hostId, activityId, data) => {
  const activity = await fetchActivityForHost(activityId, hostId);

  if (activity.status !== ActivityStatus.PUBLISHED) {
    throw new AppError('Only published activities can be edited', 400);
  }

  const counts = await getNonHostParticipantCounts(activityId);

  if (counts.pending > 0 || counts.approved > 0) {
    throw new AppError(
      'Cannot edit activity with pending or approved joiners. Cancel instead.',
      400
    );
  }

  await assertNoHostTimeOverlap(hostId, data.startTime, data.endTime, activityId);

  const updated = await prisma.activity.update({
    where: { id: activityId },
    data,
    select: ACTIVITY_SELECT,
  });

  return formatActivityResponse(updated);
};

const deleteActivity = async (hostId, activityId) => {
  const activity = await fetchActivityForHost(activityId, hostId);

  if (activity.status !== ActivityStatus.PUBLISHED) {
    throw new AppError('Only published activities can be deleted', 400);
  }

  const counts = await getNonHostParticipantCounts(activityId);

  if (counts.pending > 0 || counts.approved > 0) {
    throw new AppError(
      'Cannot delete activity with pending or approved joiners. Cancel instead.',
      400
    );
  }

  const deleted = await prisma.activity.update({
    where: { id: activityId },
    data: {
      status: ActivityStatus.DELETED,
      deletedAt: new Date(),
    },
    select: ACTIVITY_SELECT,
  });

  return formatActivityResponse(deleted);
};

const cancelActivity = async (hostId, activityId) => {
  const activity = await fetchActivityForHost(activityId, hostId);

  if (activity.status !== ActivityStatus.PUBLISHED) {
    throw new AppError('Only published activities can be cancelled', 400);
  }

  const counts = await getNonHostParticipantCounts(activityId);

  if (counts.pending === 0 && counts.approved === 0) {
    throw new AppError('No joiners to cancel for. Delete the activity instead.', 400);
  }

  const cancelled = await prisma.activity.update({
    where: { id: activityId },
    data: {
      status: ActivityStatus.CANCELLED,
      cancelledAt: new Date(),
    },
    select: ACTIVITY_SELECT,
  });

  return formatActivityResponse(cancelled);
};

/** Earliest moment the host may press Start. */
const earliestStartOf = (activity) =>
  new Date(activity.startTime.getTime() - setting('activity.startEarlyMinutes') * MINUTE_MS);

const startActivity = async (hostId, activityId) => {
  const activity = await fetchActivityForHost(activityId, hostId);

  if (activity.status !== ActivityStatus.PUBLISHED) {
    throw new AppError('Only published activities can be started', 400);
  }

  const now = new Date();

  if (now >= activity.endTime) {
    throw new AppError('Cannot start an activity after its end time', 400);
  }

  if (now < earliestStartOf(activity)) {
    const minutes = Math.ceil((earliestStartOf(activity) - now) / MINUTE_MS);
    throw new AppError(
      `Too early to start: you can start up to ${setting('activity.startEarlyMinutes')} minutes before the start time (in ${minutes} min).`,
      400
    );
  }

  // Requests nobody answered can't be approved once it's running.
  const [, started] = await prisma.$transaction([
    expirePendingRequests(activityId),
    prisma.activity.update({
      where: { id: activityId },
      data: {
        status: ActivityStatus.ACTIVE,
        startedAt: now,
      },
      select: ACTIVITY_SELECT,
    }),
  ]);

  return formatActivityResponse(started);
};

const completeActivity = async (hostId, activityId) => {
  const activity = await fetchActivityForHost(activityId, hostId);

  if (activity.status !== ActivityStatus.ACTIVE) {
    throw new AppError('Only active activities can be completed', 400);
  }

  const [, completed] = await prisma.$transaction([
    expirePendingRequests(activityId),
    prisma.activity.update({
      where: { id: activityId },
      data: {
        status: ActivityStatus.COMPLETED,
        completedAt: new Date(),
      },
      select: ACTIVITY_SELECT,
    }),
  ]);

  return formatActivityResponse(completed);
};

const getActivityById = async (userId, activityId) => {
  const activity = await fetchActivityById(activityId);
  await assertCanViewActivity(activity, userId);

  const [formatted, myParticipation] = await Promise.all([
    formatActivityResponse(activity),
    getParticipantMembership(activityId, userId),
  ]);

  return {
    activity: formatted,
    myParticipation: myParticipation ? { status: myParticipation.status, isHost: myParticipation.isHost } : null,
    highlightCount: formatted.highlightCount,
    canStartAt: activity.status === ActivityStatus.PUBLISHED ? earliestStartOf(activity) : null,
  };
};

const joinActivity = async (userId, activityId) => {
  const user = await fetchVerifiedUser(userId);

  const activity = await prisma.$transaction(async (tx) => {
    await lockActivity(tx, activityId);
    const fresh = await fetchActivityById(activityId, tx);
    assertJoinableActivity(fresh);

    if (fresh.hostId === userId) {
      throw new AppError('You cannot join your own activity', 400);
    }

    await assertNoJoinerTimeOverlap(userId, fresh.startTime, fresh.endTime, activityId, tx);

    const approvedCount = await getApprovedCount(activityId, tx);

    if (approvedCount >= fresh.maxParticipants) {
      throw new AppError('This activity is full', 409);
    }

    const existing = await tx.activityParticipant.findUnique({
      where: { activityId_userId: { activityId, userId } },
    });

    if (existing) {
      if (existing.isHost) {
        throw new AppError('You cannot join your own activity', 400);
      }

      if (existing.status === ParticipantStatus.APPROVED) {
        throw new AppError('You have already joined this activity', 409);
      }

      if (existing.status === ParticipantStatus.PENDING) {
        throw new AppError('You already have a pending join request', 409);
      }

      if (!REJOINABLE_STATUSES.includes(existing.status)) {
        throw new AppError('You cannot join this activity', 400);
      }

      await tx.activityParticipant.update({
        where: { id: existing.id },
        data: { status: ParticipantStatus.PENDING },
      });
    } else {
      await tx.activityParticipant.create({
        data: {
          activityId,
          userId,
          status: ParticipantStatus.PENDING,
          isHost: false,
        },
      });
    }

    return fresh;
  });

  const formatted = await formatActivityResponse(activity);

  return {
    activity: formatted,
    participantStatus: ParticipantStatus.PENDING,
    user,
  };
};

/**
 * Withdraws a pending request, or leaves an activity the user was approved for
 * (while it's open or running). Either way the participant becomes WITHDRAWN.
 */
const withdrawJoinRequest = async (userId, activityId) => {
  const activity = await fetchActivityById(activityId);

  const participant = await prisma.activityParticipant.findUnique({
    where: {
      activityId_userId: {
        activityId,
        userId,
      },
    },
  });

  if (!participant || participant.isHost) {
    throw new AppError('No join request found for this activity', 404);
  }

  const leaving = participant.status === ParticipantStatus.APPROVED;

  if (participant.status === ParticipantStatus.PENDING) {
    if (activity.status !== ActivityStatus.PUBLISHED) {
      throw new AppError('Only published activities allow withdrawing a join request', 400);
    }
  } else if (leaving) {
    if (!LEAVABLE_ACTIVITY_STATUSES.includes(activity.status)) {
      throw new AppError('You can only leave an activity before it ends', 400);
    }
  } else {
    throw new AppError('Only pending join requests can be withdrawn', 400);
  }

  await prisma.activityParticipant.update({
    where: { id: participant.id },
    data: { status: ParticipantStatus.WITHDRAWN },
  });

  const formatted = await formatActivityResponse(activity);

  return {
    activity: formatted,
    participantStatus: ParticipantStatus.WITHDRAWN,
    left: leaving,
  };
};

const listActivityParticipants = async (hostId, activityId) => {
  await fetchActivityForHost(activityId, hostId);

  const participants = await prisma.activityParticipant.findMany({
    where: {
      activityId,
      isHost: false,
      status: {
        in: [ParticipantStatus.PENDING, ParticipantStatus.APPROVED],
      },
    },
    select: PARTICIPANT_SELECT,
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    pending: participants.filter((p) => p.status === ParticipantStatus.PENDING),
    approved: participants.filter((p) => p.status === ParticipantStatus.APPROVED),
  };
};

const fetchPendingParticipant = async (activityId, participantUserId, tx = prisma) => {
  const participant = await tx.activityParticipant.findUnique({
    where: {
      activityId_userId: {
        activityId,
        userId: participantUserId,
      },
    },
    select: PARTICIPANT_SELECT,
  });

  if (!participant || participant.isHost) {
    throw new AppError('Join request not found', 404);
  }

  if (participant.status !== ParticipantStatus.PENDING) {
    throw new AppError('Only pending join requests can be reviewed', 409);
  }

  return participant;
};

const approveParticipant = async (hostId, activityId, participantUserId) => {
  await fetchActivityForHost(activityId, hostId);

  const { activity, participant } = await prisma.$transaction(async (tx) => {
    await lockActivity(tx, activityId);
    const fresh = await fetchActivityById(activityId, tx);

    if (fresh.status !== ActivityStatus.PUBLISHED) {
      throw new AppError('Only published activities can approve join requests', 400);
    }

    await fetchPendingParticipant(activityId, participantUserId, tx);

    const approvedCount = await getApprovedCount(activityId, tx);

    if (approvedCount >= fresh.maxParticipants) {
      throw new AppError('Activity is full. Cannot approve more participants', 409);
    }

    await assertNoJoinerTimeOverlap(participantUserId, fresh.startTime, fresh.endTime, activityId, tx);

    const updated = await tx.activityParticipant.update({
      where: { activityId_userId: { activityId, userId: participantUserId } },
      data: { status: ParticipantStatus.APPROVED },
      select: PARTICIPANT_SELECT,
    });

    return { activity: fresh, participant: updated };
  });

  const formatted = await formatActivityResponse(activity);

  return {
    activity: formatted,
    participant,
  };
};

const rejectParticipant = async (hostId, activityId, participantUserId) => {
  const activity = await fetchActivityForHost(activityId, hostId);

  if (activity.status !== ActivityStatus.PUBLISHED) {
    throw new AppError('Only published activities can reject join requests', 400);
  }

  await fetchPendingParticipant(activityId, participantUserId);

  const participant = await prisma.activityParticipant.update({
    where: {
      activityId_userId: {
        activityId,
        userId: participantUserId,
      },
    },
    data: { status: ParticipantStatus.REJECTED },
    select: PARTICIPANT_SELECT,
  });

  const formatted = await formatActivityResponse(activity);

  return {
    activity: formatted,
    participant,
  };
};

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

const distanceKm = (lat1, lng1, lat2, lng2) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
};

const buildDiscoveryWhere = (filters) => {
  const now = new Date();
  const { minLeadMs, maxStartWindowMs } = activityLimits();
  const minStart = new Date(now.getTime() + minLeadMs);
  const maxStart = new Date(now.getTime() + maxStartWindowMs);

  const where = {
    status: { in: DISCOVERY_STATUSES },
    startTime: {
      gte: minStart,
      lte: maxStart,
    },
    // Blocked hosts' activities stay hidden from discovery.
    host: { isBlocked: false },
  };

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.maxParticipants === 2) {
    where.maxParticipants = 2;
  }

  if (filters.isGroup) {
    where.maxParticipants = { gte: 3 };
  }

  if (filters.city) {
    where.city = { equals: filters.city, mode: 'insensitive' };
  }

  if (filters.latitude !== undefined) {
    const latDelta = filters.radiusKm / 111;
    const lngDelta = filters.radiusKm / (111 * Math.max(Math.cos((filters.latitude * Math.PI) / 180), 0.01));

    where.latitude = {
      gte: filters.latitude - latDelta,
      lte: filters.latitude + latDelta,
    };
    where.longitude = {
      gte: filters.longitude - lngDelta,
      lte: filters.longitude + lngDelta,
    };
  }

  return where;
};

const listDiscoveryActivities = async (_userId, { page, limit, filters }) => {
  const where = buildDiscoveryWhere(filters);
  const skip = (page - 1) * limit;

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      select: ACTIVITY_SELECT,
      orderBy: { startTime: 'asc' },
      skip,
      take: limit,
    }),
    prisma.activity.count({ where }),
  ]);

  const formatted = await formatActivityList(activities);
  const withDistance =
    filters.latitude === undefined
      ? formatted
      : formatted.map((activity) => ({
          ...activity,
          distanceKm: Math.round(distanceKm(filters.latitude, filters.longitude, activity.latitude, activity.longitude) * 100) / 100,
        }));

  return {
    activities: withDistance,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const listHostedActivities = async (hostId, { page, limit }) => {
  const where = { hostId };
  const skip = (page - 1) * limit;

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      select: ACTIVITY_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.activity.count({ where }),
  ]);

  const formatted = await formatActivityList(activities);

  return {
    activities: formatted,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const listJoinedActivities = async (userId, { page, limit }) => {
  const where = {
    userId,
    isHost: false,
    status: {
      in: [
        ParticipantStatus.PENDING,
        ParticipantStatus.APPROVED,
        ParticipantStatus.REJECTED,
        ParticipantStatus.WITHDRAWN,
        ParticipantStatus.EXPIRED,
      ],
    },
    activity: {
      status: {
        in: [
          ActivityStatus.PUBLISHED,
          ActivityStatus.CANCELLED,
          ActivityStatus.EXPIRED,
          ActivityStatus.ACTIVE,
          ActivityStatus.COMPLETED,
        ],
      },
    },
  };

  const skip = (page - 1) * limit;

  const [participations, total] = await Promise.all([
    prisma.activityParticipant.findMany({
      where,
      select: {
        status: true,
        activity: {
          select: ACTIVITY_SELECT,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.activityParticipant.count({ where }),
  ]);

  const formatted = await formatActivityList(participations.map((p) => p.activity));
  const activities = formatted.map((activity, index) => ({
    ...activity,
    participantStatus: participations[index].status,
  }));

  return {
    activities,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const activityLogEntry = (activity, action, message) => ({
  action,
  entityType: ENTITY_TYPES.ACTIVITY,
  entityId: activity.id,
  targetUserId: activity.hostId,
  message,
  metadata: {
    activityId: activity.id,
    activityCode: formatActivityCode(activity.aid),
    title: activity.title,
    category: activity.category,
  },
});

const SWEEP_SELECT = { id: true, aid: true, title: true, hostId: true, category: true, status: true };

/** Published activities nobody started become EXPIRED after their end time. Returns the affected rows. */
const expireUnstartedActivities = async () => {
  const now = new Date();

  const expiredActivities = await prisma.activity.findMany({
    where: {
      status: ActivityStatus.PUBLISHED,
      startedAt: null,
      endTime: { lt: now },
    },
    select: SWEEP_SELECT,
  });

  if (expiredActivities.length === 0) {
    return [];
  }

  const activityIds = expiredActivities.map((activity) => activity.id);

  await prisma.$transaction([
    prisma.activityParticipant.updateMany({
      where: {
        activityId: { in: activityIds },
        isHost: false,
        status: ParticipantStatus.PENDING,
      },
      data: { status: ParticipantStatus.EXPIRED },
    }),
    prisma.activity.updateMany({
      where: {
        id: { in: activityIds },
        status: ActivityStatus.PUBLISHED,
      },
      data: {
        status: ActivityStatus.EXPIRED,
        expiredAt: now,
      },
    }),
  ]);

  await logSystemActions(
    expiredActivities.map((activity) =>
      activityLogEntry(activity, AUDIT_ACTIONS.ACTIVITY_EXPIRED, `Activity ${describeActivity(activity)} expired without being started`)
    )
  );

  return expiredActivities.map((activity) => ({ ...activity, status: ActivityStatus.EXPIRED }));
};

/**
 * Started activities the host never completed are completed automatically a
 * while after their end time, so members can post highlights. Returns the affected rows.
 */
const autoCompleteActivities = async () => {
  const cutoff = new Date(Date.now() - setting('activity.autoCompleteGraceMinutes') * MINUTE_MS);

  const overdue = await prisma.activity.findMany({
    where: { status: ActivityStatus.ACTIVE, endTime: { lt: cutoff } },
    select: SWEEP_SELECT,
  });

  if (!overdue.length) return [];

  const ids = overdue.map((activity) => activity.id);
  await prisma.$transaction([
    prisma.activityParticipant.updateMany({
      where: { activityId: { in: ids }, isHost: false, status: ParticipantStatus.PENDING },
      data: { status: ParticipantStatus.EXPIRED },
    }),
    prisma.activity.updateMany({
      where: { id: { in: ids }, status: ActivityStatus.ACTIVE },
      data: { status: ActivityStatus.COMPLETED, completedAt: new Date() },
    }),
  ]);

  await logSystemActions(
    overdue.map((activity) =>
      activityLogEntry(activity, AUDIT_ACTIONS.ACTIVITY_COMPLETED, `Activity ${describeActivity(activity)} completed automatically after its end time`)
    )
  );

  return overdue.map((activity) => ({ ...activity, status: ActivityStatus.COMPLETED }));
};

module.exports = {
  createActivity,
  updateActivity,
  deleteActivity,
  cancelActivity,
  startActivity,
  completeActivity,
  getActivityById,
  joinActivity,
  withdrawJoinRequest,
  listActivityParticipants,
  approveParticipant,
  rejectParticipant,
  listDiscoveryActivities,
  listHostedActivities,
  listJoinedActivities,
  expireUnstartedActivities,
  autoCompleteActivities,
  getApprovedCount,
  formatActivityResponse,
  formatActivityList,
  lockActivity,
};
