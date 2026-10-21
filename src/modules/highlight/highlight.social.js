const { HighlightStatus } = require('@prisma/client');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { setting } = require('../../services/settings');
const realtime = require('../../services/realtime');
const { assertCanViewActivityHighlights } = require('./highlight.service');

const COMMENT_PAGE = 30;
const CLIENT_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

const COMMENT_SELECT = {
  id: true,
  highlightId: true,
  userId: true,
  text: true,
  clientId: true,
  createdAt: true,
  user: { select: { id: true, uid: true, fullName: true, profileImagePath: true, isProfileVerified: true } },
};

const formatComment = (comment, viewerId, canModerate = false) => ({
  id: comment.id,
  highlightId: comment.highlightId,
  text: comment.text,
  clientId: comment.clientId,
  createdAt: comment.createdAt,
  author: comment.user,
  isMine: Boolean(viewerId) && comment.userId === viewerId,
  canDelete: (Boolean(viewerId) && comment.userId === viewerId) || canModerate,
});

/** The highlight (published) plus who may moderate it. Viewers must be allowed to see its activity. */
const loadViewable = async (highlightId, viewerId, { anyStatus = false } = {}) => {
  const highlight = await prisma.highlight.findUnique({
    where: { id: highlightId },
    select: { id: true, title: true, userId: true, activityId: true, status: true, likeCount: true, commentCount: true, activity: { select: { hostId: true } } },
  });
  if (!highlight || (!anyStatus && highlight.status !== HighlightStatus.PUBLISHED)) throw new AppError('Highlight not found', 404);
  if (viewerId) await assertCanViewActivityHighlights(highlight.activityId, viewerId);
  return highlight;
};

const canModerate = (highlight, userId) => highlight.userId === userId || highlight.activity.hostId === userId;

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

/** Idempotent: liking twice keeps one like. */
const like = async (user, highlightId) => {
  const highlight = await loadViewable(highlightId, user.id);
  let created = false;

  try {
    await prisma.$transaction([
      prisma.highlightLike.create({ data: { highlightId, userId: user.id } }),
      prisma.highlight.update({ where: { id: highlightId }, data: { likeCount: { increment: 1 } } }),
    ]);
    created = true;
  } catch (err) {
    if (err.code !== 'P2002') throw err; // already liked
  }

  if (created && highlight.userId !== user.id) realtime.highlightLiked(highlight, user);
  const fresh = await prisma.highlight.findUnique({ where: { id: highlightId }, select: { likeCount: true } });
  return { liked: true, likeCount: fresh.likeCount, created, highlight };
};

const unlike = async (user, highlightId) => {
  const highlight = await loadViewable(highlightId, user.id);
  const removed = await prisma.$transaction(async (tx) => {
    const result = await tx.highlightLike.deleteMany({ where: { highlightId, userId: user.id } });
    if (result.count) {
      await tx.highlight.update({ where: { id: highlightId }, data: { likeCount: { decrement: result.count } } });
    }
    return result.count > 0;
  });
  const fresh = await prisma.highlight.findUnique({ where: { id: highlightId }, select: { likeCount: true } });
  return { liked: false, likeCount: Math.max(fresh.likeCount, 0), removed, highlight };
};

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** Pages oldest-first; `before=<commentId>` loads older ones. */
const listComments = async (viewerId, highlightId, query = {}, { admin = false } = {}) => {
  const highlight = await loadViewable(highlightId, admin ? null : viewerId, { anyStatus: admin });
  const take = Math.min(Math.max(parseInt(query.limit, 10) || COMMENT_PAGE, 1), 100);
  let cursor = {};

  if (query.before) {
    const ref = await prisma.highlightComment.findFirst({ where: { id: String(query.before), highlightId }, select: { id: true, createdAt: true } });
    if (!ref) throw new AppError('Unknown comment cursor', 400);
    cursor = { OR: [{ createdAt: { lt: ref.createdAt } }, { createdAt: ref.createdAt, id: { lt: ref.id } }] };
  }

  const rows = await prisma.highlightComment.findMany({
    where: { highlightId, deletedAt: null, ...cursor },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    select: COMMENT_SELECT,
  });

  const hasMore = rows.length > take;
  const page = rows.slice(0, take).reverse();
  const moderator = admin || canModerate(highlight, viewerId);

  return {
    comments: page.map((c) => formatComment(c, viewerId, moderator)),
    hasMore,
    nextBefore: hasMore ? page[0].id : null,
    commentCount: highlight.commentCount,
  };
};

const addComment = async (user, highlightId, body = {}) => {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const maxLength = setting('highlight.commentMaxLength');
  if (!text) throw new AppError('Write a comment first', 400);
  if (text.length > maxLength) throw new AppError(`Comments can be at most ${maxLength} characters`, 400);

  const clientId = body.clientId ? String(body.clientId) : null;
  if (clientId && !CLIENT_ID_REGEX.test(clientId)) throw new AppError('clientId must be 1–64 letters, digits, - or _', 400);

  const highlight = await loadViewable(highlightId, user.id);

  if (clientId) {
    const existing = await prisma.highlightComment.findUnique({
      where: { userId_clientId: { userId: user.id, clientId } },
      select: COMMENT_SELECT,
    });
    if (existing) return { comment: formatComment(existing, user.id, canModerate(highlight, user.id)), duplicate: true, highlight };
  }

  const [comment] = await prisma.$transaction([
    prisma.highlightComment.create({ data: { highlightId, userId: user.id, text, clientId }, select: COMMENT_SELECT }),
    prisma.highlight.update({ where: { id: highlightId }, data: { commentCount: { increment: 1 } } }),
  ]);

  if (highlight.userId !== user.id) realtime.highlightCommented(highlight, user, text);
  return { comment: formatComment(comment, user.id, canModerate(highlight, user.id)), duplicate: false, highlight };
};

const softDeleteComment = async (comment) => {
  await prisma.$transaction([
    prisma.highlightComment.update({ where: { id: comment.id }, data: { deletedAt: new Date() } }),
    prisma.highlight.update({ where: { id: comment.highlightId }, data: { commentCount: { decrement: 1 } } }),
  ]);
};

/** The comment's author, the highlight's author, or the activity host may delete. */
const deleteComment = async (user, highlightId, commentId) => {
  const highlight = await loadViewable(highlightId, user.id);
  const comment = await prisma.highlightComment.findFirst({
    where: { id: commentId, highlightId, deletedAt: null },
    select: { id: true, highlightId: true, userId: true, text: true },
  });
  if (!comment) throw new AppError('Comment not found', 404);
  if (comment.userId !== user.id && !canModerate(highlight, user.id)) {
    throw new AppError('You can only delete your own comments', 403);
  }
  await softDeleteComment(comment);
  return { comment, highlight };
};

/** Admin moderation: delete any comment. */
const adminDeleteComment = async (highlightId, commentId) => {
  const comment = await prisma.highlightComment.findFirst({
    where: { id: commentId, highlightId, deletedAt: null },
    select: { id: true, highlightId: true, userId: true, text: true },
  });
  if (!comment) throw new AppError('Comment not found', 404);
  await softDeleteComment(comment);
  return comment;
};

module.exports = { like, unlike, listComments, addComment, deleteComment, adminDeleteComment };
