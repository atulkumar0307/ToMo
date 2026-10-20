const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { logAdminAction, quote, userLabel } = require('../../utils/audit');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../../constants/auditActions');
const highlightService = require('./admin.highlight.service');
const {
  validateIdParam,
  validateAdminHighlightUpdate,
  parseBooleanQuery,
} = require('./admin.validation');

const assertHighlightParam = (req) => {
  const error = validateIdParam(req.params.highlightId, 'Highlight id');
  if (error) {
    throw new AppError(error, 400);
  }
};

const logHighlightChange = (req, action, highlight, message, metadata = {}) => {
  logAdminAction(req, action, {
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

const listHighlights = async (req, res, next) => {
  try {
    const result = await highlightService.listHighlights(req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getHighlight = async (req, res, next) => {
  try {
    assertHighlightParam(req);
    const highlight = await highlightService.getHighlight(req.params.highlightId);
    return sendSuccess(res, { highlight });
  } catch (err) {
    next(err);
  }
};

const updateHighlight = async (req, res, next) => {
  try {
    assertHighlightParam(req);
    const validation = validateAdminHighlightUpdate(req.body);
    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const { before, highlight } = await highlightService.updateHighlight(
      req.params.highlightId,
      validation.data
    );
    const fields = Object.keys(validation.data);
    const restored = before.status !== highlight.status && highlight.status === 'PUBLISHED';

    logHighlightChange(
      req,
      AUDIT_ACTIONS.ADMIN_HIGHLIGHT_UPDATED,
      highlight,
      restored
        ? `Restored ${userLabel(highlight.user)}'s highlight ${quote(highlight.title)}`
        : `Edited ${userLabel(highlight.user)}'s highlight ${quote(highlight.title)}: ${fields.join(', ')}`,
      { fields, fromStatus: before.status, toStatus: highlight.status }
    );

    return sendSuccess(res, { highlight, message: 'Highlight updated successfully' });
  } catch (err) {
    next(err);
  }
};

const deleteHighlight = async (req, res, next) => {
  try {
    assertHighlightParam(req);
    const hard = parseBooleanQuery(req.query.hard) === true;
    const result = await highlightService.deleteHighlight(req.params.highlightId, { hard });

    logHighlightChange(
      req,
      AUDIT_ACTIONS.ADMIN_HIGHLIGHT_DELETED,
      result.highlight,
      `${hard ? 'Permanently deleted' : 'Deleted'} ${userLabel(result.highlight.user)}'s highlight ${quote(result.highlight.title)}`,
      { hard }
    );

    return sendSuccess(res, {
      ...result,
      message: hard ? 'Highlight permanently deleted' : 'Highlight deleted',
    });
  } catch (err) {
    next(err);
  }
};

const removeMedia = async (req, res, next) => {
  try {
    assertHighlightParam(req);
    const mediaError = validateIdParam(req.params.mediaId, 'Media id');
    if (mediaError) {
      throw new AppError(mediaError, 400);
    }

    const { highlight, media } = await highlightService.removeHighlightMedia(
      req.params.highlightId,
      req.params.mediaId
    );

    logHighlightChange(
      req,
      AUDIT_ACTIONS.ADMIN_HIGHLIGHT_MEDIA_REMOVED,
      highlight,
      `Removed a ${media.type.toLowerCase()} from ${userLabel(highlight.user)}'s highlight ${quote(highlight.title)}`,
      { mediaId: media.id, mediaType: media.type }
    );

    return sendSuccess(res, { highlight, message: 'Media removed' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listHighlights,
  getHighlight,
  updateHighlight,
  deleteHighlight,
  removeMedia,
};
