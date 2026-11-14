'use strict';

/**
 * errorHandler.js — error responses.
 *
 * 404: unknown endpoint. 500: anything unexpected — the stack is
 * logged server-side and never sent to the caller.
 */

function notFound(_req, res) {
  return res.status(404).json({ error: 'not_found', message: 'No such endpoint.' });
}

function errorHandler(err, _req, res, _next) {
  console.error(err);
  return res.status(500).json({
    error: 'internal_error',
    message: 'Something went wrong. Please try again.',
  });
}

module.exports = { notFound, errorHandler };
