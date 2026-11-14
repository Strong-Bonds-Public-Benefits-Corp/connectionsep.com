'use strict';

require('dotenv').config();

const { loadConfig } = require('./config');
const dbModule = require('./db');
const { createApp } = require('./app');

/**
 * index.js — entry point. Order of operations:
 * 1. Load and validate config (PUBLIC_DB_URI must be set).
 * 2. Connect to the PUBLIC database and create the indexes.
 * 3. Attach the database to the app and start listening.
 *
 * A failure at step 1 or 2 exits the process with a clear message
 * instead of starting a half-working server. Render restarts the
 * service on exit.
 *
 * This process NEVER connects to the Vault database.
 */
async function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    console.error(`Configuration error: ${err.message}`);
    process.exit(1);
  }

  let db;
  try {
    db = await dbModule.connect(config.publicDbUri);
  } catch (err) {
    console.error(`Could not connect to the public database: ${err.message}`);
    process.exit(1);
  }

  const app = createApp();
  app.locals.db = db;
  app.locals.jwtSecret = config.jwtSecret;
  app.locals.square = {
    accessToken: config.squareAccessToken,
    locationId: config.squareLocationId,
    environment: config.squareEnvironment,
  };

  const server = app.listen(config.port, () => {
    console.log(`ccep-public-api listening on port ${config.port}`);
  });

  const shutdown = () => {
    console.log('Shutting down...');
    server.close(async () => {
      await dbModule.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
