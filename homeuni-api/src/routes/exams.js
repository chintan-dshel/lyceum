/**
 * Exams routes
 *
 * GET  /api/exams/course/:courseId     — list exams for a course
 * GET  /api/exams/:id                  — get exam (without answers)
 * POST /api/exams/:id/attempt          — start or resume an attempt
 * POST /api/exams/:id/submit           — submit attempt for grading
 * GET  /api/exams/:id/attempts         — get attempt history
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { query } from '../db/pool.js';
import { runExamGrading } from '../lib/agents.js';
import { signalExamLowScore } from '../lib/difficulty.service.js';
import { recomputeCourseGrade } from '../lib/grade.service.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { injectionDetection } from '../middleware/injectionDetection.js';
import { piiAudit } from '../middleware/piiAudit.js';
import { userCap } from '../middleware/userCap.js';

const router = Router();
router.use(requireAuth);

router.get('/course/:courseId', asyncHandler(async (req, res) => {
  const { rows: [course] } = await query(
    `SELECT c.* FROM courses c JOIN programs p ON p.id = c.program_id
     WHERE c.id = $1 AND p.user_id = $2`,
    [req.params.courseId, req.user.id]
  );
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const { rows } = await query(
    `SELECT e.id, e.title, e.exam_type, e.max_score,
            json_array_length(e.questions::json) AS question_count,
            a.score, a.grade_letter, a.attempt_number
     FROM exams e
     LEFT JOIN LATERAL (
       SELECT score, grade_letter, attempt_number
       FROM exam_attempts WHERE exam_id = e.id AND user_id = $2
       ORDER BY attempt_number DESC LIMIT 1
     ) a ON true
     WHERE e.course_id = $1 ORDER BY e.position`,
    [req.params.courseId, req.user.id]
  );
  res.json({ exams: rows });
}));

// Return exam without correct_answer fields (to prevent spoilers before submission)
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows: [exam] } = await query(
    `SELECT e.* FROM exams e
     JOIN courses c ON c.id = e.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE e.id = $1 AND p.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!exam) return res.status(404).json({ error: 'Exam not found' });

  // Strip correct answers from questions before sending to client
  const safeQuestions = (exam.questions || []).map(q => {
    const { correct_answer, ...safe } = q;
    return safe;
  });

  res.json({ exam: { ...exam, questions: safeQuestions } });
}));

router.post('/:id/attempt', asyncHandler(async (req, res) => {
  const { rows: [exam] } = await query(
    `SELECT e.id, e.title FROM exams e
     JOIN courses c ON c.id = e.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE e.id = $1 AND p.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!exam) return res.status(404).json({ error: 'Exam not found' });

  const { rows: [prev] } = await query(
    'SELECT MAX(attempt_number) AS max FROM exam_attempts WHERE exam_id = $1 AND user_id = $2',
    [exam.id, req.user.id]
  );
  const attemptNumber = (prev?.max || 0) + 1;

  const { rows: [attempt] } = await query(
    `INSERT INTO exam_attempts (exam_id, user_id, answers, attempt_number)
     VALUES ($1, $2, '{}', $3) RETURNING id, attempt_number, started_at`,
    [exam.id, req.user.id, attemptNumber]
  );

  res.status(201).json({ attempt });
}));

router.post('/:id/submit', rateLimit, userCap, injectionDetection, piiAudit, asyncHandler(async (req, res) => {
  const { attemptId, answers } = req.body;
  if (!attemptId || !answers) {
    return res.status(400).json({ error: 'attemptId and answers are required' });
  }

  const { rows: [exam] } = await query(
    `SELECT e.*, c.title AS course_title, c.id AS course_id, p.id AS program_id
     FROM exams e
     JOIN courses c ON c.id = e.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE e.id = $1 AND p.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!exam) return res.status(404).json({ error: 'Exam not found' });

  const { rows: [attempt] } = await query(
    'SELECT * FROM exam_attempts WHERE id = $1 AND user_id = $2',
    [attemptId, req.user.id]
  );
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  const course = { id: exam.course_id, title: exam.course_title };
  const result = await runExamGrading({ exam, attempt: { ...attempt, answers }, course });

  const { rows: [graded] } = await query(
    `UPDATE exam_attempts SET
       answers = $1, submitted_at = NOW(), score = $2,
       grade_letter = $3, feedback = $4
     WHERE id = $5 RETURNING *`,
    [JSON.stringify(answers), result.score, result.gradeLetter, JSON.stringify(result.feedback), attempt.id]
  );

  signalExamLowScore({
    userId: req.user.id, programId: exam.program_id,
    courseId: exam.course_id, score: result.score,
  }).catch(err => console.error('[DifficultyService]', err));

  // Recompute course grade + program GPA (fire-and-forget)
  recomputeCourseGrade(exam.course_id, req.user.id)
    .catch(err => console.error('[GradeService]', err.message));

  res.json({ attempt: graded, score: result.score, gradeLetter: result.gradeLetter, feedback: result.feedback });
}));

router.get('/:id/attempts', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, score, grade_letter, attempt_number, started_at, submitted_at
     FROM exam_attempts WHERE exam_id = $1 AND user_id = $2
     ORDER BY attempt_number DESC`,
    [req.params.id, req.user.id]
  );
  res.json({ attempts: rows });
}));

export default router;
