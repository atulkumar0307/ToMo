const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const env = require('./config/env');
const { requireSignedUpload } = require('./utils/uploads');
const prisma = require('./config/database');
const { sendSuccess } = require('./utils/response');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const app = express();

if (env.trustProxy) {
  // e.g. TRUST_PROXY=1 behind one reverse proxy, so req.ip is the real client IP.
  app.set('trust proxy', /^\d+$/.test(env.trustProxy) ? Number(env.trustProxy) : env.trustProxy);
}

// Uploaded media is loaded cross-origin by the admin panel (<img>/<video>).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// Gzip JSON responses (media is already compressed and is skipped by type).
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
// Uploaded files get random, never-reused names, so they can be cached for a long time.
// Private folders (verification photos) need a signed link.
app.use(
  '/uploads',
  requireSignedUpload,
  express.static(path.join(__dirname, '../uploads'), {
    maxAge: '30d',
    immutable: true,
    index: false,
    dotfiles: 'deny',
    setHeaders: (res, filePath) => {
      // Signed private files must not be stored by shared caches.
      if (filePath.includes(`${path.sep}verification-images${path.sep}`)) {
        res.setHeader('Cache-Control', 'private, max-age=3600');
      }
    },
  })
);

app.get('/health', async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return sendSuccess(res, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (err) {
    return sendSuccess(res, {
      status: 'degraded',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});

app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
