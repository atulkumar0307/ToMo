/** Allowlisted OTP actions — extend when adding new flows */
const OTP_ACTIONS = {
  LOGIN: 'LOGIN',
};

const ALLOWED_OTP_ACTIONS = Object.values(OTP_ACTIONS);

/** Actions that issue session tokens on successful verify */
const TOKEN_ISSUING_ACTIONS = [OTP_ACTIONS.LOGIN];

module.exports = {
  OTP_ACTIONS,
  ALLOWED_OTP_ACTIONS,
  TOKEN_ISSUING_ACTIONS,
};
