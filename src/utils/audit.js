const { ActorType } = require('@prisma/client');
const prisma = require('../config/database');

const USER_AGENT_MAX = 300;

const getRequestMeta = (req) => {
  if (!req) {
    return { ipAddress: null, userAgent: null };
  }

  const forwarded = req.headers?.['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : null) || req.ip || null;
  const userAgent = req.headers?.['user-agent'];

  return {
    ipAddress: ip ? ip.trim() : null,
    userAgent: userAgent ? String(userAgent).slice(0, USER_AGENT_MAX) : null,
  };
};

const userLabel = (user) => {
  if (!user) {
    return 'Unknown user';
  }

  if (user.fullName && user.fullName.trim()) {
    return user.fullName.trim();
  }

  if (user.mobile) {
    return `+91 ${user.mobile}`;
  }

  return user.uid ? `User #${user.uid}` : 'Unknown user';
};

const adminLabel = (admin) => admin?.fullName || admin?.email || 'Admin';

const quote = (text) => (text ? `"${text}"` : 'an activity');

const describeActivity = (activity) => {
  if (!activity) {
    return 'an activity';
  }

  const code = activity.activityCode || (activity.aid ? `ACT-${activity.aid}` : null);
  return code ? `${quote(activity.title)} (${code})` : quote(activity.title);
};

/** Writes one entry. Never throws: a logging failure must not fail the request. */
const record = (entry) => {
  return prisma.auditLog
    .create({ data: entry })
    .catch((err) => console.error('Audit log write failed:', err.message));
};

const logUserAction = (req, action, options = {}) => {
  const actor = options.user || req?.user || null;

  return record({
    actorType: ActorType.USER,
    userId: actor?.id || options.userId || null,
    actorLabel: options.actorLabel || userLabel(actor),
    action,
    entityType: options.entityType || null,
    entityId: options.entityId || null,
    targetUserId: options.targetUserId || null,
    message: options.message || null,
    metadata: options.metadata ?? undefined,
    ...getRequestMeta(req),
  });
};

const logAdminAction = (req, action, options = {}) => {
  const admin = options.admin || req?.admin || null;

  return record({
    actorType: ActorType.ADMIN,
    adminId: admin?.id || null,
    actorLabel: adminLabel(admin),
    action,
    entityType: options.entityType || null,
    entityId: options.entityId || null,
    targetUserId: options.targetUserId || null,
    message: options.message || null,
    metadata: options.metadata ?? undefined,
    ...getRequestMeta(req),
  });
};

const logSystemActions = (entries) => {
  if (!entries.length) {
    return Promise.resolve();
  }

  return prisma.auditLog
    .createMany({
      data: entries.map((entry) => ({
        actorType: ActorType.SYSTEM,
        actorLabel: 'System',
        action: entry.action,
        entityType: entry.entityType || null,
        entityId: entry.entityId || null,
        targetUserId: entry.targetUserId || null,
        message: entry.message || null,
        metadata: entry.metadata ?? undefined,
      })),
    })
    .catch((err) => console.error('Audit log write failed:', err.message));
};

module.exports = {
  logUserAction,
  logAdminAction,
  logSystemActions,
  userLabel,
  adminLabel,
  describeActivity,
  quote,
};
