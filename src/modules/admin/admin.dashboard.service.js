const { ActivityStatus, ParticipantStatus, VerificationStatus, HighlightStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AUDIT_LOG_SELECT, USER_BRIEF_SELECT, ADMIN_VERIFICATION_SELECT } = require('./admin.constants');

const TREND_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_TIMEZONE = process.env.ADMIN_TIMEZONE || 'Asia/Kolkata';

const toCountMap = (rows, key) =>
  Object.fromEntries(rows.map((row) => [row[key], row._count._all]));

/** Day-bucketed counts (in the dashboard timezone) for one table. */
const dailyCounts = async (table, since) => {
  // Table names are fixed literals below, never user input.
  const rows = await prisma.$queryRawUnsafe(
    `SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE $1::text, 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS count
       FROM "${table}"
      WHERE "createdAt" >= $2::timestamp
      GROUP BY 1`,
    DASHBOARD_TIMEZONE,
    since.toISOString()
  );

  return Object.fromEntries(rows.map((row) => [row.day, row.count]));
};

const localDayKey = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

/** How far the dashboard timezone is ahead of UTC at [date], in ms. */
const timezoneOffsetMs = (date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DASHBOARD_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));

  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/** Midnight today in the dashboard timezone, as a UTC instant. */
const startOfLocalDay = (now) => {
  const utcMidnight = new Date(`${localDayKey(now)}T00:00:00Z`);
  return new Date(utcMidnight.getTime() - timezoneOffsetMs(utcMidnight));
};

const buildTrends = async (now) => {
  const since = new Date(startOfLocalDay(now).getTime() - (TREND_DAYS - 1) * DAY_MS);

  const [users, activities, highlights, joins, verifications] = await Promise.all([
    dailyCounts('User', since),
    dailyCounts('Activity', since),
    dailyCounts('Highlight', since),
    dailyCounts('ActivityParticipant', since),
    dailyCounts('VerificationSubmission', since),
  ]);

  const days = [];
  for (let i = TREND_DAYS - 1; i >= 0; i -= 1) {
    const key = localDayKey(new Date(now.getTime() - i * DAY_MS));
    days.push({
      date: key,
      users: users[key] || 0,
      activities: activities[key] || 0,
      highlights: highlights[key] || 0,
      joins: joins[key] || 0,
      verifications: verifications[key] || 0,
    });
  }

  return days;
};

const getDashboard = async () => {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);
  const next24h = new Date(now.getTime() + DAY_MS);

  const [
    userTotal,
    userVerified,
    userBlocked,
    userCompleted,
    userNewToday,
    userNewWeek,
    verificationByStatus,
    activityByStatus,
    activityByCategory,
    dueNow,
    upcoming24h,
    pendingRequests,
    approvedJoiners,
    highlightByStatus,
    mediaByType,
    logsToday,
    activeUsersToday,
    recentUsers,
    pendingVerifications,
    recentLogs,
    trends,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isProfileVerified: true } }),
    prisma.user.count({ where: { isBlocked: true } }),
    prisma.user.count({ where: { isProfileCompleted: true } }),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.verificationSubmission.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.activity.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.activity.groupBy({
      by: ['category'],
      where: { status: { not: ActivityStatus.DELETED } },
      _count: { _all: true },
    }),
    prisma.activity.count({
      where: { status: ActivityStatus.PUBLISHED, startTime: { lte: now }, endTime: { gt: now } },
    }),
    prisma.activity.count({
      where: { status: ActivityStatus.PUBLISHED, startTime: { gt: now, lte: next24h } },
    }),
    prisma.activityParticipant.count({
      where: {
        isHost: false,
        status: ParticipantStatus.PENDING,
        activity: { status: ActivityStatus.PUBLISHED, endTime: { gt: now } },
      },
    }),
    prisma.activityParticipant.count({
      where: { isHost: false, status: ParticipantStatus.APPROVED },
    }),
    prisma.highlight.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.highlightMediaItem.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.auditLog.findMany({
      where: { createdAt: { gte: todayStart }, userId: { not: null } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { ...USER_BRIEF_SELECT, createdAt: true, isProfileCompleted: true },
    }),
    prisma.verificationSubmission.findMany({
      where: { status: VerificationStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: 5,
      select: ADMIN_VERIFICATION_SELECT,
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: AUDIT_LOG_SELECT,
    }),
    buildTrends(now),
  ]);

  const activityStatus = toCountMap(activityByStatus, 'status');
  const highlightStatus = toCountMap(highlightByStatus, 'status');
  const verificationStatus = toCountMap(verificationByStatus, 'status');

  return {
    generatedAt: now,
    timezone: DASHBOARD_TIMEZONE,
    users: {
      total: userTotal,
      verified: userVerified,
      blocked: userBlocked,
      completedProfiles: userCompleted,
      newToday: userNewToday,
      newThisWeek: userNewWeek,
      activeToday: activeUsersToday.length,
    },
    verifications: {
      pending: verificationStatus.PENDING || 0,
      approved: verificationStatus.APPROVED || 0,
      rejected: verificationStatus.REJECTED || 0,
    },
    activities: {
      total: Object.values(activityStatus).reduce((sum, count) => sum + count, 0),
      byStatus: activityStatus,
      byCategory: toCountMap(activityByCategory, 'category'),
      liveNow: activityStatus.ACTIVE || 0,
      dueNow,
      upcoming24h,
    },
    participants: {
      pendingRequests,
      approvedJoiners,
    },
    highlights: {
      total: Object.values(highlightStatus).reduce((sum, count) => sum + count, 0),
      published: highlightStatus[HighlightStatus.PUBLISHED] || 0,
      deleted: highlightStatus[HighlightStatus.DELETED] || 0,
      media: toCountMap(mediaByType, 'type'),
    },
    events: {
      today: logsToday,
    },
    recentUsers,
    pendingVerifications,
    recentLogs,
    trends,
  };
};

module.exports = { getDashboard };
