const { Router } = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const profileRoutes = require('../modules/profile/profile.routes');
const verificationRoutes = require('../modules/verification/verification.routes');
const activityRoutes = require('../modules/activity/activity.routes');
const highlightRoutes = require('../modules/highlight/highlight.routes');
const deviceRoutes = require('../modules/device/device.routes');
const { authenticate } = require('../middleware/auth');
const chatController = require('../modules/chat/chat.controller');

const userRouter = Router();

userRouter.use('/auth', authRoutes);
userRouter.use('/profile', profileRoutes);
userRouter.use('/verification', verificationRoutes);
userRouter.use('/activities', activityRoutes);
userRouter.use('/highlights', highlightRoutes);
userRouter.use('/devices', deviceRoutes);
userRouter.get('/chats', authenticate, chatController.listThreads);

module.exports = userRouter;
