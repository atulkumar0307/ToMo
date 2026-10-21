const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const { VERIFICATION_SUBMISSION_SELECT } = require('../verification/verification.constants');
const { ACTIVITY_SELECT } = require('../activity/activity.constants');

/** Compact user shape used wherever a user is referenced (hosts, members, authors, log actors). */
const USER_BRIEF_SELECT = {
  id: true,
  uid: true,
  mobile: true,
  fullName: true,
  profileImagePath: true,
  gender: true,
  isBlocked: true,
  isProfileVerified: true,
};

const ADMIN_USER_SELECT = {
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
  verificationSubmissions: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: VERIFICATION_SUBMISSION_SELECT,
  },
  _count: {
    select: {
      hostedActivities: true,
      highlights: true,
      refreshTokens: true,
    },
  },
};

const ADMIN_ACTIVITY_SELECT = {
  ...ACTIVITY_SELECT,
  host: {
    select: USER_BRIEF_SELECT,
  },
  _count: {
    select: {
      highlights: true,
    },
  },
};

const ADMIN_PARTICIPANT_SELECT = {
  id: true,
  activityId: true,
  userId: true,
  status: true,
  isHost: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: USER_BRIEF_SELECT,
  },
};

const ACTIVITY_BRIEF_SELECT = {
  id: true,
  aid: true,
  title: true,
  category: true,
  status: true,
  locationName: true,
  city: true,
  startTime: true,
  endTime: true,
  maxParticipants: true,
  hostId: true,
};

const ADMIN_HIGHLIGHT_SELECT = {
  id: true,
  activityId: true,
  userId: true,
  title: true,
  caption: true,
  description: true,
  tags: true,
  status: true,
  likeCount: true,
  commentCount: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: USER_BRIEF_SELECT,
  },
  activity: {
    select: ACTIVITY_BRIEF_SELECT,
  },
  mediaItems: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      type: true,
      filePath: true,
      thumbnailPath: true,
      sortOrder: true,
      durationSeconds: true,
      fileSizeBytes: true,
      mimeType: true,
      createdAt: true,
    },
  },
};

const ADMIN_VERIFICATION_SELECT = {
  ...VERIFICATION_SUBMISSION_SELECT,
  userId: true,
  user: {
    select: {
      ...USER_BRIEF_SELECT,
      dateOfBirth: true,
      bio: true,
      createdAt: true,
    },
  },
};

const AUDIT_LOG_SELECT = {
  id: true,
  actorType: true,
  actorLabel: true,
  action: true,
  entityType: true,
  entityId: true,
  message: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  userId: true,
  adminId: true,
  targetUserId: true,
  user: { select: USER_BRIEF_SELECT },
  targetUser: { select: USER_BRIEF_SELECT },
  admin: { select: { id: true, fullName: true, email: true } },
};

/** Status changes an admin may force. Keys are the current status. */
const ADMIN_ACTIVITY_TRANSITIONS = {
  PUBLISHED: ['ACTIVE', 'CANCELLED', 'EXPIRED', 'DELETED'],
  ACTIVE: ['COMPLETED', 'CANCELLED', 'DELETED'],
  COMPLETED: ['ACTIVE', 'DELETED'],
  CANCELLED: ['PUBLISHED', 'DELETED'],
  EXPIRED: ['PUBLISHED', 'DELETED'],
  DELETED: ['PUBLISHED'],
};

const ADMIN_PARTICIPANT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'];

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  USER_BRIEF_SELECT,
  ADMIN_USER_SELECT,
  ADMIN_ACTIVITY_SELECT,
  ADMIN_PARTICIPANT_SELECT,
  ACTIVITY_BRIEF_SELECT,
  ADMIN_HIGHLIGHT_SELECT,
  ADMIN_VERIFICATION_SELECT,
  AUDIT_LOG_SELECT,
  ADMIN_ACTIVITY_TRANSITIONS,
  ADMIN_PARTICIPANT_STATUSES,
};
