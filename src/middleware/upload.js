const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { AppError } = require('../utils/errors');
const { randomFilename } = require('../utils/uploads');

const PROFILES_DIR = path.join(__dirname, '../../uploads/profiles');
const VERIFICATION_IMAGES_DIR = path.join(
  __dirname,
  '../../uploads/verification-images'
);
const HIGHLIGHTS_DIR = path.join(__dirname, '../../uploads/highlights');
const CHAT_IMAGES_DIR = path.join(__dirname, '../../uploads/chat-images');
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_HIGHLIGHT_MEDIA_SIZE = 50 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const ALLOWED_HIGHLIGHT_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
];

fs.mkdirSync(PROFILES_DIR, { recursive: true });
fs.mkdirSync(VERIFICATION_IMAGES_DIR, { recursive: true });
fs.mkdirSync(HIGHLIGHTS_DIR, { recursive: true });
fs.mkdirSync(CHAT_IMAGES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, PROFILES_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, randomFilename(file));
  },
});

const imageFileFilter = (_req, file, cb) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    return cb(new AppError('Image must be JPEG, PNG, or WebP', 400));
  }

  cb(null, true);
};

const verificationImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, VERIFICATION_IMAGES_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, randomFilename(file));
  },
});

const uploadProfileImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_SIZE },
});

const uploadVerificationImages = multer({
  storage: verificationImageStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_SIZE },
});

const highlightMediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, HIGHLIGHTS_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, randomFilename(file));
  },
});

const highlightMediaFileFilter = (_req, file, cb) => {
  if (!ALLOWED_HIGHLIGHT_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new AppError('Media must be JPEG, PNG, WebP, MP4, MOV, or WEBM', 400)
    );
  }

  cb(null, true);
};

const uploadHighlightMedia = multer({
  storage: highlightMediaStorage,
  fileFilter: highlightMediaFileFilter,
  limits: { fileSize: MAX_HIGHLIGHT_MEDIA_SIZE },
});

const uploadChatImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHAT_IMAGES_DIR),
    filename: (_req, file, cb) => cb(null, randomFilename(file)),
  }),
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
});

module.exports = {
  uploadProfileImage,
  uploadChatImage,
  CHAT_IMAGES_DIR,
  uploadVerificationImages,
  uploadHighlightMedia,
  PROFILES_DIR,
  VERIFICATION_IMAGES_DIR,
  HIGHLIGHTS_DIR,
};
