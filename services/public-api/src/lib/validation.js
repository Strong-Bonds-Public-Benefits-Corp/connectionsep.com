'use strict';

/**
 * validation.js — check-in request validation and PII stripping.
 *
 * PRIVACY RULE (spec v01): a check-in stores ONLY the fields the
 * spec lists — score, zip, birthYear, raceEthnicity,
 * militaryConnection, branch, college, alias, createdAt. No email,
 * no real name, no link to a discount code, no link to an account.
 *
 * The check-in page ALSO collects store-order fields (first/last
 * name, street, city, state, phone, email) in its "For the
 * Resilience Market" section. Those belong to an order, never to a
 * check-in. If any of them arrive in a check-in body they are
 * dropped here — stripped, not stored, not logged. Any other
 * unknown field is dropped the same way. Only the 8 spec fields
 * can ever reach the database.
 *
 * Allowed option values are the check-in form's own option lists
 * (checkin.html). The spec's examples for militaryConnection are
 * lowercase paraphrases ("active duty, veteran, family, civilian");
 * the form sends title-case labels, and those are what the code
 * accepts (flagged in README).
 */

const ALLOWED = {
  raceEthnicity: [
    'American Indian or Alaska Native',
    'Asian',
    'Black or African American',
    'Hispanic or Latino',
    'Native Hawaiian or Pacific Islander',
    'White',
    'Two or more races',
  ],
  militaryConnection: [
    'Active Duty',
    'Veteran',
    'National Guard / Reserve',
    'Military spouse',
    'Military family',
    'Civilian',
  ],
  branch: [
    'Army',
    'Marine Corps',
    'Navy',
    'Air Force',
    'Space Force',
    'Coast Guard',
  ],
  college: ['Not a student', 'UTEP', 'EPCC', 'Other college'],
};

// Store-order / identity fields. Must NEVER be stored in check_ins.
const PII_FIELDS = new Set([
  'firstname', 'firstName',
  'lastname', 'lastName',
  'street', 'address', 'city', 'state',
  'phone', 'email', 'name',
]);

// The only fields a check-in document may contain (plus createdAt).
const CHECK_IN_FIELDS = new Set([
  'score', 'zip', 'birthYear', 'raceEthnicity',
  'militaryConnection', 'branch', 'college', 'alias',
]);

const ALIAS_MAX_LENGTH = 100;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asAbsent(value) {
  return value === undefined || value === null || value === '';
}

/**
 * Validate a POST /api/check-ins body.
 * Returns { ok, errors, doc, strippedCount }.
 * - ok: true when the body is valid.
 * - errors: human-readable list (sent back as a 400).
 * - doc: the exact document to insert (only when ok). createdAt is
 *   added by the route, not here.
 * - strippedCount: how many PII/unknown fields were dropped. The
 *   values are never logged — only the count, for observability.
 */
function validateCheckIn(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    return { ok: false, errors: ['Request body must be a JSON object.'], doc: null, strippedCount: 0 };
  }

  // Strip everything that is not a spec field. Count PII fields
  // separately in spirit, but report only a single count — values
  // are never written to a log.
  let strippedCount = 0;
  for (const key of Object.keys(body)) {
    if (!CHECK_IN_FIELDS.has(key)) strippedCount += 1;
  }

  // score — required, integer 1–10.
  const score = body.score;
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    errors.push('score is required and must be a whole number from 1 to 10.');
  }

  // zip — required, exactly 5 digits.
  const zip = body.zip;
  if (typeof zip !== 'string' || !/^[0-9]{5}$/.test(zip)) {
    errors.push('zip is required and must be a 5-digit zip code.');
  }

  // birthYear — optional, integer 1900..current year.
  let birthYear;
  if (!asAbsent(body.birthYear)) {
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(body.birthYear) || body.birthYear < 1900 || body.birthYear > currentYear) {
      errors.push(`birthYear must be a whole year from 1900 to ${currentYear}.`);
    } else {
      birthYear = body.birthYear;
    }
  }

  // Optional option-list fields: empty means "Prefer not to say"
  // (the field is omitted, so it counts in the overall view and in
  // no filtered view). A value outside the form's list is rejected.
  const optional = {};
  for (const field of ['raceEthnicity', 'militaryConnection', 'branch', 'college']) {
    const value = body[field];
    if (asAbsent(value)) continue;
    if (typeof value !== 'string' || !ALLOWED[field].includes(value)) {
      errors.push(`${field} must be one of: ${ALLOWED[field].join(', ')}.`);
    } else {
      optional[field] = value;
    }
  }

  // Branch only applies with a military connection. The form clears
  // it when none applies; the server drops it too, so a stale or
  // hand-crafted branch can never attach to a civilian check-in.
  if (optional.branch && !optional.militaryConnection) {
    delete optional.branch;
    strippedCount += 1;
  }

  // alias — optional free text, trimmed, capped.
  let alias;
  if (!asAbsent(body.alias)) {
    if (typeof body.alias !== 'string') {
      errors.push('alias must be text.');
    } else {
      const trimmed = body.alias.trim();
      if (trimmed.length > ALIAS_MAX_LENGTH) {
        errors.push(`alias must be ${ALIAS_MAX_LENGTH} characters or fewer.`);
      } else if (trimmed.length > 0) {
        alias = trimmed;
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, doc: null, strippedCount };
  }

  const doc = { score, zip };
  if (birthYear !== undefined) doc.birthYear = birthYear;
  for (const [key, value] of Object.entries(optional)) doc[key] = value;
  if (alias !== undefined) doc.alias = alias;

  return { ok: true, errors: [], doc, strippedCount };
}

module.exports = { ALLOWED, PII_FIELDS, CHECK_IN_FIELDS, validateCheckIn };
