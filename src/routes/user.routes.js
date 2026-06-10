const { Router } = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const profileRoutes = require('../modules/profile/profile.routes');
const verificationRoutes = require('../modules/verification/verification.routes');
const activityRoutes = require('../modules/activity/activity.routes');

const userRouter = Router();

userRouter.use('/auth', authRoutes);
userRouter.use('/profile', profileRoutes);
userRouter.use('/verification', verificationRoutes);
userRouter.use('/activities', activityRoutes);

module.exports = userRouter;
