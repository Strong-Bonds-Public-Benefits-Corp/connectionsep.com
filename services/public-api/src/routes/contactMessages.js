'use strict';

const express = require('express');

/**
 * POST /api/contact-messages — submit a contact form message.
 * Public, no login.
 *
 * Spec v01: body { name, email, message } → writes one document to
 * `contact_messages` with `read: false` (the team marks it true
 * once handled) and `createdAt`. Only the spec fields are stored;
 * anything else in the body is dropped.
 *
 * Validation (v01 choices the spec does not define, recorded here):
 * name 1–100 chars, email must look like an email, message 1–2000
 * chars. A message longer than that is a 400 — the contact form is
 * not a place for essays, and the JSON body limit is 10kb anyway.
 *
 * Response 201: { id, createdAt } — the id is the confirmation
 * reference for "we got it." The message content is not echoed
 * back. There is no read endpoint for messages in v01 (they are
 * handled out of band); adding one would need auth, since messages
 * contain personal contact details.
 */
const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX_LENGTH = 100;
const MESSAGE_MAX_LENGTH = 2000;

router.post('/api/contact-messages', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'validation_error', details: ['Request body must be a JSON object.'] });
    }

    const errors = [];
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
      errors.push(`name is required and must be ${NAME_MAX_LENGTH} characters or fewer.`);
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) {
      errors.push('email is required and must be a valid email address.');
    }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length === 0 || message.length > MESSAGE_MAX_LENGTH) {
      errors.push(`message is required and must be ${MESSAGE_MAX_LENGTH} characters or fewer.`);
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: 'validation_error', details: errors });
    }

    const db = req.app.locals.db;
    const now = new Date();
    const result = await db.collection('contact_messages').insertOne({
      name,
      email,
      message,
      read: false,
      createdAt: now,
    });

    return res.status(201).json({
      id: result.insertedId.toString(),
      createdAt: now.toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
