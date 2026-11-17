'use strict';

/**
 * seed-products.js — upsert the Resilience Market catalog into the
 * PUBLIC database (strong-bonds-public, `products` collection).
 *
 * Reads the seed JSON (default: products-20261116.json next to this
 * file) and upserts each document keyed on its `sku`, so re-running
 * is safe. Creates a unique index on `products.sku` first.
 *
 * The connection string comes from the PUBLIC_DB_URI environment
 * variable ONLY. It is never read from a file in this repo, never
 * printed, never logged. Without it the script exits with a clear
 * error — it never invents a connection.
 *
 *   PUBLIC_DB_URI='mongodb+srv://...' node seed/seed-products.js
 *   node seed/seed-products.js --dry-run   (validate + print plan, no DB)
 *
 * Validation (both modes): every document needs a non-empty name, a
 * finite price > 0 in dollars, a unique non-empty sku, and an
 * imageUrl that is a RELATIVE path under assets/ — a Square CDN URL
 * (http...) is refused outright, because the point of this seed is
 * that the pictures live in GitHub.
 *
 * Timestamps: createdAt is set on insert only; updatedAt on every
 * upsert. `available` defaults to true when absent.
 */

const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const DEFAULT_FILE = path.join(__dirname, 'products-20261116.json');

function fail(message) {
  console.error(`seed-products: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { dryRun: false, file: DEFAULT_FILE };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') {
      args.dryRun = true;
    } else if (argv[i] === '--file' && argv[i + 1]) {
      args.file = path.resolve(argv[i + 1]);
      i += 1;
    } else {
      fail(`unknown argument: ${argv[i]} (usage: node seed-products.js [--dry-run] [--file <path>])`);
    }
  }
  return args;
}

function loadAndValidate(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (_err) {
    fail(`cannot read seed file: ${file}`);
  }
  let docs;
  try {
    docs = JSON.parse(raw);
  } catch (err) {
    fail(`seed file is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(docs) || docs.length === 0) {
    fail('seed file must be a non-empty JSON array of product documents.');
  }
  const seenSkus = new Set();
  const problems = [];
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
      problems.push(`${where}: duplicate sku in this file.`);
    } else {
      seenSkus.add(doc.sku);
    }
    if (typeof doc.imageUrl !== 'string' || doc.imageUrl.trim() === '') {
      problems.push(`${where}: imageUrl is required.`);
    } else if (!doc.imageUrl.startsWith('assets/')) {
      problems.push(`${where}: imageUrl must be a relative path under assets/ (got: ${doc.imageUrl}).`);
    }
  });
  if (problems.length > 0) {
    fail(`seed file failed validation:\n  - ${problems.join('\n  - ')}`);
  }
  return docs;
}

async function main() {
  const args = parseArgs(process.argv);
  const docs = loadAndValidate(args.file);
  console.log(`seed-products: ${docs.length} documents from ${args.file}`);

  if (args.dryRun) {
    docs.forEach((doc) => {
      console.log(`  would upsert ${doc.sku}: ${doc.name} — $${doc.price.toFixed(2)} -> ${doc.imageUrl}`);
    });
    console.log('seed-products: dry run — nothing was written.');
    return;
  }

  const uri = process.env.PUBLIC_DB_URI;
  if (!uri) {
    fail('PUBLIC_DB_URI is not set. Set it in the environment (never in a file or in chat) and re-run.');
  }
  // The URI is a credential: it is used here and nowhere else, and
  // never printed. Do not log it, even partially.

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(); // database named in PUBLIC_DB_URI (strong-bonds-public)
    const products = db.collection('products');
    await products.createIndex({ sku: 1 }, { unique: true, name: 'uniq_product_sku' });

    const now = new Date();
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    for (const doc of docs) {
      const { _id, ...fields } = doc; // never trust an _id from the file
      const result = await products.updateOne(
        { sku: doc.sku },
        {
          $set: { ...fields, available: fields.available !== false, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
      if (result.upsertedCount === 1) {
        inserted += 1;
        console.log(`  inserted ${doc.sku}: ${doc.name}`);
      } else if (result.modifiedCount === 1) {
        updated += 1;
        console.log(`  updated ${doc.sku}: ${doc.name}`);
      } else {
        unchanged += 1;
        console.log(`  unchanged ${doc.sku}: ${doc.name}`);
      }
    }
    console.log(`seed-products: done — ${inserted} inserted, ${updated} updated, ${unchanged} unchanged.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`seed-products: ${err.message}`);
  process.exit(1);
});
