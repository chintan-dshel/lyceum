import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/app.js';
import { createTestUser, authHeader } from '../helpers/auth.js';
import {
  createTestProgram, createTestSemester, createTestCourse,
  insertCertificate, cleanup,
} from '../helpers/db.js';

const app = createTestApp();
let userA;
let program;

beforeEach(async () => {
  userA = await createTestUser();
  program = await createTestProgram(userA.id);
});

afterEach(async () => {
  await cleanup(userA?.id);
});

// ── Public verification ───────────────────────────────────────────────────────

describe('GET /api/certificates/:code (public)', () => {
  it('returns 200 + certificate for valid verification_code', async () => {
    const cert = await insertCertificate(userA.id, program.id, { full_name: userA.full_name });

    const res = await request(app)
      .get(`/api/certificates/${cert.verification_code}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      verified: true,
      certificate: expect.objectContaining({
        id: cert.id,
        full_name: userA.full_name,
        degree_type: 'bachelor',
      }),
    });
  });

  it('returns 404 for unknown verification_code', async () => {
    const fakeCode = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .get(`/api/certificates/${fakeCode}`);
    expect(res.status).toBe(404);
  });

  it('requires no Authorization header (truly public)', async () => {
    const cert = await insertCertificate(userA.id, program.id);
    const res = await request(app)
      .get(`/api/certificates/${cert.verification_code}`);
    expect(res.status).toBe(200);
  });
});

// ── Certificate issuance ─────────────────────────────────────────────────────

describe('POST /api/progress/:programId/certificate', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`/api/progress/${program.id}/certificate`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when graduation requirements not met', async () => {
    const res = await request(app)
      .post(`/api/progress/${program.id}/certificate`)
      .set(authHeader(userA));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/requirements not yet met/i);
  });

  it('returns 404 when program does not belong to user', async () => {
    const userB = await createTestUser();
    const programB = await createTestProgram(userB.id);

    const res = await request(app)
      .post(`/api/progress/${programB.id}/certificate`)
      .set(authHeader(userA));

    expect(res.status).toBe(404);
    await cleanup(userB.id);
  });

  it('is idempotent: returns existing certificate on repeat call', async () => {
    const existing = await insertCertificate(userA.id, program.id);

    const res = await request(app)
      .post(`/api/progress/${program.id}/certificate`)
      .set(authHeader(userA));

    expect(res.status).toBe(200);
    expect(res.body.certificate.id).toBe(existing.id);
  });
});

// ── Cross-program access ──────────────────────────────────────────────────────

describe('certificate cross-user isolation', () => {
  it("user A cannot verify with user B's non-existent code", async () => {
    const fakeCode = '11111111-1111-1111-1111-111111111111';
    const res = await request(app).get(`/api/certificates/${fakeCode}`);
    expect(res.status).toBe(404);
  });

  it("user A cannot issue certificate for user B's program", async () => {
    const userB = await createTestUser();
    const programB = await createTestProgram(userB.id);

    const res = await request(app)
      .post(`/api/progress/${programB.id}/certificate`)
      .set(authHeader(userA));

    expect(res.status).toBe(404);
    await cleanup(userB.id);
  });
});
