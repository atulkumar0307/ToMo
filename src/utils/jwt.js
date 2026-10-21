const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const { setting } = require('../services/settings');

const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, env.jwt.accessSecret, {
    expiresIn: `${setting('auth.accessTokenMinutes')}m`,
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, env.jwt.refreshSecret, {
    expiresIn: `${setting('auth.refreshTokenDays')}d`,
    jwtid: crypto.randomUUID(),
  });
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, env.jwt.accessSecret);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.jwt.refreshSecret);
};

const getRefreshTokenExpiry = () => new Date(Date.now() + setting('auth.refreshTokenDays') * 24 * 60 * 60 * 1000);

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getRefreshTokenExpiry,
};
