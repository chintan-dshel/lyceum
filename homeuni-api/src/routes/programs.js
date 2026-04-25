/**
 * Programs routes — advisor conversation + program CRUD
 *
 * POST /api/programs/advisor/chat    — send a message to the advisor
 * POST /api/programs/advisor/confirm — confirm a program proposal → triggers curriculum generation
 * GET  /api/programs                 — list user's programs
 * GET  /api/programs/:id             — get program with semesters
 * GET  /api/programs/:id/status      — poll generation progress
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { query } from '../db/pool.js';
import { runAdvisorTurn, PROGRAM_STAGES } from '../lib/agents.js';
import { extractProgramBrief } from '../lib/advisor.agent.js';
import { curriculumQueue } from '../jobs/queue.js';

const router = Router();
router.use(requireAuth);

// ── Advisor Chat ─────────────────────────────────────────────────────────────

router.post('/advisor/chat', asyncHandler(async (req, res) => {
  const { message, programId } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  let program = null;
  if (programId) {
    const { rows } = await query('SELECT * FROM programs WHERE id = $1 AND user_id = $2', [programId, req.user.id]);
    program = rows[0] || null;
  }

  // Fetch conversation history
  const { rows: history } = await query(
    `SELECT role, content FROM advisor_conversations
     WHERE user_id = $1 AND ($2::uuid IS NULL OR program_id = $2)
     ORDER BY created_at ASC LIMIT 30`,
    [req.user.id, programId || null]
  );

  const { message: reply, proposal } = await runAdvisorTurn({
    user: req.user,
    program,
    messages: history,
    userMessage: message,
  });

  // Persist both turns
  await query(
    `INSERT INTO advisor_conversations (user_id, program_id, role, content, stage)
     VALUES ($1, $2, 'user', $3, $4), ($1, $2, 'assistant', $5, $4)`,
    [req.user.id, programId || null, message, program?.status || 'onboarding', reply]
  );

  res.json({ message: reply, proposal });
}));

// ── Confirm Program ──────────────────────────────────────────────────────────

router.post('/advisor/confirm', asyncHandler(async (req, res) => {
  const { proposal } = req.body;
  const brief = extractProgramBrief(proposal);

  if (!brief) return res.status(400).json({ error: 'Invalid or incomplete program proposal' });

  const { rows: [program] } = await query(
    `INSERT INTO programs
       (user_id, title, degree_type, field_of_study, total_semesters,
        description, goals, status, program_brief)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'generating', $8)
     RETURNING *`,
    [
      req.user.id,
      brief.title,
      brief.degree_type,
      brief.field_of_study,
      brief.total_semesters,
      brief.description || null,
      brief.goals || null,
      JSON.stringify(brief),
    ]
  );

  // Enqueue curriculum generation
  const job = await curriculumQueue.add(
    'generate',
    { programId: program.id },
    { attempts: 2, backoff: { type: 'exponential', delay: 5000 } }
  );

  res.status(202).json({ program, jobId: job.id });
}));

// ── Program Status (poll for generation progress) ────────────────────────────

router.get('/:id/status', asyncHandler(async (req, res) => {
  const { rows: [program] } = await query(
    'SELECT id, title, status FROM programs WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!program) return res.status(404).json({ error: 'Program not found' });
  res.json({ status: program.status, ready: program.status === 'active' });
}));

// ── Delete Program ───────────────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    'DELETE FROM programs WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Program not found' });
  res.json({ ok: true });
}));

// ── List Programs ────────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT id, title, degree_type, field_of_study, total_semesters, gpa, status, created_at FROM programs WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ programs: rows });
}));

// ── Get Program with Semesters ───────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows: [program] } = await query(
    'SELECT * FROM programs WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const { rows: semesters } = await query(
    'SELECT * FROM semesters WHERE program_id = $1 ORDER BY number',
    [program.id]
  );

  // For each semester, fetch courses (without full content)
  for (const sem of semesters) {
    const { rows: courses } = await query(
      `SELECT id, code, title, description, course_type, credit_hours,
              status, final_grade, grade_letter, position
       FROM courses WHERE semester_id = $1 ORDER BY position`,
      [sem.id]
    );
    sem.courses = courses;
  }

  res.json({ program: { ...program, semesters } });
}));

// ── Nudges ───────────────────────────────────────────────────────────────────

router.get('/:id/nudges', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, nudge_type, message, course_id, lesson_id, created_at
     FROM nudges WHERE user_id = $1 AND program_id = $2 AND read_at IS NULL
     ORDER BY created_at DESC LIMIT 5`,
    [req.user.id, req.params.id]
  );
  res.json({ nudges: rows });
}));

router.patch('/nudges/:nudgeId/read', asyncHandler(async (req, res) => {
  await query(
    'UPDATE nudges SET read_at = NOW() WHERE id = $1 AND user_id = $2',
    [req.params.nudgeId, req.user.id]
  );
  res.json({ ok: true });
}));

export default router;
