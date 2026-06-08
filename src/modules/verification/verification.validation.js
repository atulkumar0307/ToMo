const { MIN_VIDEO_DURATION_SEC, MAX_VIDEO_DURATION_SEC } = require('./verification.constants');

const validateVideoUpload = (file) => {
  if (!file) {
    return 'Verification video is required';
  }

  return null;
};

const validateVideoDuration = (durationSec) => {
  if (durationSec < MIN_VIDEO_DURATION_SEC || durationSec > MAX_VIDEO_DURATION_SEC) {
    return `Verification video must be between ${MIN_VIDEO_DURATION_SEC} and ${MAX_VIDEO_DURATION_SEC} seconds`;
  }

  return null;
};

module.exports = {
  validateVideoUpload,
  validateVideoDuration,
};
