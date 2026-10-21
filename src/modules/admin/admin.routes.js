const { Router } = require('express');
const { authenticateAdmin } = require('../../middleware/adminAuth');
const { uploadProfileImage } = require('../../middleware/upload');
const adminController = require('./admin.controller');
const usersController = require('./admin.users.controller');
const activityController = require('./admin.activity.controller');
const highlightController = require('./admin.highlight.controller');
const { invalidateDashboard } = require('./admin.dashboard.service');
const { rateLimit, clientIp } = require('../../middleware/rateLimit');

const loginLimits = rateLimit([
  {
    name: 'admin-login',
    windowMs: 15 * 60 * 1000,
    max: 10,
    onlyFailures: true,
    key: (req) => `${clientIp(req)}:${String(req.body?.email || '').toLowerCase()}`,
    message: 'Too many sign-in attempts. Try again in 15 minutes.',
  },
]);

const router = Router();

// Public: session endpoints. Register only works while no admin exists.
router.get('/setup-status', adminController.setupStatus);
router.post('/register', loginLimits, adminController.register);
router.post('/login', loginLimits, adminController.login);
router.post('/refresh-token', adminController.refreshToken);
router.post('/logout', adminController.logout);

router.use(authenticateAdmin);

// Any admin write can change the dashboard numbers; drop the 15s cache so badges update at once.
router.use((req, res, next) => {
  if (req.method !== 'GET') res.on('finish', invalidateDashboard);
  next();
});

// Own account
router.get('/me', adminController.getMe);
router.patch('/me', adminController.updateMe);
router.patch('/me/password', adminController.changePassword);

// Admin accounts
router.get('/admins', adminController.listAdmins);
router.post('/admins', adminController.createAdmin);
router.patch('/admins/:adminId', adminController.updateAdmin);
router.delete('/admins/:adminId', adminController.deleteAdmin);

// Dashboard & activity log
router.get('/dashboard', adminController.getDashboard);
router.get('/logs', adminController.listLogs);
router.get('/logs/actions', adminController.getLogActions);

// Configuration (runtime settings)
router.get('/config', adminController.getConfig);
router.patch('/config', adminController.updateConfig);
router.post('/config/reset', adminController.resetConfig);

// Users
router.get('/users', usersController.listUsers);
router.post('/users', uploadProfileImage.single('profileImage'), usersController.createUser);
router.get('/users/:userId', usersController.getUser);
router.delete('/users/:userId', usersController.deleteUser);
router.patch('/users/:userId/block', usersController.blockUser);
router.patch(
  '/users/:userId/profile',
  uploadProfileImage.single('profileImage'),
  usersController.updateUserProfile
);
router.delete('/users/:userId/profile-image', usersController.removeProfileImage);
router.get('/users/:userId/activities', usersController.listUserActivities);
router.get('/users/:userId/highlights', usersController.listUserHighlights);
router.get('/users/:userId/verifications', usersController.listUserVerifications);
router.get('/users/:userId/sessions', usersController.listSessions);
router.delete('/users/:userId/sessions', usersController.revokeSessions);

// Verifications
router.get('/verifications', usersController.listVerifications);
router.get('/verifications/:verificationId', usersController.getVerification);
router.patch('/verifications/:verificationId', usersController.reviewVerification);

// Activities & participants
router.get('/activities', activityController.listActivities);
router.post('/activities', activityController.createActivity);
router.get('/activities/live', activityController.listLiveGroups);
router.get('/activities/:activityId', activityController.getActivity);
router.patch('/activities/:activityId', activityController.updateActivity);
router.patch('/activities/:activityId/status', activityController.changeStatus);
router.delete('/activities/:activityId', activityController.deleteActivity);
router.get('/activities/:activityId/participants', activityController.listParticipants);
router.post('/activities/:activityId/participants', activityController.addParticipant);
router.patch(
  '/activities/:activityId/participants/:userId',
  activityController.changeParticipantStatus
);
router.delete('/activities/:activityId/participants/:userId', activityController.removeParticipant);
router.get('/join-requests', activityController.listJoinRequests);
router.get('/activities/:activityId/chat', activityController.listChat);
router.delete('/activities/:activityId/chat/:messageId', activityController.deleteChatMessage);

// Highlights
router.get('/highlights', highlightController.listHighlights);
router.get('/highlights/:highlightId', highlightController.getHighlight);
router.patch('/highlights/:highlightId', highlightController.updateHighlight);
router.delete('/highlights/:highlightId', highlightController.deleteHighlight);
router.delete('/highlights/:highlightId/media/:mediaId', highlightController.removeMedia);
router.get('/highlights/:highlightId/comments', highlightController.listComments);
router.delete('/highlights/:highlightId/comments/:commentId', highlightController.deleteComment);

module.exports = router;
