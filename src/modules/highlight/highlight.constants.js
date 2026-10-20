const { HighlightStatus } = require('@prisma/client');

const TITLE_MAX = 150;
const CAPTION_MAX = 300;
const DESCRIPTION_MAX = 1000;
const MIN_MEDIA = 1;
const MAX_MEDIA = 7;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 40;

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const PAST_ACTIVITY_STATUSES = ['COMPLETED', 'CANCELLED', 'EXPIRED'];

const HIGHLIGHT_AUTHOR_SELECT = {
  id: true,
  uid: true,
  fullName: true,
  profileImagePath: true,
  isProfileVerified: true,
};

const HIGHLIGHT_MEDIA_SELECT = {
  id: true,
  type: true,
  filePath: true,
  thumbnailPath: true,
  sortOrder: true,
  durationSeconds: true,
  mimeType: true,
  createdAt: true,
};

const HIGHLIGHT_SELECT = {
  id: true,
  activityId: true,
  userId: true,
  title: true,
  caption: true,
  description: true,
  tags: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: HIGHLIGHT_AUTHOR_SELECT,
  },
  mediaItems: {
    orderBy: { sortOrder: 'asc' },
    select: HIGHLIGHT_MEDIA_SELECT,
  },
};

/** Highlight + the activity it belongs to (for feeds that mix activities). */
const HIGHLIGHT_FEED_SELECT = {
  ...HIGHLIGHT_SELECT,
  activity: {
    select: {
      id: true,
      aid: true,
      title: true,
      category: true,
      status: true,
      locationName: true,
      city: true,
      startTime: true,
      endTime: true,
      hostId: true,
    },
  },
};

const LIST_HIGHLIGHT_STATUSES = [HighlightStatus.PUBLISHED];

module.exports = {
  TITLE_MAX,
  CAPTION_MAX,
  DESCRIPTION_MAX,
  MIN_MEDIA,
  MAX_MEDIA,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_VIDEO_DURATION_SECONDS,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  PAST_ACTIVITY_STATUSES,
  HIGHLIGHT_AUTHOR_SELECT,
  HIGHLIGHT_MEDIA_SELECT,
  HIGHLIGHT_SELECT,
  HIGHLIGHT_FEED_SELECT,
  LIST_HIGHLIGHT_STATUSES,
};
