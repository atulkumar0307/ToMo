const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/database');
const { startActivityExpiryJob } = require('./modules/activity/activity.expiry');

const server = app.listen(env.port, () => {
  console.log(`Server running on port ${env.port} (${env.nodeEnv})`);
});

const expiryInterval = startActivityExpiryJob();

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  clearInterval(expiryInterval);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
