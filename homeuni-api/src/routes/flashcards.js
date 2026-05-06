/**
 * Flashcard routes
 *
 * GET  /api/flashcards/lesson/:lessonId        — deck + per-user SM-2 state
 * POST /api/flashcards/lesson/:lessonId/review — record review (quality 0-5), advance SM-2
 * GET  /api/flashcards/due                     — all cards due today across all lessons
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { query } from '../db/pool.js';
import { generateFlashcards } from '../lib/flashcard.generator.js';
import { mapLessonToContent } from '../lib/course.generator.js';
import { sm2 } from '../lib/sm2.js';

const router = Router();
router.use(requireAuth);

const generatingDecks = new Set();

// ── Get Deck ─────────────────────────────────────────────────────────────────

router.get('/lesson/:lessonId', asyncHandler(async (req, res) => {
  const { lessonId } = req.params;

  // Ownership check
  const { rows: [lesson] } = await query(
    `SELECT l.id, l.title, l.content, l.lesson_spec
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE l.id = $1 AND p.user_id = $2`,
    [lessonId, req.user.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  // Get or generate deck
  let { rows: [deck] } = await query(
    'SELECT * FROM flashcard_decks WHERE lesson_id = $1',
    [lessonId]
  );

  let generating = false;
  if (!deck) {
    if (!generatingDecks.has(lessonId)) {
      generatingDecks.add(lessonId);
      setImmediate(async () => {
        try {
          if (lesson.lesson_spec?.core_content !== undefined) {
            lesson.content = mapLessonToContent(lesson.lesson_spec);
          }
          const cards = await generateFlashcards({
            lesson,
            lessonTitle: lesson.title,
            meta: { userId: req.user.id },
          });
          if (cards.length > 0) {
            await query(
              `INSERT INTO flashcard_decks (lesson_id, cards)
               VALUES ($1, $2)
               ON CONFLICT (lesson_id) DO UPDATE SET cards = EXCLUDED.cards`,
              [lessonId, JSON.stringify(cards)]
            );
          }
        } catch (err) {
          console.error('[Flashcards] Generation failed:', err.message);
        } finally {
          generatingDecks.delete(lessonId);
        }
      });
    }
    generating = true;
  }

  // Fetch user's SM-2 states for this deck
  const { rows: reviews } = await query(
    `SELECT card_index, easiness, interval_days, repetitions, due_date, last_quality, reviewed_at
     FROM flashcard_reviews
     WHERE user_id = $1 AND lesson_id = $2`,
    [req.user.id, lessonId]
  );

  const reviewMap = Object.fromEntries(reviews.map(r => [r.card_index, {
    ...r,
    easiness: parseFloat(r.easiness),
    interval_days: parseInt(r.interval_days, 10),
    repetitions: parseInt(r.repetitions, 10),
  }]));
  const cards = (deck?.cards || []).map((c, i) => ({
    ...c,
    index: i,
    sm2: reviewMap[i] || null,
  }));

  res.json({ cards, generating, totalCards: cards.length });
}));

// ── Record Review ─────────────────────────────────────────────────────────────

router.post('/lesson/:lessonId/review', asyncHandler(async (req, res) => {
  const { lessonId } = req.params;
  const { cardIndex, quality } = req.body;

  if (cardIndex === undefined || quality === undefined) {
    return res.status(400).json({ error: 'cardIndex and quality are required' });
  }
  if (quality < 0 || quality > 5) {
    return res.status(400).json({ error: 'quality must be 0-5' });
  }

  // Ownership check
  const { rows: [lesson] } = await query(
    `SELECT l.id FROM lessons l
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE l.id = $1 AND p.user_id = $2`,
    [lessonId, req.user.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  // Load existing state
  const { rows: [existing] } = await query(
    `SELECT easiness, interval_days, repetitions FROM flashcard_reviews
     WHERE user_id = $1 AND lesson_id = $2 AND card_index = $3`,
    [req.user.id, lessonId, cardIndex]
  );

  const next = sm2(
    existing
      ? { easiness: existing.easiness, intervalDays: existing.interval_days, repetitions: existing.repetitions }
      : {},
    quality
  );

  await query(
    `INSERT INTO flashcard_reviews
       (user_id, lesson_id, card_index, easiness, interval_days, repetitions, due_date, last_quality, reviewed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (user_id, lesson_id, card_index) DO UPDATE SET
       easiness = EXCLUDED.easiness,
       interval_days = EXCLUDED.interval_days,
       repetitions = EXCLUDED.repetitions,
       due_date = EXCLUDED.due_date,
       last_quality = EXCLUDED.last_quality,
       reviewed_at = EXCLUDED.reviewed_at`,
    [req.user.id, lessonId, cardIndex, next.easiness, next.intervalDays, next.repetitions, next.dueDate, quality]
  );

  res.json({ next });
}));

// ── Bulk Generate ─────────────────────────────────────────────────────────────
// Generates decks for all lessons that have a lesson_spec but no non-empty deck.

router.post('/generate-all', asyncHandler(async (req, res) => {
  const { rows: lessons } = await query(
    `SELECT l.id, l.title, l.content, l.lesson_spec
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE p.user_id = $1
       AND l.lesson_spec IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM flashcard_decks fd
         WHERE fd.lesson_id = l.id
           AND jsonb_array_length(fd.cards) > 0
       )`,
    [req.user.id]
  );

  const pending = lessons.filter(l => !generatingDecks.has(l.id));

  for (const lesson of pending) {
    generatingDecks.add(lesson.id);
    // Re-derive clean content from lesson_spec before generating cards
    if (lesson.lesson_spec?.core_content !== undefined) {
      lesson.content = mapLessonToContent(lesson.lesson_spec);
    }
    setImmediate(async () => {
      try {
        const cards = await generateFlashcards({
          lesson,
          lessonTitle: lesson.title,
          meta: { userId: req.user.id },
        });
        if (cards.length > 0) {
          await query(
            `INSERT INTO flashcard_decks (lesson_id, cards)
             VALUES ($1, $2)
             ON CONFLICT (lesson_id) DO UPDATE SET cards = EXCLUDED.cards`,
            [lesson.id, JSON.stringify(cards)]
          );
          console.log(`[Flashcards] ✓ Generated ${cards.length} cards for "${lesson.title}"`);
        } else {
          console.warn(`[Flashcards] 0 cards generated for "${lesson.title}" — skipping insert`);
        }
      } catch (err) {
        console.error('[Flashcards] Bulk generation failed:', lesson.id, err.message);
      } finally {
        generatingDecks.delete(lesson.id);
      }
    });
  }

  res.json({ generating: pending.length, total: lessons.length });
}));

// ── Due Cards ─────────────────────────────────────────────────────────────────

router.get('/due', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT fr.lesson_id, fr.card_index, fr.due_date, fr.easiness, fr.interval_days, fr.repetitions,
            l.title AS lesson_title, fd.cards
     FROM flashcard_reviews fr
     JOIN lessons l ON l.id = fr.lesson_id
     JOIN flashcard_decks fd ON fd.lesson_id = fr.lesson_id
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE fr.user_id = $1 AND fr.due_date <= CURRENT_DATE AND p.user_id = $1`,
    [req.user.id]
  );

  const due = rows.map(r => {
    const card = r.cards[r.card_index];
    return {
      lessonId: r.lesson_id,
      lessonTitle: r.lesson_title,
      cardIndex: r.card_index,
      front: card?.front,
      back: card?.back,
      tags: card?.tags || [],
      dueDate: r.due_date,
      easiness: r.easiness,
      intervalDays: r.interval_days,
      repetitions: r.repetitions,
    };
  });

  res.json({ due, count: due.length });
}));

export default router;
