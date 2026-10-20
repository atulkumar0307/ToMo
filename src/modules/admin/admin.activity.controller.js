const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { logAdminAction, describeActivity, userLabel } = require('../../utils/audit');
const { formatActivityCode } = require('../../utils/activityAid');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../../constants/auditActions');
const activityService = require('./admin.activity.service');
const {
  validateIdParam,
  validateAdminActivityUpdate,
  validateActivityStatusChange,
  validateAddParticipant,
  validateParticipantStatusChange,
  parseBooleanQuery,
} = require('./admin.validation');
const { validateCreateActivity } = require('../activity/activity.validation');

const assertParams = (req, ...names) => {
  for (const name of names) {
    const error = validateIdParam(req.params[name], name);
    if (error) {
      throw new AppError(error, 400);
    }
  }
};

const withCode = (activity) => ({
  ...activity,
  activityCode: activity.activityCode || formatActivityCode(activity.aid),
});

const logActivityChange = (req, action, activity, message, metadata = {}) => {
  logAdminAction(req, action, {
    entityType: ENTITY_TYPES.ACTIVITY,
    entityId: activity.id,
    targetUserId: activity.hostId,
    message,
    metadata: {
      activityId: activity.id,
      activityCode: withCode(activity).activityCode,
      title: activity.title,
      ...metadata,
    },
  });
};

const listActivities = async (req, res, next) => {
  try {
    const result = await activityService.listActivities(req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const listLiveGroups = async (req, res, next) => {
  try {
    const result = await activityService.listLiveGroups();
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const createActivity = async (req, res, next) => {
  try {
    // Host is given as hostId, hostUid or hostMobile; fields follow the app's create rules.
    const hostValidation = validateAddParticipant({
      userId: req.body?.hostId,
      uid: req.body?.hostUid,
      mobile: req.body?.hostMobile,
    });
    if (hostValidation.error) {
      throw new AppError(hostValidation.error.replace('of the user to add', 'of the host'), 400);
    }

    const validation = validateCreateActivity(req.body);
    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const activity = await activityService.createActivity(hostValidation.data.where, validation.data);

    logActivityChange(
      req,
      AUDIT_ACTIONS.ADMIN_ACTIVITY_CREATED,
      activity,
      `Created activity ${describeActivity(activity)} for ${userLabel(activity.host)}`,
      { category: activity.category, startTime: activity.startTime }
    );

    return sendSuccess(res, { activity, message: 'Activity created successfully' }, 201);
  } catch (err) {
    next(err);
  }
};

const getActivity = async (req, res, next) => {
  try {
    assertParams(req, 'activityId');
    const result = await activityService.getActivityDetail(req.params.activityId);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const updateActivity = async (req, res, next) => {
  try {
    assertParams(req, 'activityId');
    const validation = validateAdminActivityUpdate(req.body);
    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const { activity } = await activityService.updateActivity(req.params.activityId, validation.data);
    const fields = Object.keys(validation.data);

    logActivityChange(
      req,
      AUDIT_ACTIONS.ADMIN_ACTIVITY_UPDATED,
      activity,
      `Edited activity ${describeActivity(activity)}: ${fields.join(', ')}`,
      { fields }
    );

    return sendSuccess(res, { activity, message: 'Activity updated successfully' });
  } catch (err) {
    next(err);
  }
};

const changeStatus = async (req, res, next) => {
  try {
    assertParams(req, 'activityId');
    const validation = validateActivityStatusChange(req.body);
    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const result = await activityService.changeActivityStatus(req.params.activityId, validation.data);
    const { reason } = validation.data;

    logActivityChange(
      req,
      AUDIT_ACTIONS.ADMIN_ACTIVITY_STATUS_CHANGED,
      result.activity,
      `Changed ${describeActivity(result.activity)} from ${result.previousStatus} to ${result.activity.status}${reason ? ` — ${reason}` : ''}`,
      { from: result.previousStatus, to: result.activity.status, reason }
    );

    return sendSuccess(res, { ...result, message: `Activity is now ${result.activity.status}` });
  } catch (err) {
    next(err);
  }
};

const deleteActivity = async (req, res, next) => {
  try {
    assertParams(req, 'activityId');
    const hard = parseBooleanQuery(req.query.hard) === true;
    const result = await activityService.deleteActivity(req.params.activityId, { hard });

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_ACTIVITY_DELETED, {
      entityType: ENTITY_TYPES.ACTIVITY,
      entityId: result.activity.id,
      // A hard-deleted activity's host still exists; keep the link.
      targetUserId: result.activity.hostId,
      message: `${hard ? 'Permanently deleted' : 'Deleted'} activity ${describeActivity(result.activity)}`,
      metadata: {
        hard,
        activityCode: result.activity.activityCode,
        title: result.activity.title,
      },
    });

    return sendSuccess(res, {
      ...result,
      message: hard ? 'Activity permanently deleted' : 'Activity deleted',
    });
  } catch (err) {
    next(err);
  }
};

const listParticipants = async (req, res, next) => {
  try {
    assertParams(req, 'activityId');
    const result = await activityService.listParticipants(req.params.activityId, req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const addParticipant = async (req, res, next) => {
  try {
    assertParams(req, 'activityId');
    const validation = validateAddParticipant(req.body);
    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const result = await activityService.addParticipant(req.params.activityId, validation.data);

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_PARTICIPANT_ADDED, {
      entityType: ENTITY_TYPES.ACTIVITY,
      entityId: result.activity.id,
      targetUserId: result.participant.userId,
      message: `Added ${userLabel(result.participant.user)} to ${describeActivity(result.activity)}`,
      metadata: {
        activityId: result.activity.id,
        title: result.activity.title,
        previousStatus: result.previousStatus,
        forced: validation.data.force,
      },
    });

    return sendSuccess(res, { participant: result.participant, message: 'Participant added' }, 201);
  } catch (err) {
    next(err);
  }
};

const changeParticipantStatus = async (req, res, next) => {
  try {
    assertParams(req, 'activityId', 'userId');
    const validation = validateParticipantStatusChange(req.body);
    if (validation.error) {
      throw new AppError(validation.error, 400);
    }

    const result = await activityService.changeParticipantStatus(
      req.params.activityId,
      req.params.userId,
      validation.data
    );

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_PARTICIPANT_STATUS_CHANGED, {
      entityType: ENTITY_TYPES.ACTIVITY,
      entityId: result.activity.id,
      targetUserId: req.params.userId,
      message: `Set ${userLabel(result.participant.user)} to ${result.participant.status} in ${describeActivity(result.activity)} (was ${result.previousStatus})`,
      metadata: {
        activityId: result.activity.id,
        title: result.activity.title,
        from: result.previousStatus,
        to: result.participant.status,
        forced: validation.data.force,
      },
    });

    return sendSuccess(res, {
      participant: result.participant,
      message: `Participant is now ${result.participant.status}`,
    });
  } catch (err) {
    next(err);
  }
};

const removeParticipant = async (req, res, next) => {
  try {
    assertParams(req, 'activityId', 'userId');
    const result = await activityService.removeParticipant(req.params.activityId, req.params.userId);

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_PARTICIPANT_REMOVED, {
      entityType: ENTITY_TYPES.ACTIVITY,
      entityId: result.activity.id,
      targetUserId: req.params.userId,
      message: `Removed ${userLabel(result.participant.user)} from ${describeActivity(result.activity)}`,
      metadata: {
        activityId: result.activity.id,
        title: result.activity.title,
        previousStatus: result.participant.status,
      },
    });

    return sendSuccess(res, { participant: result.participant, message: 'Participant removed' });
  } catch (err) {
    next(err);
  }
};

const listJoinRequests = async (req, res, next) => {
  try {
    const result = await activityService.listJoinRequests(req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listActivities,
  listLiveGroups,
  createActivity,
  getActivity,
  updateActivity,
  changeStatus,
  deleteActivity,
  listParticipants,
  addParticipant,
  changeParticipantStatus,
  removeParticipant,
  listJoinRequests,
};
