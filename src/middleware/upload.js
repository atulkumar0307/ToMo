const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { AppError } = require('../utils/errors');

const PROFILES_DIR = path.join(__dirname, '../../uploads/profiles');
const VERIFICATION_IMAGES_DIR = path.join(
  __dirname,
  '../../uploads/verification-images'
);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

fs.mkdirSync(PROFILES_DIR, { recursive: true });
fs.mkdirSync(VERIFICATION_IMAGES_DIR, { recursive: true });

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
    return cb(new AppError('Image must be JPEG, PNG, or WebP', 400));
  }

  cb(null, true);
};

const verificationImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, VERIFICATION_IMAGES_DIR);
  },
  filename: (_req, file, cb) => {
    const filename = resolveUniqueFilename(
      VERIFICATION_IMAGES_DIR,
      file.originalname
    );
    cb(null, filename);
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

module.exports = {
  uploadProfileImage,
  uploadVerificationImages,
  PROFILES_DIR,
  VERIFICATION_IMAGES_DIR,
};
