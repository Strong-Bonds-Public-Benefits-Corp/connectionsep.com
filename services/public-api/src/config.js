'use strict';

/**
 * config.js — environment configuration.
 *
 * Secrets this service reads from the environment:
 * - PUBLIC_DB_URI (required, no default): the public database.
 * - JWT_SECRET (required): signs login tokens for the
 *   accounts/auth endpoints.
 * - SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID (optional at startup):
 *   Square payments for orders and club memberships. The app boots
 *   without them; POST /api/orders answers 503
 *   `payments_not_configured` until they are set. SQUARE_ENVIRONMENT
 *   is 'sandbox' unless set to 'production'.
 *
 * There are no other secrets and no fallbacks: a missing required
 * value exits the process with a clear message instead of starting
 * in a half-working state.
 */

function loadConfig(env) {
  const publicDbUri = (env.PUBLIC_DB_URI || '').trim();
  if (!publicDbUri) {
    throw new Error(
      'PUBLIC_DB_URI is not set. Copy .env.example to .env and set it to the ' +
      'MongoDB connection string for the PUBLIC database (strong-bonds-public). ' +
      'Never commit a real .env.'
    );
  }

  const port = Number.parseInt(env.PORT || '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT is invalid: ${env.PORT}`);
  }

  const jwtSecret = (env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    throw new Error(
      'JWT_SECRET is not set. It signs login tokens for the accounts/auth ' +
      'endpoints. Set it in Render (Environment) or in your local .env. ' +
      'Never commit a real .env.'
    );
  }

  // Square (Step 3). Optional at startup — see the header comment.
  const squareAccessToken = (env.SQUARE_ACCESS_TOKEN || '').trim();
  const squareLocationId = (env.SQUARE_LOCATION_ID || '').trim();
  const squareEnvironment = (env.SQUARE_ENVIRONMENT || 'sandbox').trim().toLowerCase();
  if (squareEnvironment !== 'sandbox' && squareEnvironment !== 'production') {
    throw new Error(
      `SQUARE_ENVIRONMENT is invalid: ${env.SQUARE_ENVIRONMENT} (use 'sandbox' or 'production').`
    );
  }

  return {
    publicDbUri,
    port,
    jwtSecret,
    squareAccessToken,
    squareLocationId,
    squareEnvironment,
  };
}

module.exports = { loadConfig };
