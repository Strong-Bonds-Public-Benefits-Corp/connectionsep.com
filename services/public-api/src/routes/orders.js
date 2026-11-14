'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { ObjectId } = require('mongodb');
const { DISCOUNT_PERCENT } = require('../lib/codes');
const { createPayment, SquarePaymentError } = require('../lib/square');
const { optionalAuth } = require('../middleware/optionalAuth');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * Orders — POST /api/orders (place an order) and GET /api/orders
 * (list your own orders). Spec v01, "Store & orders".
 *
 * Guest checkout (Tony, Nov 14): POST accepts a login token OR no
 * token. A valid token attaches the order to the account
 * (accountId set); no token means a guest order (accountId null).
 * GET stays login-only — a guest has no account to list orders
 * under; the confirmation comes from the POST response.
 *
 * POST body (spec v01 + one addition):
 *   items: [{ productId, quantity }] — required, 1–50 lines,
 *     quantity 1–99 each.
 *   discountCode: optional, one code from a Resilience Check In.
 *   shippingAddress: { street, city, state, zip } — required;
 *     merch ships, so there is no pickup path in v01.
 *   sourceId: required — the payment source token the frontend
 *     got from the Square Web Payments SDK. NOT in the spec's body
 *     list (the spec says "creates the Square payment" without
 *     naming the field); without it there is nothing to charge.
 *     This is a v01 choice, recorded here.
 *
 * Prices come from the `products` collection only — a price the
 * frontend sends is ignored (there is no such field to send).
 * Money is computed in integer cents and stored in the order
 * document in dollars, matching the spec's field types.
 *
 * Order of operations (why this order):
 *   1. Validate the body and the products (exists, available).
 *   2. Validate the discount code (read-only) — a bad code fails
 *      before any money moves.
 *   3. Refuse with 503 if Square is not configured, before any
 *      database write.
 *   4. Consume the code atomically (used:false guard) — one code,
 *      one order, even under concurrent checkouts.
 *   5. Charge Square. If the charge fails, the code is released
 *      (used:false again) so the customer can retry.
 *   6. Write the order (status "paid"). If THAT fails after a
 *      successful charge, the route answers 500 with the Square
 *      payment id so support can reconcile — the money is real
 *      and the order must not vanish silently.
 *
 * A discount code is consumed in step 4 even though the order is
 * written in step 6: a crash between them leaves a used code with
 * no order. That window is seconds long and the code is a
 * one-time-per-check-in discount; a reconciliation job (post-launch)
 * can release codes with no matching order. Recorded in README.
 */

const router = express.Router();

const ZIP_RE = /^\d{5}$/;
const MAX_LINES = 50;
const MAX_QUANTITY = 99;

function dollars(cents) {
  return cents / 100;
}

function publicOrder(doc) {
  return {
    id: doc._id.toString(),
    items: doc.items.map((item) => ({
      productId: item.productId.toString(),
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
    subtotal: doc.subtotal,
    discountCode: doc.discountCode,
    discountAmount: doc.discountAmount,
    total: doc.total,
    squarePaymentId: doc.squarePaymentId,
    shippingAddress: doc.shippingAddress,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

router.post('/api/orders', optionalAuth, async (req, res, next) => {
  const db = req.app.locals.db;
  const now = new Date();
  let consumedCode = null;

  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'validation_error', details: ['Request body must be a JSON object.'] });
    }

    const errors = [];
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_LINES) {
      errors.push(`items is required and must have 1 to ${MAX_LINES} lines.`);
    }
    const lines = [];
    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        if (!item || typeof item !== 'object') {
          errors.push('each item must be an object with productId and quantity.');
          continue;
        }
        if (typeof item.productId !== 'string' || !ObjectId.isValid(item.productId)) {
          errors.push('each item needs a valid productId.');
          continue;
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
          errors.push(`quantity for ${item.productId} must be 1 to ${MAX_QUANTITY}.`);
          continue;
        }
        lines.push({ productId: new ObjectId(item.productId), quantity: item.quantity });
      }
    }
    const address = body.shippingAddress;
    const shippingAddress = {};
    if (!address || typeof address !== 'object' || Array.isArray(address)) {
      errors.push('shippingAddress is required.');
    } else {
      for (const field of ['street', 'city', 'state']) {
        const value = typeof address[field] === 'string' ? address[field].trim() : '';
        if (value.length === 0) {
          errors.push(`shippingAddress.${field} is required.`);
        }
        shippingAddress[field] = value;
      }
      const zip = typeof address.zip === 'string' ? address.zip.trim() : '';
      if (!ZIP_RE.test(zip)) {
        errors.push('shippingAddress.zip must be a 5-digit ZIP code.');
      }
      shippingAddress.zip = zip;
    }
    const discountCode = typeof body.discountCode === 'string' && body.discountCode.trim() !== ''
      ? body.discountCode.trim().toUpperCase()
      : null;
    const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
    if (sourceId.length === 0) {
      errors.push('sourceId is required (the payment source from the Square Web Payments SDK).');
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: 'validation_error', details: errors });
    }

    // 1. Products: exist, available, priced from the database only.
    const ids = [...new Set(lines.map((line) => line.productId.toString()))].map((id) => new ObjectId(id));
    const products = await db.collection('products').find({ _id: { $in: ids } }).toArray();
    const byId = new Map(products.map((product) => [product._id.toString(), product]));
    const pricedLines = [];
    let subtotalCents = 0;
    for (const line of lines) {
      const product = byId.get(line.productId.toString());
      if (!product) {
        return res.status(400).json({ error: 'validation_error', details: [`unknown product: ${line.productId}.`] });
      }
      if (product.available === false) {
        return res.status(400).json({ error: 'validation_error', details: [`${product.name} is not available.`] });
      }
      if (typeof product.price !== 'number' || !Number.isFinite(product.price) || product.price < 0) {
        return next(new Error(`Product ${product._id} has an invalid stored price.`));
      }
      const priceCents = Math.round(product.price * 100);
      subtotalCents += priceCents * line.quantity;
      pricedLines.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: line.quantity,
      });
    }

    // 2. Discount code, read-only validation first.
    let discountCents = 0;
    let codeDoc = null;
    if (discountCode) {
      codeDoc = await db.collection('discount_codes').findOne({ code: discountCode });
      if (!codeDoc) {
        return res.status(400).json({ error: 'invalid_discount_code', reason: 'not_found' });
      }
      if (codeDoc.used) {
        return res.status(400).json({ error: 'invalid_discount_code', reason: 'already_used' });
      }
      if (!(codeDoc.expiresAt instanceof Date) || codeDoc.expiresAt.getTime() <= now.getTime()) {
        return res.status(400).json({ error: 'invalid_discount_code', reason: 'expired' });
      }
      discountCents = Math.round((subtotalCents * DISCOUNT_PERCENT) / 100);
    }

    // 3. Square must be configured before anything is written.
    const squareConfig = req.app.locals.square || {};
    if (!squareConfig.accessToken || !squareConfig.locationId) {
      return res.status(503).json({ error: 'payments_not_configured', message: 'Card payments are not set up yet.' });
    }

    const totalCents = subtotalCents - discountCents;
    if (totalCents <= 0) {
      return res.status(400).json({ error: 'validation_error', details: ['Order total must be greater than zero.'] });
    }

    // 4. Consume the code atomically.
    if (codeDoc) {
      const consumed = await db.collection('discount_codes').findOneAndUpdate(
        { code: discountCode, used: false, expiresAt: { $gt: now } },
        { $set: { used: true, usedAt: now } }
      );
      if (!consumed || !consumed.value) {
        return res.status(400).json({ error: 'invalid_discount_code', reason: 'already_used' });
      }
      consumedCode = discountCode;
    }

    // 5. Charge Square.
    const squareClient = req.app.locals.squareClient || { createPayment };
    let payment;
    try {
      payment = await squareClient.createPayment({
        sourceId,
        amountCents: totalCents,
        idempotencyKey: crypto.randomUUID(),
        locationId: squareConfig.locationId,
        accessToken: squareConfig.accessToken,
        environment: squareConfig.environment || 'sandbox',
      });
    } catch (err) {
      if (consumedCode) {
        try {
          await db.collection('discount_codes').updateOne(
            { code: consumedCode },
            { $set: { used: false, usedAt: null } }
          );
        } catch (_releaseErr) {
          // The charge already failed; the code release is best
          // effort. The code stays used and support can release it.
        }
        consumedCode = null;
      }
      if (err instanceof SquarePaymentError && err.httpStatus === 402) {
        return res.status(402).json({ error: 'payment_declined', message: err.message });
      }
      if (err instanceof SquarePaymentError) {
        return res.status(502).json({ error: 'payment_failed', message: 'The payment provider could not complete the charge.' });
      }
      return next(err);
    }

    // 6. Write the order.
    let inserted;
    try {
      inserted = await db.collection('orders').insertOne({
        accountId: req.account ? new ObjectId(req.account.id) : null,
        items: pricedLines,
        subtotal: dollars(subtotalCents),
        discountCode,
        discountAmount: dollars(discountCents),
        total: dollars(totalCents),
        squarePaymentId: payment.id,
        shippingAddress,
        status: 'paid',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      return res.status(500).json({
        error: 'order_write_failed',
        message: 'Payment succeeded but the order could not be saved. Contact support with this payment reference.',
        squarePaymentId: payment.id,
      });
    }

    return res.status(201).json({
      id: inserted.insertedId.toString(),
      total: dollars(totalCents),
      status: 'paid',
      squarePaymentId: payment.id,
      ...(discountCode ? { discountCode } : {}),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/api/orders', requireAuth, async (req, res, next) => {
  try {
    const docs = await req.app.locals.db.collection('orders')
      .find({ accountId: new ObjectId(req.account.id) })
      .sort({ createdAt: -1 })
      .toArray();
    return res.json({ orders: docs.map(publicOrder) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
