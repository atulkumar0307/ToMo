const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { uploadHighlightMedia, uploadChatImage } = require('../../middleware/upload');
const { rateLimit } = require('../../middleware/rateLimit');
const { setting } = require('../../services/settings');
const chatController = require('../chat/chat.controller');
const { MAX_MEDIA_CEILING } = require('../highlight/highlight.constants');
const highlightController = require('../highlight/highlight.controller');
const activityController = require('./activity.controller');

const router = Router();

router.use(authenticate);

// Anti-spam: per user, independent of IP.
const chatSendLimit = rateLimit([
  {
    name: 'chat-send',
    windowMs: 60 * 1000,
    max: () => setting('chat.messagesPerMinute'),
    key: (req) => req.userId,
    message: 'You are sending messages too fast. Slow down a little.',
  },
]);

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
  // Hard ceiling here; the configured limit is checked in the validation.
  uploadHighlightMedia.array('media', MAX_MEDIA_CEILING),
  highlightController.createHighlight
);
router.get('/:activityId/highlights', highlightController.listActivityHighlights);
router.get('/:id/chat', chatController.listMessages);
router.post('/:id/chat', chatSendLimit, uploadChatImage.single('image'), chatController.sendMessage);
router.post('/:id/chat/read', chatController.markRead);
router.delete('/:id/chat/:messageId', chatController.deleteMessage);
router.get('/:id', activityController.getActivity);
router.patch('/:id', activityController.updateActivity);
router.delete('/:id', activityController.deleteActivity);
router.post('/:id/cancel', activityController.cancelActivity);
router.post('/:id/start', activityController.startActivity);
router.post('/:id/complete', activityController.completeActivity);

module.exports = router;
