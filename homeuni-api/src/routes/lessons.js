/**
 * Lessons routes
 *
 * GET    /api/lessons/course/:courseId          — list lessons for a course
 * GET    /api/lessons/:id                       — get full lesson content
 * POST   /api/lessons/:id/visit                 — record/update visit (difficulty signals)
 * POST   /api/lessons/:id/professor/chat        — professor Q&A
 * GET    /api/lessons/:id/professor/history     — conversation history
 * POST   /api/lessons/:id/struggling            — user self-reports difficulty
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { query } from '../db/pool.js';
import { runProfessorTurn } from '../lib/agents.js';
import { generateSingleLesson, generateSingleAssignment, generateSingleExam, writeAssignmentsToDB, writeExamsToDB } from '../lib/curriculum.agent.js';
import { MAX_ASSIGNMENTS, MAX_EXAMS, generatingAssignments, generatingExams } from '../lib/assessment.state.js';
import { generateNextLesson } from '../lib/qa.pipeline.js';
import { mapLessonToContent } from '../lib/course.generator.js';
import { updateStreak } from '../lib/streak.service.js';
import { gradePracticeAnswer } from '../lib/practice.agent.js';
import { getMemory, extractAndAppend, shouldExtract, formatMemoryForPrompt } from '../lib/learner.memory.js';
import {
  signalLessonTimeExceeded,
  signalLessonReopened,
  signalConfusionKeyword,
  signalUserExplicit,
  detectConfusionKeywords,
} from '../lib/difficulty.service.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { injectionDetection } from '../middleware/injectionDetection.js';
import { piiAudit } from '../middleware/piiAudit.js';

const router = Router();
router.use(requireAuth);

// Prevents double-generating the same lesson content
const generatingLessons = new Set();
// Tracks lessons that failed generation — cleared on user retry
const failedLessons = new Set();

// ── Course Lesson List ───────────────────────────────────────────────────────

router.get('/course/:courseId', asyncHandler(async (req, res) => {
  const { rows: course } = await query(
    `SELECT c.* FROM courses c
     JOIN programs p ON p.id = c.program_id
     WHERE c.id = $1 AND p.user_id = $2`,
    [req.params.courseId, req.user.id]
  );
  if (!course.length) return res.status(404).json({ error: 'Course not found' });

  const { rows: lessons } = await query(
    `SELECT l.id, l.number, l.title, l.summary, l.lesson_type, l.estimated_minutes, l.status,
            lv.visit_count, lv.time_spent_secs, lv.scroll_depth
     FROM lessons l
     LEFT JOIN lesson_visits lv ON lv.lesson_id = l.id AND lv.user_id = $2
     WHERE l.course_id = $1
     ORDER BY l.number`,
    [req.params.courseId, req.user.id]
  );

  res.json({ lessons });
}));

// ── Get Full Lesson ──────────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows: [lesson] } = await query(
    `SELECT l.*, c.title AS course_title, c.id AS course_id,
            c.code AS course_code, c.description, c.learning_objectives,
            p.id AS program_id, p.title AS program_title,
            p.field_of_study, p.degree_type
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE l.id = $1 AND p.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  // Fetch adjacent lessons for navigation
  const { rows: adjacent } = await query(
    `SELECT id, number, title FROM lessons
     WHERE course_id = $1 AND number IN ($2, $3)`,
    [lesson.course_id, lesson.number - 1, lesson.number + 1]
  );

  const prev = adjacent.find(l => l.number === lesson.number - 1) || null;
  const next = adjacent.find(l => l.number === lesson.number + 1) || null;

  // Block lazy generation if the QA pipeline is actively writing Phase 4 for this course
  const { rows: [courseRow] } = await query(
    `SELECT c.generation_phase, p.draft_mode
     FROM courses c
     JOIN programs p ON p.id = c.program_id
     WHERE c.id = $1`,
    [lesson.course_id]
  );
  const qaInProgress = !!courseRow?.generation_phase && !courseRow?.draft_mode;

  // Re-derive content from lesson_spec using the latest mapLessonToContent.
  // This ensures historically stored content (which may have bad "Heading:"/"Body:" labels)
  // is always re-rendered through the current normalisation logic.
  if (lesson.lesson_spec && lesson.lesson_spec.core_content !== undefined) {
    lesson.content = mapLessonToContent(lesson.lesson_spec);
  }

  const hasContent = !!lesson.content?.sections;
  let generating = false;
  let generationFailed = false;

  if (qaInProgress && !hasContent) {
    // Phase 4 is still running — tell the client to wait
    return res.json({ lesson, navigation: { prev, next }, generating: true, generationFailed: false });
  }

  if (!hasContent) {
    // ?retry=true clears a previous failure so the user can try again
    if (req.query.retry === 'true') failedLessons.delete(lesson.id);

    if (failedLessons.has(lesson.id)) {
      generationFailed = true;
    } else if (!generatingLessons.has(lesson.id)) {
      generatingLessons.add(lesson.id);
      setImmediate(async () => {
        try {
          // Prefer QA-grade generation via stored spec
          const generated = await generateNextLesson(lesson.course_id, lesson.number);
          if (!generated) {
            // No spec stored — fall back to lightweight generator
            const stub = { number: lesson.number, title: lesson.title };
            const course = {
              title: lesson.course_title, code: lesson.course_code,
              description: lesson.description, learning_objectives: lesson.learning_objectives,
            };
            const programContext = {
              title: lesson.program_title || '',
              field_of_study: lesson.field_of_study || '',
              degree_type: lesson.degree_type || '',
            };
            const content = await generateSingleLesson(stub, course, programContext);
            await query(
              `UPDATE lessons SET content = $1 WHERE id = $2
               AND (content IS NULL OR content = '{}' OR content::text = '"{}"')`,
              [JSON.stringify(content), lesson.id]
            );
          }
          console.log(`[Lazy] ✓ Lesson ${lesson.number} "${lesson.title}" content ready`);
        } catch (err) {
          console.error(`[Lazy] ✗ Lesson ${lesson.id} content failed:`, err.message);
          failedLessons.add(lesson.id);
        } finally {
          generatingLessons.delete(lesson.id);
        }
      });
      generating = true;
    } else {
      generating = true; // already in progress
    }
  }

  res.json({ lesson, navigation: { prev, next }, generating, generationFailed });
}));

// ── Visit Tracking ───────────────────────────────────────────────────────────

router.post('/:id/visit', asyncHandler(async (req, res) => {
  const { timeSpentSecs = 0, scrollDepth = 0 } = req.body;
  const lessonId = req.params.id;

  // Fetch lesson for context
  const { rows: [lesson] } = await query(
    `SELECT l.estimated_minutes, c.id AS course_id, p.id AS program_id
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE l.id = $1 AND p.user_id = $2`,
    [lessonId, req.user.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  // Upsert visit record
  const { rows: [visit] } = await query(
    `INSERT INTO lesson_visits (lesson_id, user_id, time_spent_secs, scroll_depth, visit_count)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (lesson_id, user_id) DO UPDATE SET
       time_spent_secs = lesson_visits.time_spent_secs + $3,
       scroll_depth = GREATEST(lesson_visits.scroll_depth, $4),
       visit_count = lesson_visits.visit_count + 1,
       last_active_at = NOW()
     RETURNING *`,
    [lessonId, req.user.id, timeSpentSecs, scrollDepth]
  );

  // Update streak (fire-and-forget)
  updateStreak(req.user.id).catch(err => console.error('[Streak]', err.message));

  // Fire difficulty signals (non-blocking)
  const estimatedSecs = lesson.estimated_minutes * 60;
  Promise.all([
    signalLessonTimeExceeded({
      userId: req.user.id, programId: lesson.program_id,
      courseId: lesson.course_id, lessonId,
      timeSpentSecs: visit.time_spent_secs, estimatedSecs,
    }),
    signalLessonReopened({
      userId: req.user.id, programId: lesson.program_id,
      courseId: lesson.course_id, lessonId,
      visitCount: visit.visit_count,
    }),
  ]).catch(err => console.error('[DifficultyService] Signal error:', err));

  res.json({ ok: true, visitCount: visit.visit_count });
}));

// ── Lesson Start ──────────────────────────────────────────────────────────────
// Called when the student opens a lesson that has content. Sets status to in_progress.

router.post('/:id/start', asyncHandler(async (req, res) => {
  await query(
    `UPDATE lessons SET status = 'in_progress'
     WHERE id = $1 AND status = 'not_started'
       AND EXISTS (
         SELECT 1 FROM courses c
         JOIN programs p ON p.id = c.program_id
         WHERE c.id = lessons.course_id AND p.user_id = $2
       )`,
    [req.params.id, req.user.id]
  );
  res.json({ ok: true });
}));

// ── Lesson Completion ─────────────────────────────────────────────────────────
// Called by the frontend when the student manually marks a lesson complete.
// Triggers background generation of the next lesson so it's ready when they click Next.

router.post('/:id/complete', asyncHandler(async (req, res) => {
  const { rows: [lesson] } = await query(
    `UPDATE lessons SET status = 'complete'
     WHERE id = $1
       AND EXISTS (
         SELECT 1 FROM courses c
         JOIN programs p ON p.id = c.program_id
         WHERE c.id = lessons.course_id AND p.user_id = $2
       )
     RETURNING number, course_id`,
    [req.params.id, req.user.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  const nextNumber = lesson.number + 1;
  const { rows: [nextLesson] } = await query(
    'SELECT id, content FROM lessons WHERE course_id = $1 AND number = $2',
    [lesson.course_id, nextNumber]
  );

  let nextGenerating = false;
  if (nextLesson && !nextLesson.content?.sections && !generatingLessons.has(nextLesson.id)) {
    generatingLessons.add(nextLesson.id);
    nextGenerating = true;
    setImmediate(async () => {
      try {
        await generateNextLesson(lesson.course_id, nextNumber);
      } catch (err) {
        console.error(`[OnDemand] ✗ Lesson ${nextNumber} pre-gen failed:`, err.message);
        failedLessons.add(nextLesson.id);
      } finally {
        generatingLessons.delete(nextLesson.id);
      }
    });
  }

  res.json({ ok: true, nextLesson: nextLesson ? { id: nextLesson.id, generating: nextGenerating } : null });

  // Auto-generate assignments/exams based on course completion progress (background)
  setImmediate(async () => {
    try {
      const { rows: allLessons } = await query(
        'SELECT id, number, title, status FROM lessons WHERE course_id = $1 ORDER BY number',
        [lesson.course_id]
      );
      const total = allLessons.length;
      if (total === 0) return;

      const completedCount = allLessons.filter(l => l.status === 'complete').length;
      const halfpoint = Math.ceil(total / 2);

      const { rows: [course] } = await query(
        `SELECT c.*, p.id AS program_id FROM courses c
         JOIN programs p ON p.id = c.program_id WHERE c.id = $1`,
        [lesson.course_id]
      );
      if (!course) return;

      const { rows: existingAssignments } = await query(
        'SELECT position FROM assignments WHERE course_id = $1 ORDER BY position',
        [lesson.course_id]
      );
      const { rows: existingExams } = await query(
        'SELECT position FROM exams WHERE course_id = $1 ORDER BY position',
        [lesson.course_id]
      );

      const assignmentPositions = new Set(existingAssignments.map(a => a.position));
      const examPositions = new Set(existingExams.map(e => e.position));

      // Reached halfway — generate mid-course assessment if not yet done
      if (completedCount >= halfpoint) {
        if (!assignmentPositions.has(1) && existingAssignments.length < MAX_ASSIGNMENTS && !generatingAssignments.has(lesson.course_id)) {
          generatingAssignments.add(lesson.course_id);
          try {
            const a = await generateSingleAssignment(course, allLessons, 1);
            await writeAssignmentsToDB({ courseId: lesson.course_id, assignments: [a] });
            console.log(`[Auto] ✓ ${course.code} mid-course assignment ready`);
          } finally {
            generatingAssignments.delete(lesson.course_id);
          }
        }
        if (!examPositions.has(1) && existingExams.length < MAX_EXAMS && !generatingExams.has(lesson.course_id)) {
          generatingExams.add(lesson.course_id);
          try {
            const e = await generateSingleExam(course, allLessons, 1);
            await writeExamsToDB({ courseId: lesson.course_id, exams: [e] });
            console.log(`[Auto] ✓ ${course.code} midterm ready`);
          } finally {
            generatingExams.delete(lesson.course_id);
          }
        }
      }

      // Completed all lessons — generate end-of-course assessment
      if (completedCount === total) {
        if (!assignmentPositions.has(2) && existingAssignments.length < MAX_ASSIGNMENTS && !generatingAssignments.has(lesson.course_id)) {
          generatingAssignments.add(lesson.course_id);
          try {
            const a = await generateSingleAssignment(course, allLessons, 2);
            await writeAssignmentsToDB({ courseId: lesson.course_id, assignments: [a] });
            console.log(`[Auto] ✓ ${course.code} final assignment ready`);
          } finally {
            generatingAssignments.delete(lesson.course_id);
          }
        }
        if (!examPositions.has(2) && existingExams.length < MAX_EXAMS && !generatingExams.has(lesson.course_id)) {
          generatingExams.add(lesson.course_id);
          try {
            const e = await generateSingleExam(course, allLessons, 2);
            await writeExamsToDB({ courseId: lesson.course_id, exams: [e] });
            console.log(`[Auto] ✓ ${course.code} final exam ready`);
          } finally {
            generatingExams.delete(lesson.course_id);
          }
        }
      }
    } catch (err) {
      console.error('[Auto] Assessment generation error:', err.message);
    }
  });
}));

// ── Professor Chat ───────────────────────────────────────────────────────────

router.post('/:id/professor/chat', rateLimit, injectionDetection, piiAudit, asyncHandler(async (req, res) => {
  const { message, stream = false } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const { rows: [lesson] } = await query(
    `SELECT l.*, c.id AS course_id, c.title AS course_title, c.code AS course_code,
            c.learning_objectives, p.id AS program_id
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE l.id = $1 AND p.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  // Fetch last 10 conversation turns + total professor turn count for extraction trigger
  const { rows: history } = await query(
    `SELECT role, content FROM professor_conversations
     WHERE lesson_id = $1 AND user_id = $2
     ORDER BY created_at DESC LIMIT 10`,
    [lesson.id, req.user.id]
  );
  const { rows: [{ professor_turns }] } = await query(
    `SELECT COUNT(*) AS professor_turns FROM professor_conversations
     WHERE lesson_id = $1 AND user_id = $2 AND role = 'assistant'`,
    [lesson.id, req.user.id]
  );

  // Fetch learner memory for personalised professor context
  const memoryFacts = await getMemory(req.user.id);
  const learnerMemory = formatMemoryForPrompt(memoryFacts);

  const course = {
    id: lesson.course_id,
    title: lesson.course_title,
    code: lesson.course_code,
    learning_objectives: lesson.learning_objectives,
  };

  // Detect confusion keywords for difficulty signals
  const confusionKeyword = detectConfusionKeywords(message);
  if (confusionKeyword) {
    signalConfusionKeyword({
      userId: req.user.id, programId: lesson.program_id,
      courseId: lesson.course_id, lessonId: lesson.id,
      keyword: confusionKeyword,
    }).catch(err => console.error('[DifficultyService]', err));
  }

  // Save user message
  await query(
    'INSERT INTO professor_conversations (lesson_id, user_id, role, content) VALUES ($1, $2, $3, $4)',
    [lesson.id, req.user.id, 'user', message]
  );

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullReply = '';
    const generator = await runProfessorTurn({
      user: req.user, course, lesson, learnerMemory,
      messages: history.reverse(), userMessage: message, stream: true,
    });

    for await (const chunk of generator) {
      fullReply += chunk;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }

    await query(
      'INSERT INTO professor_conversations (lesson_id, user_id, role, content) VALUES ($1, $2, $3, $4)',
      [lesson.id, req.user.id, 'assistant', fullReply]
    );

    res.write('data: [DONE]\n\n');
    res.end();

    // Fire-and-forget memory extraction every EXTRACT_EVERY turns
    const nextCount = parseInt(professor_turns, 10) + 1;
    if (shouldExtract(nextCount)) {
      const fullHistory = [...history.reverse(), { role: 'user', content: message }, { role: 'assistant', content: fullReply }];
      extractAndAppend(req.user.id, lesson.id, lesson.title, fullHistory)
        .catch(err => console.error('[LearnerMemory]', err.message));
    }
    return;
  }

  const { message: reply } = await runProfessorTurn({
    user: req.user, course, lesson, learnerMemory,
    messages: history.reverse(), userMessage: message,
  });

  await query(
    'INSERT INTO professor_conversations (lesson_id, user_id, role, content) VALUES ($1, $2, $3, $4)',
    [lesson.id, req.user.id, 'assistant', reply]
  );

  res.json({ message: reply });

  // Fire-and-forget memory extraction every EXTRACT_EVERY turns
  const nextCount = parseInt(professor_turns, 10) + 1;
  if (shouldExtract(nextCount)) {
    const fullHistory = [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }];
    extractAndAppend(req.user.id, lesson.id, lesson.title, fullHistory)
      .catch(err => console.error('[LearnerMemory]', err.message));
  }
}));

router.get('/:id/professor/history', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT role, content, created_at FROM professor_conversations
     WHERE lesson_id = $1 AND user_id = $2
     ORDER BY created_at ASC`,
    [req.params.id, req.user.id]
  );
  res.json({ messages: rows });
}));

// ── User Self-Reports Difficulty ─────────────────────────────────────────────

router.post('/:id/struggling', asyncHandler(async (req, res) => {
  const { rows: [lesson] } = await query(
    `SELECT l.id, c.id AS course_id, p.id AS program_id
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE l.id = $1 AND p.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  await signalUserExplicit({
    userId: req.user.id, programId: lesson.program_id,
    courseId: lesson.course_id, lessonId: lesson.id,
  });

  res.json({ ok: true, message: "Got it — your advisor will reach out shortly." });
}));

// ── Practice Problems ────────────────────────────────────────────────────────

// GET /api/lessons/:id/practice — list problems (no solutions exposed)
router.get('/:id/practice', asyncHandler(async (req, res) => {
  const { rows: [lesson] } = await query(
    `SELECT l.id, l.title, l.lesson_spec, p.user_id
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE l.id = $1 AND p.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  const problems = (lesson.lesson_spec?.practice_problems || []).map((p, i) => ({
    index: i,
    question: typeof p === 'string' ? p : (p.problem || p.question || `Problem ${i + 1}`),
  }));

  // Include past attempts for this user
  const { rows: attempts } = await query(
    `SELECT problem_index, score, verdict, feedback, hint, created_at
     FROM practice_attempts WHERE lesson_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
    [lesson.id, req.user.id]
  );

  res.json({ problems, attempts });
}));

// POST /api/lessons/:id/practice/:n — submit answer to problem n
router.post('/:id/practice/:n', rateLimit, injectionDetection, piiAudit, asyncHandler(async (req, res) => {
  const { answer } = req.body;
  if (!answer?.trim()) return res.status(400).json({ error: 'answer is required' });

  const problemIndex = parseInt(req.params.n, 10);

  const { rows: [lesson] } = await query(
    `SELECT l.id, l.title, l.lesson_spec, c.id AS course_id, p.id AS program_id
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE l.id = $1 AND p.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  const problems = lesson.lesson_spec?.practice_problems || [];
  if (problemIndex < 0 || problemIndex >= problems.length) {
    return res.status(400).json({ error: 'Problem index out of range' });
  }

  const meta = { agent: 'practice', userId: req.user.id, programId: lesson.program_id, courseId: lesson.course_id };
  const grading = await gradePracticeAnswer({
    problem: problems[problemIndex],
    studentAnswer: answer.trim(),
    lessonTitle: lesson.title,
    meta,
  });

  await query(
    `INSERT INTO practice_attempts (user_id, lesson_id, problem_index, answer_text, feedback, score, verdict, hint)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [req.user.id, lesson.id, problemIndex, answer.trim(), grading.feedback, grading.score, grading.verdict, grading.hint]
  );

  res.json(grading);
}));

export default router;
