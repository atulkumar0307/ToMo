const { AppError } = require('../utils/errors');
const { getAuthUser } = require('../utils/userCache');
const { verifyAccessToken } = require('../utils/jwt');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Access token required', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const user = await getAuthUser(decoded.userId);

    if (!user) {
      throw new AppError('User not found or Unauthorized', 401);
    }

    if (user.isBlocked) {
      throw new AppError('Your account has been blocked. Please contact support.', 403);
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      return next(err);
    }
    next(new AppError('Invalid or expired token', 401));
  }
};

module.exports = { authenticate };
