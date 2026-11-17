'use strict';

/**
 * rateLimit.js — tiny in-memory fixed-window rate limiters.
 *
 * No new dependency: the service runs as a single instance on Render
 * (WEB_CONCURRENCY=1), so an in-memory store is enough, and there is
 * nothing to install or misconfigure at deploy time. If the service
 * ever scales to several instances, this must move to a shared store
 * (Redis or the database) — per-instance buckets would then let a
 * client spread requests across instances.
 *
 * How it works: one bucket per client IP per limiter, { count,
 * resetAt }. A request past `max` inside the window gets 429 with a
 * JSON body in the API's usual error shape plus a Retry-After
 * header (seconds until the window resets). Expired buckets are
 * swept on a timer so the map cannot grow without bound.
 *
 * The client IP comes from req.ip, which is only the real client
 * when the app trusts Render's router (app.js sets
 * `trust proxy` to 1). Without that, every visitor would share the
 * proxy's address and one bucket — one abusive client would block
 * everyone, and one busy user would block themselves.
 *
 * Limits are deliberately generous (see the table in README.md):
 * a single real user doing a handful of check-ins, code validates
 * and orders — including the live test order — must never be
 * blocked. The limits exist to stop spam and brute force, not to
 * ration normal use.
 */

function createRateLimiter({ windowMs, max, name }) {
  const buckets = new Map(); // ip -> { count, resetAt }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(ip);
    }
  }, windowMs);
  if (typeof sweep.unref === 'function') sweep.unref();

  function middleware(req, res, next) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(max - bucket.count, 0)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      // Paths only — no IP in the log line. originalUrl, not path:
      // the limiter is mounted on a path prefix, so req.path would
      // just read "/" for every limited call.
      console.log(
        `Rate limit hit: ${name} ${req.method} ${req.originalUrl} (retry in ${retryAfter}s)`
      );
      return res.status(429).json({
        error: 'rate_limited',
        message: `Too many requests. Please try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
      });
    }
    return next();
  }

  // Test hooks: clear all buckets, stop the sweep timer.
  middleware._buckets = buckets;
  middleware._reset = () => buckets.clear();
  middleware._stop = () => clearInterval(sweep);
  return middleware;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Every /api call: browsing the market, reading the Heat Map, and all
// writes. 300 per 15 minutes per IP — a page load makes a few calls.
const apiLimiter = createRateLimiter({ windowMs: WINDOW_MS, max: 300, name: 'api' });

// Writes: check-ins, code validation, orders, signups, contact
// messages, club joins. 60 per 15 minutes per IP — a real user does
// a handful; the checkout page auto-validates a code a few times
// while it is typed, and that still fits easily.
const writeLimiter = createRateLimiter({ windowMs: WINDOW_MS, max: 60, name: 'write' });

// Login only: 10 attempts per 15 minutes per IP. A real user does
// not fail a login 10 times in a row; a password-guessing script
// does. Signup stays on the write limiter (60).
const authLimiter = createRateLimiter({ windowMs: WINDOW_MS, max: 10, name: 'auth-login' });

module.exports = { createRateLimiter, apiLimiter, writeLimiter, authLimiter };
