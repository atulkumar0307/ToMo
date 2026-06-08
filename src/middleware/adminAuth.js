const prisma = require('../config/database');
const { ADMIN_SELECT } = require('../constants/adminSelect');
const { AppError } = require('../utils/errors');
const { verifyAdminAccessToken } = require('../utils/adminJwt');

const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Admin access token required', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAdminAccessToken(token);

    const admin = await prisma.admin.findUnique({
      where: { id: decoded.adminId },
      select: ADMIN_SELECT,
    });

    if (!admin) {
      throw new AppError('Admin not found', 401);
    }

    if (!admin.isActive) {
      throw new AppError('Admin account is inactive', 403);
    }

    req.admin = admin;
    req.adminId = admin.id;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      return next(err);
    }
    next(new AppError('Invalid or expired admin token', 401));
  }
};

module.exports = { authenticateAdmin };
