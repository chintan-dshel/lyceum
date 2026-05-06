/**
 * Progress routes — grades, GPA, transcript, graduation check
 *
 * GET /api/progress/:programId/gradebook      — full grade book
 * GET /api/progress/:programId/transcript     — full transcript
 * GET /api/progress/:programId/graduation     — graduation eligibility check
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { query } from '../db/pool.js';
import { runSemesterReview } from '../lib/advisor.agent.js';

const router = Router();
router.use(requireAuth);

router.get('/:programId/gradebook', asyncHandler(async (req, res) => {
  const { rows: [program] } = await query(
    'SELECT * FROM programs WHERE id = $1 AND user_id = $2',
    [req.params.programId, req.user.id]
  );
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const { rows: semesters } = await query(
    'SELECT * FROM semesters WHERE program_id = $1 ORDER BY number',
    [program.id]
  );

  const result = [];
  for (const sem of semesters) {
    const { rows: courses } = await query(
      'SELECT id, code, title, course_type, credit_hours, final_grade, grade_letter, status FROM courses WHERE semester_id = $1 ORDER BY position',
      [sem.id]
    );

    for (const course of courses) {
      const { rows: submissions } = await query(
        `SELECT a.title, s.score, s.grade_letter, s.attempt_number, s.submitted_at
         FROM submissions s JOIN assignments a ON a.id = s.assignment_id
         WHERE a.course_id = $1 AND s.user_id = $2
         ORDER BY s.submitted_at DESC`,
        [course.id, req.user.id]
      );
      const { rows: attempts } = await query(
        `SELECT e.title, e.exam_type, ea.score, ea.grade_letter, ea.attempt_number
         FROM exam_attempts ea JOIN exams e ON e.id = ea.exam_id
         WHERE e.course_id = $1 AND ea.user_id = $2
         ORDER BY ea.submitted_at DESC`,
        [course.id, req.user.id]
      );
      course.submissions = submissions;
      course.examAttempts = attempts;
    }

    result.push({ ...sem, courses });
  }

  res.json({ gradebook: result, gpa: program.gpa });
}));

router.get('/:programId/transcript', asyncHandler(async (req, res) => {
  const { rows: [program] } = await query(
    `SELECT p.*, u.full_name, u.email FROM programs p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = $1 AND p.user_id = $2`,
    [req.params.programId, req.user.id]
  );
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const { rows: semesters } = await query(
    'SELECT * FROM semesters WHERE program_id = $1 ORDER BY number',
    [program.id]
  );

  for (const sem of semesters) {
    const { rows: courses } = await query(
      'SELECT id, code, title, credit_hours, final_grade, grade_letter, course_type FROM courses WHERE semester_id = $1 ORDER BY position',
      [sem.id]
    );

    for (const course of courses) {
      // Latest submission per assignment
      const { rows: assignments } = await query(
        `SELECT DISTINCT ON (a.id) a.title, s.score, s.grade_letter
         FROM assignments a
         LEFT JOIN submissions s ON s.assignment_id = a.id AND s.user_id = $2
         WHERE a.course_id = $1
         ORDER BY a.id, s.submitted_at DESC NULLS LAST`,
        [course.id, req.user.id]
      );
      // Latest attempt per exam
      const { rows: examAttempts } = await query(
        `SELECT DISTINCT ON (e.id) e.title, e.exam_type, ea.score, ea.grade_letter
         FROM exams e
         LEFT JOIN exam_attempts ea ON ea.exam_id = e.id AND ea.user_id = $2
         WHERE e.course_id = $1
         ORDER BY e.id, ea.submitted_at DESC NULLS LAST`,
        [course.id, req.user.id]
      );
      course.assignments = assignments;
      course.examAttempts = examAttempts;
    }

    sem.courses = courses;
  }

  res.json({ transcript: { program, semesters } });
}));

// Graduation eligibility
router.get('/:programId/graduation', asyncHandler(async (req, res) => {
  const { rows: [program] } = await query(
    'SELECT * FROM programs WHERE id = $1 AND user_id = $2',
    [req.params.programId, req.user.id]
  );
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const { rows: coreCourses } = await query(
    `SELECT c.id, c.title, c.code FROM courses c
     JOIN semesters s ON s.id = c.semester_id
     WHERE s.program_id = $1 AND c.course_type = 'core'`,
    [program.id]
  );

  const requirements = [];
  let allMet = true;

  for (const course of coreCourses) {
    // Require: at least one assignment submitted
    const { rows: [sub] } = await query(
      `SELECT COUNT(*) AS cnt FROM submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE a.course_id = $1 AND s.user_id = $2`,
      [course.id, req.user.id]
    );
    const hasSubmission = parseInt(sub.cnt) > 0;

    // Require: at least 70% of lessons visited
    const { rows: [lessonStats] } = await query(
      `SELECT COUNT(l.id) AS total,
              COUNT(lv.lesson_id) AS visited
       FROM lessons l
       LEFT JOIN lesson_visits lv ON lv.lesson_id = l.id AND lv.user_id = $2
       WHERE l.course_id = $1`,
      [course.id, req.user.id]
    );
    const visitPct = lessonStats.total > 0
      ? (lessonStats.visited / lessonStats.total) * 100
      : 0;
    const hasLessonProgress = visitPct >= 70;

    // Require: at least one exam attempted
    const { rows: [examAttempt] } = await query(
      `SELECT COUNT(*) AS cnt FROM exam_attempts ea
       JOIN exams e ON e.id = ea.exam_id
       WHERE e.course_id = $1 AND ea.user_id = $2`,
      [course.id, req.user.id]
    );
    const hasExamAttempt = parseInt(examAttempt.cnt) > 0;

    const met = hasSubmission && hasLessonProgress && hasExamAttempt;
    if (!met) allMet = false;

    requirements.push({
      courseId: course.id,
      courseTitle: course.title,
      courseCode: course.code,
      hasSubmission,
      lessonVisitPercent: Math.round(visitPct),
      hasLessonProgress,
      hasExamAttempt,
      met,
    });
  }

  res.json({ eligible: allMet, requirements, totalCore: coreCourses.length });
}));

// ── Certificate ───────────────────────────────────────────────────────────────

// POST — issue (or retrieve existing) certificate when graduation-eligible
router.post('/:programId/certificate', asyncHandler(async (req, res) => {
  const { rows: [program] } = await query(
    `SELECT p.*, u.full_name FROM programs p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = $1 AND p.user_id = $2`,
    [req.params.programId, req.user.id]
  );
  if (!program) return res.status(404).json({ error: 'Program not found' });

  // Idempotent: return existing cert if already issued
  const { rows: [existing] } = await query(
    'SELECT * FROM certificates WHERE program_id = $1 AND user_id = $2',
    [program.id, req.user.id]
  );
  if (existing) return res.json({ certificate: existing });

  // Verify graduation eligibility (same logic as GET /graduation)
  const { rows: coreCourses } = await query(
    `SELECT c.id FROM courses c
     JOIN semesters s ON s.id = c.semester_id
     WHERE s.program_id = $1 AND c.course_type = 'core'`,
    [program.id]
  );

  if (coreCourses.length === 0) {
    return res.status(403).json({ error: 'Graduation requirements not yet met' });
  }

  let allMet = true;
  for (const course of coreCourses) {
    const { rows: [sub] } = await query(
      `SELECT COUNT(*) AS cnt FROM submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE a.course_id = $1 AND s.user_id = $2`,
      [course.id, req.user.id]
    );
    const { rows: [lessonStats] } = await query(
      `SELECT COUNT(l.id) AS total, COUNT(lv.lesson_id) AS visited
       FROM lessons l LEFT JOIN lesson_visits lv ON lv.lesson_id = l.id AND lv.user_id = $2
       WHERE l.course_id = $1`,
      [course.id, req.user.id]
    );
    const { rows: [examAttempt] } = await query(
      `SELECT COUNT(*) AS cnt FROM exam_attempts ea
       JOIN exams e ON e.id = ea.exam_id
       WHERE e.course_id = $1 AND ea.user_id = $2`,
      [course.id, req.user.id]
    );
    const visitPct = lessonStats.total > 0 ? (lessonStats.visited / lessonStats.total) * 100 : 0;
    if (!(parseInt(sub.cnt) > 0 && visitPct >= 70 && parseInt(examAttempt.cnt) > 0)) {
      allMet = false;
      break;
    }
  }

  if (!allMet) return res.status(403).json({ error: 'Graduation requirements not yet met' });

  const { rows: [cert] } = await query(
    `INSERT INTO certificates
       (program_id, user_id, full_name, program_title, degree_type, field_of_study, total_semesters, gpa)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      program.id, req.user.id,
      program.full_name,
      program.title,
      program.degree_type,
      program.field_of_study,
      program.total_semesters,
      program.gpa || null,
    ]
  );

  res.json({ certificate: cert });
}));

// ── Semester review (advisor message)
router.post('/:programId/semester-review/:semesterId', asyncHandler(async (req, res) => {
  const { rows: [program] } = await query(
    'SELECT * FROM programs WHERE id = $1 AND user_id = $2',
    [req.params.programId, req.user.id]
  );
  const { rows: [semester] } = await query(
    'SELECT * FROM semesters WHERE id = $1 AND program_id = $2',
    [req.params.semesterId, req.params.programId]
  );
  if (!program || !semester) return res.status(404).json({ error: 'Not found' });

  const { rows: courseGrades } = await query(
    'SELECT title, final_grade, grade_letter FROM courses WHERE semester_id = $1',
    [semester.id]
  );

  const { rows: [user] } = await query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);

  const message = await runSemesterReview({
    user, program, semester, courseGrades,
  });

  res.json({ message });
}));

export default router;
