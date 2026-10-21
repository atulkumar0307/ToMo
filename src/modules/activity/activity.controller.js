const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { logUserAction, describeActivity, userLabel } = require('../../utils/audit');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../../constants/auditActions');
const realtime = require('../../services/realtime');
const chatService = require('../chat/chat.service');
const activityService = require('./activity.service');
const {
  validateCreateActivity,
  validateUpdateActivity,
  validateDiscoveryQuery,
  validateListQuery,
  validateParticipantUserId,
} = require('./activity.validation');

const logActivityAction = (req, action, activity, message, extra = {}) => {
  logUserAction(req, action, {
    entityType: ENTITY_TYPES.ACTIVITY,
    entityId: activity.id,
    targetUserId: extra.targetUserId || activity.hostId,
    message,
    metadata: {
      activityId: activity.id,
      activityCode: activity.activityCode,
      title: activity.title,
      category: activity.category,
      ...extra.metadata,
    },
  });
};

const createActivity = async (req, res, next) => {
  try {
    const validation = validateCreateActivity(req.body);

    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const activity = await activityService.createActivity(req.userId, validation.data);

    logActivityAction(
      req,
      AUDIT_ACTIONS.ACTIVITY_CREATED,
      activity,
      `Created activity ${describeActivity(activity)}`,
      {
        metadata: {
          locationName: activity.locationName,
          city: activity.city,
          startTime: activity.startTime,
          maxParticipants: activity.maxParticipants,
        },
      }
    );

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

    logActivityAction(
      req,
      AUDIT_ACTIONS.ACTIVITY_UPDATED,
      activity,
      `Edited activity ${describeActivity(activity)}`
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

    logActivityAction(
      req,
      AUDIT_ACTIONS.ACTIVITY_DELETED,
      activity,
      `Deleted activity ${describeActivity(activity)}`
    );

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

    logActivityAction(
      req,
      AUDIT_ACTIONS.ACTIVITY_CANCELLED,
      activity,
      `Cancelled activity ${describeActivity(activity)}`,
      { metadata: { approvedCount: activity.approvedCount, pendingCount: activity.pendingCount } }
    );
    chatService.postSystemMessage(activity.id, 'The host cancelled this activity');
    realtime.activityUpdated(activity, 'cancelled', { exclude: [req.userId] });

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

    logActivityAction(
      req,
      AUDIT_ACTIONS.ACTIVITY_STARTED,
      activity,
      `Started activity ${describeActivity(activity)}`,
      { metadata: { approvedCount: activity.approvedCount } }
    );
    chatService.postSystemMessage(activity.id, 'The activity has started');
    realtime.activityUpdated(activity, 'started', { exclude: [req.userId] });

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

    logActivityAction(
      req,
      AUDIT_ACTIONS.ACTIVITY_COMPLETED,
      activity,
      `Completed activity ${describeActivity(activity)}`,
      { metadata: { approvedCount: activity.approvedCount } }
    );
    chatService.postSystemMessage(activity.id, 'The activity is complete — share your highlights!');
    realtime.activityUpdated(activity, 'completed', { exclude: [req.userId] });

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
    const { user: _user, ...result } = await activityService.joinActivity(req.userId, req.params.id);

    logActivityAction(
      req,
      AUDIT_ACTIONS.JOIN_REQUESTED,
      result.activity,
      `Requested to join ${describeActivity(result.activity)}`
    );
    realtime.joinRequested(result.activity, req.user);

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

/** Withdraws a pending request, or leaves an activity the user was approved for. */
const withdrawJoinRequest = async (req, res, next) => {
  try {
    const result = await activityService.withdrawJoinRequest(req.userId, req.params.id);

    logActivityAction(
      req,
      result.left ? AUDIT_ACTIONS.ACTIVITY_LEFT : AUDIT_ACTIONS.JOIN_WITHDRAWN,
      result.activity,
      result.left
        ? `Left activity ${describeActivity(result.activity)}`
        : `Withdrew join request for ${describeActivity(result.activity)}`
    );
    if (result.left) {
      chatService.postSystemMessage(result.activity.id, `${userLabel(req.user)} left`);
    }
    realtime.participantUpdated(result.activity, req.userId, result.participantStatus, {
      notifyHost: true,
      participantName: result.left ? userLabel(req.user) : undefined,
    });

    return sendSuccess(res, {
      ...result,
      message: result.left ? 'You left the activity' : 'Join request withdrawn successfully',
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

    logActivityAction(
      req,
      AUDIT_ACTIONS.JOIN_APPROVED,
      result.activity,
      `Approved ${userLabel(result.participant.user)}'s request for ${describeActivity(result.activity)}`,
      {
        targetUserId: req.params.userId,
        metadata: { participantUserId: req.params.userId },
      }
    );
    chatService.postSystemMessage(result.activity.id, `${userLabel(result.participant.user)} joined`);
    realtime.participantUpdated(result.activity, req.params.userId, 'APPROVED');

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

    logActivityAction(
      req,
      AUDIT_ACTIONS.JOIN_REJECTED,
      result.activity,
      `Rejected ${userLabel(result.participant.user)}'s request for ${describeActivity(result.activity)}`,
      {
        targetUserId: req.params.userId,
        metadata: { participantUserId: req.params.userId },
      }
    );
    realtime.participantUpdated(result.activity, req.params.userId, 'REJECTED');

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
