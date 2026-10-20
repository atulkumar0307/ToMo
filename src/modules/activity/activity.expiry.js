const prisma = require('../../config/database');
const env = require('../../config/env');
const realtime = require('../../services/realtime');
const chatService = require('../chat/chat.service');
const activityService = require('./activity.service');

const SWEEP_INTERVAL_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

let sweeping = false;

/** Status changes that happen with time: expire unstarted activities, auto-complete running ones. */
const sweepActivities = async () => {
  if (sweeping) return; // a slow run must not overlap the next tick
  sweeping = true;

  try {
    const expired = await activityService.expireUnstartedActivities();
    const completed = await activityService.autoCompleteActivities();

    for (const activity of expired) {
      realtime.activityUpdated(activity, 'expired');
    }
    for (const activity of completed) {
      chatService.postSystemMessage(activity.id, 'The activity is complete — share your highlights!');
      realtime.activityUpdated(activity, 'completed');
    }

    if (expired.length || completed.length) {
      console.log(`Activity sweep: ${expired.length} expired, ${completed.length} auto-completed`);
    }
  } catch (err) {
    console.error('Activity sweep failed:', err.message);
  } finally {
    sweeping = false;
  }
};

/** Deletes rows nothing will ever read again, keeping the database (and its backups) small. */
const cleanup = async () => {
  try {
    const now = new Date();
    const [refresh, adminRefresh, otps, logs] = await Promise.all([
      prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.adminRefreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.otp.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - DAY_MS) } } }),
      env.retention.auditLogDays > 0
        ? prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - env.retention.auditLogDays * DAY_MS) } } })
        : Promise.resolve({ count: 0 }),
    ]);

    const total = refresh.count + adminRefresh.count + otps.count + logs.count;
    if (total) {
      console.log(
        `Cleanup: ${refresh.count} expired sessions, ${adminRefresh.count} admin sessions, ${otps.count} OTPs, ${logs.count} old log entries`
      );
    }
  } catch (err) {
    console.error('Cleanup failed:', err.message);
  }
};

const startActivityExpiryJob = () => {
  sweepActivities();
  const sweepTimer = setInterval(sweepActivities, SWEEP_INTERVAL_MS);

  // First cleanup a minute after boot, then hourly.
  const firstCleanup = setTimeout(cleanup, 60 * 1000);
  const cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);

  return {
    stop: () => {
      clearInterval(sweepTimer);
      clearInterval(cleanupTimer);
      clearTimeout(firstCleanup);
    },
  };
};

module.exports = { startActivityExpiryJob, sweepActivities, cleanup };
