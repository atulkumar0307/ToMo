const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const adminService = require('./admin.service');
const adminAuthService = require('./admin.auth.service');
const {
  validateListUsers,
  validateUserIdParam,
  validateVerificationIdParam,
  validateBlockUser,
  validateAdminUpdateProfile,
  buildAdminProfileUpdateData,
  validateReviewVerification,
  validateAdminRegister,
  validateAdminLogin,
  validateAdminRefreshToken,
} = require('./admin.validation');

const register = async (req, res, next) => {
  try {
    const validationError = validateAdminRegister(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const result = await adminAuthService.registerAdmin(req.body);
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

    await adminAuthService.logoutAdmin(req.body.refreshToken);
    return sendSuccess(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const validationError = validateListUsers(req.query);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const result = await adminService.listUsers(req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const blockUser = async (req, res, next) => {
  try {
    const paramError = validateUserIdParam(req.params.userId);
    if (paramError) {
      throw new AppError(paramError, 400);
    }

    const validationError = validateBlockUser(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const user = await adminService.setUserBlockStatus(
      req.params.userId,
      req.body.isBlocked
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

const updateUserProfile = async (req, res, next) => {
  try {
    const paramError = validateUserIdParam(req.params.userId);
    if (paramError) {
      throw new AppError(paramError, 400);
    }

    const validationError = validateAdminUpdateProfile(req.body, req.file);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const data = buildAdminProfileUpdateData(req.body, req.file);
    const user = await adminService.updateUserProfile(req.params.userId, data);

    return sendSuccess(res, { user });
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
    const verification = await adminService.reviewVerificationSubmission(
      req.params.verificationId,
      status,
      req.body.remark
    );

    return sendSuccess(res, {
      verification,
      message:
        status === 'APPROVED'
          ? 'Verification approved successfully'
          : 'Verification rejected successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  listUsers,
  blockUser,
  updateUserProfile,
  reviewVerification,
};
