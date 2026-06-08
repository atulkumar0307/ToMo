const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { uploadVerificationVideo } = require('../../middleware/upload');
const verificationController = require('./verification.controller');

const router = Router();

router.use(authenticate);

router.post(
  '/video',
  uploadVerificationVideo.single('verificationVideo'),
  verificationController.uploadVideo
);
router.get('/video', verificationController.getStatus);

module.exports = router;
