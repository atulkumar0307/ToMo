const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const highlightController = require('./highlight.controller');

const router = Router();

router.use(authenticate);

router.get('/mine', highlightController.listMyHighlights);
router.get('/:highlightId', highlightController.getHighlight);
router.patch('/:highlightId', highlightController.updateHighlight);
router.delete('/:highlightId', highlightController.deleteHighlight);

module.exports = router;
