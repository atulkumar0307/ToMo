const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/database');
const { startActivityExpiryJob } = require('./modules/activity/activity.expiry');
const { loadSettings, startSettingsRefresh, stopSettingsRefresh } = require('./services/settings');

let server;
let jobs;

// Admin-edited settings must be in memory before the first request.
loadSettings().finally(() => {
  startSettingsRefresh();
  server = app.listen(env.port, () => {
    console.log(`Server running on port ${env.port} (${env.nodeEnv})`);
  });
  jobs = startActivityExpiryJob();
});

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  jobs?.stop();
  stopSettingsRefresh();
  if (!server) process.exit(0);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
// Never let one stray promise take the whole server down; log it instead.
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
process.on('SIGINT', () => shutdown('SIGINT'));
