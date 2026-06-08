const MIN_VIDEO_DURATION_SEC = 5;
const MAX_VIDEO_DURATION_SEC = 10;

const VERIFICATION_VIDEO_SELECT = {
  id: true,
  videoPath: true,
  status: true,
  remark: true,
  createdAt: true,
  updatedAt: true,
};

module.exports = {
  MIN_VIDEO_DURATION_SEC,
  MAX_VIDEO_DURATION_SEC,
  VERIFICATION_VIDEO_SELECT,
};
