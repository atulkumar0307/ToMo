const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { logUserAction } = require('../../utils/audit');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../../constants/auditActions');
const authService = require('./auth.service');
const {
  validateSendOtp,
  validateVerifyOtp,
  validateRefreshToken,
} = require('./auth.validation');

const sendOtp = async (req, res, next) => {
  try {
    const validationError = validateSendOtp(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const { result, user, mobile } = await authService.sendOtp(req.body.mobile, req.body.action);

    logUserAction(req, AUDIT_ACTIONS.AUTH_OTP_SENT, {
      user,
      actorLabel: user ? undefined : `+91 ${mobile}`,
      entityType: user ? ENTITY_TYPES.USER : null,
      entityId: user?.id,
      message: user ? 'Requested a login OTP' : `Requested a login OTP for new number +91 ${mobile}`,
      metadata: { mobile, existingUser: Boolean(user) },
    });

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const validationError = validateVerifyOtp(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const { session, user, isNewUser } = await authService.verifyOtp(
      req.body.mobile,
      req.body.otp,
      req.body.action
    );

    logUserAction(req, isNewUser ? AUDIT_ACTIONS.AUTH_SIGNUP : AUDIT_ACTIONS.AUTH_LOGIN, {
      user,
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      message: isNewUser ? `Signed up as user #${user.uid}` : 'Logged in',
      metadata: { mobile: user.mobile },
    });

    return sendSuccess(res, session);
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.userId);
    return sendSuccess(res, { user });
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const validationError = validateRefreshToken(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const result = await authService.refreshAccessToken(req.body.refreshToken);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const validationError = validateRefreshToken(req.body);
    if (validationError) {
      throw new AppError(validationError, 400);
    }

    const { user } = await authService.logout(req.body.refreshToken);

    logUserAction(req, AUDIT_ACTIONS.AUTH_LOGOUT, {
      user,
      entityType: ENTITY_TYPES.USER,
      entityId: user?.id,
      message: 'Logged out',
    });

    return sendSuccess(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  getMe,
  refreshToken,
  logout,
};
