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

const intOr = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

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
    maxVerifyAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5,
    resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 10) || 30,
  },
  activity: {
    // How early before its start time a host may start an activity.
    startEarlyMinutes: intOr(process.env.ACTIVITY_START_EARLY_MINUTES, 60),
    // A started activity is completed automatically this long after its end time.
    autoCompleteGraceMinutes: intOr(process.env.ACTIVITY_AUTO_COMPLETE_GRACE_MINUTES, 60),
  },
  chat: {
    // Members can still message for this long after a completed activity ends.
    afterEndHours: intOr(process.env.CHAT_AFTER_END_HOURS, 24),
  },
  retention: {
    auditLogDays: intOr(process.env.AUDIT_LOG_RETENTION_DAYS, 180),
  },
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
