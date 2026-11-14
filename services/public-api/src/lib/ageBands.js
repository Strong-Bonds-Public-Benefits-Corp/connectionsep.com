'use strict';

/**
 * ageBands.js — birth year to age band.
 *
 * The bands match the Heat Map frontend's age lens exactly
 * (js/main.js VALUES.age): Under 18, 18-25, 26-35, 36-45, 46-55, 56+.
 *
 * The raw birth year NEVER appears in any Heat Map output. It is
 * converted to a band here, at aggregation time. A check-in with no
 * birthYear ("Prefer not to say") belongs to the overall view only
 * and to no age-filtered view.
 */

const AGE_BANDS = ['Under 18', '18-25', '26-35', '36-45', '46-55', '56+'];

function ageBandForBirthYear(birthYear, now = new Date()) {
  if (!Number.isInteger(birthYear)) return null;
  const age = now.getFullYear() - birthYear;
  if (age < 0) return null;
  if (age < 18) return 'Under 18';
  if (age <= 25) return '18-25';
  if (age <= 35) return '26-35';
  if (age <= 45) return '36-45';
  if (age <= 55) return '46-55';
  return '56+';
}

module.exports = { AGE_BANDS, ageBandForBirthYear };
