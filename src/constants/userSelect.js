const USER_SELECT = {
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
};

const VERIFY_OTP_USER_SELECT = {
  id: true,
  uid: true,
  isBlocked: true,
  isProfileCompleted: true,
  isProfileVerified: true,
};

module.exports = { USER_SELECT, VERIFY_OTP_USER_SELECT };
