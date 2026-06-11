const { ActivityStatus, ParticipantStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const {
  ACTIVITY_SELECT,
  DISCOVERY_STATUSES,
  MIN_LEAD_TIME_MS,
  MAX_START_WINDOW_MS,
} = require('./activity.constants');

const assertVerifiedProfile = (user) => {
  if (user.isBlocked) {
    throw new AppError('Your account has been blocked', 403);
  }

  if (!user.isProfileVerified) {
    throw new AppError('Only verified profiles can use activities', 403);
  }
};

const getNonHostParticipantCounts = async (activityId, tx = prisma) => {
  const [pending, approved] = await Promise.all([
    tx.activityParticipant.count({
      where: {
        activityId,
        isHost: false,
        status: ParticipantStatus.PENDING,
      },
    }),
    tx.activityParticipant.count({
      where: {
        activityId,
        isHost: false,
        status: ParticipantStatus.APPROVED,
      },
    }),
  ]);

  return { pending, approved };
};

const getApprovedCount = async (activityId, tx = prisma) => {
  return tx.activityParticipant.count({
    where: {
      activityId,
      status: ParticipantStatus.APPROVED,
    },
  });
};

const formatActivityResponse = async (activity, tx = prisma) => {
  const [approvedCount, counts] = await Promise.all([
    getApprovedCount(activity.id, tx),
    getNonHostParticipantCounts(activity.id, tx),
  ]);

  return {
    ...activity,
    approvedCount,
    pendingCount: counts.pending,
    spotsLeft: Math.max(activity.maxParticipants - approvedCount, 0),
  };
};

const formatActivityList = async (activities) => {
  return Promise.all(activities.map((activity) => formatActivityResponse(activity)));
};

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

const fetchActivityById = async (activityId) => {
  const activity = await prisma.activity.findUnique({
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

  throw new AppError('Activity not found', 404);
};

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

  const activity = await prisma.$transaction(async (tx) => {
    const createdActivity = await tx.activity.create({
      data: {
        hostId,
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

const startActivity = async (hostId, activityId) => {
  const activity = await fetchActivityForHost(activityId, hostId);

  if (activity.status !== ActivityStatus.PUBLISHED) {
    throw new AppError('Only published activities can be started', 400);
  }

  const now = new Date();

  if (now >= activity.endTime) {
    throw new AppError('Cannot start an activity after its end time', 400);
  }

  const started = await prisma.activity.update({
    where: { id: activityId },
    data: {
      status: ActivityStatus.ACTIVE,
      startedAt: now,
    },
    select: ACTIVITY_SELECT,
  });

  return formatActivityResponse(started);
};

const completeActivity = async (hostId, activityId) => {
  const activity = await fetchActivityForHost(activityId, hostId);

  if (activity.status !== ActivityStatus.ACTIVE) {
    throw new AppError('Only active activities can be completed', 400);
  }

  const completed = await prisma.activity.update({
    where: { id: activityId },
    data: {
      status: ActivityStatus.COMPLETED,
      completedAt: new Date(),
    },
    select: ACTIVITY_SELECT,
  });

  return formatActivityResponse(completed);
};

const getActivityById = async (userId, activityId) => {
  const activity = await fetchActivityById(activityId);
  await assertCanViewActivity(activity, userId);
  return formatActivityResponse(activity);
};

const buildDiscoveryWhere = (filters) => {
  const now = new Date();
  const minStart = new Date(now.getTime() + MIN_LEAD_TIME_MS);
  const maxStart = new Date(now.getTime() + MAX_START_WINDOW_MS);

  const where = {
    status: { in: DISCOVERY_STATUSES },
    startTime: {
      gte: minStart,
      lte: maxStart,
    },
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
    const lngDelta = filters.radiusKm / (111 * Math.cos((filters.latitude * Math.PI) / 180));

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

const listDiscoveryActivities = async (userId, { page, limit, filters }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isBlocked: true, isProfileVerified: true },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  assertVerifiedProfile(user);

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
      in: [ParticipantStatus.PENDING, ParticipantStatus.APPROVED],
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

  const activities = await Promise.all(
    participations.map(async ({ status: participantStatus, activity }) => ({
      ...(await formatActivityResponse(activity)),
      participantStatus,
    }))
  );

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

const expireUnstartedActivities = async () => {
  const now = new Date();

  const result = await prisma.activity.updateMany({
    where: {
      status: ActivityStatus.PUBLISHED,
      startedAt: null,
      endTime: { lt: now },
    },
    data: {
      status: ActivityStatus.EXPIRED,
      expiredAt: now,
    },
  });

  return result.count;
};

module.exports = {
  createActivity,
  updateActivity,
  deleteActivity,
  cancelActivity,
  startActivity,
  completeActivity,
  getActivityById,
  listDiscoveryActivities,
  listHostedActivities,
  listJoinedActivities,
  expireUnstartedActivities,
  getApprovedCount,
  formatActivityResponse,
};
