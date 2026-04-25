import { describe, it, expect } from 'vitest';
import { sm2 } from '../../lib/sm2.js';

const DEFAULT = { easiness: 2.5, intervalDays: 0, repetitions: 0 };

describe('sm2 — pass path (quality >= 3)', () => {
  it('first rep q=5: interval=1, reps=1, EF=2.60', () => {
    const r = sm2(DEFAULT, 5);
    expect(r.repetitions).toBe(1);
    expect(r.intervalDays).toBe(1);
    expect(r.easiness).toBe(2.60);
  });

  it('second rep q=5: interval=6, reps=2, EF=2.70', () => {
    const r = sm2({ easiness: 2.60, intervalDays: 1, repetitions: 1 }, 5);
    expect(r.repetitions).toBe(2);
    expect(r.intervalDays).toBe(6);
    expect(r.easiness).toBe(2.70);
  });

  it('third rep q=5: interval scales by EF (round(6 × 2.7) = 16)', () => {
    const r = sm2({ easiness: 2.70, intervalDays: 6, repetitions: 2 }, 5);
    expect(r.repetitions).toBe(3);
    expect(r.intervalDays).toBe(Math.round(6 * 2.8));
    expect(r.easiness).toBe(2.80);
  });

  it('q=4: EF unchanged (delta = 0), reps=1, interval=1', () => {
    const r = sm2(DEFAULT, 4);
    expect(r.easiness).toBe(2.50);
    expect(r.repetitions).toBe(1);
    expect(r.intervalDays).toBe(1);
  });

  it('q=3: EF decreases to 2.36', () => {
    const r = sm2(DEFAULT, 3);
    expect(r.easiness).toBe(2.36);
    expect(r.repetitions).toBe(1);
    expect(r.intervalDays).toBe(1);
  });
});

describe('sm2 — fail path (quality < 3)', () => {
  it('q=2: resets reps and interval to 1, EF decreases', () => {
    const r = sm2(DEFAULT, 2);
    expect(r.repetitions).toBe(0);
    expect(r.intervalDays).toBe(1);
    expect(r.easiness).toBe(2.18);
  });

  it('q=0: resets reps and interval to 1, EF drops significantly', () => {
    const r = sm2(DEFAULT, 0);
    expect(r.repetitions).toBe(0);
    expect(r.intervalDays).toBe(1);
    expect(r.easiness).toBe(1.70);
  });

  it('fail after many reps: reps reset to 0 regardless of prior history', () => {
    const r = sm2({ easiness: 2.5, intervalDays: 60, repetitions: 8 }, 0);
    expect(r.repetitions).toBe(0);
    expect(r.intervalDays).toBe(1);
  });
});

describe('sm2 — EF floor', () => {
  it('EF cannot drop below 1.3', () => {
    const r = sm2({ easiness: 1.4, intervalDays: 1, repetitions: 1 }, 0);
    expect(r.easiness).toBe(1.30);
  });

  it('EF at exactly 1.3 with failing quality stays at 1.3', () => {
    const r = sm2({ easiness: 1.3, intervalDays: 1, repetitions: 2 }, 1);
    expect(r.easiness).toBe(1.30);
  });
});

describe('sm2 — dueDate', () => {
  it('dueDate is a valid YYYY-MM-DD string', () => {
    const r = sm2(DEFAULT, 4);
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('dueDate for interval=1 is tomorrow', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expected = tomorrow.toISOString().slice(0, 10);
    const r = sm2(DEFAULT, 4);
    expect(r.dueDate).toBe(expected);
  });

  it('dueDate for interval=6 is 6 days from now', () => {
    const future = new Date();
    future.setDate(future.getDate() + 6);
    const expected = future.toISOString().slice(0, 10);
    const r = sm2({ easiness: 2.5, intervalDays: 1, repetitions: 1 }, 5);
    expect(r.dueDate).toBe(expected);
  });
});

describe('sm2 — clamping', () => {
  it('quality above 5 is clamped to 5', () => {
    const r = sm2(DEFAULT, 10);
    expect(r).toEqual(sm2(DEFAULT, 5));
  });

  it('quality below 0 is clamped to 0', () => {
    const r = sm2(DEFAULT, -5);
    expect(r).toEqual(sm2(DEFAULT, 0));
  });

  it('non-integer quality is rounded', () => {
    const r = sm2(DEFAULT, 3.6);
    expect(r).toEqual(sm2(DEFAULT, 4));
  });
});

describe('sm2 — default state', () => {
  it('works with empty object (all defaults)', () => {
    const r = sm2({}, 4);
    expect(r.easiness).toBe(2.50);
    expect(r.repetitions).toBe(1);
    expect(r.intervalDays).toBe(1);
  });
});
