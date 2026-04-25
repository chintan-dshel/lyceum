import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { query } from '../db/pool.js';
import { getClassmateReply, CLASSMATES } from '../lib/study.agent.js';
import { updateStreak } from '../lib/streak.service.js';

const router = Router();
router.use(requireAuth);

// POST /api/study/:programId/sessions — create or resume session
router.post('/:programId/sessions', asyncHandler(async (req, res) => {
  const { programId } = req.params;
  const { courseId, topic } = req.body;

  // Verify program ownership
  const { rows: [program] } = await query(
    `SELECT id FROM programs WHERE id = $1 AND user_id = $2`,
    [programId, req.user.id]
  );
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const { rows: [session] } = await query(
    `INSERT INTO study_sessions (user_id, program_id, course_id, topic)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.user.id, programId, courseId || null, topic || null]
  );

  updateStreak(req.user.id).catch(err => console.error('[Streak]', err.message));

  res.json({ session, classmates: CLASSMATES });
}));

// GET /api/study/:programId/sessions/:sessionId — get session + messages
router.get('/:programId/sessions/:sessionId', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const { rows: [session] } = await query(
    `SELECT ss.* FROM study_sessions ss
     WHERE ss.id = $1 AND ss.user_id = $2`,
    [sessionId, req.user.id]
  );
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { rows: messages } = await query(
    `SELECT * FROM study_messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );

  res.json({ session, messages, classmates: CLASSMATES });
}));

// POST /api/study/:programId/sessions/:sessionId/message — send + get AI reply
router.post('/:programId/sessions/:sessionId/message', asyncHandler(async (req, res) => {
  const { sessionId, programId } = req.params;
  const { content, courseTitle } = req.body;

  if (!content?.trim()) return res.status(400).json({ error: 'Message required' });

  const { rows: [session] } = await query(
    `SELECT ss.* FROM study_sessions ss
     WHERE ss.id = $1 AND ss.user_id = $2`,
    [sessionId, req.user.id]
  );
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Save user message
  await query(
    `INSERT INTO study_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
    [sessionId, content.trim()]
  );

  // Fetch message history for context
  const { rows: history } = await query(
    `SELECT role, persona, content FROM study_messages
     WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );

  // Get AI classmate reply
  const reply = await getClassmateReply({
    messages: history,
    topic: session.topic,
    courseTitle,
  });

  const { rows: [saved] } = await query(
    `INSERT INTO study_messages (session_id, role, persona, content)
     VALUES ($1, 'classmate', $2, $3) RETURNING *`,
    [sessionId, reply.persona, reply.content]
  );

  res.json({ message: { ...saved, name: reply.name, hue: reply.hue } });
}));

// PATCH /api/study/:programId/sessions/:sessionId/end
router.patch('/:programId/sessions/:sessionId/end', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  await query(
    `UPDATE study_sessions SET ended_at = NOW() WHERE id = $1 AND user_id = $2`,
    [sessionId, req.user.id]
  );
  res.json({ ok: true });
}));

export default router;
