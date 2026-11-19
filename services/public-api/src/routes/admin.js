'use strict';

const express = require('express');
const crypto = require('node:crypto');

/**
 * admin.js — admin-only endpoints for the public API.
 *
 * POST /api/admin/seed-products — upsert product documents into the
 * `products` collection (Resilience Market catalog). This is the
 * server-side path for adding new products when the VM cannot reach
 * Atlas directly (no MongoDB-protocol access from the VM) and the
 * Atlas web UI needs a security key the cloud browser cannot use.
 * Same validation and upsert semantics as seed/seed-products.js
 * (upsert keyed on `sku`, so re-running is safe).
 *
 * Auth: header `x-seed-secret` must equal the SEED_SECRET
 * environment variable. If SEED_SECRET is not set, the endpoint
 * answers 503 `seed_not_configured` (fail closed). The secret is
 * never logged. Compared in constant time.
 *
 * Body: a single product document object, or an array of product
 * documents. Each document needs a non-empty name, a finite price
 * greater than 0 in dollars, a unique non-empty sku, and an
 * imageUrl that is a relative path under assets/ — a Square CDN URL
 * (http...) is refused outright, because the pictures live in
 * GitHub. Unknown fields are kept only if they are plain product
 * fields (description, category, images, available); an `_id`
 * from the caller is never trusted.
 *
 * The global JSON body limit is 10kb, so a request must fit under
 * it — send one product per request, or a small array. Timestamps:
 * createdAt is set on insert only; updatedAt on every upsert.
 * `available` defaults to true when absent.
 *
 * Response 200: { inserted, updated, unchanged, results: [{ sku, action }] }
 * where action is 'inserted' | 'updated' | 'unchanged'.
 */
const router = express.Router();

function secretMatches(provided, expected) {
  if (typeof provided !== 'string' || provided.length === 0) {
    return false;
  }
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function validateDocs(docs) {
  const problems = [];
  const seenSkus = new Set();
  docs.forEach((doc, index) => {
    const where = `doc ${index}${doc && doc.sku ? ` (${doc.sku})` : ''}`;
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      problems.push(`${where}: not an object.`);
      return;
    }
    if (typeof doc.name !== 'string' || doc.name.trim() === '') {
      problems.push(`${where}: name is required.`);
    }
    if (typeof doc.price !== 'number' || !Number.isFinite(doc.price) || doc.price <= 0) {
      problems.push(`${where}: price must be a number greater than 0 (dollars).`);
    }
    if (typeof doc.sku !== 'string' || doc.sku.trim() === '') {
      problems.push(`${where}: sku is required.`);
    } else if (seenSkus.has(doc.sku)) {
      problems.push(`${where}: duplicate sku in this request.`);
    } else {
      seenSkus.add(doc.sku);
    }
    if (typeof doc.imageUrl !== 'string' || doc.imageUrl.trim() === '') {
      problems.push(`${where}: imageUrl is required.`);
    } else if (!doc.imageUrl.startsWith('assets/')) {
      problems.push(`${where}: imageUrl must be a relative path under assets/ (got: ${doc.imageUrl}).`);
    }
  });
  return problems;
}

router.post('/api/admin/seed-products', async (req, res, next) => {
  try {
    const seedSecret = (process.env.SEED_SECRET || '').trim();
    if (!seedSecret) {
      return res.status(503).json({
        error: 'seed_not_configured',
        message: 'Product seeding is not configured on this service.',
      });
    }
    if (!secretMatches(req.headers['x-seed-secret'], seedSecret)) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'A valid seed secret is required.',
      });
    }

    let docs = req.body;
    if (!docs || (typeof docs !== 'object')) {
      return res.status(400).json({
        error: 'validation_error',
        details: ['Body must be a product document or an array of product documents.'],
      });
    }
    if (!Array.isArray(docs)) {
      docs = [docs];
    }
    if (docs.length === 0) {
      return res.status(400).json({
        error: 'validation_error',
        details: ['At least one product document is required.'],
      });
    }

    const problems = validateDocs(docs);
    if (problems.length > 0) {
      return res.status(400).json({ error: 'validation_error', details: problems });
    }

    const db = req.app.locals.db;
    const products = db.collection('products');
    await products.createIndex({ sku: 1 }, { unique: true, name: 'uniq_product_sku' });

    const now = new Date();
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const results = [];
    for (const doc of docs) {
      const { _id, ...fields } = doc; // never trust an _id from the caller
      const result = await products.updateOne(
        { sku: doc.sku },
        {
          $set: { ...fields, available: fields.available !== false, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
      let action;
      if (result.upsertedCount === 1) {
        inserted += 1;
        action = 'inserted';
      } else if (result.modifiedCount === 1) {
        updated += 1;
        action = 'updated';
      } else {
        unchanged += 1;
        action = 'unchanged';
      }
      results.push({ sku: doc.sku, action });
    }

    return res.json({ inserted, updated, unchanged, results });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
