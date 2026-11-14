'use strict';

const express = require('express');
const { hashPassword, verifyPassword, signToken, publicAccount, MIN_PASSWORD_LENGTH } = require('../lib/auth');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * accounts.js — signup, login, and "who am I" (spec v01,
 * "Accounts & login").
 *
 * POST /api/accounts — create an account. No login required.
 *   Body: { email, password, name }. Email is trimmed and
 *   lower-cased before storage, so Tony@Example.com and
 *   tony@example.com are the same account. Password minimum is 8
 *   characters (v01 choice — the spec sets no rule). The password
 *   is bcrypt-hashed; the plain password is never stored. Returns
 *   201 { account, token } — the account shape never includes the
 *   password hash. A taken email is a 409, and a duplicate-key
 *   error from the unique index is the same 409 (race backstop).
 *
 * POST /api/auth/login — log in. No login required.
 *   Body: { email, password }. Returns { account, token }. A wrong
 *   email and a wrong password produce the IDENTICAL 401, so the
 *   caller cannot probe which accounts exist.
 *
 * GET /api/accounts/me — get your own account. Requires login.
 *   Returns { account } from the token. Never the password hash.
 *
 * Role is always "customer" at signup (spec default). There is no
 * self-serve admin promotion — an admin role is a future,
 * deliberately-granted thing.
 */
const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX_LENGTH = 100;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

router.post('/api/accounts', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'validation_error', details: ['Request body must be a JSON object.'] });
    }

    const errors = [];
    const email = normalizeEmail(body.email);
    if (!EMAIL_RE.test(email)) {
      errors.push('email is required and must be a valid email address.');
    }
    if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`password is required and must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
      errors.push(`name is required and must be ${NAME_MAX_LENGTH} characters or fewer.`);
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: 'validation_error', details: errors });
    }

    const db = req.app.locals.db;
    const existing = await db.collection('accounts').findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'email_taken', message: 'An account with this email already exists.' });
    }

    const now = new Date();
    const passwordHash = await hashPassword(body.password);
    const doc = {
      email,
      passwordHash,
      name,
      role: 'customer',
      createdAt: now,
      updatedAt: now,
    };

    let insertedId;
    try {
      const result = await db.collection('accounts').insertOne(doc);
      insertedId = result.insertedId;
    } catch (err) {
      // 11000 = duplicate key on the unique email index: someone
      // took the address between the check and the insert.
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'email_taken', message: 'An account with this email already exists.' });
      }
      throw err;
    }

    const account = publicAccount({ ...doc, _id: insertedId });
    const token = signToken(req.app.locals.jwtSecret, { ...doc, _id: insertedId });
    return res.status(201).json({ account, token });
  } catch (err) {
    return next(err);
  }
});

router.post('/api/auth/login', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'validation_error', details: ['Request body must be a JSON object.'] });
    }

    const email = normalizeEmail(body.email);
    if (!EMAIL_RE.test(email) || typeof body.password !== 'string' || body.password.length === 0) {
      return res.status(400).json({ error: 'validation_error', details: ['email and password are required.'] });
    }

    const db = req.app.locals.db;
    const doc = await db.collection('accounts').findOne({ email });

    // One generic 401 for unknown email AND wrong password.
    const wrong = () => res.status(401).json({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
    if (!doc) return wrong();
    const ok = await verifyPassword(body.password, doc.passwordHash);
    if (!ok) return wrong();

    const account = publicAccount(doc);
    const token = signToken(req.app.locals.jwtSecret, doc);
    return res.json({ account, token });
  } catch (err) {
    return next(err);
  }
});

router.get('/api/accounts/me', requireAuth, (req, res) => {
  return res.json({ account: req.account });
});

module.exports = router;
