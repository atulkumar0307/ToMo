const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const activityController = require('./activity.controller');

const router = Router();

router.use(authenticate);

router.post('/', activityController.createActivity);

module.exports = router;
