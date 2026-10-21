/**
 * Every value an admin can change at runtime (admin panel → Configuration).
 *
 * - `default` is used until an admin saves a value; where an .env variable
 *   exists it wins over the coded default, so existing deployments keep their
 *   behaviour.
 * - `public: true` values are also served to the app (GET /api/user/config)
 *   so client-side validation always matches the server.
 * - Secrets (database URL, JWT secrets, Firebase key) never live here: they
 *   stay in .env.
 */

const fromEnv = (name, fallback, parse = (v) => parseInt(v, 10)) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parse(raw);
  return parsed === undefined || Number.isNaN(parsed) ? fallback : parsed;
};

/** "15m" / "2h" / "7d" → number in the given unit (minutes or days). */
const durationEnv = (name, fallback, unit) => {
  const raw = process.env[name];
  const match = raw && /^(\d+)([smhd])$/.exec(raw.trim());
  if (!match) return fallback;
  const seconds = Number(match[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  const value = unit === 'minutes' ? seconds / 60 : seconds / 86400;
  return Math.max(1, Math.round(value));
};

const GROUPS = [
  { id: 'app', label: 'App & maintenance', description: 'Switches that affect everyone using the app.' },
  { id: 'auth', label: 'Login & OTP', description: 'How people sign in with their mobile number.' },
  { id: 'activity', label: 'Activities', description: 'Rules for creating, joining and running vibes.' },
  { id: 'chat', label: 'Group chat', description: 'Messaging between the host and approved members.' },
  { id: 'highlight', label: 'Highlights', description: 'Photos and videos shared after a vibe.' },
  { id: 'verification', label: 'Verification', description: 'Selfie check before people can host or join.' },
  { id: 'profile', label: 'Profile', description: 'What people can change on their profile.' },
  { id: 'retention', label: 'Data retention', description: 'How long old records are kept.' },
];

const SETTINGS = [
  // App & maintenance
  {
    key: 'app.maintenanceMode',
    group: 'app',
    type: 'boolean',
    label: 'Maintenance mode',
    description: 'Pauses the app for everyone (the admin panel keeps working). Users see the message below.',
    default: false,
    public: true,
    danger: true,
  },
  {
    key: 'app.maintenanceMessage',
    group: 'app',
    type: 'string',
    label: 'Maintenance message',
    description: 'Shown in the app while maintenance mode is on.',
    default: 'Tomo is getting an upgrade. Please try again in a few minutes.',
    maxLength: 200,
    public: true,
  },
  {
    key: 'app.signupsEnabled',
    group: 'app',
    type: 'boolean',
    label: 'Allow new sign-ups',
    description: 'Off: only existing accounts can log in; new numbers are told sign-ups are paused.',
    default: true,
    public: true,
    danger: true,
  },
  {
    key: 'app.pushEnabled',
    group: 'app',
    type: 'boolean',
    label: 'Real-time push',
    description: 'Silent Firebase pushes for chat and live updates. Off: the app falls back to refreshing on open.',
    default: true,
  },
  {
    key: 'app.minAppVersion',
    group: 'app',
    type: 'string',
    label: 'Minimum app version',
    description: 'Older app versions are asked to update (e.g. 1.0.18). Empty = no minimum.',
    default: '',
    maxLength: 20,
    pattern: '^$|^\\d+(\\.\\d+){0,3}$',
    public: true,
  },

  // Login & OTP
  {
    key: 'auth.devOtp',
    group: 'auth',
    type: 'string',
    label: 'Login code (development)',
    description: 'The fixed 6-digit code accepted for every number until an SMS provider is connected.',
    default: fromEnv('DEV_OTP', '000000', (v) => v),
    pattern: '^\\d{6}$',
    sensitive: true,
  },
  {
    key: 'auth.otpExpiryMinutes',
    group: 'auth',
    type: 'integer',
    label: 'Code expires after',
    unit: 'minutes',
    default: fromEnv('OTP_EXPIRY_MINUTES', 10),
    min: 1,
    max: 60,
    public: true,
  },
  {
    key: 'auth.otpMaxAttempts',
    group: 'auth',
    type: 'integer',
    label: 'Wrong guesses per code',
    description: 'After this many wrong codes the code is burned and a new one is needed.',
    default: fromEnv('OTP_MAX_ATTEMPTS', 5),
    min: 1,
    max: 20,
  },
  {
    key: 'auth.otpResendCooldownSeconds',
    group: 'auth',
    type: 'integer',
    label: 'Resend cooldown',
    unit: 'seconds',
    default: fromEnv('OTP_RESEND_COOLDOWN_SECONDS', 30),
    min: 0,
    max: 600,
    public: true,
  },
  {
    key: 'auth.otpPerHourPerNumber',
    group: 'auth',
    type: 'integer',
    label: 'Codes per number per hour',
    default: 6,
    min: 1,
    max: 100,
  },
  {
    key: 'auth.accessTokenMinutes',
    group: 'auth',
    type: 'integer',
    label: 'Session token lifetime',
    description: 'Short-lived access token; the app renews it automatically. Applies to new tokens.',
    unit: 'minutes',
    default: durationEnv('JWT_ACCESS_EXPIRES_IN', 15, 'minutes'),
    min: 5,
    max: 24 * 60,
  },
  {
    key: 'auth.refreshTokenDays',
    group: 'auth',
    type: 'integer',
    label: 'Stay signed in for',
    description: 'How long a login lasts without opening the app. Applies to new logins.',
    unit: 'days',
    default: durationEnv('JWT_REFRESH_EXPIRES_IN', 7, 'days'),
    min: 1,
    max: 365,
  },

  // Activities
  {
    key: 'activity.minLeadMinutes',
    group: 'activity',
    type: 'integer',
    label: 'Earliest start',
    description: 'A new vibe must start at least this long from now. Discovery also hides vibes starting sooner.',
    unit: 'minutes',
    default: 30,
    min: 0,
    max: 24 * 60,
    public: true,
  },
  {
    key: 'activity.maxStartWindowHours',
    group: 'activity',
    type: 'integer',
    label: 'Latest start',
    description: 'A new vibe must start within this many hours.',
    unit: 'hours',
    default: 24,
    min: 1,
    max: 24 * 30,
    public: true,
  },
  {
    key: 'activity.minDurationMinutes',
    group: 'activity',
    type: 'integer',
    label: 'Shortest duration',
    unit: 'minutes',
    default: 30,
    min: 5,
    max: 24 * 60,
    public: true,
  },
  {
    key: 'activity.maxDurationHours',
    group: 'activity',
    type: 'integer',
    label: 'Longest duration',
    unit: 'hours',
    default: 8,
    min: 1,
    max: 72,
    public: true,
  },
  {
    key: 'activity.minParticipants',
    group: 'activity',
    type: 'integer',
    label: 'Smallest group',
    description: 'Host included. 2 = one-on-one.',
    unit: 'people',
    default: 2,
    min: 2,
    max: 100,
    public: true,
  },
  {
    key: 'activity.maxParticipants',
    group: 'activity',
    type: 'integer',
    label: 'Largest group',
    description: 'Host included.',
    unit: 'people',
    default: 20,
    min: 2,
    max: 500,
    public: true,
  },
  {
    key: 'activity.startEarlyMinutes',
    group: 'activity',
    type: 'integer',
    label: 'Host can start early by',
    unit: 'minutes',
    default: fromEnv('ACTIVITY_START_EARLY_MINUTES', 60),
    min: 0,
    max: 24 * 60,
    public: true,
  },
  {
    key: 'activity.autoCompleteGraceMinutes',
    group: 'activity',
    type: 'integer',
    label: 'Auto-complete after end',
    description: 'A started vibe the host never completes is completed automatically this long after its end time.',
    unit: 'minutes',
    default: fromEnv('ACTIVITY_AUTO_COMPLETE_GRACE_MINUTES', 60),
    min: 0,
    max: 7 * 24 * 60,
  },

  // Chat
  {
    key: 'chat.afterEndHours',
    group: 'chat',
    type: 'integer',
    label: 'Chat stays open after the end',
    unit: 'hours',
    default: fromEnv('CHAT_AFTER_END_HOURS', 24),
    min: 0,
    max: 24 * 30,
    public: true,
  },
  {
    key: 'chat.maxMessageLength',
    group: 'chat',
    type: 'integer',
    label: 'Longest message',
    unit: 'characters',
    default: 1000,
    min: 50,
    max: 5000,
    public: true,
  },
  {
    key: 'chat.messagesPerMinute',
    group: 'chat',
    type: 'integer',
    label: 'Messages per person per minute',
    description: 'Anti-spam limit.',
    default: 30,
    min: 1,
    max: 300,
  },

  // Highlights
  {
    key: 'highlight.maxMedia',
    group: 'highlight',
    type: 'integer',
    label: 'Photos/videos per highlight',
    default: 7,
    min: 1,
    max: 20,
    public: true,
  },
  {
    key: 'highlight.maxVideoSeconds',
    group: 'highlight',
    type: 'integer',
    label: 'Longest video',
    unit: 'seconds',
    default: 40,
    min: 5,
    max: 300,
    public: true,
  },
  {
    key: 'highlight.maxImageMb',
    group: 'highlight',
    type: 'integer',
    label: 'Largest photo',
    unit: 'MB',
    default: 5,
    min: 1,
    max: 20,
    public: true,
  },
  {
    key: 'highlight.maxVideoMb',
    group: 'highlight',
    type: 'integer',
    label: 'Largest video',
    unit: 'MB',
    default: 50,
    min: 5,
    max: 200,
    public: true,
  },

  {
    key: 'highlight.commentMaxLength',
    group: 'highlight',
    type: 'integer',
    label: 'Longest comment',
    unit: 'characters',
    default: 500,
    min: 20,
    max: 2000,
    public: true,
  },

  // Verification
  {
    key: 'verification.minImages',
    group: 'verification',
    type: 'integer',
    label: 'Fewest selfie photos',
    description: 'The app captures 4 poses, so this can be at most 4.',
    default: 3,
    min: 1,
    max: 4,
    public: true,
  },
  {
    key: 'verification.maxImages',
    group: 'verification',
    type: 'integer',
    label: 'Most selfie photos',
    description: 'At least 4 — the app always sends 4 poses.',
    default: 5,
    min: 4,
    max: 10,
    public: true,
  },

  // Profile
  {
    key: 'profile.nameDobCooldownDays',
    group: 'profile',
    type: 'integer',
    label: 'Name / birth date change cooldown',
    description: 'Verified users can change their name or date of birth once per this many days.',
    unit: 'days',
    default: 14,
    min: 0,
    max: 365,
    public: true,
  },

  // Retention
  {
    key: 'retention.auditLogDays',
    group: 'retention',
    type: 'integer',
    label: 'Keep the activity log for',
    description: '0 keeps it forever.',
    unit: 'days',
    default: fromEnv('AUDIT_LOG_RETENTION_DAYS', 180),
    min: 0,
    max: 3650,
  },
  {
    key: 'retention.notificationDays',
    group: 'retention',
    type: 'integer',
    label: 'Keep notifications for',
    unit: 'days',
    default: 60,
    min: 1,
    max: 3650,
  },
  {
    key: 'retention.otpHours',
    group: 'retention',
    type: 'integer',
    label: 'Keep used login codes for',
    unit: 'hours',
    default: 24,
    min: 1,
    max: 24 * 30,
  },
];

/** Cross-field rules checked after a save. Return an error message or null. */
const CONSISTENCY_RULES = [
  (v) =>
    v['activity.minParticipants'] > v['activity.maxParticipants'] ? 'Smallest group cannot be larger than the largest group' : null,
  (v) =>
    v['verification.minImages'] > v['verification.maxImages'] ? 'Fewest selfie photos cannot be more than the most' : null,
  (v) =>
    v['activity.minDurationMinutes'] > v['activity.maxDurationHours'] * 60
      ? 'Shortest duration cannot be longer than the longest duration'
      : null,
  (v) =>
    v['activity.minLeadMinutes'] >= v['activity.maxStartWindowHours'] * 60
      ? 'Earliest start must be before the latest start'
      : null,
];

module.exports = { GROUPS, SETTINGS, CONSISTENCY_RULES };
