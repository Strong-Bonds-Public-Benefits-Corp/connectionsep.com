'use strict';

const crypto = require('node:crypto');

/**
 * codes.js — unique discount-code minting.
 *
 * Format: RESILIENCE-XXXXXXXX (8 random characters). The spec's
 * example is `RESILIENCE-XXXX`; 8 characters is the choice made
 * here (flagged in README). The alphabet drops I, O, 0 and 1 so a
 * code read off a screen can't be mis-typed.
 *
 * A code is a STANDALONE document: { code, expiresAt, used,
 * usedAt, createdAt } — no reference to a check-in and no reference
 * to an account. That is what keeps a check-in anonymous even after
 * the code is used in an order. Uniqueness is enforced twice: the
 * generator retries on collision, and the database carries a unique
 * index on discount_codes.code as a backstop.
 *
 * A code is good for one order, 7 days from minting (spec v01).
 */

const CODE_PREFIX = 'RESILIENCE-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
const CODE_RANDOM_LENGTH = 8;
const CODE_TTL_DAYS = 7;
const MAX_MINT_ATTEMPTS = 5;

// The Resilience Check In discount: 10% off one order. The spec's
// discount-code shape has no amount field, so the value lives here
// as the single named constant the validate endpoint returns (and
// the orders endpoint will apply). If the discount ever changes,
// this is the one place it changes.
const DISCOUNT_PERCENT = 10;

function generateDiscountCode() {
  const bytes = crypto.randomBytes(CODE_RANDOM_LENGTH);
  let suffix = '';
  for (let i = 0; i < CODE_RANDOM_LENGTH; i += 1) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return CODE_PREFIX + suffix;
}

async function mintDiscountCode(db, now = new Date()) {
  const collection = db.collection('discount_codes');
  const createdAt = new Date(now);
  const expiresAt = new Date(createdAt.getTime() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000);

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_MINT_ATTEMPTS; attempt += 1) {
    const code = generateDiscountCode();
    try {
      await collection.insertOne({
        code,
        expiresAt,
        used: false,
        usedAt: null,
        createdAt,
      });
      return { code, expiresAt };
    } catch (err) {
      // 11000 = duplicate key: another code collided. Retry with a fresh one.
      if (err && err.code === 11000) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `Could not mint a unique discount code after ${MAX_MINT_ATTEMPTS} attempts. ` +
    `Last error: ${lastError ? lastError.message : 'unknown'}`
  );
}

module.exports = {
  CODE_PREFIX,
  CODE_TTL_DAYS,
  DISCOUNT_PERCENT,
  generateDiscountCode,
  mintDiscountCode,
};
