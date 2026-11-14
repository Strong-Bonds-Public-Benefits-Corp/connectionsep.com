'use strict';

const { ObjectId } = require('mongodb');
const { verifyToken, publicAccount } = require('../lib/auth');

/**
 * requireAuth — gate for logged-in endpoints (spec v01).
 *
 * Expects `Authorization: Bearer <token>`. Verifies the JWT
 * against app.locals.jwtSecret, loads the account it names, and
 * attaches the public account shape as req.account.
 *
 * - Missing or malformed header → 401.
 * - Bad, expired, or forged token → 401.
 * - Token names an account that no longer exists → 401.
 * - The same 401 either way: the caller learns nothing about
 *   which part failed.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }

  let payload;
  try {
    payload = verifyToken(req.app.locals.jwtSecret, parts[1]);
  } catch (_err) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }

  if (!payload || !payload.sub || !ObjectId.isValid(payload.sub)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }

  req.app.locals.db.collection('accounts').findOne({ _id: new ObjectId(payload.sub) })
    .then((doc) => {
      if (!doc) {
        return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
      }
      req.account = publicAccount(doc);
      return next();
    })
    .catch(next);
}

module.exports = { requireAuth };
