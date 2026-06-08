const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { AppError } = require('../utils/errors');

const PROFILES_DIR = path.join(__dirname, '../../uploads/profiles');
const VERIFICATION_VIDEOS_DIR = path.join(
  __dirname,
  '../../uploads/verification-videos'
);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

fs.mkdirSync(PROFILES_DIR, { recursive: true });
fs.mkdirSync(VERIFICATION_VIDEOS_DIR, { recursive: true });

const resolveUniqueFilename = (directory, originalName) => {
  const safeName = path.basename(originalName);
  const ext = path.extname(safeName);
  const base = path.basename(safeName, ext);

  let candidate = safeName;
  let counter = 2;

  while (fs.existsSync(path.join(directory, candidate))) {
    candidate = `${base}-${counter}${ext}`;
    counter += 1;
  }

  return candidate;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, PROFILES_DIR);
  },
  filename: (_req, file, cb) => {
    const filename = resolveUniqueFilename(PROFILES_DIR, file.originalname);
    cb(null, filename);
  },
});

const imageFileFilter = (_req, file, cb) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    return cb(new AppError('Profile image must be JPEG, PNG, or WebP', 400));
  }

  cb(null, true);
};

const verificationVideoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, VERIFICATION_VIDEOS_DIR);
  },
  filename: (_req, file, cb) => {
    const filename = resolveUniqueFilename(
      VERIFICATION_VIDEOS_DIR,
      file.originalname
    );
    cb(null, filename);
  },
});

const videoFileFilter = (_req, file, cb) => {
  if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype)) {
    return cb(new AppError('Verification video must be MP4, WebM, or MOV', 400));
  }

  cb(null, true);
};

const uploadProfileImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_SIZE },
});

const uploadVerificationVideo = multer({
  storage: verificationVideoStorage,
  fileFilter: videoFileFilter,
  limits: { fileSize: MAX_VIDEO_SIZE },
});

module.exports = {
  uploadProfileImage,
  uploadVerificationVideo,
  PROFILES_DIR,
  VERIFICATION_VIDEOS_DIR,
};
