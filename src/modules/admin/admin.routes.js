const { Router } = require('express');
const { authenticateAdmin } = require('../../middleware/adminAuth');
const { uploadProfileImage } = require('../../middleware/upload');
const adminController = require('./admin.controller');

const router = Router();

router.post('/register', adminController.register);
router.post('/login', adminController.login);
router.post('/refresh-token', adminController.refreshToken);
router.post('/logout', adminController.logout);

router.use(authenticateAdmin);

router.get('/users', adminController.listUsers);
router.patch('/users/:userId/block', adminController.blockUser);
router.patch(
  '/users/:userId/profile',
  uploadProfileImage.single('profileImage'),
  adminController.updateUserProfile
);
router.patch(
  '/verification-videos/:verificationId',
  adminController.reviewVerification
);

module.exports = router;
