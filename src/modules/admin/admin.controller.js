const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { logAdminAction } = require('../../utils/audit');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../../constants/auditActions');
const adminAuthService = require('./admin.auth.service');
const dashboardService = require('./admin.dashboard.service');
const logService = require('./admin.log.service');
const {
  validateAdminRegister,
  validateAdminLogin,
  validateAdminRefreshToken,
  validateAdminAccountUpdate,
  validateChangePassword,
  validateIdParam,
} = require('./admin.validation');

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

const setupStatus = async (req, res, next) => {
  try {
    const result = await adminAuthService.getSetupStatus();
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const register = async (req, res, next) => {
  try {
    const validationError = validateAdminRegister(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const result = await adminAuthService.registerAdmin(req.body);

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_REGISTERED, {
      admin: result.admin,
      entityType: ENTITY_TYPES.ADMIN,
      entityId: result.admin.id,
      message: `Set up the first admin account (${result.admin.email})`,
    });

    return sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const validationError = validateAdminLogin(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const result = await adminAuthService.loginAdmin(req.body);

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_LOGIN, {
      admin: result.admin,
      entityType: ENTITY_TYPES.ADMIN,
      entityId: result.admin.id,
      message: 'Logged in to the admin panel',
    });

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const validationError = validateAdminRefreshToken(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const result = await adminAuthService.refreshAdminAccessToken(req.body.refreshToken);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const validationError = validateAdminRefreshToken(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const { admin } = await adminAuthService.logoutAdmin(req.body.refreshToken);

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_LOGOUT, {
      admin,
      entityType: ENTITY_TYPES.ADMIN,
      entityId: admin.id,
      message: 'Logged out of the admin panel',
    });

    return sendSuccess(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Own account
// ---------------------------------------------------------------------------

const getMe = async (req, res) => sendSuccess(res, { admin: req.admin });

const updateMe = async (req, res, next) => {
  try {
    const validationError = validateAdminAccountUpdate({ fullName: req.body?.fullName });
    if (validationError || req.body?.fullName === undefined) {
      throw new AppError(validationError || 'Full name is required', 400);
    }

    const admin = await adminAuthService.updateOwnProfile(req.adminId, req.body);

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_UPDATED, {
      entityType: ENTITY_TYPES.ADMIN,
      entityId: admin.id,
      message: 'Updated own admin profile',
      metadata: { fields: ['fullName'] },
    });

    return sendSuccess(res, { admin, message: 'Profile updated' });
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const validationError = validateChangePassword(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    await adminAuthService.changeOwnPassword(req.adminId, req.body);

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_PASSWORD_CHANGED, {
      entityType: ENTITY_TYPES.ADMIN,
      entityId: req.adminId,
      message: 'Changed own password (other sessions signed out)',
    });

    return sendSuccess(res, { message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Admin accounts
// ---------------------------------------------------------------------------

const listAdmins = async (req, res, next) => {
  try {
    const result = await adminAuthService.listAdmins();
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const createAdmin = async (req, res, next) => {
  try {
    const validationError = validateAdminRegister(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const admin = await adminAuthService.createAdmin(req.body);

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_CREATED, {
      entityType: ENTITY_TYPES.ADMIN,
      entityId: admin.id,
      message: `Created admin account for ${admin.fullName} (${admin.email})`,
    });

    return sendSuccess(res, { admin, message: 'Admin created successfully' }, 201);
  } catch (err) {
    next(err);
  }
};

const updateAdmin = async (req, res, next) => {
  try {
    const paramError = validateIdParam(req.params.adminId, 'Admin id');
    const validationError = paramError || validateAdminAccountUpdate(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const { admin, changes } = await adminAuthService.updateAdmin(
      req.adminId,
      req.params.adminId,
      req.body
    );

    const statusNote =
      req.body.isActive === undefined ? '' : req.body.isActive ? ' (activated)' : ' (deactivated)';

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_UPDATED, {
      entityType: ENTITY_TYPES.ADMIN,
      entityId: admin.id,
      message: `Updated admin ${admin.fullName}: ${changes.join(', ') || 'no changes'}${statusNote}`,
      metadata: { fields: changes },
    });

    return sendSuccess(res, { admin, message: 'Admin updated successfully' });
  } catch (err) {
    next(err);
  }
};

const deleteAdmin = async (req, res, next) => {
  try {
    const paramError = validateIdParam(req.params.adminId, 'Admin id');
    if (paramError) {
      throw new AppError(paramError, 400);
    }

    const admin = await adminAuthService.deleteAdmin(req.adminId, req.params.adminId);

    logAdminAction(req, AUDIT_ACTIONS.ADMIN_DELETED, {
      entityType: ENTITY_TYPES.ADMIN,
      entityId: admin.id,
      message: `Deleted admin ${admin.fullName} (${admin.email})`,
      metadata: { email: admin.email },
    });

    return sendSuccess(res, { admin, message: 'Admin deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Dashboard & activity log
// ---------------------------------------------------------------------------

const getDashboard = async (req, res, next) => {
  try {
    const result = await dashboardService.getDashboard();
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const listLogs = async (req, res, next) => {
  try {
    const result = await logService.listLogs(req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const getLogActions = async (req, res) => sendSuccess(res, logService.getActionCatalog());

module.exports = {
  setupStatus,
  register,
  login,
  refreshToken,
  logout,
  getMe,
  updateMe,
  changePassword,
  listAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  getDashboard,
  listLogs,
  getLogActions,
};
