const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const activityService = require('./activity.service');
const {
  validateCreateActivity,
  validateUpdateActivity,
  validateDiscoveryQuery,
  validateListQuery,
  validateParticipantUserId,
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
    const result = await activityService.getActivityById(req.userId, req.params.id);

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const joinActivity = async (req, res, next) => {
  try {
    const result = await activityService.joinActivity(req.userId, req.params.id);

    return sendSuccess(
      res,
      {
        ...result,
        message: 'Join request sent successfully',
      },
      201
    );
  } catch (err) {
    next(err);
  }
};

const withdrawJoinRequest = async (req, res, next) => {
  try {
    const result = await activityService.withdrawJoinRequest(req.userId, req.params.id);

    return sendSuccess(res, {
      ...result,
      message: 'Join request withdrawn successfully',
    });
  } catch (err) {
    next(err);
  }
};

const listParticipants = async (req, res, next) => {
  try {
    const result = await activityService.listActivityParticipants(req.userId, req.params.id);

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const approveParticipant = async (req, res, next) => {
  try {
    const paramError = validateParticipantUserId(req.params.userId);

    if (paramError) {
      throw new AppError(paramError, 400);
    }

    const result = await activityService.approveParticipant(
      req.userId,
      req.params.id,
      req.params.userId
    );

    return sendSuccess(res, {
      ...result,
      message: 'Participant approved successfully',
    });
  } catch (err) {
    next(err);
  }
};

const rejectParticipant = async (req, res, next) => {
  try {
    const paramError = validateParticipantUserId(req.params.userId);

    if (paramError) {
      throw new AppError(paramError, 400);
    }

    const result = await activityService.rejectParticipant(
      req.userId,
      req.params.id,
      req.params.userId
    );

    return sendSuccess(res, {
      ...result,
      message: 'Participant rejected successfully',
    });
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
  joinActivity,
  withdrawJoinRequest,
  listParticipants,
  approveParticipant,
  rejectParticipant,
  listDiscovery,
  listHosted,
  listJoined,
};
