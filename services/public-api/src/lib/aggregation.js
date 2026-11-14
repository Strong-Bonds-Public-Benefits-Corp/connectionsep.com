'use strict';

const { AGE_BANDS } = require('./ageBands');

/**
 * aggregation.js — Heat Map aggregation.
 *
 * TWO AGGREGATION PATHS (flagged in README — the spec is silent on
 * the trigger, and its heat_map shape stores all-time overall
 * aggregates only):
 *
 * 1. Precomputed per-zip overall aggregates (the `heat_map`
 *    collection, spec shape exactly). Recomputed on every check-in
 *    for the affected zip only (recompute-on-write). This is the
 *    path GET /api/heat-map uses for the default view
 *    (dimension=all, range=all).
 *
 * 2. Live aggregation straight from `check_ins`, for filtered views
 *    (a dimension + value) and for time ranges (7d / 30d). The
 *    pipeline returns ONLY { zip, averageScore, checkInCount } —
 *    no individual check-in ever leaves the database.
 *
 * SUPPRESSION (spec v01) is enforced at READ time in both paths:
 * a zip needs 10 check-ins for the public (all) view and 5 for a
 * filtered view. Below that the zip is returned as
 * { zip, suppressed: true, status: "too few voices" } — with NO
 * average and NO count. It never reads as zero, and no single
 * person's score can ever be inferred.
 *
 * Why heat_map stores aggregates for EVERY zip with >= 1 check-in,
 * not just zips past the threshold: the spec says a zip "only
 * appears here once it meets the suppression threshold", but the
 * filtered threshold (5) is lower than the public one (10), and
 * the frontend renders below-threshold zips grey ("not enough data
 * yet"). The collection must hold a zip for the API to know it
 * exists and mark it "too few voices". Suppression is therefore
 * enforced when the API answers, not when it writes. See README.
 */

const THRESHOLD_PUBLIC = 10;
const THRESHOLD_FILTERED = 5;

const DIMENSION_FIELDS = {
  military: 'militaryConnection',
  branch: 'branch',
  college: 'college',
  race: 'raceEthnicity',
  // age is computed from birthYear (see buildLivePipeline).
};

const DIMENSION_VALUES = {
  military: ['Active Duty', 'Veteran', 'National Guard / Reserve', 'Military spouse', 'Military family', 'Civilian'],
  branch: ['Army', 'Marine Corps', 'Navy', 'Air Force', 'Space Force', 'Coast Guard'],
  age: AGE_BANDS,
  college: ['Not a student', 'UTEP', 'EPCC', 'Other college'],
  race: [
    'American Indian or Alaska Native',
    'Asian',
    'Black or African American',
    'Hispanic or Latino',
    'Native Hawaiian or Pacific Islander',
    'White',
    'Two or more races',
  ],
};

const RANGE_DAYS = { '7d': 7, '30d': 30, all: null };

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Recompute the precomputed aggregate for ONE zip from all of its
 * check-ins and upsert it into `heat_map`. Called after every
 * check-in insert (recompute-on-write — the trigger the spec
 * leaves undefined).
 */
async function recomputeZipAggregate(db, zip) {
  const rows = await db.collection('check_ins').aggregate([
    { $match: { zip } },
    {
      $group: {
        _id: '$zip',
        checkInCount: { $sum: 1 },
        averageScore: { $avg: '$score' },
      },
    },
  ]).toArray();

  if (rows.length === 0) return null;

  const row = rows[0];
  const doc = {
    zip,
    averageScore: round1(row.averageScore),
    checkInCount: row.checkInCount,
    updatedAt: new Date(),
  };
  await db.collection('heat_map').updateOne(
    { zip },
    { $set: doc },
    { upsert: true }
  );
  return doc;
}

/**
 * Build the live aggregation pipeline for a filtered and/or
 * time-ranged view. Returns rows of { zip, averageScore,
 * checkInCount } sorted by zip.
 */
async function computeLiveAggregates(db, { dimension, value, rangeDays }) {
  const pipeline = [];
  const match = {};

  if (rangeDays) {
    match.createdAt = { $gte: new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000) };
  }

  if (dimension === 'age') {
    // Birth year becomes an age band inside the pipeline. Check-ins
    // with no birthYear are excluded here (they count in the overall
    // view and in no filtered view).
    match.birthYear = { $type: 'number' };
    pipeline.push({ $match: match });
    pipeline.push({
      $addFields: {
        _ageBand: {
          $switch: {
            branches: [
              { case: { $gte: [{ $subtract: [new Date().getFullYear(), '$birthYear'] }, 56] }, then: '56+' },
              { case: { $gte: [{ $subtract: [new Date().getFullYear(), '$birthYear'] }, 46] }, then: '46-55' },
              { case: { $gte: [{ $subtract: [new Date().getFullYear(), '$birthYear'] }, 36] }, then: '36-45' },
              { case: { $gte: [{ $subtract: [new Date().getFullYear(), '$birthYear'] }, 26] }, then: '26-35' },
              { case: { $gte: [{ $subtract: [new Date().getFullYear(), '$birthYear'] }, 18] }, then: '18-25' },
            ],
            default: 'Under 18',
          },
        },
      },
    });
    pipeline.push({ $match: { _ageBand: value } });
  } else if (dimension !== 'all') {
    match[DIMENSION_FIELDS[dimension]] = value;
    pipeline.push({ $match: match });
  } else {
    pipeline.push({ $match: match });
  }

  pipeline.push({
    $group: {
      _id: '$zip',
      checkInCount: { $sum: 1 },
      averageScore: { $avg: '$score' },
    },
  });
  pipeline.push({ $sort: { _id: 1 } });

  const rows = await db.collection('check_ins').aggregate(pipeline).toArray();
  return rows.map((row) => ({
    zip: row._id,
    averageScore: round1(row.averageScore),
    checkInCount: row.checkInCount,
  }));
}

/**
 * Apply suppression to aggregate rows. Rows below the threshold
 * become "too few voices" markers — zip only, no numbers.
 * Returns { zips, totals }.
 */
function applySuppression(rows, threshold) {
  const zips = [];
  let areasShown = 0;
  let areasSuppressed = 0;
  let totalCheckIns = 0;

  for (const row of rows) {
    if (row.checkInCount < threshold) {
      areasSuppressed += 1;
      zips.push({ zip: row.zip, suppressed: true, status: 'too few voices' });
    } else {
      areasShown += 1;
      totalCheckIns += row.checkInCount;
      zips.push({
        zip: row.zip,
        averageScore: row.averageScore,
        checkInCount: row.checkInCount,
        suppressed: false,
      });
    }
  }

  // Totals count shown areas only — a suppressed zip's volume is
  // never exposed, even in a sum.
  return { zips, totals: { areasShown, areasSuppressed, totalCheckIns } };
}

module.exports = {
  THRESHOLD_PUBLIC,
  THRESHOLD_FILTERED,
  DIMENSION_FIELDS,
  DIMENSION_VALUES,
  RANGE_DAYS,
  round1,
  recomputeZipAggregate,
  computeLiveAggregates,
  applySuppression,
};
