'use strict';

const { MongoClient } = require('mongodb');

/**
 * db.js — MongoDB connection to the PUBLIC database only.
 *
 * This module never connects to the Vault database. The database
 * name comes from the connection string itself (client.db() with no
 * argument), so the URI governs which database is used — the code
 * never hard-codes a database name.
 *
 * serverSelectionTimeoutMS is short on purpose: a bad URI or a
 * dead cluster should fail fast at startup instead of hanging.
 */

let client = null;
let db = null;

async function connect(uri) {
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(); // database named in PUBLIC_DB_URI (strong-bonds-public)
  await ensureIndexes(db);
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database is not connected yet.');
  }
  return db;
}

async function ping() {
  if (!client) return false;
  try {
    await client.db().command({ ping: 1 });
    return true;
  } catch (_err) {
    return false;
  }
}

async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

/**
 * Indexes the spec requires (spec v01, "Rules the code must follow"):
 * unique index on discount_codes.code, unique index on heat_map.zip,
 * and unique index on accounts.email.
 *
 * Extra (not in the spec, flagged in README): a compound index on
 * check_ins (zip, createdAt) so the live filtered/time-ranged
 * aggregations and the per-zip recompute stay fast.
 */
async function ensureIndexes(database) {
  await database.collection('discount_codes').createIndex(
    { code: 1 },
    { unique: true, name: 'uniq_discount_code' }
  );
  await database.collection('heat_map').createIndex(
    { zip: 1 },
    { unique: true, name: 'uniq_heat_map_zip' }
  );
  await database.collection('accounts').createIndex(
    { email: 1 },
    { unique: true, name: 'uniq_account_email' }
  );
  await database.collection('check_ins').createIndex(
    { zip: 1, createdAt: -1 },
    { name: 'check_ins_zip_created' }
  );
}

module.exports = { connect, getDb, ping, close, ensureIndexes };
