const { Router } = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const profileRoutes = require('../modules/profile/profile.routes');
const verificationRoutes = require('../modules/verification/verification.routes');
const activityRoutes = require('../modules/activity/activity.routes');
const highlightRoutes = require('../modules/highlight/highlight.routes');
const deviceRoutes = require('../modules/device/device.routes');
const notificationRoutes = require('../modules/notification/notification.routes');
const { authenticate } = require('../middleware/auth');
const chatController = require('../modules/chat/chat.controller');
const { setting, publicSettings } = require('../services/settings');
const { sendSuccess } = require('../utils/response');

const userRouter = Router();

/** Limits and switches the app reads at start (no login needed; cacheable for a minute). */
userRouter.get('/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  return sendSuccess(res, { config: publicSettings(), serverTime: new Date().toISOString() });
});

// Maintenance mode pauses the user API (the admin panel keeps working).
userRouter.use((req, res, next) => {
  if (!setting('app.maintenanceMode')) return next();
  res.set('Retry-After', '120');
  return res.status(503).json({ success: false, maintenance: true, message: setting('app.maintenanceMessage') });
});

userRouter.use('/auth', authRoutes);
userRouter.use('/profile', profileRoutes);
userRouter.use('/verification', verificationRoutes);
userRouter.use('/activities', activityRoutes);
userRouter.use('/highlights', highlightRoutes);
userRouter.use('/devices', deviceRoutes);
userRouter.use('/notifications', notificationRoutes);
userRouter.get('/chats', authenticate, chatController.listThreads);

module.exports = userRouter;
