const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { logUserAction, quote } = require('../../utils/audit');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../../constants/auditActions');
const highlightService = require('./highlight.service');
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

    const highlight = await highlightService.createHighlight(
      req.userId,
      req.params.activityId,
      validation.data,
      req.files
    );

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

const listMyHighlights = async (req, res, next) => {
  try {
    const { data } = validateListQuery(req.query);
    const result = await highlightService.listMyHighlights(req.userId, data);

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createHighlight,
  listActivityHighlights,
  getHighlight,
  updateHighlight,
  deleteHighlight,
  listMyHighlights,
};
