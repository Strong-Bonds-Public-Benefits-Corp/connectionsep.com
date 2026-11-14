'use strict';

const express = require('express');
const { ObjectId } = require('mongodb');

/**
 * catalog.js — public store + menu reads. No login.
 *
 * Spec v01 (collections `products` and `menu`):
 * - GET /api/products — list store products (merch only).
 * - GET /api/products/:id — one product by ID.
 * - GET /api/menu — list café menu items (food and drink only).
 * - GET /api/menu/:id — one menu item by ID.
 *
 * Prices come from the database and nowhere else — the API never
 * trusts a price the frontend sends, and no price is hard-coded
 * here. `products` and `menu` are the single source of truth.
 *
 * Only AVAILABLE items are ever returned. An item with
 * `available: false` is hidden, not deleted, and reads as 404 on
 * the single-item endpoints — the storefront and menu page can
 * never show something that was pulled. A document with no
 * `available` field counts as available (the spec default is
 * `true`), so the filter is `available: { $ne: false }`.
 *
 * IDs are MongoDB ObjectIds. A malformed :id is a 400
 * validation_error; a well-formed ID with no matching available
 * item is a 404. Lists are sorted for stable output (products by
 * name, menu by section then name). No pagination in v01 — the
 * catalogs are small (spec lists none; flagged in README).
 *
 * The documents hold public fields only (name, description, price,
 * category/section, imageUrl, options, available, timestamps), so
 * they are returned as stored. The `menu.options` shape is still
 * undefined in the spec ("to be defined when the café menu is
 * designed") — whatever is stored is returned as-is.
 */
const router = express.Router();

function availableFilter() {
  return { available: { $ne: false } };
}

router.get('/api/products', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const items = await db.collection('products')
      .find(availableFilter())
      .sort({ name: 1 })
      .toArray();
    return res.json({ products: items });
  } catch (err) {
    return next(err);
  }
});

router.get('/api/products/:id', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'validation_error', details: ['id must be a valid product id.'] });
    }
    const db = req.app.locals.db;
    const item = await db.collection('products').findOne({
      _id: new ObjectId(req.params.id),
      ...availableFilter(),
    });
    if (!item) {
      return res.status(404).json({ error: 'not_found', message: 'No such product.' });
    }
    return res.json(item);
  } catch (err) {
    return next(err);
  }
});

router.get('/api/menu', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const items = await db.collection('menu')
      .find(availableFilter())
      .sort({ section: 1, name: 1 })
      .toArray();
    return res.json({ menu: items });
  } catch (err) {
    return next(err);
  }
});

router.get('/api/menu/:id', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'validation_error', details: ['id must be a valid menu item id.'] });
    }
    const db = req.app.locals.db;
    const item = await db.collection('menu').findOne({
      _id: new ObjectId(req.params.id),
      ...availableFilter(),
    });
    if (!item) {
      return res.status(404).json({ error: 'not_found', message: 'No such menu item.' });
    }
    return res.json(item);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
