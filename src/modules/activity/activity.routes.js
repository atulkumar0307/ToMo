const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { uploadHighlightMedia } = require('../../middleware/upload');
const { MAX_MEDIA } = require('../highlight/highlight.constants');
const highlightController = require('../highlight/highlight.controller');
const activityController = require('./activity.controller');

const router = Router();

router.use(authenticate);

router.get('/mine/hosted', activityController.listHosted);
router.get('/mine/joined', activityController.listJoined);
router.get('/', activityController.listDiscovery);
router.post('/', activityController.createActivity);
router.get('/:id/participants', activityController.listParticipants);
router.post('/:id/join', activityController.joinActivity);
router.post('/:id/withdraw', activityController.withdrawJoinRequest);
router.post('/:id/participants/:userId/approve', activityController.approveParticipant);
router.post('/:id/participants/:userId/reject', activityController.rejectParticipant);
router.post(
  '/:activityId/highlights',
  uploadHighlightMedia.array('media', MAX_MEDIA),
  highlightController.createHighlight
);
router.get('/:activityId/highlights', highlightController.listActivityHighlights);
router.get('/:id', activityController.getActivity);
router.patch('/:id', activityController.updateActivity);
router.delete('/:id', activityController.deleteActivity);
router.post('/:id/cancel', activityController.cancelActivity);
router.post('/:id/start', activityController.startActivity);
router.post('/:id/complete', activityController.completeActivity);

module.exports = router;
