'use strict';

const express = require('express');
const { validateCheckIn } = require('../lib/validation');
const { mintDiscountCode } = require('../lib/codes');
const { recomputeZipAggregate } = require('../lib/aggregation');

/**
 * POST /api/check-ins — submit a Resilience Check In. No login.
 *
 * Spec v01 flow, in order:
 * 1. Validate the body (score 1–10, 5-digit zip, option-list
 *    demographics). Unknown fields and PII fields (name, email,
 *    phone, address, ...) are stripped before anything is stored.
 * 2. Write ONE document to `check_ins` — spec fields only. No
 *    email, no real name, no link to a discount code, no link to
 *    an account. The identity link is destroyed, not hidden.
 * 3. Mint ONE unique discount code in `discount_codes` (standalone
 *    document, no link back to the check-in) and return it.
 * 4. Recompute the `heat_map` aggregate for that zip
 *    (recompute-on-write — the trigger the spec leaves undefined;
 *    see README).
 *
 * Response 201: { discountCode, expiresAt } — nothing else. No
 * check-in ID is returned, so the response itself carries no link
 * back to the stored check-in.
 *
 * If minting fails after the check-in is stored (database error),
 * the check-in still counts on the map and the caller gets a 500
 * with a try-again message. The check-in is not written twice.
 */
const router = express.Router();

router.post('/api/check-ins', async (req, res, next) => {
  try {
    const { ok, errors, doc, strippedCount } = validateCheckIn(req.body);

    if (!ok) {
      return res.status(400).json({ error: 'validation_error', details: errors });
    }

    if (strippedCount > 0) {
      // Values are never logged — only the count.
      console.warn(
        `POST /api/check-ins: stripped ${strippedCount} unexpected/PII field(s) from request body.`
      );
    }

    const db = req.app.locals.db;
    const now = new Date();

    const checkIn = { ...doc, createdAt: now };
    await db.collection('check_ins').insertOne(checkIn);

    const { code, expiresAt } = await mintDiscountCode(db, now);

    await recomputeZipAggregate(db, checkIn.zip);

    return res.status(201).json({
      discountCode: code,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
