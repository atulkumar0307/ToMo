const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { USER_SELECT } = require('../../constants/userSelect');
const { verifiedFieldCooldownMs } = require('./profile.constants');
const { invalidateUser } = require('../../utils/userCache');
const { removeUploadPaths } = require('../../utils/uploads');

const isSameDate = (a, b) => {
  if (!a && !b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return (
    new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10)
  );
};

const getDaysUntilCooldownEnds = (lastUpdatedAt) => {
  const elapsed = Date.now() - lastUpdatedAt.getTime();
  return Math.ceil((verifiedFieldCooldownMs() - elapsed) / (24 * 60 * 60 * 1000));
};

const assertFieldCooldown = (lastUpdatedAt, fieldLabel) => {
  if (!lastUpdatedAt) {
    return;
  }

  const elapsed = Date.now() - lastUpdatedAt.getTime();

  if (elapsed < verifiedFieldCooldownMs()) {
    const daysLeft = getDaysUntilCooldownEnds(lastUpdatedAt);
    throw new AppError(
      `${fieldLabel} can only be changed once every ${Math.round(verifiedFieldCooldownMs() / 86400000)} days. Try again in ${daysLeft} day(s).`,
      403
    );
  }
};

const getProfileChanges = (user, data) => {
  const changingName =
    data.fullName !== undefined && data.fullName !== user.fullName;
  const changingDob =
    data.dateOfBirth !== undefined &&
    !isSameDate(data.dateOfBirth, user.dateOfBirth);

  return { changingName, changingDob };
};

const enforceVerifiedProfileRules = (user, data) => {
  if (!user.isProfileVerified) {
    return;
  }

  if (data.gender !== undefined) {
    throw new AppError('Gender cannot be changed after profile verification', 403);
  }

  const { changingName, changingDob } = getProfileChanges(user, data);

  if (changingName) {
    assertFieldCooldown(user.fullNameUpdatedAt, 'Full name');
  }

  if (changingDob) {
    assertFieldCooldown(user.dateOfBirthUpdatedAt, 'Date of birth');
  }
};

const updateProfile = async (userId, data) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profileImagePath: true,
      fullName: true,
      dateOfBirth: true,
      isProfileVerified: true,
      fullNameUpdatedAt: true,
      dateOfBirthUpdatedAt: true,
    },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  enforceVerifiedProfileRules(user, data);

  const { changingName, changingDob } = getProfileChanges(user, data);
  const updateData = {
    ...data,
    isProfileCompleted: true,
  };

  if (user.isProfileVerified && changingName) {
    updateData.fullNameUpdatedAt = new Date();
  }

  if (user.isProfileVerified && changingDob) {
    updateData.dateOfBirthUpdatedAt = new Date();
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: USER_SELECT,
  });

  invalidateUser(userId);

  // A new photo replaces the old file; nothing references the old one any more.
  if (data.profileImagePath && user.profileImagePath && user.profileImagePath !== data.profileImagePath) {
    removeUploadPaths([user.profileImagePath]);
  }

  return updated;
};

const getProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_SELECT,
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

/** Counts for the profile screen in one request (the app used to page through whole lists). */
const getProfileStats = async (userId) => {
  const notDeleted = { status: { not: 'DELETED' } };
  const [joined, hosted, highlights] = await Promise.all([
    prisma.activityParticipant.count({ where: { userId, isHost: false, status: 'APPROVED', activity: notDeleted } }),
    prisma.activity.count({ where: { hostId: userId, ...notDeleted } }),
    prisma.highlight.count({ where: { userId, status: 'PUBLISHED' } }),
  ]);
  return { joined, hosted, highlights };
};

module.exports = {
  getProfileStats,
  updateProfile,
  getProfile,
};
