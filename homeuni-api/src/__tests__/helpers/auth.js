import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../../db/pool.js';
import { randomUUID } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-not-for-production';

export async function createTestUser(overrides = {}) {
  const email = overrides.email ?? `test-${randomUUID()}@lyceum.test`;
  const password = overrides.password ?? 'testpassword123';
  const full_name = overrides.full_name ?? 'Test User';
  const password_hash = await bcrypt.hash(password, 1);

  const { rows: [user] } = await query(
    'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, created_at',
    [email, password_hash, full_name]
  );

  return { ...user, password };
}

export function makeToken(userId, email) {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: '1h' });
}

export function authHeader(user) {
  const token = makeToken(user.id, user.email);
  return { Authorization: `Bearer ${token}` };
}
