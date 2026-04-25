/**
 * PII audit middleware — fire-and-forget scan, never blocks the request.
 * Detects: credit card numbers (Luhn), SSNs, and phone numbers.
 * On detection: logs to security_events table and console.
 * Email addresses are NOT flagged — they appear legitimately in learning content.
 */

import crypto from 'crypto';
import { query } from '../db/pool.js';

// Strip non-digits for numeric checks
const digits = s => s.replace(/\D/g, '');

function luhn(num) {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = parseInt(num[i], 10);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const PII_PATTERNS = [
  {
    name: 'credit_card',
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    validate: match => {
      const n = digits(match);
      return n.length >= 13 && n.length <= 19 && luhn(n);
    },
  },
  {
    name: 'ssn',
    regex: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,
    validate: () => true,
  },
  {
    name: 'phone',
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    validate: match => digits(match).length === 10 || digits(match).length === 11,
  },
];

function extractText(body) {
  if (!body || typeof body !== 'object') return null;
  return body.message || body.content || body.text || null;
}

function hashInput(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function hashIP(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function auditAsync(req) {
  const text = extractText(req.body);
  if (!text || typeof text !== 'string') return;

  const found = [];
  for (const { name, regex, validate } of PII_PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (validate(match[0])) {
        found.push(name);
        break;
      }
    }
  }

  if (found.length === 0) return;

  const userId = req.user?.id || null;
  const inputHash = hashInput(text);
  const ipHash = hashIP(req);

  console.warn(`[Security] PII detected user=${userId?.slice(0, 8) || 'anon'} types=${found.join(',')} hash=${inputHash}`);

  query(
    `INSERT INTO security_events (user_id, event_type, detail, ip_hash)
     VALUES ($1, $2, $3, $4)`,
    [userId, 'pii_detected', JSON.stringify({ types: found, inputHash, textLength: text.length }), ipHash]
  ).catch(err => console.error('[Security] Failed to write pii event:', err.message));
}

export function piiAudit(req, res, next) {
  // Fire-and-forget — never holds up the response
  setImmediate(() => auditAsync(req));
  next();
}
