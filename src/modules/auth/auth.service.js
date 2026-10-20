const prisma = require('../../config/database');
const env = require('../../config/env');
const { AppError } = require('../../utils/errors');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiry,
} = require('../../utils/jwt');
const { USER_SELECT, VERIFY_OTP_USER_SELECT } = require('../../constants/userSelect');
const { getNextUserUid } = require('../../utils/userUid');
const { OTP_ACTIONS, TOKEN_ISSUING_ACTIONS } = require('./auth.constants');
const { normalizeAction } = require('./auth.validation');

const assertUserNotBlocked = (user) => {
  if (user.isBlocked) {
    throw new AppError('Your account has been blocked. Please contact support.', 403);
  }
};

const sendOtp = async (mobile, action) => {
  const normalizedMobile = mobile.trim();
  const normalizedAction = normalizeAction(action);

  const existingUser = await prisma.user.findUnique({
    where: { mobile: normalizedMobile },
    select: { id: true, uid: true, mobile: true, fullName: true, isBlocked: true },
  });

  if (existingUser) {
    assertUserNotBlocked(existingUser);
  }

  const expiresAt = new Date(Date.now() + env.otp.expiryMinutes * 60 * 1000);

  await prisma.otp.create({
    data: {
      mobile: normalizedMobile,
      otp: env.otp.devOtp,
      action: normalizedAction,
      expiresAt,
    },
  });

  return {
    result: { action: normalizedAction },
    user: existingUser || null,
    mobile: normalizedMobile,
  };
};

const findValidOtp = async (mobile, action, otp) => {
  const now = new Date();
  const normalizedMobile = mobile.trim();
  const normalizedAction = normalizeAction(action);
  const normalizedOtp = otp.trim();

  const record = await prisma.otp.findFirst({
    where: {
      mobile: normalizedMobile,
      action: normalizedAction,
      isUsed: false,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    throw new AppError('Invalid or expired OTP', 400);
  }

  if (record.otp !== normalizedOtp) {
    // Each code allows a few guesses; after that it is burned and a new one is needed.
    const attempts = record.attempts + 1;
    const exhausted = attempts >= env.otp.maxVerifyAttempts;
    await prisma.otp.update({
      where: { id: record.id },
      data: { attempts, ...(exhausted ? { isUsed: true } : {}) },
    });
    throw new AppError(
      exhausted ? 'Too many wrong attempts. Please request a new code.' : 'Invalid or expired OTP',
      exhausted ? 429 : 400
    );
  }

  return record;
};

const resolveUserAfterLogin = async (mobile) => {
  const normalizedMobile = mobile.trim();

  const existingUser = await prisma.user.findUnique({
    where: { mobile: normalizedMobile },
    select: VERIFY_OTP_USER_SELECT,
  });

  if (existingUser) {
    assertUserNotBlocked(existingUser);
    return { user: existingUser, isNewUser: false };
  }

  const user = await prisma.$transaction(async (tx) => {
    const uid = await getNextUserUid(tx);

    return tx.user.create({
      data: {
        uid,
        mobile: normalizedMobile,
        isProfileCompleted: false,
        isProfileVerified: false,
      },
      select: VERIFY_OTP_USER_SELECT,
    });
  });

  return { user, isNewUser: true };
};

const issueSessionTokens = async (user) => {
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiry(),
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      uid: user.uid,
      isBlocked: user.isBlocked,
      isProfileCompleted: user.isProfileCompleted,
      isProfileVerified: user.isProfileVerified,
    },
  };
};

const verifyOtp = async (mobile, otp, action) => {
  const normalizedAction = normalizeAction(action);
  const record = await findValidOtp(mobile, normalizedAction, otp);

  await prisma.otp.update({
    where: { id: record.id },
    data: { isUsed: true },
  });

  if (!TOKEN_ISSUING_ACTIONS.includes(normalizedAction)) {
    throw new AppError('OTP action not supported for verification', 400);
  }

  if (normalizedAction === OTP_ACTIONS.LOGIN) {
    const { user, isNewUser } = await resolveUserAfterLogin(mobile);
    const session = await issueSessionTokens(user);
    return { session, user, isNewUser };
  }

  throw new AppError('OTP action not supported for verification', 400);
};

const getCurrentUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_SELECT,
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

const refreshAccessToken = async (refreshToken) => {
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: { select: USER_SELECT } },
  });

  if (!storedToken) {
    throw new AppError('Invalid refresh token', 401);
  }

  if (storedToken.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    throw new AppError('Refresh token expired', 401);
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    throw new AppError('Invalid refresh token', 401);
  }

  if (decoded.userId !== storedToken.userId) {
    throw new AppError('Invalid refresh token', 401);
  }

  assertUserNotBlocked(storedToken.user);

  const accessToken = generateAccessToken(storedToken.userId);

  return { accessToken };
};

const logout = async (refreshToken, deviceToken) => {
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    select: {
      id: true,
      user: { select: { id: true, uid: true, mobile: true, fullName: true } },
    },
  });

  if (!storedToken) {
    throw new AppError('Invalid refresh token', 400);
  }

  await prisma.refreshToken.deleteMany({ where: { id: storedToken.id } });

  // Stop pushes to this phone for this user.
  if (typeof deviceToken === 'string' && deviceToken) {
    await prisma.deviceToken.deleteMany({ where: { token: deviceToken, userId: storedToken.user.id } });
  }

  return { loggedOut: true, user: storedToken.user };
};

module.exports = {
  sendOtp,
  verifyOtp,
  getCurrentUser,
  refreshAccessToken,
  logout,
};
