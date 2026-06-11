const { ActivityCategory, ActivityStatus } = require('@prisma/client');

const TITLE_MIN = 5;
const TITLE_MAX = 100;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 1000;
const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 20;
const MIN_DURATION_MS = 30 * 60 * 1000;
const MAX_DURATION_MS = 8 * 60 * 60 * 1000;
const MIN_LEAD_TIME_MS = 30 * 60 * 1000;
const MAX_START_WINDOW_MS = 24 * 60 * 60 * 1000;

const ALLOWED_CATEGORIES = Object.values(ActivityCategory);

const DISCOVERY_STATUSES = ['PUBLISHED'];

const SCHEDULE_BLOCKING_STATUSES = [
  ActivityStatus.PUBLISHED,
  ActivityStatus.ACTIVE,
];

const HOST_SCHEDULE_BLOCKING_STATUSES = SCHEDULE_BLOCKING_STATUSES;
const JOINER_SCHEDULE_BLOCKING_STATUSES = SCHEDULE_BLOCKING_STATUSES;

const ACTIVITY_HOST_SELECT = {
  uid: true,
  fullName: true,
  profileImagePath: true,
  isProfileVerified: true,
};

const PARTICIPANT_USER_SELECT = {
  uid: true,
  fullName: true,
  profileImagePath: true,
  isProfileVerified: true,
};

const PARTICIPANT_SELECT = {
  id: true,
  userId: true,
  status: true,
  isHost: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: PARTICIPANT_USER_SELECT,
  },
};

const ACTIVITY_SELECT = {
  id: true,
  aid: true,
  hostId: true,
  title: true,
  description: true,
  category: true,
  locationName: true,
  address: true,
  city: true,
  latitude: true,
  longitude: true,
  startTime: true,
  endTime: true,
  maxParticipants: true,
  status: true,
  startedAt: true,
  completedAt: true,
  cancelledAt: true,
  deletedAt: true,
  expiredAt: true,
  createdAt: true,
  updatedAt: true,
  host: {
    select: ACTIVITY_HOST_SELECT,
  },
};

module.exports = {
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
  DISCOVERY_STATUSES,
  SCHEDULE_BLOCKING_STATUSES,
  HOST_SCHEDULE_BLOCKING_STATUSES,
  JOINER_SCHEDULE_BLOCKING_STATUSES,
  ACTIVITY_HOST_SELECT,
  PARTICIPANT_USER_SELECT,
  PARTICIPANT_SELECT,
  ACTIVITY_SELECT,
};
