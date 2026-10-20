const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

/** Folders whose files are private: only reachable through a signed URL. */
const PRIVATE_PREFIXES = ['/uploads/verification-images/'];
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

/** Unguessable file name; the extension follows the (already validated) MIME type. */
const randomFilename = (file) => {
  const ext = EXTENSION_BY_MIME[file.mimetype] || path.extname(path.basename(file.originalname || '')).toLowerCase() || '';
  return `${crypto.randomUUID()}${ext}`;
};

/**
 * Deletes files referenced by their public `/uploads/...` paths. Paths that
 * resolve outside the uploads folder are ignored. Best effort: never throws.
 */
const removeUploadPaths = (publicPaths = []) => {
  for (const publicPath of publicPaths) {
    if (!publicPath || typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) {
      continue;
    }

    const absolute = path.resolve(UPLOADS_ROOT, publicPath.split('?')[0].slice('/uploads/'.length));

    if (!absolute.startsWith(UPLOADS_ROOT + path.sep)) {
      continue;
    }

    try {
      if (fs.existsSync(absolute)) {
        fs.unlinkSync(absolute);
      }
    } catch (err) {
      console.error('Failed to remove upload:', publicPath, err.message);
    }
  }
};

const signatureFor = (publicPath, expires) =>
  crypto.createHmac('sha256', env.mediaSigningSecret).update(`${publicPath}:${expires}`).digest('base64url');

const isPrivatePath = (publicPath) => PRIVATE_PREFIXES.some((prefix) => publicPath?.startsWith(prefix));

/**
 * Turns a private `/uploads/...` path into a URL valid for an hour.
 * The expiry is rounded to the hour so the URL stays the same (and cacheable) within that window.
 */
const signUploadPath = (publicPath) => {
  if (!publicPath || !isPrivatePath(publicPath)) return publicPath;
  const hour = 60 * 60;
  const expires = (Math.floor(Date.now() / 1000 / hour) + 2) * hour;
  return `${publicPath}?exp=${expires}&sig=${signatureFor(publicPath, expires)}`;
};

/** Express middleware guarding private upload folders. */
const requireSignedUpload = (req, res, next) => {
  const publicPath = `/uploads${req.path}`;
  if (!isPrivatePath(publicPath)) return next();

  const expires = parseInt(req.query.exp, 10);
  const signature = String(req.query.sig || '');
  const expected = Number.isNaN(expires) ? '' : signatureFor(publicPath, expires);

  const valid =
    expected &&
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) &&
    expires * 1000 > Date.now();

  if (!valid) {
    return res.status(403).json({ success: false, message: 'This file requires a signed link' });
  }

  return next();
};

module.exports = {
  UPLOADS_ROOT,
  SIGNED_URL_TTL_SECONDS,
  randomFilename,
  removeUploadPaths,
  signUploadPath,
  requireSignedUpload,
  isPrivatePath,
};
