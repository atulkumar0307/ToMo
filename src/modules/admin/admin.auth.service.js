const bcrypt = require('bcrypt');
const prisma = require('../../config/database');
const { AppError } = require('../../utils/errors');
const { ADMIN_SELECT } = require('../../constants/adminSelect');
const {
  generateAdminAccessToken,
  generateAdminRefreshToken,
  verifyAdminRefreshToken,
  getAdminRefreshTokenExpiry,
} = require('../../utils/adminJwt');

const PASSWORD_SALT_ROUNDS = 10;

const assertAdminActive = (admin) => {
  if (!admin.isActive) {
    throw new AppError('Admin account is inactive', 403);
  }
};

const issueAdminSessionTokens = async (admin) => {
  const accessToken = generateAdminAccessToken(admin.id);
  const refreshToken = generateAdminRefreshToken(admin.id);

  await prisma.adminRefreshToken.create({
    data: {
      adminId: admin.id,
      token: refreshToken,
      expiresAt: getAdminRefreshTokenExpiry(),
    },
  });

  return { accessToken, refreshToken, admin };
};

const registerAdmin = async ({ email, password, fullName }) => {
  const normalizedEmail = email.trim().toLowerCase();

  const existingAdmin = await prisma.admin.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingAdmin) {
    throw new AppError('Admin with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

  const admin = await prisma.admin.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      fullName: fullName.trim(),
    },
    select: ADMIN_SELECT,
  });

  return issueAdminSessionTokens(admin);
};

const loginAdmin = async ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();

  const admin = await prisma.admin.findUnique({
    where: { email: normalizedEmail },
    select: {
      ...ADMIN_SELECT,
      passwordHash: true,
    },
  });

  if (!admin) {
    throw new AppError('Invalid email or password', 401);
  }

  assertAdminActive(admin);

  const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);

  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  const { passwordHash, ...adminData } = admin;
  return issueAdminSessionTokens(adminData);
};

const refreshAdminAccessToken = async (refreshToken) => {
  const storedToken = await prisma.adminRefreshToken.findUnique({
    where: { token: refreshToken },
    include: {
      admin: {
        select: ADMIN_SELECT,
      },
    },
  });

  if (!storedToken) {
    throw new AppError('Invalid refresh token', 401);
  }

  if (storedToken.expiresAt < new Date()) {
    await prisma.adminRefreshToken.delete({ where: { id: storedToken.id } });
    throw new AppError('Refresh token expired', 401);
  }

  let decoded;
  try {
    decoded = verifyAdminRefreshToken(refreshToken);
  } catch {
    await prisma.adminRefreshToken.delete({ where: { id: storedToken.id } });
    throw new AppError('Invalid refresh token', 401);
  }

  if (decoded.adminId !== storedToken.adminId) {
    throw new AppError('Invalid refresh token', 401);
  }

  assertAdminActive(storedToken.admin);

  const accessToken = generateAdminAccessToken(storedToken.adminId);

  return { accessToken };
};

const logoutAdmin = async (refreshToken) => {
  const result = await prisma.adminRefreshToken.deleteMany({
    where: { token: refreshToken },
  });

  if (result.count === 0) {
    throw new AppError('Invalid refresh token', 400);
  }

  return { loggedOut: true };
};

module.exports = {
  registerAdmin,
  loginAdmin,
  refreshAdminAccessToken,
  logoutAdmin,
};
