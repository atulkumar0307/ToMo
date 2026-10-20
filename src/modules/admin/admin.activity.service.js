const { ActivityStatus, ParticipantStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { formatActivityCode, getNextActivityAid } = require('../../utils/activityAid');
const { removeUploadPaths } = require('../../utils/uploads');
const {
  ADMIN_ACTIVITY_SELECT,
  ADMIN_PARTICIPANT_SELECT,
  ACTIVITY_BRIEF_SELECT,
  USER_BRIEF_SELECT,
  ADMIN_ACTIVITY_TRANSITIONS,
} = require('./admin.constants');
const {
  parsePagination,
  buildPagination,
  parseBooleanQuery,
  parseDateQuery,
  parseEnumList,
  trimmedQuery,
  ALLOWED_ACTIVITY_STATUSES,
  ALLOWED_CATEGORIES,
} = require('./admin.validation');

const STARTING_SOON_MS = 2 * 60 * 60 * 1000;

// Grouped participant counts are shared with the user API.
const { loadParticipantCounts, emptyCounts } = require('../activity/activity.stats');

const liveStateOf = (activity, now = new Date()) => {
  if (activity.status === ActivityStatus.ACTIVE) {
    return 'LIVE';
  }

  if (activity.status !== ActivityStatus.PUBLISHED) {
    return null;
  }

  if (activity.startTime <= now && now < activity.endTime) {
    return 'DUE';
  }

  if (activity.startTime > now && activity.startTime - now <= STARTING_SOON_MS) {
    return 'SOON';
  }

  return null;
};

const attachActivityStats = async (activities) => {
  const counts = await loadParticipantCounts(activities.map((activity) => activity.id));
  const now = new Date();

  return activities.map((activity) => {
    const { _count, ...rest } = activity;
    const entry = counts.get(activity.id) || emptyCounts();

    return {
      ...rest,
      activityCode: formatActivityCode(activity.aid),
      approvedCount: entry.approved,
      pendingCount: entry.pending,
      rejectedCount: entry.rejected,
      withdrawnCount: entry.withdrawn,
      expiredCount: entry.expired,
      spotsLeft: Math.max(activity.maxParticipants - entry.approved, 0),
      highlightCount: _count?.highlights ?? 0,
      liveState: liveStateOf(activity, now),
    };
  });
};

const fetchActivityOrThrow = async (activityId, select = ADMIN_ACTIVITY_SELECT) => {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select,
  });

  if (!activity) {
    throw new AppError('Activity not found', 404);
  }

  return activity;
};

const formatOne = async (activity) => (await attachActivityStats([activity]))[0];

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

const ACTIVITY_SORTS = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  startAsc: { startTime: 'asc' },
  startDesc: { startTime: 'desc' },
  title: { title: 'asc' },
};

const buildActivityWhere = (query) => {
  const and = [];
  const statuses = parseEnumList(query.status, ALLOWED_ACTIVITY_STATUSES);
  const categories = parseEnumList(query.category, ALLOWED_CATEGORIES);
  const q = trimmedQuery(query.q);

  if (statuses.length) {
    and.push({ status: { in: statuses } });
  }

  if (categories.length) {
    and.push({ category: { in: categories } });
  }

  if (query.hostId) {
    and.push({ hostId: String(query.hostId) });
  }

  if (q) {
    const or = [
      { title: { contains: q, mode: 'insensitive' } },
      { locationName: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
      { host: { fullName: { contains: q, mode: 'insensitive' } } },
      { host: { mobile: { contains: q } } },
    ];
    const code = q.toUpperCase().replace(/^ACT-?/, '');
    if (/^\d+$/.test(code) && code.length <= 9) {
      or.push({ aid: parseInt(code, 10) });
    }
    and.push({ OR: or });
  }

  const from = parseDateQuery(query.from);
  const to = parseDateQuery(query.to);
  if (from || to) {
    and.push({ startTime: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  }

  if (parseBooleanQuery(query.live)) {
    and.push({ status: ActivityStatus.ACTIVE });
  }

  const size = trimmedQuery(query.size).toLowerCase();
  if (size === 'single') {
    and.push({ maxParticipants: 2 });
  } else if (size === 'group') {
    and.push({ maxParticipants: { gte: 3 } });
  }

  return and.length ? { AND: and } : {};
};

const listActivities = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const where = buildActivityWhere(query);
  const orderBy = ACTIVITY_SORTS[trimmedQuery(query.sort)] || ACTIVITY_SORTS.newest;

  const [activities, total, statusCounts] = await Promise.all([
    prisma.activity.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      select: ADMIN_ACTIVITY_SELECT,
    }),
    prisma.activity.count({ where }),
    prisma.activity.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  return {
    activities: await attachActivityStats(activities),
    statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])),
    pagination: buildPagination(page, limit, total),
  };
};

const PARTICIPANT_ORDER = [
  { isHost: 'desc' },
  { status: 'asc' },
  { createdAt: 'asc' },
];

const getActivityDetail = async (activityId) => {
  const activity = await fetchActivityOrThrow(activityId);

  const [participants, recentHighlights] = await Promise.all([
    prisma.activityParticipant.findMany({
      where: { activityId },
      orderBy: PARTICIPANT_ORDER,
      select: ADMIN_PARTICIPANT_SELECT,
    }),
    prisma.highlight.findMany({
      where: { activityId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        user: { select: USER_BRIEF_SELECT },
        mediaItems: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { id: true, type: true, filePath: true, thumbnailPath: true },
        },
        _count: { select: { mediaItems: true } },
      },
    }),
  ]);

  return {
    activity: await formatOne(activity),
    participants,
    recentHighlights,
    allowedTransitions: ADMIN_ACTIVITY_TRANSITIONS[activity.status] || [],
  };
};

/** Running groups: started activities, plus ones that should be running and ones about to start. */
const listLiveGroups = async () => {
  const now = new Date();
  const soon = new Date(now.getTime() + STARTING_SOON_MS);

  const activities = await prisma.activity.findMany({
    where: {
      OR: [
        { status: ActivityStatus.ACTIVE },
        {
          status: ActivityStatus.PUBLISHED,
          startTime: { lte: soon },
          endTime: { gt: now },
        },
      ],
    },
    orderBy: { startTime: 'asc' },
    take: 200,
    select: {
      ...ADMIN_ACTIVITY_SELECT,
      participants: {
        where: { status: { in: [ParticipantStatus.APPROVED, ParticipantStatus.PENDING] } },
        orderBy: PARTICIPANT_ORDER,
        select: ADMIN_PARTICIPANT_SELECT,
      },
    },
  });

  const withStats = await attachActivityStats(activities);
  const groups = { live: [], due: [], soon: [] };

  for (const activity of withStats) {
    const { participants, ...rest } = activity;
    const entry = {
      ...rest,
      members: participants.filter((p) => p.status === ParticipantStatus.APPROVED),
      pendingMembers: participants.filter((p) => p.status === ParticipantStatus.PENDING),
    };

    if (activity.liveState === 'LIVE') groups.live.push(entry);
    else if (activity.liveState === 'DUE') groups.due.push(entry);
    else if (activity.liveState === 'SOON') groups.soon.push(entry);
  }

  return {
    ...groups,
    counts: {
      live: groups.live.length,
      due: groups.due.length,
      soon: groups.soon.length,
      peopleLive: groups.live.reduce((sum, activity) => sum + activity.members.length, 0),
    },
    generatedAt: now,
  };
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Creates an activity on behalf of a host (who joins as the approved host participant). */
const createActivity = async (hostWhere, data) => {
  const host = await prisma.user.findUnique({ where: hostWhere, select: USER_BRIEF_SELECT });

  if (!host) {
    throw new AppError('Host user not found', 404);
  }

  if (host.isBlocked) {
    throw new AppError('A blocked user cannot host activities', 400);
  }

  const activity = await prisma.$transaction(async (tx) => {
    const aid = await getNextActivityAid(tx);
    const created = await tx.activity.create({
      data: { ...data, aid, hostId: host.id },
      select: ADMIN_ACTIVITY_SELECT,
    });

    await tx.activityParticipant.create({
      data: { activityId: created.id, userId: host.id, status: ParticipantStatus.APPROVED, isHost: true },
    });

    return created;
  });

  return formatOne(activity);
};

const updateActivity = async (activityId, data) => {
  const activity = await fetchActivityOrThrow(activityId);
  const startTime = data.startTime || activity.startTime;
  const endTime = data.endTime || activity.endTime;

  if (endTime <= startTime) {
    throw new AppError('End time must be after start time', 400);
  }

  if (data.maxParticipants !== undefined) {
    const approved = await prisma.activityParticipant.count({
      where: { activityId, status: ParticipantStatus.APPROVED },
    });

    if (data.maxParticipants < approved) {
      throw new AppError(
        `Maximum participants cannot be below the ${approved} people already approved (host included)`,
        400
      );
    }
  }

  const updated = await prisma.activity.update({
    where: { id: activityId },
    data,
    select: ADMIN_ACTIVITY_SELECT,
  });

  return { before: activity, activity: await formatOne(updated) };
};

const STATUS_TIMESTAMPS = {
  ACTIVE: 'startedAt',
  COMPLETED: 'completedAt',
  CANCELLED: 'cancelledAt',
  DELETED: 'deletedAt',
  EXPIRED: 'expiredAt',
};

const changeActivityStatus = async (activityId, { status }) => {
  const activity = await fetchActivityOrThrow(activityId);
  const allowed = ADMIN_ACTIVITY_TRANSITIONS[activity.status] || [];

  if (activity.status === status) {
    throw new AppError(`Activity is already ${status}`, 400);
  }

  if (!allowed.includes(status)) {
    throw new AppError(
      `Cannot change status from ${activity.status} to ${status}. Allowed: ${allowed.join(', ') || 'none'}`,
      400
    );
  }

  const now = new Date();

  if (status === ActivityStatus.PUBLISHED && activity.endTime <= now) {
    throw new AppError('Cannot republish an activity whose end time has passed. Edit the times first.', 400);
  }

  const data = { status };
  const timestampField = STATUS_TIMESTAMPS[status];

  if (timestampField) {
    data[timestampField] = now;
  }

  if (status === ActivityStatus.PUBLISHED) {
    Object.assign(data, { startedAt: null, cancelledAt: null, deletedAt: null, expiredAt: null });
  }

  if (activity.status === ActivityStatus.COMPLETED && status === ActivityStatus.ACTIVE) {
    data.completedAt = null;
  }

  const operations = [
    prisma.activity.update({ where: { id: activityId }, data, select: ADMIN_ACTIVITY_SELECT }),
  ];

  // Requests nobody answered can no longer be answered once the activity is closed.
  if ([ActivityStatus.COMPLETED, ActivityStatus.EXPIRED].includes(status)) {
    operations.push(
      prisma.activityParticipant.updateMany({
        where: { activityId, isHost: false, status: ParticipantStatus.PENDING },
        data: { status: ParticipantStatus.EXPIRED },
      })
    );
  }

  const [updated] = await prisma.$transaction(operations);

  return {
    previousStatus: activity.status,
    activity: await formatOne(updated),
    allowedTransitions: ADMIN_ACTIVITY_TRANSITIONS[status] || [],
  };
};

const deleteActivity = async (activityId, { hard }) => {
  const activity = await fetchActivityOrThrow(activityId);

  if (!hard) {
    if (activity.status === ActivityStatus.DELETED) {
      throw new AppError('Activity is already deleted. Use hard delete to remove it permanently.', 400);
    }

    const updated = await prisma.activity.update({
      where: { id: activityId },
      data: { status: ActivityStatus.DELETED, deletedAt: new Date() },
      select: ADMIN_ACTIVITY_SELECT,
    });

    return { hard: false, activity: await formatOne(updated) };
  }

  const mediaItems = await prisma.highlightMediaItem.findMany({
    where: { highlight: { activityId } },
    select: { filePath: true, thumbnailPath: true },
  });

  await prisma.activity.delete({ where: { id: activityId } });
  removeUploadPaths(mediaItems.flatMap((item) => [item.filePath, item.thumbnailPath]));

  return { hard: true, activity: { ...activity, activityCode: formatActivityCode(activity.aid) } };
};

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

const listParticipants = async (activityId, query = {}) => {
  await fetchActivityOrThrow(activityId, { id: true });
  const statuses = parseEnumList(query.status, Object.values(ParticipantStatus));

  const participants = await prisma.activityParticipant.findMany({
    where: {
      activityId,
      ...(statuses.length ? { status: { in: statuses } } : {}),
    },
    orderBy: PARTICIPANT_ORDER,
    select: ADMIN_PARTICIPANT_SELECT,
  });

  return { participants };
};

const assertCapacity = async (activity, force) => {
  if (force) {
    return;
  }

  const approved = await prisma.activityParticipant.count({
    where: { activityId: activity.id, status: ParticipantStatus.APPROVED },
  });

  if (approved >= activity.maxParticipants) {
    throw new AppError(
      `Activity is full (${approved}/${activity.maxParticipants}). Send force=true to exceed the limit.`,
      409
    );
  }
};

const addParticipant = async (activityId, { where, force }) => {
  const activity = await fetchActivityOrThrow(activityId, ACTIVITY_BRIEF_SELECT);

  const user = await prisma.user.findUnique({ where, select: USER_BRIEF_SELECT });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.id === activity.hostId) {
    throw new AppError('The host is already part of this activity', 400);
  }

  if (user.isBlocked) {
    throw new AppError('Blocked users cannot be added to activities', 400);
  }

  const existing = await prisma.activityParticipant.findUnique({
    where: { activityId_userId: { activityId, userId: user.id } },
    select: { id: true, status: true },
  });

  if (existing?.status === ParticipantStatus.APPROVED) {
    throw new AppError('This user is already an approved participant', 409);
  }

  await assertCapacity(activity, force);

  const participant = await prisma.activityParticipant.upsert({
    where: { activityId_userId: { activityId, userId: user.id } },
    create: { activityId, userId: user.id, status: ParticipantStatus.APPROVED, isHost: false },
    update: { status: ParticipantStatus.APPROVED },
    select: ADMIN_PARTICIPANT_SELECT,
  });

  return { activity, participant, previousStatus: existing?.status || null };
};

const fetchJoinerOrThrow = async (activityId, userId) => {
  const participant = await prisma.activityParticipant.findUnique({
    where: { activityId_userId: { activityId, userId } },
    select: ADMIN_PARTICIPANT_SELECT,
  });

  if (!participant) {
    throw new AppError('Participant not found', 404);
  }

  if (participant.isHost) {
    throw new AppError('The host participation cannot be changed', 400);
  }

  return participant;
};

const changeParticipantStatus = async (activityId, userId, { status, force }) => {
  const activity = await fetchActivityOrThrow(activityId, ACTIVITY_BRIEF_SELECT);
  const participant = await fetchJoinerOrThrow(activityId, userId);

  if (participant.status === status) {
    throw new AppError(`Participant is already ${status}`, 400);
  }

  if (status === ParticipantStatus.APPROVED) {
    await assertCapacity(activity, force);
  }

  const updated = await prisma.activityParticipant.update({
    where: { id: participant.id },
    data: { status },
    select: ADMIN_PARTICIPANT_SELECT,
  });

  return { activity, participant: updated, previousStatus: participant.status };
};

const removeParticipant = async (activityId, userId) => {
  const activity = await fetchActivityOrThrow(activityId, ACTIVITY_BRIEF_SELECT);
  const participant = await fetchJoinerOrThrow(activityId, userId);

  await prisma.activityParticipant.delete({ where: { id: participant.id } });

  return { activity, participant };
};

/** Every pending join request on activities that can still accept people. */
const listJoinRequests = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const q = trimmedQuery(query.q);
  const where = {
    isHost: false,
    status: ParticipantStatus.PENDING,
    activity: { status: ActivityStatus.PUBLISHED, endTime: { gt: new Date() } },
  };

  if (query.activityId) {
    where.activityId = String(query.activityId);
  }

  if (q) {
    where.OR = [
      { user: { fullName: { contains: q, mode: 'insensitive' } } },
      { user: { mobile: { contains: q } } },
      { activity: { title: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const orderBy = trimmedQuery(query.sort) === 'newest' ? { createdAt: 'desc' } : { createdAt: 'asc' };

  const [requests, total] = await Promise.all([
    prisma.activityParticipant.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      select: {
        ...ADMIN_PARTICIPANT_SELECT,
        activity: {
          select: {
            ...ACTIVITY_BRIEF_SELECT,
            host: { select: USER_BRIEF_SELECT },
          },
        },
      },
    }),
    prisma.activityParticipant.count({ where }),
  ]);

  const counts = await loadParticipantCounts([...new Set(requests.map((r) => r.activityId))]);

  return {
    requests: requests.map((request) => {
      const entry = counts.get(request.activityId) || emptyCounts();
      return {
        ...request,
        activity: {
          ...request.activity,
          activityCode: formatActivityCode(request.activity.aid),
          approvedCount: entry.approved,
          pendingCount: entry.pending,
          spotsLeft: Math.max(request.activity.maxParticipants - entry.approved, 0),
        },
      };
    }),
    pagination: buildPagination(page, limit, total),
  };
};

module.exports = {
  attachActivityStats,
  loadParticipantCounts,
  listActivities,
  getActivityDetail,
  listLiveGroups,
  createActivity,
  updateActivity,
  changeActivityStatus,
  deleteActivity,
  listParticipants,
  addParticipant,
  changeParticipantStatus,
  removeParticipant,
  listJoinRequests,
};
