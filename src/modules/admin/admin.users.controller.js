const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { logAdminAction, userLabel } = require('../../utils/audit');
const { removeUploadPaths } = require('../../utils/uploads');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../../constants/auditActions');
const adminService = require('./admin.service');
const realtime = require('../../services/realtime');
const {
  validateUserIdParam,
  validateVerificationIdParam,
  validateBlockUser,
  validateAdminUpdateProfile,
  validateAdminCreateUser,
  buildAdminProfileUpdateData,
  validateReviewVerification,
} = require('./admin.validation');

const assertUserParam = (req) => {
  const paramError = validateUserIdParam(req.params.userId);
  if (paramError) {
    throw new AppError(paramError, 400);
  }
};

const discardUpload = (req) => {
  if (req.file) {
    removeUploadPaths([`/uploads/profiles/${req.file.filename}`]);
  }
};

const logUserChange = (req, action, user, message, metadata) => {
  logAdminAction(req, action, {
    entityType: ENTITY_TYPES.USER,
    entityId: user.id,
    targetUserId: user.id,
    message,
    metadata,
  });
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const listUsers = async (req, res, next) => {
  try {
    const result = await adminService.listUsers(req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getUser = async (req, res, next) => {
  try {
    assertUserParam(req);
    const result = await adminService.getUserDetail(req.params.userId);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const createUser = async (req, res, next) => {
  try {
    const validationError = validateAdminCreateUser(req.body, req.file);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const data = buildAdminProfileUpdateData(req.body, req.file);
    const user = await adminService.createUser(data);

    logUserChange(
      req,
      AUDIT_ACTIONS.ADMIN_USER_CREATED,
      user,
      `Created user ${userLabel(user)} (#${user.uid})`,
      { mobile: user.mobile }
    );

    return sendSuccess(res, { user, message: 'User created successfully' }, 201);
  } catch (err) {
    discardUpload(req);
    next(err);
  }
};

const updateUserProfile = async (req, res, next) => {
  try {
    assertUserParam(req);

    const validationError = validateAdminUpdateProfile(req.body, req.file);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const data = buildAdminProfileUpdateData(req.body, req.file);
    const user = await adminService.updateUserProfile(req.params.userId, data);
    const fields = Object.keys(data);

    realtime.profileUpdated(user.id);
    logUserChange(
      req,
      AUDIT_ACTIONS.ADMIN_USER_UPDATED,
      user,
      `Edited ${userLabel(user)}'s profile: ${fields.join(', ')}`,
      { fields, verifiedFlag: data.isProfileVerified }
    );

    return sendSuccess(res, { user });
  } catch (err) {
    discardUpload(req);
    next(err);
  }
};

const blockUser = async (req, res, next) => {
  try {
    assertUserParam(req);

    const validationError = validateBlockUser(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const user = await adminService.setUserBlockStatus(req.params.userId, req.body.isBlocked);
    if (req.body.isBlocked) realtime.accountBlocked(user.id);
    else realtime.profileUpdated(user.id);

    logUserChange(
      req,
      req.body.isBlocked ? AUDIT_ACTIONS.ADMIN_USER_BLOCKED : AUDIT_ACTIONS.ADMIN_USER_UNBLOCKED,
      user,
      `${req.body.isBlocked ? 'Blocked' : 'Unblocked'} ${userLabel(user)}`
    );

    return sendSuccess(res, {
      user,
      message: req.body.isBlocked
        ? 'User blocked successfully'
        : 'User unblocked successfully',
    });
  } catch (err) {
    next(err);
  }
};

const removeProfileImage = async (req, res, next) => {
  try {
    assertUserParam(req);
    const user = await adminService.removeUserProfileImage(req.params.userId);

    realtime.profileUpdated(user.id);
    logUserChange(
      req,
      AUDIT_ACTIONS.ADMIN_USER_PHOTO_REMOVED,
      user,
      `Removed ${userLabel(user)}'s profile photo`
    );

    return sendSuccess(res, { user, message: 'Profile photo removed' });
  } catch (err) {
    next(err);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    assertUserParam(req);
    const user = await adminService.deleteUser(req.params.userId);

    // The user row is gone, so the log keeps the details in metadata only.
    logAdminAction(req, AUDIT_ACTIONS.ADMIN_USER_DELETED, {
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      message: `Permanently deleted ${userLabel(user)} (#${user.uid}, +91 ${user.mobile})`,
      metadata: { uid: user.uid, mobile: user.mobile, fullName: user.fullName },
    });

    return sendSuccess(res, { user, message: 'User deleted permanently' });
  } catch (err) {
    next(err);
  }
};

const listSessions = async (req, res, next) => {
  try {
    assertUserParam(req);
    const result = await adminService.listUserSessions(req.params.userId);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const revokeSessions = async (req, res, next) => {
  try {
    assertUserParam(req);
    const result = await adminService.revokeUserSessions(req.params.userId);

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_USER_SESSIONS_REVOKED, {
      entityType: ENTITY_TYPES.USER,
      entityId: req.params.userId,
      targetUserId: req.params.userId,
      message: `Signed a user out of ${result.revoked} session(s)`,
      metadata: result,
    });

    return sendSuccess(res, { ...result, message: 'All sessions revoked' });
  } catch (err) {
    next(err);
  }
};

const listUserActivities = async (req, res, next) => {
  try {
    assertUserParam(req);
    const result = await adminService.listUserActivities(req.params.userId, req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const listUserHighlights = async (req, res, next) => {
  try {
    assertUserParam(req);
    const result = await adminService.listUserHighlights(req.params.userId, req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const listUserVerifications = async (req, res, next) => {
  try {
    assertUserParam(req);
    const result = await adminService.listUserVerifications(req.params.userId);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Verifications
// ---------------------------------------------------------------------------

const listVerifications = async (req, res, next) => {
  try {
    const result = await adminService.listVerifications(req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getVerification = async (req, res, next) => {
  try {
    const paramError = validateVerificationIdParam(req.params.verificationId);
    if (paramError) {
      throw new AppError(paramError, 400);
    }

    const result = await adminService.getVerification(req.params.verificationId);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const reviewVerification = async (req, res, next) => {
  try {
    const paramError = validateVerificationIdParam(req.params.verificationId);
    if (paramError) {
      throw new AppError(paramError, 400);
    }

    const validationError = validateReviewVerification(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const status = req.body.status.trim().toUpperCase();
    const { verification, user } = await adminService.reviewVerificationSubmission(
      req.params.verificationId,
      status,
      req.body.remark
    );

    const approved = status === 'APPROVED';
    realtime.verificationReviewed(user.id, status, verification.remark);
    logAdminAction(
      req,
      approved ? AUDIT_ACTIONS.ADMIN_VERIFICATION_APPROVED : AUDIT_ACTIONS.ADMIN_VERIFICATION_REJECTED,
      {
        entityType: ENTITY_TYPES.VERIFICATION,
        entityId: verification.id,
        targetUserId: user.id,
        message: approved
          ? `Approved verification of ${userLabel(user)}`
          : `Rejected verification of ${userLabel(user)}: ${verification.remark}`,
        metadata: { remark: verification.remark },
      }
    );

    return sendSuccess(res, {
      verification,
      message: approved
        ? 'Verification approved successfully'
        : 'Verification rejected successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUserProfile,
  blockUser,
  removeProfileImage,
  deleteUser,
  listSessions,
  revokeSessions,
  listUserActivities,
  listUserHighlights,
  listUserVerifications,
  listVerifications,
  getVerification,
  reviewVerification,
};
