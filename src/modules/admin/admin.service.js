const { VerificationStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { getNextUserUid } = require('../../utils/userUid');
const { removeUploadPaths } = require('../../utils/uploads');
const { VERIFICATION_SUBMISSION_SELECT } = require('../verification/verification.constants');
const {
  ADMIN_USER_SELECT,
  ADMIN_VERIFICATION_SELECT,
  ADMIN_HIGHLIGHT_SELECT,
  ADMIN_ACTIVITY_SELECT,
} = require('./admin.constants');
const {
  parsePagination,
  buildPagination,
  parseBooleanQuery,
  parseEnumList,
  trimmedQuery,
  ALLOWED_GENDERS,
} = require('./admin.validation');
const { attachActivityStats } = require('./admin.activity.service');

const formatAdminUser = (user) => {
  const { verificationSubmissions, _count, ...rest } = user;

  return {
    ...rest,
    latestVerification: verificationSubmissions?.[0] || null,
    counts: {
      hostedActivities: _count?.hostedActivities ?? 0,
      highlights: _count?.highlights ?? 0,
      activeSessions: _count?.refreshTokens ?? 0,
    },
  };
};

const findUserOrThrow = async (userId, select = { id: true }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select,
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

/** `q` matches name or mobile (contains), or uid (exact) when numeric. */
const buildUserSearch = (q) => {
  if (!q) {
    return null;
  }

  const or = [
    { fullName: { contains: q, mode: 'insensitive' } },
    { mobile: { contains: q } },
  ];

  const numeric = q.replace(/^#/, '');
  if (/^\d+$/.test(numeric) && numeric.length <= 9) {
    or.push({ uid: parseInt(numeric, 10) });
  }

  return { OR: or };
};

const USER_SORTS = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  name: { fullName: 'asc' },
  uid: { uid: 'asc' },
  updated: { updatedAt: 'desc' },
};

const buildUserWhere = (query) => {
  const and = [];
  const search = buildUserSearch(trimmedQuery(query.q));

  if (search) {
    and.push(search);
  }

  const blocked = parseBooleanQuery(query.blocked);
  if (blocked !== undefined) {
    and.push({ isBlocked: blocked });
  }

  const verified = parseBooleanQuery(query.verified);
  if (verified !== undefined) {
    and.push({ isProfileVerified: verified });
  }

  const completed = parseBooleanQuery(query.completed);
  if (completed !== undefined) {
    and.push({ isProfileCompleted: completed });
  }

  const [gender] = parseEnumList(query.gender, ALLOWED_GENDERS);
  if (gender) {
    and.push({ gender });
  }

  const verification = trimmedQuery(query.verification).toUpperCase();
  if (verification === 'PENDING') {
    and.push({ verificationSubmissions: { some: { status: VerificationStatus.PENDING } } });
  } else if (verification === 'APPROVED') {
    and.push({ isProfileVerified: true });
  } else if (verification === 'REJECTED') {
    and.push({
      isProfileVerified: false,
      verificationSubmissions: {
        some: { status: VerificationStatus.REJECTED },
        none: { status: VerificationStatus.PENDING },
      },
    });
  } else if (verification === 'NONE') {
    and.push({ verificationSubmissions: { none: {} } });
  }

  return and.length ? { AND: and } : {};
};

const listUsers = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const where = buildUserWhere(query);
  const orderBy = USER_SORTS[trimmedQuery(query.sort)] || USER_SORTS.newest;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      select: ADMIN_USER_SELECT,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map(formatAdminUser),
    pagination: buildPagination(page, limit, total),
  };
};

const getUserDetail = async (userId) => {
  const user = await findUserOrThrow(userId, ADMIN_USER_SELECT);

  const [hostedByStatus, participationByStatus, highlightsByStatus, verificationCount, lastLog] =
    await Promise.all([
      prisma.activity.groupBy({
        by: ['status'],
        where: { hostId: userId },
        _count: { _all: true },
      }),
      prisma.activityParticipant.groupBy({
        by: ['status'],
        where: { userId, isHost: false },
        _count: { _all: true },
      }),
      prisma.highlight.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
      prisma.verificationSubmission.count({ where: { userId } }),
      prisma.auditLog.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, action: true, message: true },
      }),
    ]);

  const toMap = (rows) =>
    Object.fromEntries(rows.map((row) => [row.status, row._count._all]));

  return {
    user: formatAdminUser(user),
    stats: {
      hostedByStatus: toMap(hostedByStatus),
      participationByStatus: toMap(participationByStatus),
      highlightsByStatus: toMap(highlightsByStatus),
      verificationSubmissions: verificationCount,
      lastSeenAt: lastLog?.createdAt || null,
      lastAction: lastLog || null,
    },
  };
};

const createUser = async (data) => {
  const existing = await prisma.user.findUnique({
    where: { mobile: data.mobile },
    select: { id: true },
  });

  if (existing) {
    throw new AppError('A user with this mobile number already exists', 409);
  }

  const user = await prisma.$transaction(async (tx) => {
    const uid = await getNextUserUid(tx);

    return tx.user.create({
      data: {
        uid,
        isProfileCompleted: Boolean(data.fullName),
        isProfileVerified: false,
        ...data,
      },
      select: ADMIN_USER_SELECT,
    });
  });

  return formatAdminUser(user);
};

const setUserBlockStatus = async (userId, isBlocked) => {
  await findUserOrThrow(userId);

  const user = await prisma.$transaction(async (tx) => {
    if (isBlocked) {
      await tx.refreshToken.deleteMany({ where: { userId } });
    }

    return tx.user.update({
      where: { id: userId },
      data: { isBlocked },
      select: ADMIN_USER_SELECT,
    });
  });

  return formatAdminUser(user);
};

const updateUserProfile = async (userId, data) => {
  const before = await findUserOrThrow(userId, { id: true, profileImagePath: true });

  if (data.mobile) {
    const existingUser = await prisma.user.findUnique({
      where: { mobile: data.mobile },
      select: { id: true },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new AppError('Mobile number already in use', 409);
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: ADMIN_USER_SELECT,
  });

  if (data.profileImagePath && before.profileImagePath && before.profileImagePath !== data.profileImagePath) {
    removeUploadPaths([before.profileImagePath]);
  }

  return formatAdminUser(user);
};

const removeUserProfileImage = async (userId) => {
  const before = await findUserOrThrow(userId, { id: true, profileImagePath: true });

  if (!before.profileImagePath) {
    throw new AppError('This user has no profile photo', 400);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { profileImagePath: null },
    select: ADMIN_USER_SELECT,
  });

  removeUploadPaths([before.profileImagePath]);
  return formatAdminUser(user);
};

/**
 * Permanently removes the user and everything that cascades from them
 * (sessions, verifications, hosted activities, participations, highlights),
 * then deletes their uploaded files.
 */
const deleteUser = async (userId) => {
  const user = await findUserOrThrow(userId, {
    id: true,
    uid: true,
    mobile: true,
    fullName: true,
    profileImagePath: true,
  });

  const [verificationImages, mediaItems] = await Promise.all([
    prisma.verificationImage.findMany({
      where: { submission: { userId } },
      select: { imagePath: true },
    }),
    prisma.highlightMediaItem.findMany({
      where: {
        highlight: {
          OR: [{ userId }, { activity: { hostId: userId } }],
        },
      },
      select: { filePath: true, thumbnailPath: true },
    }),
  ]);

  await prisma.user.delete({ where: { id: userId } });

  removeUploadPaths([
    user.profileImagePath,
    ...verificationImages.map((image) => image.imagePath),
    ...mediaItems.flatMap((item) => [item.filePath, item.thumbnailPath]),
  ]);

  return user;
};

const listUserSessions = async (userId) => {
  await findUserOrThrow(userId);

  const sessions = await prisma.refreshToken.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, expiresAt: true },
  });

  const now = new Date();

  return {
    sessions: sessions.map((session) => ({
      ...session,
      isExpired: session.expiresAt < now,
    })),
  };
};

const revokeUserSessions = async (userId) => {
  await findUserOrThrow(userId);
  const result = await prisma.refreshToken.deleteMany({ where: { userId } });
  return { revoked: result.count };
};

const listUserActivities = async (userId, query = {}) => {
  await findUserOrThrow(userId);
  const { page, limit, skip } = parsePagination(query);
  const type = trimmedQuery(query.type).toLowerCase() === 'joined' ? 'joined' : 'hosted';

  if (type === 'hosted') {
    const where = { hostId: userId };
    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: ADMIN_ACTIVITY_SELECT,
      }),
      prisma.activity.count({ where }),
    ]);

    return {
      type,
      activities: await attachActivityStats(activities),
      pagination: buildPagination(page, limit, total),
    };
  }

  const where = { userId, isHost: false };
  const [participations, total] = await Promise.all([
    prisma.activityParticipant.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        createdAt: true,
        updatedAt: true,
        activity: { select: ADMIN_ACTIVITY_SELECT },
      },
    }),
    prisma.activityParticipant.count({ where }),
  ]);

  const withStats = await attachActivityStats(participations.map((p) => p.activity));

  return {
    type,
    activities: withStats.map((activity, index) => ({
      ...activity,
      participantStatus: participations[index].status,
      requestedAt: participations[index].createdAt,
      participantUpdatedAt: participations[index].updatedAt,
    })),
    pagination: buildPagination(page, limit, total),
  };
};

const listUserHighlights = async (userId, query = {}) => {
  await findUserOrThrow(userId);
  const { page, limit, skip } = parsePagination(query);
  const where = { userId };

  const [highlights, total] = await Promise.all([
    prisma.highlight.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: ADMIN_HIGHLIGHT_SELECT,
    }),
    prisma.highlight.count({ where }),
  ]);

  return { highlights, pagination: buildPagination(page, limit, total) };
};

const listUserVerifications = async (userId) => {
  await findUserOrThrow(userId);

  const verifications = await prisma.verificationSubmission.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: VERIFICATION_SUBMISSION_SELECT,
  });

  return { verifications };
};

// ---------------------------------------------------------------------------
// Verifications
// ---------------------------------------------------------------------------

const listVerifications = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const statuses = parseEnumList(query.status, Object.values(VerificationStatus));
  const q = trimmedQuery(query.q);
  const where = {};

  if (statuses.length) {
    where.status = { in: statuses };
  }

  const userSearch = buildUserSearch(q);
  if (userSearch) {
    where.user = userSearch;
  }

  const sort = trimmedQuery(query.sort);
  // The review queue is first-come first-served by default.
  const orderBy = sort === 'newest' ? { createdAt: 'desc' } : { createdAt: 'asc' };

  const [verifications, total, counts] = await Promise.all([
    prisma.verificationSubmission.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      select: ADMIN_VERIFICATION_SELECT,
    }),
    prisma.verificationSubmission.count({ where }),
    prisma.verificationSubmission.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  return {
    verifications,
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
    pagination: buildPagination(page, limit, total),
  };
};

const getVerification = async (verificationId) => {
  const verification = await prisma.verificationSubmission.findUnique({
    where: { id: verificationId },
    select: ADMIN_VERIFICATION_SELECT,
  });

  if (!verification) {
    throw new AppError('Verification submission not found', 404);
  }

  const history = await prisma.verificationSubmission.findMany({
    where: { userId: verification.userId, id: { not: verification.id } },
    orderBy: { createdAt: 'desc' },
    select: VERIFICATION_SUBMISSION_SELECT,
  });

  return { verification, history };
};

const findPendingVerificationOrThrow = async (verificationId) => {
  const verification = await prisma.verificationSubmission.findUnique({
    where: { id: verificationId },
    include: {
      user: {
        select: { id: true, uid: true, fullName: true, mobile: true },
      },
    },
  });

  if (!verification) {
    throw new AppError('Verification submission not found', 404);
  }

  if (verification.status !== VerificationStatus.PENDING) {
    throw new AppError('Only pending verification submissions can be reviewed', 409);
  }

  return verification;
};

const reviewVerificationSubmission = async (verificationId, status, remark) => {
  const verification = await findPendingVerificationOrThrow(verificationId);

  if (status === VerificationStatus.APPROVED) {
    const updated = await prisma.$transaction(async (tx) => {
      const updatedVerification = await tx.verificationSubmission.update({
        where: { id: verification.id },
        data: {
          status: VerificationStatus.APPROVED,
          remark: remark?.trim() || null,
        },
        select: VERIFICATION_SUBMISSION_SELECT,
      });

      await tx.user.update({
        where: { id: verification.userId },
        data: { isProfileVerified: true },
      });

      return updatedVerification;
    });

    return { verification: updated, user: verification.user };
  }

  const updated = await prisma.verificationSubmission.update({
    where: { id: verification.id },
    data: {
      status: VerificationStatus.REJECTED,
      remark: remark.trim(),
    },
    select: VERIFICATION_SUBMISSION_SELECT,
  });

  return { verification: updated, user: verification.user };
};

module.exports = {
  formatAdminUser,
  listUsers,
  getUserDetail,
  createUser,
  setUserBlockStatus,
  updateUserProfile,
  removeUserProfileImage,
  deleteUser,
  listUserSessions,
  revokeUserSessions,
  listUserActivities,
  listUserHighlights,
  listUserVerifications,
  listVerifications,
  getVerification,
  reviewVerificationSubmission,
};
