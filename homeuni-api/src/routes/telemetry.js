/**
 * Telemetry routes — cost, token, and latency data per user / course
 *
 * GET /api/telemetry/summary             — total cost + breakdown by agent
 * GET /api/telemetry/course/:courseId    — cost breakdown for a single course
 *
 * All routes are user-scoped (req.user.id). A user can only see their own data.
 * Migration guard: returns 200 + warning if agent_traces table doesn't exist yet.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { query } from '../db/pool.js';

const router = Router();
router.use(requireAuth);

// ── Migration guard ──────────────────────────────────────────────────────────

let _tableReady = null;
async function tableReady() {
  if (_tableReady !== null) return _tableReady;
  const { rows } = await query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'agent_traces'`
  ).catch(() => ({ rows: [] }));
  _tableReady = rows.length > 0;
  return _tableReady;
}

// ── Summary ──────────────────────────────────────────────────────────────────

router.get('/summary', asyncHandler(async (req, res) => {
  if (!await tableReady()) {
    return res.json({ warning: 'Telemetry table not found. Run migration 007_telemetry.sql.', data: null });
  }

  const { rows: [totals] } = await query(
    `SELECT
       COUNT(*)::int                        AS call_count,
       SUM(input_tokens)::int               AS total_input_tokens,
       SUM(output_tokens)::int              AS total_output_tokens,
       ROUND(SUM(cost_usd)::numeric, 6)     AS total_cost_usd,
       ROUND(AVG(latency_ms)::numeric, 0)   AS avg_latency_ms,
       MIN(created_at)                      AS first_call,
       MAX(created_at)                      AS last_call
     FROM agent_traces
     WHERE user_id = $1 AND status = 'success'`,
    [req.user.id]
  );

  const { rows: byAgent } = await query(
    `SELECT
       agent,
       COUNT(*)::int                        AS calls,
       SUM(input_tokens)::int               AS input_tokens,
       SUM(output_tokens)::int              AS output_tokens,
       ROUND(SUM(cost_usd)::numeric, 6)     AS cost_usd,
       ROUND(AVG(latency_ms)::numeric, 0)   AS avg_latency_ms
     FROM agent_traces
     WHERE user_id = $1 AND status = 'success'
     GROUP BY agent
     ORDER BY cost_usd DESC`,
    [req.user.id]
  );

  const { rows: byModel } = await query(
    `SELECT
       model,
       COUNT(*)::int                        AS calls,
       ROUND(SUM(cost_usd)::numeric, 6)     AS cost_usd
     FROM agent_traces
     WHERE user_id = $1 AND status = 'success'
     GROUP BY model
     ORDER BY cost_usd DESC`,
    [req.user.id]
  );

  res.json({ totals, byAgent, byModel });
}));

// ── Per-program cost (all courses in one query) ──────────────────────────────

router.get('/program/:programId', asyncHandler(async (req, res) => {
  if (!await tableReady()) {
    return res.json({ warning: 'Telemetry table not found. Run migration 007_telemetry.sql.', data: null });
  }

  // Verify program belongs to requesting user
  const { rows: [program] } = await query(
    `SELECT id, title FROM programs WHERE id = $1 AND user_id = $2`,
    [req.params.programId, req.user.id]
  );
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const { rows } = await query(
    `SELECT
       at.course_id,
       c.code                                   AS course_code,
       c.title                                  AS course_title,
       COUNT(*)::int                            AS call_count,
       SUM(at.input_tokens)::int                AS total_input_tokens,
       SUM(at.output_tokens)::int               AS total_output_tokens,
       ROUND(SUM(at.cost_usd)::numeric, 6)      AS total_cost_usd
     FROM agent_traces at
     JOIN courses c ON c.id = at.course_id
     WHERE c.program_id = $1 AND at.status = 'success'
     GROUP BY at.course_id, c.code, c.title
     ORDER BY total_cost_usd DESC`,
    [req.params.programId]
  );

  const programTotal = rows.reduce((sum, r) => sum + parseFloat(r.total_cost_usd || 0), 0);

  res.json({
    program: { id: program.id, title: program.title },
    courses: rows,
    program_total_usd: Math.round(programTotal * 1e6) / 1e6,
  });
}));

// ── Per-course cost ──────────────────────────────────────────────────────────

router.get('/course/:courseId', asyncHandler(async (req, res) => {
  if (!await tableReady()) {
    return res.json({ warning: 'Telemetry table not found. Run migration 007_telemetry.sql.', data: null });
  }

  // Verify the course belongs to the requesting user
  const { rows: [course] } = await query(
    `SELECT c.id, c.title, c.code FROM courses c
     JOIN programs p ON p.id = c.program_id
     WHERE c.id = $1 AND p.user_id = $2`,
    [req.params.courseId, req.user.id]
  );
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const { rows: [totals] } = await query(
    `SELECT
       COUNT(*)::int                        AS call_count,
       SUM(input_tokens)::int               AS total_input_tokens,
       SUM(output_tokens)::int              AS total_output_tokens,
       ROUND(SUM(cost_usd)::numeric, 6)     AS total_cost_usd,
       ROUND(AVG(latency_ms)::numeric, 0)   AS avg_latency_ms
     FROM agent_traces
     WHERE course_id = $1 AND status = 'success'`,
    [req.params.courseId]
  );

  const { rows: byAgent } = await query(
    `SELECT
       agent,
       COUNT(*)::int                        AS calls,
       ROUND(SUM(cost_usd)::numeric, 6)     AS cost_usd,
       ROUND(AVG(latency_ms)::numeric, 0)   AS avg_latency_ms
     FROM agent_traces
     WHERE course_id = $1 AND status = 'success'
     GROUP BY agent
     ORDER BY cost_usd DESC`,
    [req.params.courseId]
  );

  res.json({
    course: { id: course.id, title: course.title, code: course.code },
    totals,
    byAgent,
  });
}));

export default router;
