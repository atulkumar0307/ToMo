const {
  TITLE_MIN,
  TITLE_MAX,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  MIN_PARTICIPANTS,
  MAX_PARTICIPANTS,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
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

const validateCreateActivity = (body) => {
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

  const startTime = startTimeResult.value;
  const endTime = endTimeResult.value;
  const now = new Date();

  if (startTime <= now) {
    return { error: 'Start time must be in the future' };
  }

  if (endTime <= startTime) {
    return { error: 'End time must be after start time' };
  }

  const durationMs = endTime.getTime() - startTime.getTime();

  if (durationMs < MIN_DURATION_MS) {
    return { error: 'Activity duration must be at least 30 minutes' };
  }

  if (durationMs > MAX_DURATION_MS) {
    return { error: 'Activity duration must be at most 8 hours' };
  }

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
      startTime,
      endTime,
      maxParticipants: parseInt(body.maxParticipants, 10),
    },
  };
};

module.exports = {
  validateCreateActivity,
};
