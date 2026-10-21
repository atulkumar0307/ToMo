const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { logUserAction, quote } = require('../../utils/audit');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../../constants/auditActions');
const highlightService = require('./highlight.service');
const realtime = require('../../services/realtime');
const social = require('./highlight.social');
const {
  validateCreateHighlight,
  validateUpdateHighlight,
  validateListQuery,
} = require('./highlight.validation');

const logHighlightAction = (req, action, highlight, message, metadata = {}) => {
  logUserAction(req, action, {
    entityType: ENTITY_TYPES.HIGHLIGHT,
    entityId: highlight.id,
    targetUserId: highlight.userId,
    message,
    metadata: {
      highlightId: highlight.id,
      activityId: highlight.activityId,
      title: highlight.title,
      ...metadata,
    },
  });
};

const createHighlight = async (req, res, next) => {
  try {
    const validation = validateCreateHighlight(req.body, req.files);

    if (validation.error) {
      highlightService.removeUploadedFiles(req.files);
      throw new AppError(validation.error, 400);
    }

    const { duplicate, ...highlight } = await highlightService.createHighlight(
      req.userId,
      req.params.activityId,
      validation.data,
      req.files
    );

    if (duplicate) {
      return sendSuccess(res, { highlight, duplicate: true, message: 'Highlight already posted' });
    }

    realtime.highlightCreated(highlight);
    logHighlightAction(
      req,
      AUDIT_ACTIONS.HIGHLIGHT_CREATED,
      highlight,
      `Posted highlight ${quote(highlight.title)} with ${highlight.mediaItems.length} media`,
      { mediaCount: highlight.mediaItems.length }
    );

    return sendSuccess(
      res,
      {
        highlight,
        message: 'Highlight created successfully',
      },
      201
    );
  } catch (err) {
    next(err);
  }
};

const listActivityHighlights = async (req, res, next) => {
  try {
    const { data } = validateListQuery(req.query);
    const result = await highlightService.listActivityHighlights(
      req.userId,
      req.params.activityId,
      data
    );

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getHighlight = async (req, res, next) => {
  try {
    const highlight = await highlightService.getHighlightById(
      req.userId,
      req.params.highlightId
    );

    return sendSuccess(res, { highlight });
  } catch (err) {
    next(err);
  }
};

const updateHighlight = async (req, res, next) => {
  try {
    const validation = validateUpdateHighlight(req.body);

    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const highlight = await highlightService.updateHighlight(
      req.userId,
      req.params.highlightId,
      validation.data
    );

    logHighlightAction(
      req,
      AUDIT_ACTIONS.HIGHLIGHT_UPDATED,
      highlight,
      `Edited highlight ${quote(highlight.title)}`,
      { fields: Object.keys(validation.data) }
    );

    return sendSuccess(res, {
      highlight,
      message: 'Highlight updated successfully',
    });
  } catch (err) {
    next(err);
  }
};

const deleteHighlight = async (req, res, next) => {
  try {
    const highlight = await highlightService.deleteHighlight(
      req.userId,
      req.params.highlightId
    );

    const byAuthor = highlight.userId === req.userId;
    logHighlightAction(
      req,
      AUDIT_ACTIONS.HIGHLIGHT_DELETED,
      highlight,
      byAuthor
        ? `Deleted highlight ${quote(highlight.title)}`
        : `Removed ${highlight.author.fullName || 'a participant'}'s highlight ${quote(highlight.title)} as host`,
      { byAuthor }
    );

    return sendSuccess(res, {
      highlight,
      message: 'Highlight deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

const listFeed = async (req, res, next) => {
  try {
    const { data } = validateListQuery(req.query);
    const result = await highlightService.listFeedHighlights(req.userId, data);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const listMyHighlights = async (req, res, next) => {
  try {
    const { data } = validateListQuery(req.query);
    const result = await highlightService.listMyHighlights(req.userId, data);

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const logSocial = (req, action, highlight, message, metadata = {}) =>
  logUserAction(req, action, {
    entityType: ENTITY_TYPES.HIGHLIGHT,
    entityId: highlight.id,
    targetUserId: highlight.userId,
    message,
    metadata: { highlightId: highlight.id, activityId: highlight.activityId, title: highlight.title, ...metadata },
  });

const likeHighlight = async (req, res, next) => {
  try {
    const { highlight, created, ...result } = await social.like(req.user, req.params.highlightId);
    if (created) logSocial(req, AUDIT_ACTIONS.HIGHLIGHT_LIKED, highlight, `Liked highlight ${quote(highlight.title)}`);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const unlikeHighlight = async (req, res, next) => {
  try {
    const { highlight, removed, ...result } = await social.unlike(req.user, req.params.highlightId);
    if (removed) logSocial(req, AUDIT_ACTIONS.HIGHLIGHT_UNLIKED, highlight, `Unliked highlight ${quote(highlight.title)}`);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const listComments = async (req, res, next) => {
  try {
    return sendSuccess(res, await social.listComments(req.userId, req.params.highlightId, req.query));
  } catch (err) {
    next(err);
  }
};

const addComment = async (req, res, next) => {
  try {
    const { comment, duplicate, highlight } = await social.addComment(req.user, req.params.highlightId, req.body);
    if (!duplicate) {
      logSocial(req, AUDIT_ACTIONS.HIGHLIGHT_COMMENTED, highlight, `Commented on ${quote(highlight.title)}: “${comment.text.slice(0, 80)}”`, {
        commentId: comment.id,
      });
    }
    return sendSuccess(res, { comment, duplicate }, duplicate ? 200 : 201);
  } catch (err) {
    next(err);
  }
};

const deleteComment = async (req, res, next) => {
  try {
    const { comment, highlight } = await social.deleteComment(req.user, req.params.highlightId, req.params.commentId);
    logSocial(
      req,
      AUDIT_ACTIONS.HIGHLIGHT_COMMENT_DELETED,
      highlight,
      comment.userId === req.userId ? `Deleted own comment on ${quote(highlight.title)}` : `Removed a comment on ${quote(highlight.title)}`,
      { commentId: comment.id, text: comment.text.slice(0, 300) }
    );
    return sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  likeHighlight,
  unlikeHighlight,
  listComments,
  addComment,
  deleteComment,
  createHighlight,
  listActivityHighlights,
  getHighlight,
  updateHighlight,
  deleteHighlight,
  listMyHighlights,
  listFeed,
};
