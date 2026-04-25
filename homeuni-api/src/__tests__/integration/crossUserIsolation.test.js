/**
 * Cross-user isolation tests — the non-negotiable security layer.
 *
 * Every test here asserts that user A cannot read, write, or modify
 * user B's resources regardless of what ID is supplied in the URL.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/app.js';
import { createTestUser, authHeader } from '../helpers/auth.js';
import {
  createTestProgram, createTestSemester, createTestCourse,
  createTestLesson, insertCertificate, insertFlashcardDeck, cleanup,
} from '../helpers/db.js';

const app = createTestApp();

let userA, userB;
let programA, programB;
let semesterA, semesterB;
let courseA, courseB;
let lessonA, lessonB;

beforeEach(async () => {
  [userA, userB] = await Promise.all([createTestUser(), createTestUser()]);

  [programA, programB] = await Promise.all([
    createTestProgram(userA.id),
    createTestProgram(userB.id),
  ]);

  [semesterA, semesterB] = await Promise.all([
    createTestSemester(programA.id),
    createTestSemester(programB.id),
  ]);

  [courseA, courseB] = await Promise.all([
    createTestCourse(semesterA.id, programA.id),
    createTestCourse(semesterB.id, programB.id),
  ]);

  [lessonA, lessonB] = await Promise.all([
    createTestLesson(courseA.id),
    createTestLesson(courseB.id),
  ]);
});

afterEach(async () => {
  await cleanup(userA?.id, userB?.id);
});

describe('unauthenticated access', () => {
  const PROTECTED = [
    ['GET',  '/api/auth/me'],
    ['GET',  '/api/flashcards/due'],
    ['POST', '/api/flashcards/lesson/00000000-0000-0000-0000-000000000001/review'],
    ['POST', '/api/progress/00000000-0000-0000-0000-000000000001/certificate'],
  ];

  it.each(PROTECTED)('%s %s → 401 (no auth header)', async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path);
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});

describe('cross-user resource access', () => {
  it("user A cannot view user B's certificate issuance endpoint", async () => {
    const res = await request(app)
      .post(`/api/progress/${programB.id}/certificate`)
      .set(authHeader(userA));

    expect([403, 404]).toContain(res.status);
  });

  it("user A cannot read user B's flashcard deck", async () => {
    await insertFlashcardDeck(lessonB.id, [
      { front: 'Secret Q?', back: 'Secret A', tags: [] },
    ]);

    const res = await request(app)
      .get(`/api/flashcards/lesson/${lessonB.id}`)
      .set(authHeader(userA));

    expect(res.status).toBe(404);
  });

  it("user A cannot submit a flashcard review for user B's lesson", async () => {
    const res = await request(app)
      .post(`/api/flashcards/lesson/${lessonB.id}/review`)
      .set(authHeader(userA))
      .send({ cardIndex: 0, quality: 4 });

    expect(res.status).toBe(404);
  });

  it("user B's certificate code is accessible publicly, but not tied to user A's auth", async () => {
    const cert = await insertCertificate(userB.id, programB.id);

    // Public verification — anyone can view (expected behaviour)
    const publicRes = await request(app)
      .get(`/api/certificates/${cert.verification_code}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.certificate.user_id).toBe(userB.id);

    // But the certificate cannot be re-issued by user A
    const issueRes = await request(app)
      .post(`/api/progress/${programB.id}/certificate`)
      .set(authHeader(userA));
    expect([403, 404]).toContain(issueRes.status);
  });
});

describe('invalid/non-existent resource IDs', () => {
  const NIL_UUID = '00000000-0000-0000-0000-000000000000';

  it('non-existent programId → 404, not a server error', async () => {
    const res = await request(app)
      .post(`/api/progress/${NIL_UUID}/certificate`)
      .set(authHeader(userA));
    expect(res.status).toBe(404);
  });

  it('non-existent lessonId for flashcards → 404, not a server error', async () => {
    const res = await request(app)
      .get(`/api/flashcards/lesson/${NIL_UUID}`)
      .set(authHeader(userA));
    expect(res.status).toBe(404);
  });

  it('non-existent certificate code → 404', async () => {
    const res = await request(app).get(`/api/certificates/${NIL_UUID}`);
    expect(res.status).toBe(404);
  });
});
