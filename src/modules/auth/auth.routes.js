const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const authController = require('./auth.controller');

const router = Router();

// Public routes
router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);

// Private routes (authenticate applies to all routes below)
router.use(authenticate);

router.get('/me', authController.getMe);

module.exports = router;
