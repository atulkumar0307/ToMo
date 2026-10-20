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

const getSetupStatus = async () => {
  const adminCount = await prisma.admin.count();
  return { needsSetup: adminCount === 0 };
};

const createAdminRecord = async ({ email, password, fullName }) => {
  const normalizedEmail = email.trim().toLowerCase();

  const existingAdmin = await prisma.admin.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingAdmin) {
    throw new AppError('Admin with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

  return prisma.admin.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      fullName: fullName.trim(),
    },
    select: ADMIN_SELECT,
  });
};

/**
 * Public self-registration only bootstraps the very first admin. After that,
 * new admins are created by an existing admin (POST /api/admin/admins).
 */
const registerAdmin = async (payload) => {
  const { needsSetup } = await getSetupStatus();

  if (!needsSetup) {
    throw new AppError(
      'Admin registration is closed. Ask an existing admin to create your account.',
      403
    );
  }

  const admin = await createAdminRecord(payload);
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
  const storedToken = await prisma.adminRefreshToken.findUnique({
    where: { token: refreshToken },
    select: { id: true, admin: { select: ADMIN_SELECT } },
  });

  if (!storedToken) {
    throw new AppError('Invalid refresh token', 400);
  }

  await prisma.adminRefreshToken.deleteMany({ where: { id: storedToken.id } });

  return { loggedOut: true, admin: storedToken.admin };
};

// ---------------------------------------------------------------------------
// Own account
// ---------------------------------------------------------------------------

const updateOwnProfile = async (adminId, { fullName }) => {
  return prisma.admin.update({
    where: { id: adminId },
    data: { fullName: fullName.trim() },
    select: ADMIN_SELECT,
  });
};

const changeOwnPassword = async (adminId, { currentPassword, newPassword, refreshToken }) => {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, passwordHash: true },
  });

  if (!admin) {
    throw new AppError('Admin not found', 404);
  }

  const isValid = await bcrypt.compare(currentPassword, admin.passwordHash);

  if (!isValid) {
    throw new AppError('Current password is incorrect', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);

  await prisma.$transaction([
    prisma.admin.update({ where: { id: adminId }, data: { passwordHash } }),
    // Sign out every other session; keep the one making this request.
    prisma.adminRefreshToken.deleteMany({
      where: {
        adminId,
        ...(typeof refreshToken === 'string' ? { token: { not: refreshToken } } : {}),
      },
    }),
  ]);

  return { changed: true };
};

// ---------------------------------------------------------------------------
// Admin accounts management
// ---------------------------------------------------------------------------

const ADMIN_LIST_SELECT = {
  ...ADMIN_SELECT,
  _count: { select: { refreshTokens: true, auditLogs: true } },
};

const listAdmins = async () => {
  const admins = await prisma.admin.findMany({
    orderBy: { createdAt: 'asc' },
    select: ADMIN_LIST_SELECT,
  });

  return { admins };
};

const createAdmin = async (payload) => createAdminRecord(payload);

const findAdminOrThrow = async (adminId) => {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: ADMIN_SELECT,
  });

  if (!admin) {
    throw new AppError('Admin not found', 404);
  }

  return admin;
};

const assertNotLastActiveAdmin = async (adminId) => {
  const otherActive = await prisma.admin.count({
    where: { isActive: true, id: { not: adminId } },
  });

  if (otherActive === 0) {
    throw new AppError('At least one active admin must remain', 400);
  }
};

const updateAdmin = async (actingAdminId, adminId, body) => {
  const target = await findAdminOrThrow(adminId);
  const data = {};

  if (body.fullName !== undefined) {
    data.fullName = body.fullName.trim();
  }

  if (body.isActive !== undefined && body.isActive !== target.isActive) {
    if (!body.isActive) {
      if (actingAdminId === adminId) {
        throw new AppError('You cannot deactivate your own account', 400);
      }
      await assertNotLastActiveAdmin(adminId);
    }
    data.isActive = body.isActive;
  }

  if (body.password !== undefined) {
    data.passwordHash = await bcrypt.hash(body.password, PASSWORD_SALT_ROUNDS);
  }

  const revokeSessions = data.isActive === false || data.passwordHash !== undefined;

  const [admin] = await prisma.$transaction([
    prisma.admin.update({ where: { id: adminId }, data, select: ADMIN_LIST_SELECT }),
    ...(revokeSessions && actingAdminId !== adminId
      ? [prisma.adminRefreshToken.deleteMany({ where: { adminId } })]
      : []),
  ]);

  return { admin, changes: Object.keys(data).map((key) => (key === 'passwordHash' ? 'password' : key)) };
};

const deleteAdmin = async (actingAdminId, adminId) => {
  const target = await findAdminOrThrow(adminId);

  if (actingAdminId === adminId) {
    throw new AppError('You cannot delete your own account', 400);
  }

  if (target.isActive) {
    await assertNotLastActiveAdmin(adminId);
  }

  await prisma.admin.delete({ where: { id: adminId } });
  return target;
};

module.exports = {
  getSetupStatus,
  registerAdmin,
  loginAdmin,
  refreshAdminAccessToken,
  logoutAdmin,
  updateOwnProfile,
  changeOwnPassword,
  listAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
};
