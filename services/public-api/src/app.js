'use strict';

const express = require('express');
const checkInsRouter = require('./routes/checkIns');
const heatMapRouter = require('./routes/heatMap');
const discountCodesRouter = require('./routes/discountCodes');
const catalogRouter = require('./routes/catalog');
const accountsRouter = require('./routes/accounts');
const contactMessagesRouter = require('./routes/contactMessages');
const clubMembersRouter = require('./routes/clubMembers');
const ordersRouter = require('./routes/orders');
const adminRouter = require('./routes/admin');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter, writeLimiter, authLimiter } = require('./middleware/rateLimit');
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
/**
 * CORS — the site is a static GitHub Pages site on another origin,
 * so the browser blocks its fetch calls without these headers.
 * Allowed origins are the Pages site, the production domain, and
 * localhost for local development. No credentials (no cookies);
 * auth travels in the Authorization header, which is allowed.
 * Preflight (OPTIONS) answers 204 with the same headers.
 */
const ALLOWED_ORIGINS = [
  'https://strong-bonds-public-benefits-corp.github.io',
  'https://connectionsep.com',
  'https://www.connectionsep.com',
];

function isAllowedOrigin(origin) {
  if (!origin) { return false; }
  if (ALLOWED_ORIGINS.includes(origin)) { return true; }
  return origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
}

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

function createApp() {
  const app = express();

  // Render terminates TLS at its router and forwards the real client
  // IP in X-Forwarded-For. Trust exactly one proxy hop so req.ip is
  // that client — per-IP rate limiting depends on it. Without this,
  // every visitor would share the router's address and one bucket.
  app.set('trust proxy', 1);

  app.use(corsMiddleware);
  app.use(express.json({ limit: '10kb' }));

  app.get('/', (_req, res) => {
    res.json({
      service: 'ccep-public-api',
      version: SERVICE_VERSION,
      status: 'ok',
      endpoints: ['POST /api/check-ins', 'GET /api/heat-map', 'POST /api/discount-codes/validate', 'GET /api/products', 'GET /api/products/:id', 'GET /api/menu', 'GET /api/menu/:id', 'POST /api/accounts', 'POST /api/auth/login', 'GET /api/accounts/me', 'POST /api/contact-messages', 'POST /api/club-members', 'GET /api/club-members/me', 'POST /api/orders', 'GET /api/orders', 'POST /api/admin/seed-products', 'GET /health'],
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

  // Rate limiting — mounted before the routers, after CORS, so a
  // preflight OPTIONS is answered by corsMiddleware and never
  // counted. / and /health are not under /api and stay unlimited
  // (health checks must never be throttled).
  //   apiLimiter:   every /api call, 300 / 15 min / IP.
  //   writeLimiter: writes (check-ins, code validation, orders,
  //                 signups, contact messages, club joins),
  //                 60 / 15 min / IP. Mounted by path prefix, so it
  //                 also covers GET /api/orders and
  //                 GET /api/accounts/me — both are generous at 60.
  //   authLimiter:  POST /api/auth/login only, 10 / 15 min / IP
  //                 (brute-force protection).
  app.use('/api', apiLimiter);
  app.use('/api/check-ins', writeLimiter);
  app.use('/api/discount-codes/validate', writeLimiter);
  app.use('/api/orders', writeLimiter);
  app.use('/api/accounts', writeLimiter);
  app.use('/api/contact-messages', writeLimiter);
  app.use('/api/club-members', writeLimiter);
  app.use('/api/admin', writeLimiter);
  app.use('/api/auth/login', authLimiter);

  app.use(checkInsRouter);
  app.use(heatMapRouter);
  app.use(discountCodesRouter);
  app.use(catalogRouter);
  app.use(accountsRouter);
  app.use(contactMessagesRouter);
  app.use(clubMembersRouter);
  app.use(ordersRouter);
  app.use(adminRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, SERVICE_VERSION };
