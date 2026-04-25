import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/app.js';
import { createTestUser, makeToken } from '../helpers/auth.js';
import { cleanup } from '../helpers/db.js';

const app = createTestApp();
let testUser;

beforeEach(async () => {
  testUser = await createTestUser();
});

afterEach(async () => {
  await cleanup(testUser?.id);
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns token + user object', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `reg-${Date.now()}@test.com`, password: 'password123', full_name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      token: expect.any(String),
      user: { email: expect.any(String), full_name: 'New User' },
    });
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('rejects duplicate email with 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testUser.email, password: 'password123', full_name: 'Dup User' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('rejects missing fields with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'no-password@test.com' });

    expect(res.status).toBe(400);
  });

  it('rejects short password with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `short-${Date.now()}@test.com`, password: '123', full_name: 'Short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it('lowercases email before storing', async () => {
    const email = `UPPER-${Date.now()}@TEST.COM`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', full_name: 'Upper' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email.toLowerCase());
  });
});

describe('POST /api/auth/login', () => {
  it('returns token + user for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      token: expect.any(String),
      user: { email: testUser.email },
    });
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects unknown email with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@nowhere.com', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('rejects missing credentials with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email });

    expect(res.status).toBe(400);
  });

  it('login is case-insensitive for email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email.toUpperCase(), password: testUser.password });

    expect(res.status).toBe(200);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user data for valid token', async () => {
    const token = makeToken(testUser.id, testUser.email);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: testUser.id,
      email: testUser.email,
      full_name: testUser.full_name,
    });
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-valid-jwt');
    expect(res.status).toBe(401);
  });

  it('returns 401 with expired token', async () => {
    const expiredToken = makeToken(testUser.id, testUser.email).split('.').map((part, i) => {
      if (i !== 1) return part;
      const payload = JSON.parse(Buffer.from(part, 'base64').toString());
      payload.exp = Math.floor(Date.now() / 1000) - 3600;
      return Buffer.from(JSON.stringify(payload)).toString('base64url');
    }).join('.');

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong Bearer scheme', async () => {
    const token = makeToken(testUser.id, testUser.email);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Token ${token}`);
    expect(res.status).toBe(401);
  });
});
