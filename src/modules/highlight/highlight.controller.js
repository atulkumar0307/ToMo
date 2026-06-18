const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const highlightService = require('./highlight.service');
const {
  validateCreateHighlight,
  validateUpdateHighlight,
  validateListQuery,
} = require('./highlight.validation');

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
