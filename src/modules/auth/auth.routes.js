// Per-IP caps are generous: mobile carriers put many users behind one IP (CGNAT).
// The per-number caps are what stop OTP abuse.
const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const authController = require('./auth.controller');
const { setting } = require('../../services/settings');
const { rateLimit, clientIp } = require('../../middleware/rateLimit');

const MINUTE = 60 * 1000;
const mobileOf = (req) => (typeof req.body?.mobile === 'string' ? req.body.mobile.trim() : null);

const sendOtpLimits = rateLimit([
  {
    name: 'otp-resend',
    windowMs: () => setting('auth.otpResendCooldownSeconds') * 1000,
    max: 1,
    key: mobileOf,
    message: () => `Please wait ${setting('auth.otpResendCooldownSeconds')} seconds before requesting another code.`,
  },
  {
    name: 'otp-mobile-hour',
    windowMs: 60 * MINUTE,
    max: () => setting('auth.otpPerHourPerNumber'),
    key: mobileOf,
    message: 'Too many codes requested for this number. Try again in an hour.',
  },
  { name: 'otp-ip-hour', windowMs: 60 * MINUTE, max: 300, key: clientIp },
]);

const verifyOtpLimits = rateLimit([
  { name: 'verify-ip', windowMs: 10 * MINUTE, max: 400, key: clientIp },
  { name: 'verify-mobile', windowMs: 10 * MINUTE, max: 15, key: mobileOf },
]);

const refreshLimits = rateLimit([{ name: 'refresh-ip', windowMs: MINUTE, max: 600, key: clientIp }]);

const router = Router();

// Public routes
router.post('/send-otp', sendOtpLimits, authController.sendOtp);
router.post('/verify-otp', verifyOtpLimits, authController.verifyOtp);
router.post('/refresh-token', refreshLimits, authController.refreshToken);
router.post('/logout', authController.logout);

// Private routes (authenticate applies to all routes below)
router.use(authenticate);

router.get('/me', authController.getMe);

module.exports = router;
