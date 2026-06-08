const { VerificationStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { VERIFICATION_VIDEO_SELECT } = require('../verification/verification.constants');
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
      latestVerification: user.verificationVideos[0] || null,
      verificationVideos: undefined,
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
    latestVerification: user.verificationVideos[0] || null,
    verificationVideos: undefined,
  };
};

const updateUserProfile = async (userId, data) => {
  await findUserOrThrow(userId);

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: ADMIN_USER_SELECT,
  });

  return {
    ...user,
    latestVerification: user.verificationVideos[0] || null,
    verificationVideos: undefined,
  };
};

const findPendingVerificationOrThrow = async (verificationId) => {
  const verification = await prisma.verificationVideo.findUnique({
    where: { id: verificationId },
    include: {
      user: {
        select: { id: true },
      },
    },
  });

  if (!verification) {
    throw new AppError('Verification video not found', 404);
  }

  if (verification.status !== VerificationStatus.PENDING) {
    throw new AppError('Only pending verification videos can be reviewed', 409);
  }

  return verification;
};

const reviewVerificationVideo = async (verificationId, status, remark) => {
  const verification = await findPendingVerificationOrThrow(verificationId);

  if (status === VerificationStatus.APPROVED) {
    return prisma.$transaction(async (tx) => {
      const updatedVerification = await tx.verificationVideo.update({
        where: { id: verification.id },
        data: {
          status: VerificationStatus.APPROVED,
          remark: null,
        },
        select: VERIFICATION_VIDEO_SELECT,
      });

      await tx.user.update({
        where: { id: verification.userId },
        data: { isProfileVerified: true },
      });

      return updatedVerification;
    });
  }

  return prisma.verificationVideo.update({
    where: { id: verification.id },
    data: {
      status: VerificationStatus.REJECTED,
      remark: remark.trim(),
    },
    select: VERIFICATION_VIDEO_SELECT,
  });
};

module.exports = {
  listUsers,
  setUserBlockStatus,
  updateUserProfile,
  reviewVerificationVideo,
};
