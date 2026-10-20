const { Router } = require('express');
const prisma = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { isPushEnabled } = require('../../services/push');

const MAX_DEVICES_PER_USER = 10;
const PLATFORMS = ['android', 'ios', 'web'];

const validateToken = (body) => {
  if (!body?.token || typeof body.token !== 'string' || body.token.length < 20 || body.token.length > 4096) {
    return 'A valid FCM token is required';
  }
  return null;
};

const router = Router();
router.use(authenticate);

/** Registers this device for silent push. Re-registering moves the token to the current user. */
router.post('/', async (req, res, next) => {
  try {
    const error = validateToken(req.body);
    if (error) throw new AppError(error, 400);

    const platform = PLATFORMS.includes(String(req.body.platform).toLowerCase()) ? String(req.body.platform).toLowerCase() : 'android';

    await prisma.deviceToken.upsert({
      where: { token: req.body.token },
      create: { token: req.body.token, userId: req.userId, platform },
      update: { userId: req.userId, platform },
    });

    // Keep only the most recent devices per user.
    const stale = await prisma.deviceToken.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: 'desc' },
      skip: MAX_DEVICES_PER_USER,
      select: { id: true },
    });
    if (stale.length) {
      await prisma.deviceToken.deleteMany({ where: { id: { in: stale.map((d) => d.id) } } });
    }

    return sendSuccess(res, { registered: true, pushEnabled: isPushEnabled() });
  } catch (err) {
    next(err);
  }
});

/** Call on logout so the device stops receiving this user's pushes. */
router.post('/remove', async (req, res, next) => {
  try {
    const error = validateToken(req.body);
    if (error) throw new AppError(error, 400);

    const result = await prisma.deviceToken.deleteMany({ where: { token: req.body.token, userId: req.userId } });
    return sendSuccess(res, { removed: result.count });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
