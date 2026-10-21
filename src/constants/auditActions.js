/**
 * Every event written to the audit log. The admin panel reads this catalog
 * (GET /api/admin/logs/actions) to label and filter the Recent Activity feed.
 */
const AUDIT_ACTIONS = {
  // User — auth
  AUTH_OTP_SENT: 'AUTH_OTP_SENT',
  AUTH_SIGNUP: 'AUTH_SIGNUP',
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',

  // User — profile & verification
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  VERIFICATION_SUBMITTED: 'VERIFICATION_SUBMITTED',

  // User — activities
  ACTIVITY_CREATED: 'ACTIVITY_CREATED',
  ACTIVITY_UPDATED: 'ACTIVITY_UPDATED',
  ACTIVITY_DELETED: 'ACTIVITY_DELETED',
  ACTIVITY_CANCELLED: 'ACTIVITY_CANCELLED',
  ACTIVITY_STARTED: 'ACTIVITY_STARTED',
  ACTIVITY_COMPLETED: 'ACTIVITY_COMPLETED',
  ACTIVITY_EXPIRED: 'ACTIVITY_EXPIRED',

  // User — participants
  JOIN_REQUESTED: 'JOIN_REQUESTED',
  JOIN_WITHDRAWN: 'JOIN_WITHDRAWN',
  ACTIVITY_LEFT: 'ACTIVITY_LEFT',
  JOIN_APPROVED: 'JOIN_APPROVED',
  JOIN_REJECTED: 'JOIN_REJECTED',

  // User — highlights
  HIGHLIGHT_CREATED: 'HIGHLIGHT_CREATED',
  HIGHLIGHT_UPDATED: 'HIGHLIGHT_UPDATED',
  HIGHLIGHT_DELETED: 'HIGHLIGHT_DELETED',
  HIGHLIGHT_LIKED: 'HIGHLIGHT_LIKED',
  HIGHLIGHT_UNLIKED: 'HIGHLIGHT_UNLIKED',
  HIGHLIGHT_COMMENTED: 'HIGHLIGHT_COMMENTED',
  HIGHLIGHT_COMMENT_DELETED: 'HIGHLIGHT_COMMENT_DELETED',

  // Admin — session & admin accounts
  ADMIN_LOGIN: 'ADMIN_LOGIN',
  ADMIN_LOGOUT: 'ADMIN_LOGOUT',
  ADMIN_REGISTERED: 'ADMIN_REGISTERED',
  ADMIN_CREATED: 'ADMIN_CREATED',
  ADMIN_UPDATED: 'ADMIN_UPDATED',
  ADMIN_DELETED: 'ADMIN_DELETED',
  ADMIN_PASSWORD_CHANGED: 'ADMIN_PASSWORD_CHANGED',

  // Admin — users
  ADMIN_USER_CREATED: 'ADMIN_USER_CREATED',
  ADMIN_USER_UPDATED: 'ADMIN_USER_UPDATED',
  ADMIN_USER_BLOCKED: 'ADMIN_USER_BLOCKED',
  ADMIN_USER_UNBLOCKED: 'ADMIN_USER_UNBLOCKED',
  ADMIN_USER_DELETED: 'ADMIN_USER_DELETED',
  ADMIN_USER_PHOTO_REMOVED: 'ADMIN_USER_PHOTO_REMOVED',
  ADMIN_USER_SESSIONS_REVOKED: 'ADMIN_USER_SESSIONS_REVOKED',

  // Admin — verification
  ADMIN_VERIFICATION_APPROVED: 'ADMIN_VERIFICATION_APPROVED',
  ADMIN_VERIFICATION_REJECTED: 'ADMIN_VERIFICATION_REJECTED',

  // Admin — activities & participants
  ADMIN_ACTIVITY_CREATED: 'ADMIN_ACTIVITY_CREATED',
  ADMIN_ACTIVITY_UPDATED: 'ADMIN_ACTIVITY_UPDATED',
  ADMIN_ACTIVITY_STATUS_CHANGED: 'ADMIN_ACTIVITY_STATUS_CHANGED',
  ADMIN_ACTIVITY_DELETED: 'ADMIN_ACTIVITY_DELETED',
  ADMIN_PARTICIPANT_ADDED: 'ADMIN_PARTICIPANT_ADDED',
  ADMIN_PARTICIPANT_STATUS_CHANGED: 'ADMIN_PARTICIPANT_STATUS_CHANGED',
  ADMIN_PARTICIPANT_REMOVED: 'ADMIN_PARTICIPANT_REMOVED',

  // Admin — highlights
  ADMIN_HIGHLIGHT_UPDATED: 'ADMIN_HIGHLIGHT_UPDATED',
  ADMIN_HIGHLIGHT_DELETED: 'ADMIN_HIGHLIGHT_DELETED',
  ADMIN_HIGHLIGHT_MEDIA_REMOVED: 'ADMIN_HIGHLIGHT_MEDIA_REMOVED',
  ADMIN_HIGHLIGHT_COMMENT_DELETED: 'ADMIN_HIGHLIGHT_COMMENT_DELETED',

  // Admin — chat moderation
  ADMIN_CHAT_MESSAGE_DELETED: 'ADMIN_CHAT_MESSAGE_DELETED',

  // Admin — configuration
  ADMIN_CONFIG_UPDATED: 'ADMIN_CONFIG_UPDATED',
};

const ENTITY_TYPES = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  ACTIVITY: 'ACTIVITY',
  PARTICIPANT: 'PARTICIPANT',
  VERIFICATION: 'VERIFICATION',
  HIGHLIGHT: 'HIGHLIGHT',
};

/** Display label + group for each action, served to the admin panel. */
const AUDIT_ACTION_CATALOG = [
  { action: AUDIT_ACTIONS.AUTH_OTP_SENT, label: 'OTP requested', group: 'Auth' },
  { action: AUDIT_ACTIONS.AUTH_SIGNUP, label: 'Signed up', group: 'Auth' },
  { action: AUDIT_ACTIONS.AUTH_LOGIN, label: 'Logged in', group: 'Auth' },
  { action: AUDIT_ACTIONS.AUTH_LOGOUT, label: 'Logged out', group: 'Auth' },
  { action: AUDIT_ACTIONS.PROFILE_UPDATED, label: 'Profile updated', group: 'Profile' },
  { action: AUDIT_ACTIONS.VERIFICATION_SUBMITTED, label: 'Verification submitted', group: 'Verification' },
  { action: AUDIT_ACTIONS.ACTIVITY_CREATED, label: 'Activity created', group: 'Activity' },
  { action: AUDIT_ACTIONS.ACTIVITY_UPDATED, label: 'Activity edited', group: 'Activity' },
  { action: AUDIT_ACTIONS.ACTIVITY_DELETED, label: 'Activity deleted', group: 'Activity' },
  { action: AUDIT_ACTIONS.ACTIVITY_CANCELLED, label: 'Activity cancelled', group: 'Activity' },
  { action: AUDIT_ACTIONS.ACTIVITY_STARTED, label: 'Activity started', group: 'Activity' },
  { action: AUDIT_ACTIONS.ACTIVITY_COMPLETED, label: 'Activity completed', group: 'Activity' },
  { action: AUDIT_ACTIONS.ACTIVITY_EXPIRED, label: 'Activity expired', group: 'Activity' },
  { action: AUDIT_ACTIONS.JOIN_REQUESTED, label: 'Join requested', group: 'Participants' },
  { action: AUDIT_ACTIONS.JOIN_WITHDRAWN, label: 'Join request withdrawn', group: 'Participants' },
  { action: AUDIT_ACTIONS.ACTIVITY_LEFT, label: 'Left activity', group: 'Participants' },
  { action: AUDIT_ACTIONS.JOIN_APPROVED, label: 'Join request approved', group: 'Participants' },
  { action: AUDIT_ACTIONS.JOIN_REJECTED, label: 'Join request rejected', group: 'Participants' },
  { action: AUDIT_ACTIONS.HIGHLIGHT_CREATED, label: 'Highlight posted', group: 'Highlights' },
  { action: AUDIT_ACTIONS.HIGHLIGHT_UPDATED, label: 'Highlight edited', group: 'Highlights' },
  { action: AUDIT_ACTIONS.HIGHLIGHT_DELETED, label: 'Highlight deleted', group: 'Highlights' },
  { action: AUDIT_ACTIONS.HIGHLIGHT_LIKED, label: 'Highlight liked', group: 'Highlights' },
  { action: AUDIT_ACTIONS.HIGHLIGHT_UNLIKED, label: 'Highlight unliked', group: 'Highlights' },
  { action: AUDIT_ACTIONS.HIGHLIGHT_COMMENTED, label: 'Comment posted', group: 'Highlights' },
  { action: AUDIT_ACTIONS.HIGHLIGHT_COMMENT_DELETED, label: 'Comment deleted', group: 'Highlights' },
  { action: AUDIT_ACTIONS.ADMIN_LOGIN, label: 'Admin logged in', group: 'Admin' },
  { action: AUDIT_ACTIONS.ADMIN_LOGOUT, label: 'Admin logged out', group: 'Admin' },
  { action: AUDIT_ACTIONS.ADMIN_REGISTERED, label: 'First admin registered', group: 'Admin' },
  { action: AUDIT_ACTIONS.ADMIN_CREATED, label: 'Admin created', group: 'Admin' },
  { action: AUDIT_ACTIONS.ADMIN_UPDATED, label: 'Admin updated', group: 'Admin' },
  { action: AUDIT_ACTIONS.ADMIN_DELETED, label: 'Admin deleted', group: 'Admin' },
  { action: AUDIT_ACTIONS.ADMIN_PASSWORD_CHANGED, label: 'Admin password changed', group: 'Admin' },
  { action: AUDIT_ACTIONS.ADMIN_USER_CREATED, label: 'User created by admin', group: 'Admin · Users' },
  { action: AUDIT_ACTIONS.ADMIN_USER_UPDATED, label: 'User edited by admin', group: 'Admin · Users' },
  { action: AUDIT_ACTIONS.ADMIN_USER_BLOCKED, label: 'User blocked', group: 'Admin · Users' },
  { action: AUDIT_ACTIONS.ADMIN_USER_UNBLOCKED, label: 'User unblocked', group: 'Admin · Users' },
  { action: AUDIT_ACTIONS.ADMIN_USER_DELETED, label: 'User deleted', group: 'Admin · Users' },
  { action: AUDIT_ACTIONS.ADMIN_USER_PHOTO_REMOVED, label: 'User photo removed', group: 'Admin · Users' },
  { action: AUDIT_ACTIONS.ADMIN_USER_SESSIONS_REVOKED, label: 'User sessions revoked', group: 'Admin · Users' },
  { action: AUDIT_ACTIONS.ADMIN_VERIFICATION_APPROVED, label: 'Verification approved', group: 'Admin · Verification' },
  { action: AUDIT_ACTIONS.ADMIN_VERIFICATION_REJECTED, label: 'Verification rejected', group: 'Admin · Verification' },
  { action: AUDIT_ACTIONS.ADMIN_ACTIVITY_CREATED, label: 'Activity created by admin', group: 'Admin · Activities' },
  { action: AUDIT_ACTIONS.ADMIN_ACTIVITY_UPDATED, label: 'Activity edited by admin', group: 'Admin · Activities' },
  { action: AUDIT_ACTIONS.ADMIN_ACTIVITY_STATUS_CHANGED, label: 'Activity status changed', group: 'Admin · Activities' },
  { action: AUDIT_ACTIONS.ADMIN_ACTIVITY_DELETED, label: 'Activity deleted by admin', group: 'Admin · Activities' },
  { action: AUDIT_ACTIONS.ADMIN_PARTICIPANT_ADDED, label: 'Participant added', group: 'Admin · Activities' },
  { action: AUDIT_ACTIONS.ADMIN_PARTICIPANT_STATUS_CHANGED, label: 'Participant status changed', group: 'Admin · Activities' },
  { action: AUDIT_ACTIONS.ADMIN_PARTICIPANT_REMOVED, label: 'Participant removed', group: 'Admin · Activities' },
  { action: AUDIT_ACTIONS.ADMIN_HIGHLIGHT_UPDATED, label: 'Highlight edited by admin', group: 'Admin · Highlights' },
  { action: AUDIT_ACTIONS.ADMIN_HIGHLIGHT_DELETED, label: 'Highlight deleted by admin', group: 'Admin · Highlights' },
  { action: AUDIT_ACTIONS.ADMIN_HIGHLIGHT_MEDIA_REMOVED, label: 'Highlight media removed', group: 'Admin · Highlights' },
  { action: AUDIT_ACTIONS.ADMIN_HIGHLIGHT_COMMENT_DELETED, label: 'Comment removed by admin', group: 'Admin · Highlights' },
  { action: AUDIT_ACTIONS.ADMIN_CHAT_MESSAGE_DELETED, label: 'Chat message removed', group: 'Admin · Chat' },
  { action: AUDIT_ACTIONS.ADMIN_CONFIG_UPDATED, label: 'Configuration changed', group: 'Admin' },
];

module.exports = {
  AUDIT_ACTIONS,
  ENTITY_TYPES,
  AUDIT_ACTION_CATALOG,
};
