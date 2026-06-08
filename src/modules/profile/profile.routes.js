const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { uploadProfileImage } = require('../../middleware/upload');
const profileController = require('./profile.controller');

const router = Router();

router.use(authenticate);

router.get('/', profileController.getProfile);
router.patch(
  '/',
  uploadProfileImage.single('profileImage'),
  profileController.updateProfile
);

module.exports = router;
