const { HighlightStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { formatActivityCode } = require('../../utils/activityAid');
const { removeUploadPaths } = require('../../utils/uploads');
const { ADMIN_HIGHLIGHT_SELECT } = require('./admin.constants');
const {
  parsePagination,
  buildPagination,
  parseEnumList,
  parseDateQuery,
  trimmedQuery,
  ALLOWED_HIGHLIGHT_STATUSES,
  ALLOWED_CATEGORIES,
} = require('./admin.validation');

const formatHighlight = (highlight) => ({
  ...highlight,
  activity: highlight.activity
    ? { ...highlight.activity, activityCode: formatActivityCode(highlight.activity.aid) }
    : null,
});

const fetchHighlightOrThrow = async (highlightId) => {
  const highlight = await prisma.highlight.findUnique({
    where: { id: highlightId },
    select: ADMIN_HIGHLIGHT_SELECT,
  });

  if (!highlight) {
    throw new AppError('Highlight not found', 404);
  }

  return highlight;
};

const HIGHLIGHT_SORTS = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  updated: { updatedAt: 'desc' },
  mostLiked: [{ likeCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  mostCommented: [{ commentCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
};

const listHighlights = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query, 24);
  const statuses = parseEnumList(query.status, ALLOWED_HIGHLIGHT_STATUSES);
  const categories = parseEnumList(query.category, ALLOWED_CATEGORIES);
  const q = trimmedQuery(query.q);
  const tag = trimmedQuery(query.tag).toLowerCase();
  const mediaType = trimmedQuery(query.mediaType).toUpperCase();
  const and = [];

  if (statuses.length) and.push({ status: { in: statuses } });
  if (query.activityId) and.push({ activityId: String(query.activityId) });
  if (query.userId) and.push({ userId: String(query.userId) });
  if (categories.length) and.push({ activity: { category: { in: categories } } });
  if (tag) and.push({ tags: { has: tag.replace(/^#/, '') } });
  if (mediaType === 'IMAGE' || mediaType === 'VIDEO') {
    and.push({ mediaItems: { some: { type: mediaType } } });
  }

  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { caption: { contains: q, mode: 'insensitive' } },
        { user: { fullName: { contains: q, mode: 'insensitive' } } },
        { activity: { title: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }

  const from = parseDateQuery(query.from);
  const to = parseDateQuery(query.to);
  if (from || to) {
    and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  }

  const where = and.length ? { AND: and } : {};

  const [highlights, total, statusCounts] = await Promise.all([
    prisma.highlight.findMany({
      where,
      skip,
      take: limit,
      orderBy: HIGHLIGHT_SORTS[trimmedQuery(query.sort)] || HIGHLIGHT_SORTS.newest,
      select: ADMIN_HIGHLIGHT_SELECT,
    }),
    prisma.highlight.count({ where }),
    prisma.highlight.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  return {
    highlights: highlights.map(formatHighlight),
    statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])),
    pagination: buildPagination(page, limit, total),
  };
};

const getHighlight = async (highlightId) => formatHighlight(await fetchHighlightOrThrow(highlightId));

const updateHighlight = async (highlightId, data) => {
  const before = await fetchHighlightOrThrow(highlightId);

  const highlight = await prisma.highlight.update({
    where: { id: highlightId },
    data,
    select: ADMIN_HIGHLIGHT_SELECT,
  });

  return { before, highlight: formatHighlight(highlight) };
};

const deleteHighlight = async (highlightId, { hard }) => {
  const highlight = await fetchHighlightOrThrow(highlightId);

  if (!hard) {
    if (highlight.status === HighlightStatus.DELETED) {
      throw new AppError('Highlight is already deleted. Use hard delete to remove it permanently.', 400);
    }

    const updated = await prisma.highlight.update({
      where: { id: highlightId },
      data: { status: HighlightStatus.DELETED },
      select: ADMIN_HIGHLIGHT_SELECT,
    });

    return { hard: false, highlight: formatHighlight(updated) };
  }

  await prisma.highlight.delete({ where: { id: highlightId } });
  removeUploadPaths(highlight.mediaItems.flatMap((item) => [item.filePath, item.thumbnailPath]));

  return { hard: true, highlight: formatHighlight(highlight) };
};

const removeHighlightMedia = async (highlightId, mediaId) => {
  const highlight = await fetchHighlightOrThrow(highlightId);
  const item = highlight.mediaItems.find((media) => media.id === mediaId);

  if (!item) {
    throw new AppError('Media item not found on this highlight', 404);
  }

  if (highlight.mediaItems.length <= 1) {
    throw new AppError('A highlight needs at least one media item. Delete the highlight instead.', 400);
  }

  await prisma.highlightMediaItem.delete({ where: { id: mediaId } });
  removeUploadPaths([item.filePath, item.thumbnailPath]);

  return { highlight: formatHighlight(await fetchHighlightOrThrow(highlightId)), media: item };
};

module.exports = {
  listHighlights,
  getHighlight,
  updateHighlight,
  deleteHighlight,
  removeHighlightMedia,
};
