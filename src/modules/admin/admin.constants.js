const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const ADMIN_USER_SELECT = {
  id: true,
  uid: true,
  mobile: true,
  isBlocked: true,
  fullName: true,
  profileImagePath: true,
  gender: true,
  dateOfBirth: true,
  bio: true,
  isProfileCompleted: true,
  isProfileVerified: true,
  createdAt: true,
  updatedAt: true,
  verificationVideos: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      videoPath: true,
      status: true,
      remark: true,
      createdAt: true,
      updatedAt: true,
    },
  },
};

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ADMIN_USER_SELECT,
};
