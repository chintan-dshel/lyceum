/**
 * Lectures routes — voice + whiteboard
 *
 * GET  /api/lectures/:lessonId           — fetch cached lecture script
 * POST /api/lectures/:lessonId/generate  — generate lecture script + whiteboard timeline
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { query } from '../db/pool.js';
import { generateLectureScript } from '../lib/lecture.agent.js';

const router = Router();
router.use(requireAuth);

const generatingLectures = new Set();

router.get('/:lessonId', asyncHandler(async (req, res) => {
  const { rows: [script] } = await query(
    `SELECT ls.* FROM lecture_scripts ls
     JOIN lessons l ON l.id = ls.lesson_id
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE ls.lesson_id = $1 AND p.user_id = $2`,
    [req.params.lessonId, req.user.id]
  );

  if (!script) return res.status(404).json({ error: 'Lecture not yet generated for this lesson' });
  res.json({ script });
}));

router.post('/:lessonId/generate', asyncHandler(async (req, res) => {
  const lessonId = req.params.lessonId;

  // Check if already generated
  const { rows: [existing] } = await query(
    `SELECT ls.id FROM lecture_scripts ls
     JOIN lessons l ON l.id = ls.lesson_id
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE ls.lesson_id = $1 AND p.user_id = $2`,
    [lessonId, req.user.id]
  );
  if (existing) return res.json({ status: 'exists', scriptId: existing.id });

  if (generatingLectures.has(lessonId)) {
    return res.json({ status: 'generating' });
  }

  // Fetch lesson + course for context
  const { rows: [lesson] } = await query(
    `SELECT l.*, c.id AS course_id, c.title AS course_title, c.code AS course_code,
            c.learning_objectives, p.id AS program_id
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     JOIN programs p ON p.id = c.program_id
     WHERE l.id = $1 AND p.user_id = $2`,
    [lessonId, req.user.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  // Respond immediately — generation is async
  res.json({ status: 'generating' });

  generatingLectures.add(lessonId);
  setImmediate(async () => {
    try {
      const course = {
        id: lesson.course_id,
        title: lesson.course_title,
        code: lesson.course_code,
        learning_objectives: lesson.learning_objectives,
      };

      const { script_text, whiteboard_timeline } = await generateLectureScript(lesson, course);

      await query(
        `INSERT INTO lecture_scripts (lesson_id, script_text, whiteboard_timeline)
         VALUES ($1, $2, $3)
         ON CONFLICT (lesson_id) DO UPDATE SET
           script_text = EXCLUDED.script_text,
           whiteboard_timeline = EXCLUDED.whiteboard_timeline,
           generated_at = NOW()`,
        [lessonId, script_text, JSON.stringify(whiteboard_timeline)]
      );

      console.log(`[Lecture] ✓ Generated lecture for lesson ${lessonId}`);
    } catch (err) {
      console.error(`[Lecture] ✗ Generation failed for lesson ${lessonId}:`, err.message);
    } finally {
      generatingLectures.delete(lessonId);
    }
  });
}));

export default router;
