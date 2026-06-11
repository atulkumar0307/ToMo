const { ActivityStatus } = require('@prisma/client');
const {
  validateName,
  validateGender,
  validateDateOfBirth,
  validateBio,
  buildProfileUpdateData,
} = require('../profile/profile.validation');
const { DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } = require('./admin.constants');
const { validateOptionalMobile } = require('../auth/auth.validation');

const UPDATABLE_PROFILE_FIELDS = [
  'mobile',
  'fullName',
  'gender',
  'dateOfBirth',
  'bio',
  'isProfileCompleted',
  'isProfileVerified',
];

const ALLOWED_ACTIVITY_STATUSES = Object.values(ActivityStatus);

const validatePaginationQuery = (query) => {
  const page = query.page !== undefined ? parseInt(query.page, 10) : DEFAULT_PAGE;
  const limit = query.limit !== undefined ? parseInt(query.limit, 10) : DEFAULT_LIMIT;

  if (Number.isNaN(page) || page < 1) {
    return 'Page must be a positive integer';
  }

  if (Number.isNaN(limit) || limit < 1 || limit > MAX_LIMIT) {
    return `Limit must be between 1 and ${MAX_LIMIT}`;
  }

  return null;
};

const validateListUsers = (query) => validatePaginationQuery(query);

const validateListActivities = (query) => {
  const paginationError = validatePaginationQuery(query);

  if (paginationError) {
    return paginationError;
  }

  if (query.status === undefined || query.status === null || query.status === '') {
    return null;
  }

  const normalized = String(query.status).trim().toUpperCase();

  if (!ALLOWED_ACTIVITY_STATUSES.includes(normalized)) {
    return `Invalid status. Allowed values: ${ALLOWED_ACTIVITY_STATUSES.join(', ')}`;
  }

  return null;
};

const validateUserIdParam = (userId) => {
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    return 'User id is required';
  }

  return null;
};

const validateVerificationIdParam = (verificationId) => {
  if (
    !verificationId ||
    typeof verificationId !== 'string' ||
    verificationId.trim().length === 0
  ) {
    return 'Verification id is required';
  }

  return null;
};

const validateBlockUser = (body) => {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  if (typeof body.isBlocked !== 'boolean') {
    return 'isBlocked must be a boolean';
  }

  return null;
};

const parseBooleanField = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  return value === 'true';
};

const validateBooleanField = (value, fieldLabel) => {
  if (value === undefined) {
    return null;
  }

  if (
    typeof value !== 'boolean' &&
    value !== 'true' &&
    value !== 'false'
  ) {
    return `${fieldLabel} must be a boolean`;
  }

  return null;
};

const validateAdminUpdateProfile = (body, file) => {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  const hasUpdate =
    UPDATABLE_PROFILE_FIELDS.some((field) => body[field] !== undefined) ||
    Boolean(file);

  if (!hasUpdate) {
    return `At least one field is required: ${UPDATABLE_PROFILE_FIELDS.join(', ')}, profileImage`;
  }

  const checks = [
    validateOptionalMobile(body.mobile),
    validateName(body.fullName, 'Full name'),
    validateGender(body.gender),
    validateDateOfBirth(body.dateOfBirth),
    validateBio(body.bio),
    validateBooleanField(body.isProfileCompleted, 'isProfileCompleted'),
    validateBooleanField(body.isProfileVerified, 'isProfileVerified'),
  ];

  return checks.find((error) => error !== null) || null;
};

const buildAdminProfileUpdateData = (body, file) => {
  const data = buildProfileUpdateData(body, file);

  if (body.mobile !== undefined) {
    data.mobile = body.mobile.trim();
  }

  if (body.isProfileCompleted !== undefined) {
    data.isProfileCompleted = parseBooleanField(body.isProfileCompleted);
  }

  if (body.isProfileVerified !== undefined) {
    data.isProfileVerified = parseBooleanField(body.isProfileVerified);
  }

  return data;
};

const ALLOWED_REVIEW_STATUSES = ['APPROVED', 'REJECTED'];

const validateReviewVerification = (body) => {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  if (!body.status || typeof body.status !== 'string') {
    return 'Status is required';
  }

  const normalizedStatus = body.status.trim().toUpperCase();

  if (!ALLOWED_REVIEW_STATUSES.includes(normalizedStatus)) {
    return `Invalid status. Allowed values: ${ALLOWED_REVIEW_STATUSES.join(', ')}`;
  }

  if (normalizedStatus === 'REJECTED') {
    if (!body.remark || typeof body.remark !== 'string' || body.remark.trim().length === 0) {
      return 'Remark is required when rejecting verification';
    }

    if (body.remark.trim().length > 500) {
      return 'Remark must be at most 500 characters';
    }
  }

  if (normalizedStatus === 'APPROVED' && body.remark !== undefined && body.remark !== null) {
    if (typeof body.remark !== 'string') {
      return 'Remark must be a string';
    }

    if (body.remark.trim().length > 500) {
      return 'Remark must be at most 500 characters';
    }
  }

  return null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const ADMIN_NAME_MIN = 1;
const ADMIN_NAME_MAX = 100;

const validateAdminRegister = (body) => {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  if (!body.email || typeof body.email !== 'string' || !EMAIL_REGEX.test(body.email.trim())) {
    return 'Valid email is required';
  }

  if (!body.password || typeof body.password !== 'string') {
    return 'Password is required';
  }

  if (body.password.length < PASSWORD_MIN || body.password.length > PASSWORD_MAX) {
    return `Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`;
  }

  if (!body.fullName || typeof body.fullName !== 'string') {
    return 'Full name is required';
  }

  const trimmedName = body.fullName.trim();

  if (trimmedName.length < ADMIN_NAME_MIN || trimmedName.length > ADMIN_NAME_MAX) {
    return `Full name must be between ${ADMIN_NAME_MIN} and ${ADMIN_NAME_MAX} characters`;
  }

  return null;
};

const validateAdminLogin = (body) => {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  if (!body.email || typeof body.email !== 'string' || !EMAIL_REGEX.test(body.email.trim())) {
    return 'Valid email is required';
  }

  if (!body.password || typeof body.password !== 'string' || body.password.length === 0) {
    return 'Password is required';
  }

  return null;
};

const validateAdminRefreshToken = (body) => {
  if (!body.refreshToken || typeof body.refreshToken !== 'string') {
    return 'Refresh token is required';
  }

  return null;
};

module.exports = {
  validateListUsers,
  validateListActivities,
  validateUserIdParam,
  validateVerificationIdParam,
  validateBlockUser,
  validateAdminUpdateProfile,
  buildAdminProfileUpdateData,
  validateReviewVerification,
  validateAdminRegister,
  validateAdminLogin,
  validateAdminRefreshToken,
};
