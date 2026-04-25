import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

// Mock flashcard generator before app loads to prevent real API calls
vi.mock('../../lib/flashcard.generator.js', () => ({
  generateFlashcards: vi.fn().mockResolvedValue([
    { front: 'What is a vector?', back: 'A quantity with magnitude and direction.', tags: ['definition'] },
    { front: 'What is matrix multiplication?', back: 'Row × column dot products.', tags: ['operation'] },
    { front: 'What is an eigenvalue?', back: 'A scalar λ where Av = λv.', tags: ['definition'] },
  ]),
}));

import { createTestApp } from '../helpers/app.js';
import { createTestUser, authHeader } from '../helpers/auth.js';
import {
  createTestProgram, createTestSemester, createTestCourse,
  createTestLesson, insertFlashcardDeck, cleanup,
} from '../helpers/db.js';
import { query } from '../../db/pool.js';

const app = createTestApp();
let user;
let lesson;

beforeEach(async () => {
  user = await createTestUser();
  const program = await createTestProgram(user.id);
  const semester = await createTestSemester(program.id);
  const course = await createTestCourse(semester.id, program.id);
  lesson = await createTestLesson(course.id);
});

afterEach(async () => {
  await cleanup(user?.id);
});

const FIXTURE_CARDS = [
  { front: 'Q1?', back: 'A1', tags: ['tag1'] },
  { front: 'Q2?', back: 'A2', tags: ['tag2'] },
];

describe('GET /api/flashcards/lesson/:lessonId', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/api/flashcards/lesson/${lesson.id}`);
    expect(res.status).toBe(401);
  });

  it('returns generating:true and empty cards when no deck exists', async () => {
    const res = await request(app)
      .get(`/api/flashcards/lesson/${lesson.id}`)
      .set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ generating: true, cards: [], totalCards: 0 });
  });

  it('returns cards with no sm2 state when deck exists but never reviewed', async () => {
    await insertFlashcardDeck(lesson.id, FIXTURE_CARDS);

    const res = await request(app)
      .get(`/api/flashcards/lesson/${lesson.id}`)
      .set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.generating).toBe(false);
    expect(res.body.cards).toHaveLength(2);
    expect(res.body.cards[0]).toMatchObject({ front: 'Q1?', back: 'A1', index: 0, sm2: null });
    expect(res.body.cards[1]).toMatchObject({ front: 'Q2?', back: 'A2', index: 1, sm2: null });
  });

  it('merges sm2 state into cards after a review', async () => {
    await insertFlashcardDeck(lesson.id, FIXTURE_CARDS);

    await request(app)
      .post(`/api/flashcards/lesson/${lesson.id}/review`)
      .set(authHeader(user))
      .send({ cardIndex: 0, quality: 4 });

    const res = await request(app)
      .get(`/api/flashcards/lesson/${lesson.id}`)
      .set(authHeader(user));

    expect(res.body.cards[0].sm2).not.toBeNull();
    expect(res.body.cards[0].sm2).toMatchObject({
      easiness: expect.any(Number),
      interval_days: expect.any(Number),
      repetitions: expect.any(Number),
      due_date: expect.any(String),
    });
    expect(res.body.cards[1].sm2).toBeNull();
  });

  it('returns 404 for a lesson that does not belong to the user', async () => {
    const otherUser = await createTestUser();
    const otherProgram = await createTestProgram(otherUser.id);
    const otherSemester = await createTestSemester(otherProgram.id);
    const otherCourse = await createTestCourse(otherSemester.id, otherProgram.id);
    const otherLesson = await createTestLesson(otherCourse.id);

    const res = await request(app)
      .get(`/api/flashcards/lesson/${otherLesson.id}`)
      .set(authHeader(user));

    expect(res.status).toBe(404);
    await cleanup(otherUser.id);
  });
});

describe('POST /api/flashcards/lesson/:lessonId/review', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`/api/flashcards/lesson/${lesson.id}/review`)
      .send({ cardIndex: 0, quality: 4 });
    expect(res.status).toBe(401);
  });

  it('returns 400 when cardIndex or quality missing', async () => {
    const res = await request(app)
      .post(`/api/flashcards/lesson/${lesson.id}/review`)
      .set(authHeader(user))
      .send({ cardIndex: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when quality out of range', async () => {
    const res = await request(app)
      .post(`/api/flashcards/lesson/${lesson.id}/review`)
      .set(authHeader(user))
      .send({ cardIndex: 0, quality: 6 });
    expect(res.status).toBe(400);
  });

  it('returns sm2 next state after review', async () => {
    const res = await request(app)
      .post(`/api/flashcards/lesson/${lesson.id}/review`)
      .set(authHeader(user))
      .send({ cardIndex: 0, quality: 5 });

    expect(res.status).toBe(200);
    expect(res.body.next).toMatchObject({
      easiness: 2.60,
      intervalDays: 1,
      repetitions: 1,
      dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('upserts state: second review on same card updates (not duplicates)', async () => {
    await request(app)
      .post(`/api/flashcards/lesson/${lesson.id}/review`)
      .set(authHeader(user))
      .send({ cardIndex: 0, quality: 5 });

    await request(app)
      .post(`/api/flashcards/lesson/${lesson.id}/review`)
      .set(authHeader(user))
      .send({ cardIndex: 0, quality: 5 });

    const { rows } = await query(
      'SELECT COUNT(*) AS cnt FROM flashcard_reviews WHERE user_id = $1 AND lesson_id = $2 AND card_index = 0',
      [user.id, lesson.id]
    );
    expect(parseInt(rows[0].cnt)).toBe(1);
  });

  it('second review advances SM-2 state (reps increments)', async () => {
    await request(app)
      .post(`/api/flashcards/lesson/${lesson.id}/review`)
      .set(authHeader(user))
      .send({ cardIndex: 0, quality: 5 });

    const res = await request(app)
      .post(`/api/flashcards/lesson/${lesson.id}/review`)
      .set(authHeader(user))
      .send({ cardIndex: 0, quality: 5 });

    expect(res.body.next.repetitions).toBe(2);
    expect(res.body.next.intervalDays).toBe(6);
  });
});

describe('GET /api/flashcards/due', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/flashcards/due');
    expect(res.status).toBe(401);
  });

  it('returns empty array when nothing is due', async () => {
    const res = await request(app)
      .get('/api/flashcards/due')
      .set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ due: [], count: 0 });
  });

  it('returns cards whose due_date is today or earlier', async () => {
    await insertFlashcardDeck(lesson.id, FIXTURE_CARDS);

    // Seed a review record with due_date in the past
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dueDateStr = yesterday.toISOString().slice(0, 10);

    await query(
      `INSERT INTO flashcard_reviews
         (user_id, lesson_id, card_index, easiness, interval_days, repetitions, due_date, last_quality, reviewed_at)
       VALUES ($1, $2, 0, 2.5, 6, 2, $3, 4, NOW())`,
      [user.id, lesson.id, dueDateStr]
    );

    const res = await request(app)
      .get('/api/flashcards/due')
      .set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.due[0]).toMatchObject({
      lessonId: lesson.id,
      cardIndex: 0,
      front: 'Q1?',
      back: 'A1',
    });
  });

  it('does not return cards due in the future', async () => {
    await insertFlashcardDeck(lesson.id, FIXTURE_CARDS);

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const futureDateStr = nextWeek.toISOString().slice(0, 10);

    await query(
      `INSERT INTO flashcard_reviews
         (user_id, lesson_id, card_index, easiness, interval_days, repetitions, due_date, last_quality, reviewed_at)
       VALUES ($1, $2, 0, 2.5, 7, 2, $3, 5, NOW())`,
      [user.id, lesson.id, futureDateStr]
    );

    const res = await request(app)
      .get('/api/flashcards/due')
      .set(authHeader(user));

    expect(res.body.count).toBe(0);
  });
});
