const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const activityController = require('./activity.controller');

const router = Router();

router.use(authenticate);

router.get('/mine/hosted', activityController.listHosted);
router.get('/mine/joined', activityController.listJoined);
router.get('/', activityController.listDiscovery);
router.post('/', activityController.createActivity);
router.get('/:id', activityController.getActivity);
router.patch('/:id', activityController.updateActivity);
router.delete('/:id', activityController.deleteActivity);
router.post('/:id/cancel', activityController.cancelActivity);
router.post('/:id/start', activityController.startActivity);
router.post('/:id/complete', activityController.completeActivity);

module.exports = router;
