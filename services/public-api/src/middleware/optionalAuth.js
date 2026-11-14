'use strict';

const { ObjectId } = require('mongodb');
const { verifyToken, publicAccount } = require('../lib/auth');

/**
 * optionalAuth — the guest-checkout gate (Tony, Nov 14).
 *
 * POST /api/orders accepts a login token OR no token at all:
 * - No Authorization header → guest order; req.account is null.
 * - Valid token for an existing account → req.account is the
 *   public account shape, and the order is attached to it.
 * - A token is present but bad, expired, forged, or names a
 *   deleted account → 401. A bad token is never silently treated
 *   as a guest — that would let a broken login flow place orders
 *   the customer thinks are on their account.
 *
 * Same 401 either way, so the caller learns nothing about which
 * part failed.
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header) {
    req.account = null;
    return next();
  }

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

module.exports = { optionalAuth };
