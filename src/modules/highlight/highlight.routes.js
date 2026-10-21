const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const highlightController = require('./highlight.controller');
const { rateLimit } = require('../../middleware/rateLimit');

// Anti-spam for comments (per user).
const commentLimit = rateLimit([
  { name: 'comment', windowMs: 60 * 1000, max: 20, key: (req) => req.userId, message: 'You are commenting too fast. Slow down a little.' },
]);

const router = Router();

router.use(authenticate);

router.get('/mine', highlightController.listMyHighlights);
router.get('/feed', highlightController.listFeed);
router.get('/:highlightId', highlightController.getHighlight);
router.patch('/:highlightId', highlightController.updateHighlight);
router.post('/:highlightId/like', highlightController.likeHighlight);
router.delete('/:highlightId/like', highlightController.unlikeHighlight);
router.get('/:highlightId/comments', highlightController.listComments);
router.post('/:highlightId/comments', commentLimit, highlightController.addComment);
router.delete('/:highlightId/comments/:commentId', highlightController.deleteComment);
router.delete('/:highlightId', highlightController.deleteHighlight);

module.exports = router;
