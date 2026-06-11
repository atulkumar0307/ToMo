const { VerificationStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { ACTIVITY_SELECT } = require('../activity/activity.constants');
const { formatActivityResponse } = require('../activity/activity.service');
const { VERIFICATION_SUBMISSION_SELECT } = require('../verification/verification.constants');
const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  ADMIN_USER_SELECT,
} = require('./admin.constants');

const findUserOrThrow = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

const listActivities = async (query = {}) => {
  const page = query.page ? parseInt(query.page, 10) : DEFAULT_PAGE;
  const limit = query.limit ? parseInt(query.limit, 10) : DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const where = {};

  if (query.status) {
    where.status = String(query.status).trim().toUpperCase();
  }

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: ACTIVITY_SELECT,
    }),
    prisma.activity.count({ where }),
  ]);

  const formatted = await Promise.all(
    activities.map((activity) => formatActivityResponse(activity))
  );

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

const listUsers = async (query = {}) => {
  const page = query.page ? parseInt(query.page, 10) : DEFAULT_PAGE;
  const limit = query.limit ? parseInt(query.limit, 10) : DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: ADMIN_USER_SELECT,
    }),
    prisma.user.count(),
  ]);

  return {
    users: users.map((user) => ({
      ...user,
      latestVerification: user.verificationSubmissions[0] || null,
      verificationSubmissions: undefined,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
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

  return {
    ...user,
    latestVerification: user.verificationSubmissions[0] || null,
    verificationSubmissions: undefined,
  };
};

const updateUserProfile = async (userId, data) => {
  await findUserOrThrow(userId);

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

  return {
    ...user,
    latestVerification: user.verificationSubmissions[0] || null,
    verificationSubmissions: undefined,
  };
};

const findPendingVerificationOrThrow = async (verificationId) => {
  const verification = await prisma.verificationSubmission.findUnique({
    where: { id: verificationId },
    include: {
      user: {
        select: { id: true },
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
    return prisma.$transaction(async (tx) => {
      const updatedVerification = await tx.verificationSubmission.update({
        where: { id: verification.id },
        data: {
          status: VerificationStatus.APPROVED,
          remark: null,
        },
        select: VERIFICATION_SUBMISSION_SELECT,
      });

      await tx.user.update({
        where: { id: verification.userId },
        data: { isProfileVerified: true },
      });

      return updatedVerification;
    });
  }

  return prisma.verificationSubmission.update({
    where: { id: verification.id },
    data: {
      status: VerificationStatus.REJECTED,
      remark: remark.trim(),
    },
    select: VERIFICATION_SUBMISSION_SELECT,
  });
};

module.exports = {
  listActivities,
  listUsers,
  setUserBlockStatus,
  updateUserProfile,
  reviewVerificationSubmission,
};
