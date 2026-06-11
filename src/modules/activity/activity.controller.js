const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const activityService = require('./activity.service');
const {
  validateCreateActivity,
  validateUpdateActivity,
  validateDiscoveryQuery,
  validateListQuery,
} = require('./activity.validation');

const createActivity = async (req, res, next) => {
  try {
    const validation = validateCreateActivity(req.body);

    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const activity = await activityService.createActivity(req.userId, validation.data);

    return sendSuccess(
      res,
      {
        activity,
        message: 'Activity created successfully',
      },
      201
    );
  } catch (err) {
    next(err);
  }
};

const updateActivity = async (req, res, next) => {
  try {
    const validation = validateUpdateActivity(req.body);

    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const activity = await activityService.updateActivity(
      req.userId,
      req.params.id,
      validation.data
    );

    return sendSuccess(res, {
      activity,
      message: 'Activity updated successfully',
    });
  } catch (err) {
    next(err);
  }
};

const deleteActivity = async (req, res, next) => {
  try {
    const activity = await activityService.deleteActivity(req.userId, req.params.id);

    return sendSuccess(res, {
      activity,
      message: 'Activity deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

const cancelActivity = async (req, res, next) => {
  try {
    const activity = await activityService.cancelActivity(req.userId, req.params.id);

    return sendSuccess(res, {
      activity,
      message: 'Activity cancelled successfully',
    });
  } catch (err) {
    next(err);
  }
};

const startActivity = async (req, res, next) => {
  try {
    const activity = await activityService.startActivity(req.userId, req.params.id);

    return sendSuccess(res, {
      activity,
      message: 'Activity started successfully',
    });
  } catch (err) {
    next(err);
  }
};

const completeActivity = async (req, res, next) => {
  try {
    const activity = await activityService.completeActivity(req.userId, req.params.id);

    return sendSuccess(res, {
      activity,
      message: 'Activity completed successfully',
    });
  } catch (err) {
    next(err);
  }
};

const getActivity = async (req, res, next) => {
  try {
    const activity = await activityService.getActivityById(req.userId, req.params.id);

    return sendSuccess(res, { activity });
  } catch (err) {
    next(err);
  }
};

const listDiscovery = async (req, res, next) => {
  try {
    const validation = validateDiscoveryQuery(req.query);

    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const result = await activityService.listDiscoveryActivities(req.userId, validation.data);

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const listHosted = async (req, res, next) => {
  try {
    const validation = validateListQuery(req.query);
    const result = await activityService.listHostedActivities(req.userId, validation.data);

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const listJoined = async (req, res, next) => {
  try {
    const validation = validateListQuery(req.query);
    const result = await activityService.listJoinedActivities(req.userId, validation.data);

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createActivity,
  updateActivity,
  deleteActivity,
  cancelActivity,
  startActivity,
  completeActivity,
  getActivity,
  listDiscovery,
  listHosted,
  listJoined,
};
