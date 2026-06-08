const jwt = require('jsonwebtoken');
const env = require('../config/env');

const generateAdminAccessToken = (adminId) => {
  return jwt.sign({ adminId }, env.admin.jwt.accessSecret, {
    expiresIn: env.admin.jwt.accessExpiresIn,
  });
};

const generateAdminRefreshToken = (adminId) => {
  return jwt.sign({ adminId }, env.admin.jwt.refreshSecret, {
    expiresIn: env.admin.jwt.refreshExpiresIn,
  });
};

const verifyAdminAccessToken = (token) => {
  return jwt.verify(token, env.admin.jwt.accessSecret);
};

const verifyAdminRefreshToken = (token) => {
  return jwt.verify(token, env.admin.jwt.refreshSecret);
};

const getAdminRefreshTokenExpiry = () => {
  const expiresIn = env.admin.jwt.refreshExpiresIn;
  const match = expiresIn.match(/^(\d+)([dhms])$/);

  if (!match) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

  return new Date(Date.now() + value * multipliers[unit]);
};

module.exports = {
  generateAdminAccessToken,
  generateAdminRefreshToken,
  verifyAdminAccessToken,
  verifyAdminRefreshToken,
  getAdminRefreshTokenExpiry,
};
