'use strict';

// Load and validate environment variables FIRST — before any other module
// that might depend on config (DB connection, JWT, etc.)
const { validateEnv } = require('./src/config/env');
validateEnv();

const { connectDB } = require('./src/config/db');
const { config } = require('./src/config/env');
const app = require('./app');

async function start() {
  await connectDB();

  const server = app.listen(config.port, () => {
    console.log(`[Server] Career Connect API running on port ${config.port} (${config.nodeEnv})`);
  });

  // Graceful shutdown — allows in-flight requests to complete
  // before the process exits (important on Render for zero-downtime deploys)
  const shutdown = (signal) => {
    console.log(`[Server] ${signal} received — shutting down gracefully`);
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(err => {
  console.error('[Server] Startup failed:', err);
  process.exit(1);
});
