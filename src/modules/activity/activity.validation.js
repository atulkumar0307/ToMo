const {
  TITLE_MIN,
  TITLE_MAX,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  MIN_PARTICIPANTS,
  MAX_PARTICIPANTS,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  MIN_LEAD_TIME_MS,
  MAX_START_WINDOW_MS,
  ALLOWED_CATEGORIES,
} = require('./activity.constants');

const validateTitle = (value) => {
  if (!value || typeof value !== 'string') {
    return 'Title is required';
  }

  const trimmed = value.trim();

  if (trimmed.length < TITLE_MIN || trimmed.length > TITLE_MAX) {
    return `Title must be between ${TITLE_MIN} and ${TITLE_MAX} characters`;
  }

  return null;
};

const validateDescription = (value) => {
  if (!value || typeof value !== 'string') {
    return 'Description is required';
  }

  const trimmed = value.trim();

  if (trimmed.length < DESCRIPTION_MIN || trimmed.length > DESCRIPTION_MAX) {
    return `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters`;
  }

  return null;
};

const validateCategory = (value) => {
  if (!value || typeof value !== 'string') {
    return 'Category is required';
  }

  const normalized = value.trim().toUpperCase();

  if (!ALLOWED_CATEGORIES.includes(normalized)) {
    return `Invalid category. Allowed values: ${ALLOWED_CATEGORIES.join(', ')}`;
  }

  return null;
};

const validateLocationName = (value) => {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return 'Location name is required';
  }

  if (value.trim().length > 200) {
    return 'Location name must be at most 200 characters';
  }

  return null;
};

const validateOptionalString = (value, fieldLabel, maxLength) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return `${fieldLabel} must be a string`;
  }

  if (value.trim().length > maxLength) {
    return `${fieldLabel} must be at most ${maxLength} characters`;
  }

  return null;
};

const parseCoordinate = (value, fieldLabel, min, max) => {
  if (value === undefined || value === null || value === '') {
    return { error: `${fieldLabel} is required` };
  }

  const parsed = typeof value === 'number' ? value : parseFloat(value);

  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return { error: `${fieldLabel} must be a valid coordinate` };
  }

  return { value: parsed };
};

const parseDateTime = (value, fieldLabel) => {
  if (!value || typeof value !== 'string') {
    return { error: `${fieldLabel} is required` };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { error: `${fieldLabel} must be a valid ISO date-time string` };
  }

  return { value: date };
};

const validateMaxParticipants = (value) => {
  if (value === undefined || value === null || value === '') {
    return 'Maximum participants is required';
  }

  const parsed = typeof value === 'number' ? value : parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < MIN_PARTICIPANTS || parsed > MAX_PARTICIPANTS) {
    return `Maximum participants must be between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}`;
  }

  return null;
};

const validateActivityTimes = (startTime, endTime) => {
  const now = new Date();
  const minStart = new Date(now.getTime() + MIN_LEAD_TIME_MS);
  const maxStart = new Date(now.getTime() + MAX_START_WINDOW_MS);

  if (startTime < minStart) {
    return 'Start time must be at least 30 minutes from now';
  }

  if (startTime > maxStart) {
    return 'Start time must be within 24 hours from now';
  }

  if (endTime <= startTime) {
    return 'End time must be after start time';
  }

  const durationMs = endTime.getTime() - startTime.getTime();

  if (durationMs < MIN_DURATION_MS) {
    return 'Activity duration must be at least 30 minutes';
  }

  if (durationMs > MAX_DURATION_MS) {
    return 'Activity duration must be at most 8 hours';
  }

  return null;
};

const buildActivityData = (body) => {
  const latitudeResult = parseCoordinate(body.latitude, 'Latitude', -90, 90);
  if (latitudeResult.error) {
    return { error: latitudeResult.error };
  }

  const longitudeResult = parseCoordinate(body.longitude, 'Longitude', -180, 180);
  if (longitudeResult.error) {
    return { error: longitudeResult.error };
  }

  const startTimeResult = parseDateTime(body.startTime, 'Start time');
  if (startTimeResult.error) {
    return { error: startTimeResult.error };
  }

  const endTimeResult = parseDateTime(body.endTime, 'End time');
  if (endTimeResult.error) {
    return { error: endTimeResult.error };
  }

  const timeError = validateActivityTimes(startTimeResult.value, endTimeResult.value);
  if (timeError) {
    return { error: timeError };
  }

  const maxParsed =
    typeof body.maxParticipants === 'number'
      ? body.maxParticipants
      : parseInt(body.maxParticipants, 10);

  return {
    data: {
      title: body.title.trim(),
      description: body.description.trim(),
      category: body.category.trim().toUpperCase(),
      locationName: body.locationName.trim(),
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      latitude: latitudeResult.value,
      longitude: longitudeResult.value,
      startTime: startTimeResult.value,
      endTime: endTimeResult.value,
      maxParticipants: maxParsed,
    },
  };
};

const validateActivityPayload = (body) => {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' };
  }

  const checks = [
    validateTitle(body.title),
    validateDescription(body.description),
    validateCategory(body.category),
    validateLocationName(body.locationName),
    validateOptionalString(body.address, 'Address', 500),
    validateOptionalString(body.city, 'City', 100),
    validateMaxParticipants(body.maxParticipants),
  ];

  const fieldError = checks.find((error) => error !== null);
  if (fieldError) {
    return { error: fieldError };
  }

  return buildActivityData(body);
};

const validateCreateActivity = (body) => validateActivityPayload(body);

const validateUpdateActivity = (body) => validateActivityPayload(body);

const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed;
};

const validateDiscoveryQuery = (query) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = Math.min(parsePositiveInt(query.limit, 20), 50);

  const filters = {};

  if (query.category) {
    const normalized = String(query.category).trim().toUpperCase();
    if (!ALLOWED_CATEGORIES.includes(normalized)) {
      return { error: `Invalid category. Allowed values: ${ALLOWED_CATEGORIES.join(', ')}` };
    }
    filters.category = normalized;
  }

  if (query.size) {
    const size = String(query.size).trim().toLowerCase();
    if (size === 'single') {
      filters.maxParticipants = 2;
    } else if (size === 'group') {
      filters.isGroup = true;
    } else {
      return { error: 'Invalid size. Allowed values: single, group' };
    }
  }

  if (query.city) {
    filters.city = String(query.city).trim();
  }

  if (query.latitude !== undefined || query.longitude !== undefined || query.radiusKm !== undefined) {
    const lat = parseFloat(query.latitude);
    const lng = parseFloat(query.longitude);
    const radiusKm = parseFloat(query.radiusKm);

    if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(radiusKm) || radiusKm <= 0) {
      return { error: 'latitude, longitude, and radiusKm are required for location filter' };
    }

    filters.latitude = lat;
    filters.longitude = lng;
    filters.radiusKm = Math.min(radiusKm, 100);
  }

  return { data: { page, limit, filters } };
};

const validateListQuery = (query) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = Math.min(parsePositiveInt(query.limit, 20), 50);
  return { data: { page, limit } };
};

const validateParticipantUserId = (userId) => {
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    return 'Participant user id is required';
  }

  return null;
};

module.exports = {
  validateCreateActivity,
  validateUpdateActivity,
  validateDiscoveryQuery,
  validateListQuery,
  validateParticipantUserId,
};
