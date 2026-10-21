const { setting } = require('../../services/settings');

/** Upload hard ceiling; the live limits come from admin → Configuration. */
const MAX_IMAGES_CEILING = 10;
const verificationLimits = () => ({
  minImages: setting('verification.minImages'),
  maxImages: setting('verification.maxImages'),
});

const VERIFICATION_IMAGE_SELECT = {
  id: true,
  imagePath: true,
  sortOrder: true,
  createdAt: true,
};

const VERIFICATION_SUBMISSION_SELECT = {
  id: true,
  status: true,
  remark: true,
  createdAt: true,
  updatedAt: true,
  images: {
    orderBy: { sortOrder: 'asc' },
    select: VERIFICATION_IMAGE_SELECT,
  },
};

const { signUploadPath } = require('../../utils/uploads');

/** Verification photos are private: every path handed out is a short-lived signed URL. */
const signVerification = (verification) =>
  verification && verification.images
    ? { ...verification, images: verification.images.map((image) => ({ ...image, imagePath: signUploadPath(image.imagePath) })) }
    : verification;

module.exports = {
  signVerification,
  MAX_IMAGES_CEILING,
  verificationLimits,
  VERIFICATION_IMAGE_SELECT,
  VERIFICATION_SUBMISSION_SELECT,
};
