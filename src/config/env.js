require('dotenv').config();

const required = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ADMIN_ACCESS_SECRET',
  'JWT_ADMIN_REFRESH_SECRET',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10,
    devOtp: process.env.DEV_OTP || '000000',
  },
  admin: {
    jwt: {
      accessSecret: process.env.JWT_ADMIN_ACCESS_SECRET,
      refreshSecret: process.env.JWT_ADMIN_REFRESH_SECRET,
      accessExpiresIn: process.env.JWT_ADMIN_ACCESS_EXPIRES_IN || '15m',
      refreshExpiresIn: process.env.JWT_ADMIN_REFRESH_EXPIRES_IN || '7d',
    },
  },
};

module.exports = env;
