const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { USER_SELECT } = require('../../constants/userSelect');
const { VERIFIED_FIELD_COOLDOWN_MS } = require('./profile.constants');

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
  return Math.ceil((VERIFIED_FIELD_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
};

const assertFieldCooldown = (lastUpdatedAt, fieldLabel) => {
  if (!lastUpdatedAt) {
    return;
  }

  const elapsed = Date.now() - lastUpdatedAt.getTime();

  if (elapsed < VERIFIED_FIELD_COOLDOWN_MS) {
    const daysLeft = getDaysUntilCooldownEnds(lastUpdatedAt);
    throw new AppError(
      `${fieldLabel} can only be changed once every 2 weeks. Try again in ${daysLeft} day(s).`,
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

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: USER_SELECT,
  });
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

module.exports = {
  updateProfile,
  getProfile,
};
