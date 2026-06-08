const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { USER_SELECT } = require('../../constants/userSelect');

const updateProfile = async (userId, data) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...data,
      isProfileCompleted: true,
    },
    select: USER_SELECT,
  });

  return user;
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
