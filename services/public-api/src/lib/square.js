'use strict';

/**
 * square.js — a thin client for Square's Payments API.
 *
 * Why plain HTTPS instead of Square's Node SDK: the SDK's import
 * shape changes across major versions, while the REST endpoint
 * (POST /v2/payments) is stable. This module is one function with
 * one job — charge a payment source the frontend tokenized with
 * the Square Web Payments SDK — and it is trivially stubbed in
 * tests (the orders route reads app.locals.squareClient when one
 * is set).
 *
 * Money is integer cents here. The products collection stores
 * prices in dollars (spec v01); the orders route converts.
 * Square charges in the smallest currency unit, so a $49.50
 * hoodie is amount 4950, currency USD.
 *
 * Errors: Square answers a declined card with HTTP 402 and an
 * errors[] array; anything else non-2xx is a provider failure.
 * Both arrive as SquarePaymentError with .httpStatus and
 * .squareErrors, so the route can tell a decline (402, the
 * customer's card) from a provider problem (502, our side).
 * A network failure throws the underlying fetch error.
 */

const SANDBOX_BASE = 'https://connect.squareupsandbox.com';
const PRODUCTION_BASE = 'https://connect.squareup.com';

class SquarePaymentError extends Error {
  constructor(message, httpStatus, squareErrors) {
    super(message);
    this.name = 'SquarePaymentError';
    this.httpStatus = httpStatus;
    this.squareErrors = squareErrors || [];
  }
}

async function createPayment({ sourceId, amountCents, idempotencyKey, locationId, accessToken, environment }) {
  if (!sourceId || !Number.isInteger(amountCents) || amountCents <= 0 || !locationId || !accessToken) {
    throw new Error('createPayment called with missing or invalid arguments.');
  }

  const base = environment === 'production' ? PRODUCTION_BASE : SANDBOX_BASE;
  const response = await fetch(`${base}/v2/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_id: sourceId,
      idempotency_key: idempotencyKey,
      amount_money: { amount: amountCents, currency: 'USD' },
      location_id: locationId,
      autocomplete: true,
    }),
  });

  let json = {};
  try {
    json = await response.json();
  } catch (_err) {
    // A non-JSON body is still a failure; handled below by status.
  }

  if (!response.ok) {
    const errors = Array.isArray(json.errors) ? json.errors : [];
    const detail = errors.length > 0 && errors[0].detail
      ? errors[0].detail
      : `Square returned HTTP ${response.status}.`;
    throw new SquarePaymentError(detail, response.status, errors);
  }

  if (!json.payment || !json.payment.id) {
    throw new SquarePaymentError('Square returned a successful response without a payment.', response.status, []);
  }

  return { id: json.payment.id, status: json.payment.status };
}

module.exports = { createPayment, SquarePaymentError };
