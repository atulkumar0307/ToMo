const { ActivityCategory } = require('@prisma/client');

const TITLE_MIN = 5;
const TITLE_MAX = 100;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 1000;
const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 20;
const MIN_DURATION_MS = 30 * 60 * 1000;
const MAX_DURATION_MS = 8 * 60 * 60 * 1000;

const ALLOWED_CATEGORIES = Object.values(ActivityCategory);

const ACTIVITY_HOST_SELECT = {
  uid: true,
  fullName: true,
  profileImagePath: true,
  isProfileVerified: true,
};

const ACTIVITY_SELECT = {
  id: true,
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
  ALLOWED_CATEGORIES,
  ACTIVITY_HOST_SELECT,
  ACTIVITY_SELECT,
};
