const {
  TITLE_MAX,
  CAPTION_MAX,
  DESCRIPTION_MAX,
  MIN_MEDIA,
  MAX_MEDIA,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
} = require('./highlight.constants');

const normalizeTag = (tag) => {
  return String(tag)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
};

const parseTags = (value) => {
  if (value === undefined || value === null || value === '') {
    return { tags: [] };
  }

  let parsed = value;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return { error: 'tags must be a valid JSON array of strings' };
    }
  }

  if (!Array.isArray(parsed)) {
    return { error: 'tags must be an array of strings' };
  }

  if (parsed.length > MAX_TAGS) {
    return { error: `At most ${MAX_TAGS} tags are allowed` };
  }

  const tags = [];

  for (const tag of parsed) {
    if (typeof tag !== 'string' || tag.trim().length === 0) {
      return { error: 'Each tag must be a non-empty string' };
    }

    const normalized = normalizeTag(tag);

    if (normalized.length > MAX_TAG_LENGTH) {
      return { error: `Each tag must be at most ${MAX_TAG_LENGTH} characters` };
    }

    tags.push(normalized);
  }

  return { tags };
};

const parseMediaOrder = (value, fileCount) => {
  if (value === undefined || value === null || value === '') {
    return { order: Array.from({ length: fileCount }, (_, index) => index) };
  }

  let parsed = value;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return { error: 'mediaOrder must be a valid JSON array of integers' };
    }
  }

  if (!Array.isArray(parsed)) {
    return { error: 'mediaOrder must be an array of integers' };
  }

  if (parsed.length !== fileCount) {
    return { error: 'mediaOrder length must match the number of media files' };
  }

  const seen = new Set();

  for (const item of parsed) {
    const index = typeof item === 'number' ? item : parseInt(item, 10);

    if (Number.isNaN(index) || index < 0 || index >= fileCount) {
      return { error: 'mediaOrder contains invalid file indices' };
    }

    if (seen.has(index)) {
      return { error: 'mediaOrder must not contain duplicate indices' };
    }

    seen.add(index);
  }

  return { order: parsed.map((item) => (typeof item === 'number' ? item : parseInt(item, 10))) };
};

const validateTitle = (value) => {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return 'Title is required';
  }

  if (value.trim().length > TITLE_MAX) {
    return `Title must be at most ${TITLE_MAX} characters`;
  }

  return null;
};

const validateOptionalText = (value, fieldLabel, maxLength) => {
  if (value === undefined || value === null || value === '') {
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

const validateMediaUpload = (files) => {
  if (!files || files.length === 0) {
    return 'At least one media file is required';
  }

  if (files.length < MIN_MEDIA) {
    return `Upload at least ${MIN_MEDIA} media file`;
  }

  if (files.length > MAX_MEDIA) {
    return `Upload at most ${MAX_MEDIA} media files`;
  }

  for (const file of files) {
    const isImage = ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype);
    const isVideo = ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype);

    if (!isImage && !isVideo) {
      return 'Media must be JPEG, PNG, WebP, MP4, MOV, or WEBM';
    }
  }

  return null;
};

const validateCreateHighlight = (body, files) => {
  const mediaError = validateMediaUpload(files);
  if (mediaError) {
    return { error: mediaError };
  }

  const checks = [
    validateTitle(body.title),
    validateOptionalText(body.caption, 'Caption', CAPTION_MAX),
    validateOptionalText(body.description, 'Description', DESCRIPTION_MAX),
  ];

  const fieldError = checks.find((error) => error !== null);
  if (fieldError) {
    return { error: fieldError };
  }

  const tagsResult = parseTags(body.tags);
  if (tagsResult.error) {
    return { error: tagsResult.error };
  }

  const mediaOrderResult = parseMediaOrder(body.mediaOrder, files.length);
  if (mediaOrderResult.error) {
    return { error: mediaOrderResult.error };
  }

  return {
    data: {
      title: body.title.trim(),
      caption: body.caption?.trim() || null,
      description: body.description?.trim() || null,
      tags: tagsResult.tags,
      mediaOrder: mediaOrderResult.order,
    },
  };
};

const validateUpdateHighlight = (body) => {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' };
  }

  const hasField =
    body.title !== undefined ||
    body.caption !== undefined ||
    body.description !== undefined ||
    body.tags !== undefined;

  if (!hasField) {
    return { error: 'At least one field is required to update' };
  }

  if (body.title !== undefined) {
    const titleError = validateTitle(body.title);
    if (titleError) {
      return { error: titleError };
    }
  }

  const checks = [
    body.caption !== undefined
      ? validateOptionalText(body.caption, 'Caption', CAPTION_MAX)
      : null,
    body.description !== undefined
      ? validateOptionalText(body.description, 'Description', DESCRIPTION_MAX)
      : null,
  ];

  const fieldError = checks.find((error) => error !== null);
  if (fieldError) {
    return { error: fieldError };
  }

  let tags;

  if (body.tags !== undefined) {
    const tagsResult = parseTags(body.tags);
    if (tagsResult.error) {
      return { error: tagsResult.error };
    }
    tags = tagsResult.tags;
  }

  const data = {};

  if (body.title !== undefined) {
    data.title = body.title.trim();
  }

  if (body.caption !== undefined) {
    data.caption = body.caption.trim() || null;
  }

  if (body.description !== undefined) {
    data.description = body.description.trim() || null;
  }

  if (tags !== undefined) {
    data.tags = tags;
  }

  return { data };
};

const validateListQuery = (query) => {
  const page = parseInt(query.page, 10);
  const limit = parseInt(query.limit, 10);

  return {
    data: {
      page: Number.isNaN(page) || page < 1 ? 1 : page,
      limit: Number.isNaN(limit) || limit < 1 ? 20 : Math.min(limit, 50),
    },
  };
};

module.exports = {
  validateCreateHighlight,
  validateUpdateHighlight,
  validateMediaUpload,
  validateListQuery,
};
