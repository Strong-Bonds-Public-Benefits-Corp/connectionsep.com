'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/**
 * auth.js — passwords and login tokens (spec v01, "Auth").
 *
 * Passwords are hashed with bcrypt (12 rounds) before storage.
 * The plain password is never stored and never returned. Login
 * returns a JWT (HS256, 7 days) signed with JWT_SECRET; the
 * website/app sends it as `Authorization: Bearer <token>` on
 * requests that need a logged-in user.
 *
 * The public API has its own JWT_SECRET — a token from the Vault
 * backend does not work here, and vice versa.
 *
 * Token lifetime (7 days) and the minimum password length (8) are
 * v01 choices the spec does not define — recorded here so they can
 * be revisited deliberately, not discovered by accident.
 */

const BCRYPT_ROUNDS = 12;
const TOKEN_TTL = '7d';
const MIN_PASSWORD_LENGTH = 8;

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function signToken(secret, account) {
  return jwt.sign(
    { sub: account._id.toString(), email: account.email, role: account.role },
    secret,
    { expiresIn: TOKEN_TTL }
  );
}

function verifyToken(secret, token) {
  return jwt.verify(token, secret);
}

/**
 * The public shape of an account — what the API returns. The
 * password hash is NEVER in it. `id` is the string form of the
 * MongoDB _id so callers never have to parse ObjectIds.
 */
function publicAccount(doc) {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    role: doc.role,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = {
  BCRYPT_ROUNDS,
  TOKEN_TTL,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  publicAccount,
};
