'use strict';

/* Rate-limit tests — no database, no live calls, nothing created.
 *
 * Run: node test/rate-limit.test.js   (exit 0 = all pass)
 *      npm test                        (same)
 *
 * Two parts:
 *  1. The limiter factory itself, with tiny limits (max 3, 200ms
 *     window) on a throwaway app: over-limit returns 429 with the
 *     API's error shape and a Retry-After header, a different IP
 *     gets its own bucket, and requests pass again after the
 *     window resets.
 *  2. The real wired app (createApp, no database attached):
 *     invalid bodies fail validation BEFORE any database access,
 *     so hammering them proves the limiters are mounted without
 *     creating a check-in, an account, or anything else. Each
 *     section uses its own X-Forwarded-For address so the
 *     per-IP buckets do not interfere with each other.
 *     - 61 invalid check-ins -> first 60 are 400, 61st is 429
 *       (write limiter: 60 / 15 min).
 *     - 11 invalid logins -> first 10 are 400, 11th is 429
 *       (auth limiter: 10 / 15 min).
 *     - 301 invalid heat-map reads -> first 300 are 400, 301st
 *       is 429 (API limiter: 300 / 15 min).
 *     - A handful of mixed calls from a fresh IP -> none is 429
 *       (normal use passes).
 */

const express = require('express');
const { createRateLimiter } = require('../src/middleware/rateLimit');
const { createApp } = require('../src/app');

let passes = 0;
let failures = 0;

function check(name, cond, extra) {
  if (cond) { passes += 1; console.log('  PASS ' + name); }
  else { failures += 1; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

async function req(port, method, path, opts) {
  opts = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (opts.ip) headers['X-Forwarded-For'] = opts.ip;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let body = null;
  try { body = await res.json(); } catch (_e) { /* empty body */ }
  return { status: res.status, body, retryAfter: res.headers.get('retry-after') };
}

async function testFactory() {
  console.log('Factory limiter (max 3, 200ms window):');
  const limiter = createRateLimiter({ windowMs: 200, max: 3, name: 'test' });
  const app = express();
  app.set('trust proxy', 1);
  app.use(limiter);
  app.get('/x', (_req, res) => res.json({ ok: true }));
  const { server, port } = await listen(app);
  try {
    const ip = '10.1.1.1';
    const first = [];
    for (let i = 0; i < 3; i += 1) first.push(await req(port, 'GET', '/x', { ip }));
    check('first 3 requests pass', first.every((r) => r.status === 200));

    const fourth = await req(port, 'GET', '/x', { ip });
    check('4th request is 429', fourth.status === 429, 'got ' + fourth.status);
    check('429 body is the API error shape',
      fourth.body && fourth.body.error === 'rate_limited' && typeof fourth.body.message === 'string',
      JSON.stringify(fourth.body));
    check('429 carries Retry-After', fourth.retryAfter !== null && Number(fourth.retryAfter) > 0,
      'got ' + fourth.retryAfter);

    const other = await req(port, 'GET', '/x', { ip: '10.2.2.2' });
    check('a different IP gets its own bucket', other.status === 200, 'got ' + other.status);

    await sleep(250);
    const after = await req(port, 'GET', '/x', { ip });
    check('requests pass again after the window resets', after.status === 200, 'got ' + after.status);
  } finally {
    limiter._stop();
    server.close();
  }
}

async function testWiredApp() {
  console.log('Wired app (createApp, no database):');
  const app = createApp();
  const { server, port } = await listen(app);
  try {
    const root = await req(port, 'GET', '/', {});
    check('GET / is not rate limited', root.status === 200, 'got ' + root.status);

    // Write limiter: 60 invalid check-ins from one IP.
    const ipA = '10.10.0.1';
    let last = null;
    let saw400 = 0;
    for (let i = 0; i < 61; i += 1) {
      last = await req(port, 'POST', '/api/check-ins', { ip: ipA, body: {} });
      if (last.status === 400) saw400 += 1;
    }
    check('60 invalid check-ins return 400 (validation, no DB)', saw400 === 60, 'got ' + saw400);
    check('61st check-in is 429', last.status === 429, 'got ' + last.status);
    check('check-in 429 body is rate_limited',
      last.body && last.body.error === 'rate_limited', JSON.stringify(last.body));

    // Auth limiter: 11 invalid logins from another IP.
    const ipB = '10.10.0.2';
    let login400 = 0;
    let loginLast = null;
    for (let i = 0; i < 11; i += 1) {
      loginLast = await req(port, 'POST', '/api/auth/login', { ip: ipB, body: {} });
      if (loginLast.status === 400) login400 += 1;
    }
    check('10 invalid logins return 400', login400 === 10, 'got ' + login400);
    check('11th login is 429', loginLast.status === 429, 'got ' + loginLast.status);

    // API limiter: 301 invalid heat-map reads from a third IP.
    const ipC = '10.10.0.3';
    let map400 = 0;
    let mapLast = null;
    for (let i = 0; i < 301; i += 1) {
      mapLast = await req(port, 'GET', '/api/heat-map?dimension=nope', { ip: ipC });
      if (mapLast.status === 400) map400 += 1;
    }
    check('300 invalid heat-map reads return 400', map400 === 300, 'got ' + map400);
    check('301st heat-map read is 429', mapLast.status === 429, 'got ' + mapLast.status);

    // Normal use from a fresh IP: a handful of mixed calls, none 429.
    const ipD = '10.10.0.4';
    const mixed = [];
    for (let i = 0; i < 3; i += 1) mixed.push(await req(port, 'POST', '/api/check-ins', { ip: ipD, body: {} }));
    for (let i = 0; i < 3; i += 1) mixed.push(await req(port, 'POST', '/api/discount-codes/validate', { ip: ipD, body: {} }));
    for (let i = 0; i < 2; i += 1) mixed.push(await req(port, 'GET', '/api/heat-map', { ip: ipD }));
    check('normal use (8 mixed calls) is never 429',
      mixed.every((r) => r.status !== 429),
      'got ' + mixed.map((r) => r.status).join(','));
  } finally {
    server.close();
  }
}

(async () => {
  await testFactory();
  await testWiredApp();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
