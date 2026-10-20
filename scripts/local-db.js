/**
 * Runs a local PostgreSQL for development, matching DATABASE_URL in .env
 * (same port, user, password and database). Data lives in .local-pg/.
 *
 *   npm run db:local        # keep this running in its own terminal
 *   npx prisma migrate deploy
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const EmbeddedPostgres = require('embedded-postgres').default;

const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  console.error(`DATABASE_URL points to ${url.hostname}; db:local only runs a database on localhost.`);
  process.exit(1);
}

const databaseDir = path.resolve(__dirname, '../.local-pg');
const database = decodeURIComponent(url.pathname.slice(1)) || 'tomo_db';
const pg = new EmbeddedPostgres({
  databaseDir,
  user: decodeURIComponent(url.username || 'postgres'),
  password: decodeURIComponent(url.password || 'postgres'),
  port: Number(url.port || 5432),
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

(async () => {
  if (!fs.existsSync(path.join(databaseDir, 'PG_VERSION'))) {
    console.log('Creating a new local database cluster in .local-pg/ …');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(database);
    console.log(`Created database "${database}".`);
  } catch {
    // already exists
  }
  console.log(`PostgreSQL ready on localhost:${url.port || 5432} (database "${database}"). Press Ctrl+C to stop.`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((err) => {
  console.error('Local database failed to start:', err.message);
  process.exit(1);
});
