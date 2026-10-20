const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

/**
 * Deletes files referenced by their public `/uploads/...` paths. Paths that
 * resolve outside the uploads folder are ignored. Best effort: never throws.
 */
const removeUploadPaths = (publicPaths = []) => {
  for (const publicPath of publicPaths) {
    if (!publicPath || typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) {
      continue;
    }

    const absolute = path.resolve(UPLOADS_ROOT, publicPath.slice('/uploads/'.length));

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

module.exports = { removeUploadPaths, UPLOADS_ROOT };
