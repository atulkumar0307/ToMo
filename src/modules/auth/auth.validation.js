const { ALLOWED_OTP_ACTIONS } = require('./auth.constants');

const MOBILE_REGEX = /^[6-9]\d{9}$/;

const validateMobile = (mobile) => {
  if (!mobile || typeof mobile !== 'string') {
    return 'Mobile number is required';
  }

  const normalized = mobile.trim();

  if (!MOBILE_REGEX.test(normalized)) {
    return 'Invalid mobile number. Must be a valid 10-digit Indian mobile number';
  }

  return null;
};

const validateAction = (action) => {
  if (!action || typeof action !== 'string') {
    return 'Action is required';
  }

  const normalized = action.trim().toUpperCase();

  if (!ALLOWED_OTP_ACTIONS.includes(normalized)) {
    return `Invalid action. Allowed values: ${ALLOWED_OTP_ACTIONS.join(', ')}`;
  }

  return null;
};

const validateSendOtp = (body) => {
  const mobileError = validateMobile(body.mobile);
  if (mobileError) {
    return mobileError;
  }

  return validateAction(body.action);
};

const validateVerifyOtp = (body) => {
  const mobileError = validateMobile(body.mobile);
  if (mobileError) {
    return mobileError;
  }

  const actionError = validateAction(body.action);
  if (actionError) {
    return actionError;
  }

  if (!body.otp || typeof body.otp !== 'string' || body.otp.trim().length === 0) {
    return 'OTP is required';
  }

  if (!/^\d{6}$/.test(body.otp.trim())) {
    return 'OTP must be a 6-digit code';
  }

  return null;
};

const validateRefreshToken = (body) => {
  if (!body.refreshToken || typeof body.refreshToken !== 'string') {
    return 'Refresh token is required';
  }
  return null;
};

const normalizeAction = (action) => action.trim().toUpperCase();

const validateOptionalMobile = (mobile) => {
  if (mobile === undefined || mobile === null) {
    return null;
  }

  return validateMobile(mobile);
};

module.exports = {
  validateSendOtp,
  validateVerifyOtp,
  validateRefreshToken,
  validateOptionalMobile,
  normalizeAction,
};
