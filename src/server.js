const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/database');
const { startActivityExpiryJob } = require('./modules/activity/activity.expiry');

const server = app.listen(env.port, () => {
  console.log(`Server running on port ${env.port} (${env.nodeEnv})`);
});

const jobs = startActivityExpiryJob();

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  jobs.stop();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
// Never let one stray promise take the whole server down; log it instead.
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
process.on('SIGINT', () => shutdown('SIGINT'));
