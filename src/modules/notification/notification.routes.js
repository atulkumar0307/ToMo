const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { sendSuccess } = require('../../utils/response');
const notifications = require('../../services/notifications');

const router = Router();
router.use(authenticate);

/** `?before=<id>&limit` → newest first, with the unread count. */
router.get('/', async (req, res, next) => {
  try {
    return sendSuccess(res, await notifications.list(req.userId, req.query));
  } catch (err) {
    next(err);
  }
});

/** Cheap badge count for the bell. */
router.get('/unread-count', async (req, res, next) => {
  try {
    return sendSuccess(res, { unreadCount: await notifications.unreadCount(req.userId) });
  } catch (err) {
    next(err);
  }
});

/** `{ids?: [...]}` — omit ids to mark everything read. */
router.post('/read', async (req, res, next) => {
  try {
    return sendSuccess(res, await notifications.markRead(req.userId, req.body?.ids));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
