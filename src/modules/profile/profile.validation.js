const { Gender } = require('@prisma/client');

const NAME_MIN = 1;
const NAME_MAX = 100;
const BIO_MAX = 500;
const ALLOWED_GENDERS = Object.values(Gender);

const validateName = (value, fieldLabel) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return `${fieldLabel} must be a string`;
  }

  const trimmed = value.trim();

  if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
    return `${fieldLabel} must be between ${NAME_MIN} and ${NAME_MAX} characters`;
  }

  return null;
};

const validateGender = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return 'Gender must be a string';
  }

  const normalized = value.trim().toUpperCase();

  if (!ALLOWED_GENDERS.includes(normalized)) {
    return `Invalid gender. Allowed values: ${ALLOWED_GENDERS.join(', ')}`;
  }

  return null;
};

const validateDateOfBirth = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return 'Date of birth must be a string (YYYY-MM-DD)';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Invalid date of birth';
  }

  if (date > new Date()) {
    return 'Date of birth cannot be in the future';
  }

  return null;
};

const validateBio = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return 'Bio must be a string';
  }

  if (value.trim().length > BIO_MAX) {
    return `Bio must be at most ${BIO_MAX} characters`;
  }

  return null;
};

const UPDATABLE_FIELDS = ['fullName', 'gender', 'dateOfBirth', 'bio'];

const validateMobileNotAllowed = (body) => {
  if (body.mobile !== undefined) {
    return 'Mobile number cannot be changed';
  }

  return null;
};

const validateUpdateProfile = (body, file) => {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  const mobileError = validateMobileNotAllowed(body);
  if (mobileError) {
    return mobileError;
  }

  const hasUpdate =
    UPDATABLE_FIELDS.some((field) => body[field] !== undefined) || Boolean(file);

  if (!hasUpdate) {
    return `At least one field is required: ${UPDATABLE_FIELDS.join(', ')}, profileImage`;
  }

  const checks = [
    validateName(body.fullName, 'Full name'),
    validateGender(body.gender),
    validateDateOfBirth(body.dateOfBirth),
    validateBio(body.bio),
  ];

  return checks.find((error) => error !== null) || null;
};

const buildProfileUpdateData = (body, file) => {
  const data = {};

  if (body.fullName !== undefined) {
    data.fullName = body.fullName.trim();
  }

  if (body.gender !== undefined) {
    data.gender = body.gender.trim().toUpperCase();
  }

  if (body.dateOfBirth !== undefined) {
    data.dateOfBirth = new Date(body.dateOfBirth);
  }

  if (body.bio !== undefined) {
    data.bio = body.bio.trim();
  }

  if (file) {
    data.profileImagePath = `/uploads/profiles/${file.filename}`;
  }

  return data;
};

module.exports = {
  validateName,
  validateGender,
  validateDateOfBirth,
  validateBio,
  validateMobileNotAllowed,
  validateUpdateProfile,
  buildProfileUpdateData,
};
