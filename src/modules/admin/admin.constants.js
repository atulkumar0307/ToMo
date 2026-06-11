const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const { VERIFICATION_SUBMISSION_SELECT } = require('../verification/verification.constants');

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
  fullNameUpdatedAt: true,
  dateOfBirthUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
  verificationSubmissions: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: VERIFICATION_SUBMISSION_SELECT,
  },
};

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ADMIN_USER_SELECT,
};
