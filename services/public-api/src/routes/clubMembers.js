'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { ObjectId } = require('mongodb');
const { createPayment, SquarePaymentError } = require('../lib/square');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * Club members — POST /api/club-members (join the Sanctuary Club)
 * and GET /api/club-members/me (your membership). Spec v01,
 * "Sanctuary Club".
 *
 * Both endpoints require login (spec v01): a membership belongs
 * to an account, so there is no guest join.
 *
 * POST body (spec v01 + one addition):
 *   tier: required — one of the seven tier names below.
 *   sourceId: required — the payment source token the frontend
 *     got from the Square Web Payments SDK. NOT in the spec's body
 *     list (the spec says "creates the Square payment" without
 *     naming the field); without it there is nothing to charge.
 *     Same v01 choice as POST /api/orders.
 *
 * Tier prices (Sanctuary Club pricing, spec v01 + club records):
 *   Grounding $50 / Connection $75 / Sanctuary $100,
 *   Ally Grounding $85 / Ally Connection $127.50 /
 *   Ally Sanctuary $170, Student $75.
 * Prices come from this table only — a price the frontend sends
 * is ignored (there is no such field to send). Money is computed
 * in integer cents and stored in dollars, matching the spec's
 * field types.
 *
 * V01 choices (recorded here and in README):
 * - Student is charged $75 once at join. The club's student plan
 *   is $25/mo x 3 — installments need Square Subscriptions, which
 *   is a v02 decision. Until then the student tier is the
 *   Connection price paid up front.
 * - Gift-a-tier (10% off for a gifted membership) is NOT in v01:
 *   it needs a recipient model the spec does not define.
 * - No discount codes on a club join in v01: the spec's POST body
 *   has no discountCode field.
 * - An account with an ACTIVE membership gets 409 already_member.
 *   An expired membership does not block a re-join (that is how
 *   renewal works in v01; a dedicated renewal flow is v02).
 * - GET /me reports the EFFECTIVE status: an "active" membership
 *   past its expiresAt reads as "expired". The stored document
 *   is not rewritten — a sweep job can reconcile stored statuses
 *   later, same as the discount-code expiry sweep.
 *
 * Order of operations (mirrors POST /api/orders):
 *   1. Validate the body (tier, sourceId).
 *   2. Refuse with 409 if an active membership already exists.
 *   3. Refuse with 503 if Square is not configured, before any
 *      database write.
 *   4. Charge Square. A decline is 402 and writes nothing; any
 *      other Square failure is 502.
 *   5. Write the club_members document (status "active", one
 *      year from joining). If THAT fails after a successful
 *      charge, the route answers 500 with the Square payment id
 *      so support can reconcile — the money is real and the
 *      membership must not vanish silently.
 *   6. Write the orders record for the payment (spec v01). A
 *      membership has no product and nothing ships: the item
 *      carries the tier name only, and shippingAddress is null.
 *      If the orders write fails, the route answers 500 with
 *      both the membership id and the payment id — the
 *      membership is real, only the payment record is missing.
 */

const router = express.Router();

const TIERS = {
  Grounding: 50,
  Connection: 75,
  Sanctuary: 100,
  'Ally Grounding': 85,
  'Ally Connection': 127.5,
  'Ally Sanctuary': 170,
  Student: 75,
};

function effectiveStatus(doc, now) {
  if (doc.status === 'active' && doc.expiresAt instanceof Date && doc.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return doc.status;
}

function publicMembership(doc, now) {
  return {
    id: doc._id.toString(),
    tier: doc.tier,
    price: doc.price,
    joinedAt: doc.joinedAt,
    expiresAt: doc.expiresAt,
    status: effectiveStatus(doc, now),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

router.post('/api/club-members', requireAuth, async (req, res, next) => {
  const db = req.app.locals.db;
  const now = new Date();

  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'validation_error', details: ['Request body must be a JSON object.'] });
    }

    const errors = [];
    const tier = typeof body.tier === 'string' ? body.tier.trim() : '';
    if (!Object.prototype.hasOwnProperty.call(TIERS, tier)) {
      errors.push(`tier must be one of: ${Object.keys(TIERS).join(', ')}.`);
    }
    const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
    if (sourceId.length === 0) {
      errors.push('sourceId is required (the payment source from the Square Web Payments SDK).');
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: 'validation_error', details: errors });
    }

    const accountId = new ObjectId(req.account.id);

    // 2. An active membership blocks a new join.
    const existing = await db.collection('club_members').findOne({ accountId, status: 'active' });
    if (existing && effectiveStatus(existing, now) === 'active') {
      return res.status(409).json({ error: 'already_member', message: 'This account already has an active Sanctuary Club membership.' });
    }

    // 3. Square must be configured before anything is written.
    const squareConfig = req.app.locals.square || {};
    if (!squareConfig.accessToken || !squareConfig.locationId) {
      return res.status(503).json({ error: 'payments_not_configured', message: 'Card payments are not set up yet.' });
    }

    const price = TIERS[tier];
    const amountCents = Math.round(price * 100);

    // 4. Charge Square.
    const squareClient = req.app.locals.squareClient || { createPayment };
    let payment;
    try {
      payment = await squareClient.createPayment({
        sourceId,
        amountCents,
        idempotencyKey: crypto.randomUUID(),
        locationId: squareConfig.locationId,
        accessToken: squareConfig.accessToken,
        environment: squareConfig.environment || 'sandbox',
      });
    } catch (err) {
      if (err instanceof SquarePaymentError && err.httpStatus === 402) {
        return res.status(402).json({ error: 'payment_declined', message: err.message });
      }
      if (err instanceof SquarePaymentError) {
        return res.status(502).json({ error: 'payment_failed', message: 'The payment provider could not complete the charge.' });
      }
      return next(err);
    }

    // 5. Write the membership (one year from joining).
    const joinedAt = now;
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    let inserted;
    try {
      inserted = await db.collection('club_members').insertOne({
        accountId,
        tier,
        price,
        joinedAt,
        expiresAt,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      return res.status(500).json({
        error: 'membership_write_failed',
        message: 'Payment succeeded but the membership could not be saved. Contact support with this payment reference.',
        squarePaymentId: payment.id,
      });
    }

    // 6. The orders record for the payment.
    try {
      await db.collection('orders').insertOne({
        accountId,
        items: [{ name: `Sanctuary Club — ${tier}`, price, quantity: 1 }],
        subtotal: price,
        discountCode: null,
        discountAmount: 0,
        total: price,
        squarePaymentId: payment.id,
        shippingAddress: null,
        status: 'paid',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      return res.status(500).json({
        error: 'membership_order_failed',
        message: 'The membership was created but the payment record could not be saved. Contact support with these references.',
        membershipId: inserted.insertedId.toString(),
        squarePaymentId: payment.id,
      });
    }

    const doc = await db.collection('club_members').findOne({ _id: inserted.insertedId });
    return res.status(201).json({ ...publicMembership(doc, now), squarePaymentId: payment.id });
  } catch (err) {
    return next(err);
  }
});

router.get('/api/club-members/me', requireAuth, async (req, res, next) => {
  try {
    const doc = await req.app.locals.db.collection('club_members')
      .findOne({ accountId: new ObjectId(req.account.id) }, { sort: { createdAt: -1 } });
    if (!doc) {
      return res.status(404).json({ error: 'membership_not_found', message: 'This account has no Sanctuary Club membership yet.' });
    }
    return res.json(publicMembership(doc, new Date()));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
