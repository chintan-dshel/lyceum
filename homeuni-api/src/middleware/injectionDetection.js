/**
 * Prompt injection detection middleware.
 * Scans req.body.message (and req.body.content) for known attack patterns.
 * On match: 403, fire-and-forget DB log with input hash (not raw input).
 */

import crypto from 'crypto';
import { query } from '../db/pool.js';

// 7 pattern families covering the main injection attack surface
const PATTERNS = [
  /ignore\s+(previous|above|all|prior)\s+instructions?/i,
  /\b(system\s+prompt|your\s+prompt|original\s+instructions?)\b/i,
  /\b(you\s+are\s+now|pretend\s+(you\s+are|to\s+be)|act\s+as|roleplay\s+as)\b/i,
  /\b(jailbreak|DAN|do\s+anything\s+now|developer\s+mode)\b/i,
  /disregard\s+(all\s+)?(instructions?|rules?|constraints?|guidelines?)/i,
  /\{\{[\s\S]*?\}\}|<\|[\s\S]*?\|>/,     // template injection: {{...}} or <|...|>
  /\b(forget\s+everything|override\s+(your\s+)?(mode|instructions?|purpose))\b/i,
];

function hashInput(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function hashIP(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function extractText(body) {
  if (!body || typeof body !== 'object') return null;
  return body.message || body.content || body.text || null;
}

function writeSecurityEvent(userId, eventType, detail, ipHash) {
  query(
    `INSERT INTO security_events (user_id, event_type, detail, ip_hash)
     VALUES ($1, $2, $3, $4)`,
    [userId || null, eventType, JSON.stringify(detail), ipHash]
  ).catch(err => console.error('[Security] Failed to write security_event:', err.message));
}

export function injectionDetection(req, res, next) {
  const text = extractText(req.body);
  if (!text || typeof text !== 'string') return next();

  const matched = PATTERNS.find(p => p.test(text));
  if (!matched) return next();

  const inputHash = hashInput(text);
  const ipHash = hashIP(req);
  const userId = req.user?.id || null;

  console.warn(`[Security] Injection blocked user=${userId?.slice(0, 8) || 'anon'} hash=${inputHash} pattern=${matched.source.slice(0, 40)}`);

  writeSecurityEvent(userId, 'injection_blocked', {
    inputHash,
    patternIndex: PATTERNS.indexOf(matched),
    textLength: text.length,
  }, ipHash);

  return res.status(403).json({
    error: 'Your message contains content that cannot be processed.',
  });
}
