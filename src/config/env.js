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
  },
  // OTP, activity, chat, highlight and retention rules are runtime settings:
  // see src/config/settings.registry.js (admin panel → Configuration).
  firebase: {
    // Service account JSON (raw or base64). Empty disables push notifications.
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT || '',
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  },
  // Signs short-lived URLs for private uploads (verification photos).
  mediaSigningSecret: process.env.MEDIA_SIGNING_SECRET || process.env.JWT_ADMIN_ACCESS_SECRET,
  // Express "trust proxy" (set when running behind nginx/Render so req.ip is the client IP).
  trustProxy: process.env.TRUST_PROXY || '',
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
