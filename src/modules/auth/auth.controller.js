const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
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

    const result = await authService.sendOtp(req.body.mobile, req.body.action);
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

    const result = await authService.verifyOtp(
      req.body.mobile,
      req.body.otp,
      req.body.action
    );
    return sendSuccess(res, result);
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

    await authService.logout(req.body.refreshToken);
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
