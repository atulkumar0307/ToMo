const { ParticipantStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { ACTIVITY_SELECT } = require('./activity.constants');

const assertCanCreateActivity = (user) => {
  if (user.isBlocked) {
    throw new AppError('Your account has been blocked', 403);
  }

  if (!user.isProfileCompleted) {
    throw new AppError('Complete your profile before creating an activity', 403);
  }
};

const formatActivityResponse = (activity, approvedCount) => ({
  ...activity,
  approvedCount,
});

const getApprovedCount = async (activityId, tx = prisma) => {
  return tx.activityParticipant.count({
    where: {
      activityId,
      status: ParticipantStatus.APPROVED,
    },
  });
};

const createActivity = async (hostId, data) => {
  const host = await prisma.user.findUnique({
    where: { id: hostId },
    select: {
      id: true,
      isBlocked: true,
      isProfileCompleted: true,
    },
  });

  if (!host) {
    throw new AppError('User not found', 404);
  }

  assertCanCreateActivity(host);

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

  return formatActivityResponse(activity, 1);
};

module.exports = {
  createActivity,
  getApprovedCount,
  formatActivityResponse,
};
