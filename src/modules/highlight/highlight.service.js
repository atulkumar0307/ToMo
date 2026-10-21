const fs = require('fs');
const path = require('path');
const { ActivityStatus, HighlightStatus, MediaType, ParticipantStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { getVideoDurationSeconds } = require('../../utils/videoDuration');
const { formatActivityCode } = require('../../utils/activityAid');
const {
  PAST_ACTIVITY_STATUSES,
  HIGHLIGHT_SELECT,
  HIGHLIGHT_FEED_SELECT,
  LIST_HIGHLIGHT_STATUSES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  highlightLimits,
} = require('./highlight.constants');

const removeUploadedFiles = (files = []) => {
  files.forEach((file) => {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  });
};

const formatMediaItem = (item) => ({
  id: item.id,
  type: item.type,
  url: item.filePath,
  thumbnailUrl: item.thumbnailPath,
  order: item.sortOrder,
  durationSeconds: item.durationSeconds,
});

const formatHighlight = (highlight) => ({
  id: highlight.id,
  activityId: highlight.activityId,
  userId: highlight.userId,
  title: highlight.title,
  caption: highlight.caption,
  description: highlight.description,
  tags: highlight.tags,
  status: highlight.status,
  likeCount: highlight.likeCount ?? 0,
  commentCount: highlight.commentCount ?? 0,
  likedByMe: false,
  createdAt: highlight.createdAt,
  updatedAt: highlight.updatedAt,
  mediaItems: highlight.mediaItems.map(formatMediaItem),
  author: {
    uid: highlight.user.uid,
    fullName: highlight.user.fullName,
    profileImagePath: highlight.user.profileImagePath,
    isProfileVerified: highlight.user.isProfileVerified,
  },
  ...(highlight.activity
    ? { activity: { ...highlight.activity, activityCode: formatActivityCode(highlight.activity.aid) } }
    : {}),
});

/** Sets `likedByMe` for the viewer on already formatted highlights (one query per page). */
const withViewerLikes = async (highlights, viewerId) => {
  if (!viewerId || !highlights.length) return highlights;
  const liked = await prisma.highlightLike.findMany({
    where: { userId: viewerId, highlightId: { in: highlights.map((h) => h.id) } },
    select: { highlightId: true },
  });
  const set = new Set(liked.map((l) => l.highlightId));
  return highlights.map((h) => ({ ...h, likedByMe: set.has(h.id) }));
};

const fetchActivityOrThrow = async (activityId) => {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      hostId: true,
      status: true,
    },
  });

  if (!activity) {
    throw new AppError('Activity not found', 404);
  }

  return activity;
};

const assertPastActivity = (activity) => {
  if (!PAST_ACTIVITY_STATUSES.includes(activity.status)) {
    throw new AppError('Highlights can only be posted for past activities', 403);
  }
};

const assertCanPostHighlight = async (activity, userId) => {
  assertPastActivity(activity);

  if (activity.hostId === userId) {
    return;
  }

  const participant = await prisma.activityParticipant.findUnique({
    where: {
      activityId_userId: {
        activityId: activity.id,
        userId,
      },
    },
    select: {
      status: true,
      isHost: true,
    },
  });

  if (!participant || participant.isHost || participant.status !== ParticipantStatus.APPROVED) {
    throw new AppError('Only the host or approved participants can post highlights', 403);
  }
};

const assertCanViewActivityHighlights = async (activityId, userId) => {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      hostId: true,
      status: true,
    },
  });

  if (!activity) {
    throw new AppError('Activity not found', 404);
  }

  if (activity.hostId === userId) {
    return;
  }

  if (activity.status === ActivityStatus.PUBLISHED) {
    return;
  }

  if (activity.status === ActivityStatus.DELETED) {
    throw new AppError('Activity not found', 404);
  }

  const membership = await prisma.activityParticipant.findUnique({
    where: {
      activityId_userId: {
        activityId,
        userId,
      },
    },
    select: {
      status: true,
      isHost: true,
    },
  });

  if (
    membership &&
    !membership.isHost &&
    [ParticipantStatus.PENDING, ParticipantStatus.APPROVED].includes(membership.status)
  ) {
    return;
  }

  if (
    membership &&
    !membership.isHost &&
    [ActivityStatus.CANCELLED, ActivityStatus.EXPIRED].includes(activity.status) &&
    [
      ParticipantStatus.PENDING,
      ParticipantStatus.APPROVED,
      ParticipantStatus.REJECTED,
      ParticipantStatus.WITHDRAWN,
      ParticipantStatus.EXPIRED,
    ].includes(membership.status)
  ) {
    return;
  }

  if (
    membership &&
    !membership.isHost &&
    [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED].includes(activity.status) &&
    membership.status === ParticipantStatus.APPROVED
  ) {
    return;
  }

  throw new AppError('Activity not found', 404);
};

const validateMediaFileSizes = (files) => {
  for (const file of files) {
    const isImage = ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype);
    const limits = highlightLimits();
    const maxSize = isImage ? limits.maxImageBytes : limits.maxVideoBytes;

    if (file.size > maxSize) {
      const limitMb = maxSize / (1024 * 1024);
      throw new AppError(
        `${isImage ? 'Image' : 'Video'} must be at most ${limitMb} MB`,
        400
      );
    }
  }
};

const buildMediaRecords = async (files, mediaOrder) => {
  const records = [];

  for (let position = 0; position < mediaOrder.length; position += 1) {
    const fileIndex = mediaOrder[position];
    const file = files[fileIndex];
    const isImage = ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype);
    const isVideo = ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype);

    if (!isImage && !isVideo) {
      throw new AppError('Media must be JPEG, PNG, WebP, MP4, MOV, or WEBM', 400);
    }

    let durationSeconds = null;

    if (isVideo) {
      durationSeconds = await getVideoDurationSeconds(file.path, file.mimetype);

      if (durationSeconds === null) {
        throw new AppError('Could not read video duration', 400);
      }

      const { maxVideoSeconds } = highlightLimits();
      if (durationSeconds > maxVideoSeconds) {
        throw new AppError(
          `Video must be at most ${maxVideoSeconds} seconds`,
          400
        );
      }
    }

    records.push({
      type: isImage ? MediaType.IMAGE : MediaType.VIDEO,
      filePath: `/uploads/highlights/${path.basename(file.path)}`,
      thumbnailPath: null,
      sortOrder: position + 1,
      durationSeconds,
      fileSizeBytes: file.size,
      mimeType: file.mimetype,
    });
  }

  return records;
};

const fetchPublishedHighlightOrThrow = async (highlightId) => {
  const highlight = await prisma.highlight.findUnique({
    where: { id: highlightId },
    select: {
      id: true,
      activityId: true,
      userId: true,
      status: true,
      activity: {
        select: { hostId: true },
      },
    },
  });

  if (!highlight || highlight.status === HighlightStatus.DELETED) {
    throw new AppError('Highlight not found', 404);
  }

  return highlight;
};

const createHighlight = async (userId, activityId, data, files) => {
  let mediaRecords;

  // A retried upload (timeout, lost connection) returns the highlight the first attempt created.
  if (data.clientRequestId) {
    const existing = await prisma.highlight.findUnique({
      where: { userId_clientRequestId: { userId, clientRequestId: data.clientRequestId } },
      select: HIGHLIGHT_SELECT,
    });
    if (existing) {
      removeUploadedFiles(files);
      return { ...formatHighlight(existing), duplicate: true };
    }
  }

  try {
    const activity = await fetchActivityOrThrow(activityId);
    await assertCanPostHighlight(activity, userId);
    validateMediaFileSizes(files);
    mediaRecords = await buildMediaRecords(files, data.mediaOrder);
  } catch (err) {
    removeUploadedFiles(files);
    throw err;
  }

  try {
    const highlight = await prisma.highlight.create({
      data: {
        activityId,
        userId,
        title: data.title,
        caption: data.caption,
        description: data.description,
        tags: data.tags,
        clientRequestId: data.clientRequestId || null,
        status: HighlightStatus.PUBLISHED,
        mediaItems: {
          create: mediaRecords,
        },
      },
      select: HIGHLIGHT_SELECT,
    });

    return formatHighlight(highlight);
  } catch (err) {
    removeUploadedFiles(files);
    throw err;
  }
};

const listActivityHighlights = async (userId, activityId, { page, limit }) => {
  await assertCanViewActivityHighlights(activityId, userId);

  const where = {
    activityId,
    status: { in: LIST_HIGHLIGHT_STATUSES },
  };

  const skip = (page - 1) * limit;

  const [highlights, total] = await Promise.all([
    prisma.highlight.findMany({
      where,
      select: HIGHLIGHT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.highlight.count({ where }),
  ]);

  return {
    highlights: await withViewerLikes(highlights.map(formatHighlight), userId),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getHighlightById = async (userId, highlightId) => {
  const highlight = await prisma.highlight.findUnique({
    where: { id: highlightId },
    select: HIGHLIGHT_SELECT,
  });

  if (!highlight || highlight.status === HighlightStatus.DELETED) {
    throw new AppError('Highlight not found', 404);
  }

  await assertCanViewActivityHighlights(highlight.activityId, userId);

  return (await withViewerLikes([formatHighlight(highlight)], userId))[0];
};

const updateHighlight = async (userId, highlightId, data) => {
  const highlight = await fetchPublishedHighlightOrThrow(highlightId);

  if (highlight.userId !== userId) {
    throw new AppError('Only the author can update this highlight', 403);
  }

  const updated = await prisma.highlight.update({
    where: { id: highlightId },
    data,
    select: HIGHLIGHT_SELECT,
  });

  return formatHighlight(updated);
};

const deleteHighlight = async (userId, highlightId) => {
  const highlight = await fetchPublishedHighlightOrThrow(highlightId);

  const isAuthor = highlight.userId === userId;
  const isHost = highlight.activity.hostId === userId;

  if (!isAuthor && !isHost) {
    throw new AppError('Only the author or activity host can delete this highlight', 403);
  }

  const deleted = await prisma.highlight.update({
    where: { id: highlightId },
    data: { status: HighlightStatus.DELETED },
    select: HIGHLIGHT_SELECT,
  });

  return formatHighlight(deleted);
};

const listMyHighlights = async (userId, { page, limit }) => {
  const where = {
    userId,
    status: { in: LIST_HIGHLIGHT_STATUSES },
  };

  const skip = (page - 1) * limit;

  const [highlights, total] = await Promise.all([
    prisma.highlight.findMany({
      where,
      select: HIGHLIGHT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.highlight.count({ where }),
  ]);

  return {
    highlights: await withViewerLikes(highlights.map(formatHighlight), userId),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * One request for the app's highlights feed: published highlights from every
 * activity the user hosted or was approved for, newest first.
 */
const listFeedHighlights = async (userId, { page, limit }) => {
  const where = {
    status: HighlightStatus.PUBLISHED,
    activity: {
      status: { not: ActivityStatus.DELETED },
      OR: [{ hostId: userId }, { participants: { some: { userId, status: ParticipantStatus.APPROVED } } }],
    },
  };

  const skip = (page - 1) * limit;
  const [highlights, total] = await Promise.all([
    prisma.highlight.findMany({ where, select: HIGHLIGHT_FEED_SELECT, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.highlight.count({ where }),
  ]);

  return {
    highlights: await withViewerLikes(highlights.map(formatHighlight), userId),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
};

const countPublishedHighlights = async (activityId) => {
  return prisma.highlight.count({
    where: {
      activityId,
      status: HighlightStatus.PUBLISHED,
    },
  });
};

module.exports = {
  assertCanViewActivityHighlights,
  fetchPublishedHighlightOrThrow,
  withViewerLikes,
  formatHighlight,
  createHighlight,
  listActivityHighlights,
  getHighlightById,
  updateHighlight,
  deleteHighlight,
  listMyHighlights,
  listFeedHighlights,
  countPublishedHighlights,
  removeUploadedFiles,
};
