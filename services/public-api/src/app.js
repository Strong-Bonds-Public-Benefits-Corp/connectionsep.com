'use strict';

const express = require('express');
const checkInsRouter = require('./routes/checkIns');
const heatMapRouter = require('./routes/heatMap');
const discountCodesRouter = require('./routes/discountCodes');
const catalogRouter = require('./routes/catalog');
const accountsRouter = require('./routes/accounts');
const contactMessagesRouter = require('./routes/contactMessages');
const ordersRouter = require('./routes/orders');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { ping } = require('./db');

const SERVICE_VERSION = '0.1.0';

/**
 * app.js — the Express app. Kept separate from index.js so the app
 * can be loaded (and its routes inspected) without connecting to a
 * database or opening a port.
 *
 * Routes read the database from app.locals.db, which index.js sets
 * after a successful connection. Body limit is 10kb — a check-in
 * body is a few hundred bytes; anything bigger is not a check-in.
 */
function createApp() {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.get('/', (_req, res) => {
    res.json({
      service: 'ccep-public-api',
      version: SERVICE_VERSION,
      status: 'ok',
      endpoints: ['POST /api/check-ins', 'GET /api/heat-map', 'POST /api/discount-codes/validate', 'GET /api/products', 'GET /api/products/:id', 'GET /api/menu', 'GET /api/menu/:id', 'POST /api/accounts', 'POST /api/auth/login', 'GET /api/accounts/me', 'POST /api/contact-messages', 'POST /api/orders', 'GET /api/orders', 'GET /health'],
    });
  });

  app.get('/health', async (_req, res) => {
    const dbUp = await ping();
    res.json({
      status: dbUp ? 'ok' : 'degraded',
      service: 'ccep-public-api',
      version: SERVICE_VERSION,
      db: dbUp ? 'up' : 'down',
      time: new Date().toISOString(),
    });
  });

  app.use(checkInsRouter);
  app.use(heatMapRouter);
  app.use(discountCodesRouter);
  app.use(catalogRouter);
  app.use(accountsRouter);
  app.use(contactMessagesRouter);
  app.use(ordersRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, SERVICE_VERSION };
