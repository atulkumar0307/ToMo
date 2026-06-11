const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { uploadVerificationImages } = require('../../middleware/upload');
const { MAX_IMAGES } = require('./verification.constants');
const verificationController = require('./verification.controller');

const router = Router();

router.use(authenticate);

router.post(
  '/',
  uploadVerificationImages.array('verificationImages', MAX_IMAGES),
  verificationController.uploadImages
);
router.get('/', verificationController.getStatus);

module.exports = router;
