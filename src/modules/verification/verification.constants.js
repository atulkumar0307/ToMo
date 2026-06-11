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

module.exports = {
  MIN_IMAGES,
  MAX_IMAGES,
  VERIFICATION_IMAGE_SELECT,
  VERIFICATION_SUBMISSION_SELECT,
};
