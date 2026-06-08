const { Router } = require('express');
const userRoutes = require('./user.routes');
const adminRoutes = require('../modules/admin/admin.routes');

const apiRouter = Router();

apiRouter.use('/user', userRoutes);
apiRouter.use('/admin', adminRoutes);

module.exports = apiRouter;
