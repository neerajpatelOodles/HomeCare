const env = require('./config/env');
const { pool } = require('./config/db');
const app = require('./app');

async function start() {
  await pool.query('SELECT 1'); // fail fast if the database is unreachable
  const server = app.listen(env.port, () => {
    console.log(`Home-Care Central API listening on :${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
