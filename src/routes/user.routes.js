const { Router } = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const profileRoutes = require('../modules/profile/profile.routes');
const verificationRoutes = require('../modules/verification/verification.routes');

const userRouter = Router();

userRouter.use('/auth', authRoutes);
userRouter.use('/profile', profileRoutes);
userRouter.use('/verification', verificationRoutes);

module.exports = userRouter;
