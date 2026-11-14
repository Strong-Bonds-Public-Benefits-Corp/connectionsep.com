'use strict';

const express = require('express');
const {
  THRESHOLD_PUBLIC,
  THRESHOLD_FILTERED,
  DIMENSION_VALUES,
  RANGE_DAYS,
  computeLiveAggregates,
  applySuppression,
} = require('../lib/aggregation');

/**
 * GET /api/heat-map — read the Resilience Heat Map. Public, no login.
 *
 * Query params:
 *   dimension  all | military | branch | age | college | race   (default: all)
 *   value      the group inside the dimension (required unless dimension=all)
 *   range      7d | 30d | all                             (default: 30d — matches
 *                                                          the frontend's default button)
 *
 * Data source:
 * - dimension=all, range=all → the precomputed `heat_map`
 *   collection (spec shape: zip, averageScore, checkInCount).
 * - Any filter or time range → live aggregation from `check_ins`.
 *   The spec's heat_map shape stores all-time overall aggregates
 *   only, so filtered/time-ranged views cannot come from it.
 *   The pipeline returns aggregates only; no individual check-in
 *   is ever returned (flagged in README).
 *
 * Suppression (spec v01): 10 check-ins for the public view, 5 for
 * a filtered view. Below that, the zip is returned as
 * { zip, suppressed: true, status: "too few voices" } — no average,
 * no count. Never zero, never one person's score.
 *
 * Response:
 * {
 *   dimension, value, range, threshold, generatedAt,
 *   zips: [ { zip, averageScore, checkInCount, suppressed: false }
 *         | { zip, suppressed: true, status: "too few voices" } ],
 *   totals: { areasShown, areasSuppressed, totalCheckIns }
 * }
 * totals.totalCheckIns counts shown areas only.
 */
const router = express.Router();

router.get('/api/heat-map', async (req, res, next) => {
  try {
    const dimension = (req.query.dimension || 'all').toString();
    const value = req.query.value === undefined ? null : req.query.value.toString();
    const range = (req.query.range || '30d').toString();

    const errors = [];
    const knownDimensions = ['all', ...Object.keys(DIMENSION_VALUES)];

    if (!knownDimensions.includes(dimension)) {
      errors.push(`dimension must be one of: ${knownDimensions.join(', ')}.`);
    }
    if (dimension === 'all' && value !== null) {
      errors.push('value requires a dimension other than all.');
    }
    if (dimension !== 'all' && DIMENSION_VALUES[dimension]) {
      if (value === null || value === '') {
        errors.push(`value is required when dimension is ${dimension}.`);
      } else if (!DIMENSION_VALUES[dimension].includes(value)) {
        errors.push(`value must be one of: ${DIMENSION_VALUES[dimension].join(', ')}.`);
      }
    }
    if (!Object.prototype.hasOwnProperty.call(RANGE_DAYS, range)) {
      errors.push('range must be one of: 7d, 30d, all.');
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: 'validation_error', details: errors });
    }

    const threshold = dimension === 'all' ? THRESHOLD_PUBLIC : THRESHOLD_FILTERED;
    const rangeDays = RANGE_DAYS[range];
    const db = req.app.locals.db;

    let rows;
    if (dimension === 'all' && range === 'all') {
      const docs = await db.collection('heat_map').find({}).sort({ zip: 1 }).toArray();
      rows = docs.map((doc) => ({
        zip: doc.zip,
        averageScore: doc.averageScore,
        checkInCount: doc.checkInCount,
      }));
    } else {
      rows = await computeLiveAggregates(db, { dimension, value, rangeDays });
    }

    const { zips, totals } = applySuppression(rows, threshold);

    return res.json({
      dimension,
      value,
      range,
      threshold,
      generatedAt: new Date().toISOString(),
      zips,
      totals,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
