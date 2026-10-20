const MIN_IMAGES = 3;
const MAX_IMAGES = 5;

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
  MIN_IMAGES,
  MAX_IMAGES,
  VERIFICATION_IMAGE_SELECT,
  VERIFICATION_SUBMISSION_SELECT,
};
