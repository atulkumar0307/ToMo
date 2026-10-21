const { ActivityStatus, ActivityCategory, Gender, HighlightStatus, ActorType } = require('@prisma/client');
const {
  validateName,
  validateGender,
  validateDateOfBirth,
  validateBio,
  buildProfileUpdateData,
} = require('../profile/profile.validation');
const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ADMIN_PARTICIPANT_STATUSES,
} = require('./admin.constants');
const { validateOptionalMobile } = require('../auth/auth.validation');
const {
  TITLE_MIN,
  TITLE_MAX,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  activityLimits,
} = require('../activity/activity.constants');
const {
  TITLE_MAX: HIGHLIGHT_TITLE_MAX,
  CAPTION_MAX,
  DESCRIPTION_MAX: HIGHLIGHT_DESCRIPTION_MAX,
  MAX_TAGS,
  MAX_TAG_LENGTH,
} = require('../highlight/highlight.constants');

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
const ALLOWED_CATEGORIES = Object.values(ActivityCategory);
const ALLOWED_GENDERS = Object.values(Gender);
const ALLOWED_HIGHLIGHT_STATUSES = Object.values(HighlightStatus);
const ALLOWED_ACTOR_TYPES = Object.values(ActorType);
const MOBILE_REGEX = /^[6-9]\d{9}$/;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Lenient pagination: bad or out-of-range values fall back to defaults/limits. */
const parsePagination = (query = {}, defaultLimit = DEFAULT_LIMIT) => {
  const page = parseInt(query.page, 10);
  const limit = parseInt(query.limit, 10);
  const safePage = Number.isNaN(page) || page < 1 ? DEFAULT_PAGE : page;
  const safeLimit = Number.isNaN(limit) || limit < 1 ? defaultLimit : Math.min(limit, MAX_LIMIT);

  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
};

const buildPagination = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit) || 1,
});

const parseBooleanQuery = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }

  return undefined;
};

const parseDateQuery = (value) => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Accepts `A`, `A,B` or repeated params; keeps only allowed values. */
const parseEnumList = (value, allowed) => {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  const raw = Array.isArray(value) ? value : String(value).split(',');

  return raw
    .map((item) => String(item).trim().toUpperCase())
    .filter((item) => allowed.includes(item));
};

const trimmedQuery = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
};

// ---------------------------------------------------------------------------
// Legacy validators (kept for existing callers)
// ---------------------------------------------------------------------------

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

  const statuses = String(query.status).split(',').map((s) => s.trim().toUpperCase());
  const invalid = statuses.find((s) => !ALLOWED_ACTIVITY_STATUSES.includes(s));

  if (invalid) {
    return `Invalid status. Allowed values: ${ALLOWED_ACTIVITY_STATUSES.join(', ')}`;
  }

  return null;
};

const validateIdParam = (value, label) => {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return `${label} is required`;
  }

  return null;
};

const validateUserIdParam = (userId) => validateIdParam(userId, 'User id');

const validateVerificationIdParam = (verificationId) =>
  validateIdParam(verificationId, 'Verification id');

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

const validateAdminCreateUser = (body, file) => {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  if (!body.mobile || typeof body.mobile !== 'string' || !MOBILE_REGEX.test(body.mobile.trim())) {
    return 'A valid 10-digit Indian mobile number is required';
  }

  return validateAdminUpdateProfile(body, file);
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

// ---------------------------------------------------------------------------
// Admin accounts
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const ADMIN_NAME_MIN = 1;
const ADMIN_NAME_MAX = 100;

const validatePassword = (password, label = 'Password') => {
  if (!password || typeof password !== 'string') {
    return `${label} is required`;
  }

  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `${label} must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`;
  }

  return null;
};

const validateAdminName = (fullName) => {
  if (!fullName || typeof fullName !== 'string') {
    return 'Full name is required';
  }

  const trimmedName = fullName.trim();

  if (trimmedName.length < ADMIN_NAME_MIN || trimmedName.length > ADMIN_NAME_MAX) {
    return `Full name must be between ${ADMIN_NAME_MIN} and ${ADMIN_NAME_MAX} characters`;
  }

  return null;
};

const validateAdminRegister = (body) => {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  if (!body.email || typeof body.email !== 'string' || !EMAIL_REGEX.test(body.email.trim())) {
    return 'Valid email is required';
  }

  return validatePassword(body.password) || validateAdminName(body.fullName);
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
  if (!body || !body.refreshToken || typeof body.refreshToken !== 'string') {
    return 'Refresh token is required';
  }

  return null;
};

const validateAdminAccountUpdate = (body) => {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  const hasField =
    body.fullName !== undefined || body.isActive !== undefined || body.password !== undefined;

  if (!hasField) {
    return 'At least one field is required: fullName, isActive, password';
  }

  if (body.fullName !== undefined) {
    const nameError = validateAdminName(body.fullName);
    if (nameError) {
      return nameError;
    }
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return 'isActive must be a boolean';
  }

  if (body.password !== undefined) {
    return validatePassword(body.password);
  }

  return null;
};

const validateChangePassword = (body) => {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  if (!body.currentPassword || typeof body.currentPassword !== 'string') {
    return 'Current password is required';
  }

  const passwordError = validatePassword(body.newPassword, 'New password');
  if (passwordError) {
    return passwordError;
  }

  if (body.currentPassword === body.newPassword) {
    return 'New password must be different from the current password';
  }

  return null;
};

// ---------------------------------------------------------------------------
// Activities & participants
// ---------------------------------------------------------------------------

const validateLength = (value, label, min, max) => {
  if (typeof value !== 'string') {
    return `${label} must be a string`;
  }

  const length = value.trim().length;

  if (length < min || length > max) {
    return `${label} must be between ${min} and ${max} characters`;
  }

  return null;
};

/** Partial update: only fields present in the body are validated and returned. */
const validateAdminActivityUpdate = (body) => {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' };
  }

  const data = {};

  if (body.title !== undefined) {
    const error = validateLength(body.title, 'Title', TITLE_MIN, TITLE_MAX);
    if (error) return { error };
    data.title = body.title.trim();
  }

  if (body.description !== undefined) {
    const error = validateLength(body.description, 'Description', DESCRIPTION_MIN, DESCRIPTION_MAX);
    if (error) return { error };
    data.description = body.description.trim();
  }

  if (body.category !== undefined) {
    const category = String(body.category).trim().toUpperCase();
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return { error: `Invalid category. Allowed values: ${ALLOWED_CATEGORIES.join(', ')}` };
    }
    data.category = category;
  }

  if (body.locationName !== undefined) {
    const error = validateLength(body.locationName, 'Location name', 1, 200);
    if (error) return { error };
    data.locationName = body.locationName.trim();
  }

  for (const [field, label, max] of [
    ['address', 'Address', 500],
    ['city', 'City', 100],
  ]) {
    if (body[field] !== undefined) {
      if (body[field] !== null && typeof body[field] !== 'string') {
        return { error: `${label} must be a string` };
      }
      const value = body[field] === null ? '' : body[field].trim();
      if (value.length > max) {
        return { error: `${label} must be at most ${max} characters` };
      }
      data[field] = value || null;
    }
  }

  for (const [field, label, min, max] of [
    ['latitude', 'Latitude', -90, 90],
    ['longitude', 'Longitude', -180, 180],
  ]) {
    if (body[field] !== undefined) {
      const parsed = typeof body[field] === 'number' ? body[field] : parseFloat(body[field]);
      if (Number.isNaN(parsed) || parsed < min || parsed > max) {
        return { error: `${label} must be a valid coordinate` };
      }
      data[field] = parsed;
    }
  }

  for (const [field, label] of [
    ['startTime', 'Start time'],
    ['endTime', 'End time'],
  ]) {
    if (body[field] !== undefined) {
      const date = new Date(body[field]);
      if (typeof body[field] !== 'string' || Number.isNaN(date.getTime())) {
        return { error: `${label} must be a valid ISO date-time string` };
      }
      data[field] = date;
    }
  }

  if (body.maxParticipants !== undefined) {
    const parsed =
      typeof body.maxParticipants === 'number'
        ? body.maxParticipants
        : parseInt(body.maxParticipants, 10);
    const { minParticipants, maxParticipants } = activityLimits();
    if (Number.isNaN(parsed) || parsed < minParticipants || parsed > maxParticipants) {
      return {
        error: `Maximum participants must be between ${minParticipants} and ${maxParticipants}`,
      };
    }
    data.maxParticipants = parsed;
  }

  if (Object.keys(data).length === 0) {
    return { error: 'At least one field is required to update' };
  }

  return { data };
};

const validateActivityStatusChange = (body) => {
  if (!body || typeof body !== 'object' || !body.status || typeof body.status !== 'string') {
    return { error: 'Status is required' };
  }

  const status = body.status.trim().toUpperCase();

  if (!ALLOWED_ACTIVITY_STATUSES.includes(status)) {
    return { error: `Invalid status. Allowed values: ${ALLOWED_ACTIVITY_STATUSES.join(', ')}` };
  }

  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== 'string' || body.reason.trim().length > 500) {
      return { error: 'Reason must be a string of at most 500 characters' };
    }
  }

  return { data: { status, reason: body.reason?.trim() || null } };
};

const validateAddParticipant = (body) => {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' };
  }

  const { userId, uid, mobile } = body;

  if (userId && typeof userId === 'string') {
    return { data: { where: { id: userId.trim() }, force: body.force === true } };
  }

  if (uid !== undefined && uid !== null && uid !== '') {
    const parsed = parseInt(uid, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return { error: 'uid must be a positive integer' };
    }
    return { data: { where: { uid: parsed }, force: body.force === true } };
  }

  if (mobile && typeof mobile === 'string') {
    if (!MOBILE_REGEX.test(mobile.trim())) {
      return { error: 'Invalid mobile number' };
    }
    return { data: { where: { mobile: mobile.trim() }, force: body.force === true } };
  }

  return { error: 'Provide userId, uid or mobile of the user to add' };
};

const validateParticipantStatusChange = (body) => {
  if (!body || typeof body !== 'object' || !body.status || typeof body.status !== 'string') {
    return { error: 'Status is required' };
  }

  const status = body.status.trim().toUpperCase();

  if (!ADMIN_PARTICIPANT_STATUSES.includes(status)) {
    return { error: `Invalid status. Allowed values: ${ADMIN_PARTICIPANT_STATUSES.join(', ')}` };
  }

  return { data: { status, force: body.force === true } };
};

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

const validateAdminHighlightUpdate = (body) => {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' };
  }

  const data = {};

  if (body.title !== undefined) {
    const error = validateLength(body.title, 'Title', 1, HIGHLIGHT_TITLE_MAX);
    if (error) return { error };
    data.title = body.title.trim();
  }

  for (const [field, label, max] of [
    ['caption', 'Caption', CAPTION_MAX],
    ['description', 'Description', HIGHLIGHT_DESCRIPTION_MAX],
  ]) {
    if (body[field] !== undefined) {
      if (body[field] !== null && typeof body[field] !== 'string') {
        return { error: `${label} must be a string` };
      }
      const value = body[field] === null ? '' : body[field].trim();
      if (value.length > max) {
        return { error: `${label} must be at most ${max} characters` };
      }
      data[field] = value || null;
    }
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > MAX_TAGS) {
      return { error: `tags must be an array of at most ${MAX_TAGS} strings` };
    }
    const tags = [];
    for (const tag of body.tags) {
      if (typeof tag !== 'string' || !tag.trim()) {
        return { error: 'Each tag must be a non-empty string' };
      }
      const normalized = tag.trim().toLowerCase().replace(/\s+/g, '_');
      if (normalized.length > MAX_TAG_LENGTH) {
        return { error: `Each tag must be at most ${MAX_TAG_LENGTH} characters` };
      }
      if (!tags.includes(normalized)) {
        tags.push(normalized);
      }
    }
    data.tags = tags;
  }

  if (body.status !== undefined) {
    const status = String(body.status).trim().toUpperCase();
    if (!ALLOWED_HIGHLIGHT_STATUSES.includes(status)) {
      return { error: `Invalid status. Allowed values: ${ALLOWED_HIGHLIGHT_STATUSES.join(', ')}` };
    }
    data.status = status;
  }

  if (Object.keys(data).length === 0) {
    return { error: 'At least one field is required to update' };
  }

  return { data };
};

module.exports = {
  parsePagination,
  buildPagination,
  parseBooleanQuery,
  parseDateQuery,
  parseEnumList,
  trimmedQuery,
  validateListUsers,
  validateListActivities,
  validateIdParam,
  validateUserIdParam,
  validateVerificationIdParam,
  validateBlockUser,
  validateAdminUpdateProfile,
  buildAdminProfileUpdateData,
  validateAdminCreateUser,
  validateReviewVerification,
  validateAdminRegister,
  validateAdminLogin,
  validateAdminRefreshToken,
  validateAdminAccountUpdate,
  validateChangePassword,
  validateAdminActivityUpdate,
  validateActivityStatusChange,
  validateAddParticipant,
  validateParticipantStatusChange,
  validateAdminHighlightUpdate,
  ALLOWED_ACTIVITY_STATUSES,
  ALLOWED_CATEGORIES,
  ALLOWED_GENDERS,
  ALLOWED_HIGHLIGHT_STATUSES,
  ALLOWED_ACTOR_TYPES,
};
