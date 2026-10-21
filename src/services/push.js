const fs = require('fs');
const env = require('../config/env');
const prisma = require('../config/database');
const { setting } = require('./settings');

/**
 * Silent (data-only) Firebase Cloud Messaging.
 *
 * The app receives every message in its own handler and decides what to do:
 * refresh a screen, insert a chat message, or show a local notification.
 * Without a service account configured, every call is a no-op.
 */

const MAX_TOKENS_PER_BATCH = 500; // FCM multicast limit
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

let messaging = null;
let initialised = false;

const loadServiceAccount = () => {
  if (env.firebase.serviceAccount) {
    const raw = env.firebase.serviceAccount.trim();
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(json);
  }
  if (env.firebase.serviceAccountPath && fs.existsSync(env.firebase.serviceAccountPath)) {
    return JSON.parse(fs.readFileSync(env.firebase.serviceAccountPath, 'utf8'));
  }
  return null;
};

const getMessaging = () => {
  if (initialised) return messaging;
  initialised = true;

  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      console.log('Push notifications disabled: set FIREBASE_SERVICE_ACCOUNT to enable them.');
      return null;
    }
    // Loaded lazily so the SDK costs nothing when push is off.
    const admin = require('firebase-admin');
    const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    messaging = admin.messaging(app);
    console.log('Push notifications enabled (Firebase project %s).', serviceAccount.project_id);
  } catch (err) {
    console.error('Push notifications disabled, invalid Firebase credentials:', err.message);
    messaging = null;
  }

  return messaging;
};

const isPushEnabled = () => Boolean(getMessaging());

/** FCM data values must be strings; drop null/undefined and cap long text. */
const toData = (data) =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value).slice(0, 900)])
  );

/**
 * Sends a data-only message to every device of the given users.
 * options.urgent: wake the device now (chat). Otherwise delivered at normal priority (state sync).
 * options.collapseKey: newer messages with the same key replace older undelivered ones.
 */
const sendToUsers = async (userIds, data, options = {}) => {
  const fcm = getMessaging();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!fcm || !ids.length) return { sent: 0 };

  const devices = await prisma.deviceToken.findMany({
    where: { userId: { in: ids } },
    select: { token: true },
  });
  if (!devices.length) return { sent: 0 };

  const payload = toData({ ...data, sentAt: new Date().toISOString() });
  const tokens = devices.map((device) => device.token);
  const dead = [];
  let sent = 0;

  for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_BATCH) {
    const batch = tokens.slice(i, i + MAX_TOKENS_PER_BATCH);
    const response = await fcm.sendEachForMulticast({
      tokens: batch,
      data: payload,
      android: {
        priority: options.urgent ? 'high' : 'normal',
        ...(options.collapseKey ? { collapseKey: options.collapseKey } : {}),
        ttl: (options.ttlSeconds ?? 24 * 60 * 60) * 1000,
      },
      apns: {
        headers: {
          'apns-push-type': 'background',
          'apns-priority': '5',
          ...(options.collapseKey ? { 'apns-collapse-id': options.collapseKey.slice(0, 64) } : {}),
        },
        payload: { aps: { 'content-available': 1 } },
      },
    });

    sent += response.successCount;
    response.responses.forEach((result, index) => {
      if (!result.success && DEAD_TOKEN_CODES.has(result.error?.code)) dead.push(batch[index]);
    });
  }

  if (dead.length) {
    await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
  }

  return { sent, removed: dead.length };
};

/** Fire-and-forget wrapper: push problems never affect the API response. */
const notifyUsers = (userIds, data, options) => {
  if (!setting('app.pushEnabled') || !getMessaging()) return;
  setImmediate(() => {
    sendToUsers(userIds, data, options).catch((err) => console.error('Push send failed:', err.message));
  });
};

module.exports = { notifyUsers, sendToUsers, isPushEnabled };
