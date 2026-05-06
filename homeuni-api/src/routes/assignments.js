/**
 * Assignments routes
 *
 * GET  /api/assignments/course/:courseId     — list assignments for a course
 * GET  /api/assignments/:id                  — get assignment detail
 * POST /api/assignments/:id/submit           — submit work for grading
 * GET  /api/assignments/:id/submissions      — get submission history
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { query } from '../db/pool.js';
import { runAssessment } from '../lib/agents.js';
import { signalAssignmentLowScore } from '../lib/difficulty.service.js';
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

  const { rows: assignments } = await query(
    `SELECT a.id, a.title, a.assignment_type, a.max_score, a.position,
            s.score, s.grade_letter, s.attempt_number, s.submitted_at
     FROM assignments a
     LEFT JOIN LATERAL (
       SELECT score, grade_letter, attempt_number, submitted_at
       FROM submissions WHERE assignment_id = a.id AND user_id = $2
       ORDER BY attempt_number DESC LIMIT 1
     ) s ON true
     WHERE a.course_id = $1
     ORDER BY a.position`,
    [req.params.courseId, req.user.id]
  );

  res.json({ assignments });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows: [assignment] } = await query(
    `SELECT a.* FROM assignments a
     JOIN courses c ON c.id = a.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE a.id = $1 AND p.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  res.json({ assignment });
}));

router.post('/:id/submit', rateLimit, userCap, injectionDetection, piiAudit, asyncHandler(async (req, res) => {
  const { content_text } = req.body;
  if (!content_text?.trim()) {
    return res.status(400).json({ error: 'Submission content is required' });
  }

  const { rows: [assignment] } = await query(
    `SELECT a.*, c.title AS course_title, c.id AS course_id, p.id AS program_id
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE a.id = $1 AND p.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  // Determine attempt number
  const { rows: [prev] } = await query(
    'SELECT MAX(attempt_number) AS max FROM submissions WHERE assignment_id = $1 AND user_id = $2',
    [assignment.id, req.user.id]
  );
  const attemptNumber = (prev?.max || 0) + 1;

  // Create pending submission
  const { rows: [submission] } = await query(
    `INSERT INTO submissions (assignment_id, user_id, content_text, attempt_number)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [assignment.id, req.user.id, content_text, attemptNumber]
  );

  // Grade with assessor agent
  const course = { id: assignment.course_id, title: assignment.course_title };
  const result = await runAssessment({ assignment, submission, course });

  // Update submission with grades
  const { rows: [graded] } = await query(
    `UPDATE submissions SET
       score = $1, grade_letter = $2, feedback_text = $3,
       rubric_scores = $4, graded_at = NOW()
     WHERE id = $5 RETURNING *`,
    [
      result.score, result.gradeLetter, result.feedbackText,
      JSON.stringify(result.rubricScores), submission.id,
    ]
  );

  // Fire difficulty signal if low score
  signalAssignmentLowScore({
    userId: req.user.id, programId: assignment.program_id,
    courseId: assignment.course_id, score: result.score,
  }).catch(err => console.error('[DifficultyService]', err));

  // Recompute course grade + program GPA (fire-and-forget)
  recomputeCourseGrade(assignment.course_id, req.user.id)
    .catch(err => console.error('[GradeService]', err.message));

  res.json({
    submission: graded,
    feedback: {
      score: result.score,
      gradeLetter: result.gradeLetter,
      feedbackText: result.feedbackText,
      rubricScores: result.rubricScores,
      strengths: result.strengths,
      growthAreas: result.growthAreas,
    },
  });
}));

router.get('/:id/submissions', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, score, grade_letter, feedback_text, rubric_scores,
            attempt_number, submitted_at, graded_at
     FROM submissions
     WHERE assignment_id = $1 AND user_id = $2
     ORDER BY attempt_number DESC`,
    [req.params.id, req.user.id]
  );
  res.json({ submissions: rows });
}));

export default router;
