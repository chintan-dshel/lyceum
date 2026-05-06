import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();

// POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  if (process.env.REGISTRATION_OPEN !== 'true') {
    return res.status(403).json({ error: 'Registration is currently closed.' });
  }

  const { email, password, full_name } = req.body;

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'email, password, and full_name are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows: [user] } = await query(
    'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, created_at',
    [email.toLowerCase(), passwordHash, full_name]
  );

  const token = signToken(user);
  res.status(201).json({ token, user: safeUser(user) });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { rows: [user] } = await query(
    'SELECT id, email, full_name, password_hash, created_at FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken(user);
  res.json({ token, user: safeUser(user) });
}));

// GET /api/auth/me
import { requireAuth } from '../middleware/auth.js';
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows: [user] } = await query(
    'SELECT id, email, full_name, created_at, current_streak, longest_streak, last_active_date FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: safeUser(user) });
}));

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function safeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

export default router;
