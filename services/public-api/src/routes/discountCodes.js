'use strict';

const express = require('express');
const { DISCOUNT_PERCENT } = require('../lib/codes');

/**
 * POST /api/discount-codes/validate — check a Resilience discount
 * code at checkout. No login.
 *
 * Spec v01 says the validate endpoint "requires login (or at
 * checkout)" — ambiguous. Decision for v01: NO login. The person
 * holding the code is the anonymous shopper who just checked in;
 * requiring an account would break the check-in → code → checkout
 * flow the launch test gate depends on. If accounts ever gate
 * checkout, revisit this. (Flagged in README.)
 *
 * Validate does NOT consume the code. Consumption happens once, in
 * the orders endpoint, when the order is placed — so a shopper can
 * check a code, change their mind, and still use it. A code that
 * was already used in an order validates as already_used.
 *
 * The static RESILIENCE10 fallback is NOT accepted here. Only
 * codes minted by POST /api/check-ins validate. (Tony's rule, Nov
 * 14: the static code does not satisfy the unique-code launch
 * requirement.)
 *
 * Request: { code } — a string. It is trimmed and upper-cased
 * before lookup, so a code typed in lowercase still works.
 *
 * Response 200 for every well-formed request — the request was
 * fine, the code is the thing being judged:
 *   valid code   → { valid: true, discountPercent: 10, expiresAt }
 *   unknown code → { valid: false, reason: 'not_found' }
 *   expired      → { valid: false, reason: 'expired', expiresAt }
 *   already used → { valid: false, reason: 'already_used' }
 * A missing or non-string code is a 400 validation_error.
 *
 * The code document carries no link to a check-in or an account,
 * so validating it reveals nothing about who checked in.
 */
const router = express.Router();

router.post('/api/discount-codes/validate', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'validation_error', details: ['Request body must be a JSON object.'] });
    }

    const rawCode = body.code;
    if (typeof rawCode !== 'string' || rawCode.trim().length === 0) {
      return res.status(400).json({ error: 'validation_error', details: ['code is required.'] });
    }
    const code = rawCode.trim().toUpperCase();

    const db = req.app.locals.db;
    const doc = await db.collection('discount_codes').findOne({ code });

    if (!doc) {
      return res.json({ valid: false, reason: 'not_found' });
    }

    const now = new Date();
    if (doc.expiresAt && new Date(doc.expiresAt) <= now) {
      return res.json({
        valid: false,
        reason: 'expired',
        expiresAt: new Date(doc.expiresAt).toISOString(),
      });
    }

    if (doc.used) {
      return res.json({ valid: false, reason: 'already_used' });
    }

    return res.json({
      valid: true,
      discountPercent: DISCOUNT_PERCENT,
      expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
