/**
 * Curriculum routes — read the full course structure
 *
 * GET /api/curriculum/:programId            — full structure (semesters+courses)
 * GET /api/curriculum/course/:courseId      — course with lesson stub list
 *
 * Two-level lazy generation:
 *   Level 1 (this file): when a course is first opened, generate 10 lesson stubs
 *     (title + summary, ~400 tokens, ~4 sec). User sees the lesson list immediately.
 *     Assignments + exams generate concurrently in the background.
 *   Level 2 (lessons.js): when a lesson is first opened, generate its full content
 *     (~1500 tokens, ~6 sec).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { query } from '../db/pool.js';
import {
  generateLessonStubs,
  generateSingleLesson,
  writeLessonStubsToDB,
  generateCourseAssignments,
  generateCourseExams,
  writeAssignmentsToDB,
  writeExamsToDB,
} from '../lib/curriculum.agent.js';
import { runSpecPipeline, generateNextLesson } from '../lib/qa.pipeline.js';

const router = Router();
router.use(requireAuth);

// Prevents double-generating if user opens the same course twice before stubs appear
const generatingCourses = new Set();

async function generateCourseContentBackground(course, programContext) {
  try {
    // Step 1 — stubs (fast: ~400 tokens). Unblocks course page.
    const stubs = await generateLessonStubs(course, programContext);
    await writeLessonStubsToDB({ courseId: course.id, stubs });
    console.log(`[Lazy] ✓ ${course.code} stubs ready (${stubs.length} lessons)`);
  } catch (err) {
    console.error(`[Lazy] ✗ ${course.code} stubs failed:`, err.message);
  } finally {
    generatingCourses.delete(course.id);  // unblock course page polling
  }

  // Step 2 — pre-generate lesson 1 so it's ready when the student clicks it
  try {
    const { rows: [lesson1] } = await query(
      'SELECT * FROM lessons WHERE course_id = $1 AND number = 1',
      [course.id]
    );
    if (lesson1 && !lesson1.content?.sections) {
      const content = await generateSingleLesson(
        { number: 1, title: lesson1.title },
        course,
        programContext
      );
      // Conditional update: no-op if lesson route already wrote content concurrently
      await query(
        `UPDATE lessons SET content = $1 WHERE id = $2
         AND (content = '{}' OR content IS NULL OR content::text = '\"{}\"')`,
        [JSON.stringify(content), lesson1.id]
      );
      console.log(`[Lazy] ✓ ${course.code} lesson 1 pre-generated`);
    }
  } catch (err) {
    console.error(`[Lazy] ✗ ${course.code} lesson 1 pre-gen failed:`, err.message);
  }

  // Step 3 — assignments + exams using stub titles (student is reading lesson 1 by now)
  try {
    const { rows: savedStubs } = await query(
      'SELECT number, title FROM lessons WHERE course_id = $1 ORDER BY number',
      [course.id]
    );
    if (savedStubs.length === 0) return;

    const [assignments, exams] = await Promise.all([
      generateCourseAssignments(course, savedStubs),
      generateCourseExams(course, savedStubs),
    ]);
    await writeAssignmentsToDB({ courseId: course.id, assignments });
    await writeExamsToDB({ courseId: course.id, exams });
    console.log(`[Lazy] ✓ ${course.code} assignments + exams ready`);
  } catch (err) {
    console.error(`[Lazy] ✗ ${course.code} assignments/exams failed:`, err.message);
  }
}

// NOTE: /course/:courseId must be defined BEFORE /:programId or Express will
// swallow it — parameter routes match any segment including literal "course".
router.get('/course/:courseId', asyncHandler(async (req, res) => {
  const { rows: [course] } = await query(
    `SELECT c.*, s.number AS semester_number, s.title AS semester_title,
            p.id AS program_id, p.title AS program_title, p.field_of_study, p.degree_type,
            p.program_brief, p.draft_mode, p.learner_profile
     FROM courses c
     JOIN semesters s ON s.id = c.semester_id
     JOIN programs p ON p.id = c.program_id
     WHERE c.id = $1 AND p.user_id = $2`,
    [req.params.courseId, req.user.id]
  );
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const { rows: lessons } = await query(
    `SELECT l.id, l.number, l.title, l.summary, l.lesson_type, l.estimated_minutes,
            lv.visit_count, lv.scroll_depth, lv.time_spent_secs
     FROM lessons l
     LEFT JOIN lesson_visits lv ON lv.lesson_id = l.id AND lv.user_id = $2
     WHERE l.course_id = $1
     ORDER BY l.number`,
    [course.id, req.user.id]
  );

  // qa_generating: pipeline is running (generation_phase set) or stubs absent
  const qaGenerating = !!course.generation_phase;
  const stubsAbsent = lessons.length === 0;
  let generating = qaGenerating;

  // Trigger generation on first open, or retry if a previous pipeline run errored
  const needsGeneration = stubsAbsent || course.qa_status === 'error';
  if (needsGeneration && !generatingCourses.has(course.id) && !qaGenerating) {
    generatingCourses.add(course.id);
    generating = true;

    const programContext = {
      title: course.program_title,
      field_of_study: course.field_of_study,
      degree_type: course.degree_type,
    };

    if (course.draft_mode) {
      // Legacy fast path: lightweight stubs + lazy lesson content (no spec reviewer)
      const legacyCourse = {
        ...course,
        program_title: course.program_title,
        field_of_study: course.field_of_study,
        degree_type: course.degree_type,
      };
      setImmediate(() => generateCourseContentBackground(legacyCourse, programContext));
    } else {
      // Spec pipeline: generate curriculum structure + lesson 1, then lessons on demand
      const program = {
        id: course.program_id,
        program_brief: course.program_brief,
        draft_mode: course.draft_mode,
        learner_profile: course.learner_profile,
      };
      setImmediate(async () => {
        try {
          // Build reviewed spec + stubs — course page shows lesson list once this completes
          const courseSpec = await runSpecPipeline(course, program, programContext);

          // Generate lesson 1 immediately so the student can start reading
          await generateNextLesson(course.id, 1, courseSpec);
          console.log(`[QA] ✓ ${course.code} lesson 1 ready`);

          // Assignments + exams from stubs (student is reading lesson 1 by now)
          const { rows: stubs } = await query(
            'SELECT number, title FROM lessons WHERE course_id = $1 ORDER BY number',
            [course.id]
          );
          if (stubs.length > 0) {
            await query('DELETE FROM assignments WHERE course_id = $1', [course.id]);
            await query('DELETE FROM exams WHERE course_id = $1', [course.id]);
            const [assignments, exams] = await Promise.all([
              generateCourseAssignments(course, stubs),
              generateCourseExams(course, stubs),
            ]);
            await writeAssignmentsToDB({ courseId: course.id, assignments });
            await writeExamsToDB({ courseId: course.id, exams });
            console.log(`[QA] ✓ ${course.code} assignments + exams ready`);
          }
        } catch (err) {
          console.error(`[QA] Pipeline failed for ${course.code}:`, err.message);
        } finally {
          generatingCourses.delete(course.id);
        }
      });
    }
  } else if (needsGeneration && generatingCourses.has(course.id)) {
    generating = true;
  }

  res.json({
    course,
    lessons,
    generating,
    generationPhase: course.generation_phase || null,
    qaStatus: course.qa_status || null,
  });
}));

// ── Knowledge Graph ──────────────────────────────────────────────────────────
// Returns nodes (courses + lessons) and edges (prerequisites + lesson order)
// for rendering dependency visualisations in the frontend.

router.get('/:programId/graph', asyncHandler(async (req, res) => {
  const { rows: [program] } = await query(
    'SELECT id FROM programs WHERE id = $1 AND user_id = $2',
    [req.params.programId, req.user.id]
  );
  if (!program) return res.status(404).json({ error: 'Program not found' });

  // Fetch all courses with semester ordering
  const { rows: courses } = await query(
    `SELECT c.id, c.code, c.title, c.course_type, c.status, c.credit_hours,
            c.prerequisites, c.position, s.number AS semester_number
     FROM courses c
     JOIN semesters s ON s.id = c.semester_id
     WHERE c.program_id = $1
     ORDER BY s.number, c.position`,
    [program.id]
  );

  // Fetch all lessons (id, number, title, summary, course_id)
  const courseIds = courses.map(c => c.id);
  let lessons = [];
  if (courseIds.length) {
    const placeholders = courseIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await query(
      `SELECT id, course_id, number, title, summary, lesson_type, estimated_minutes
       FROM lessons WHERE course_id IN (${placeholders}) ORDER BY course_id, number`,
      courseIds
    );
    lessons = rows;
  }

  // Build nodes
  const courseNodeMap = Object.fromEntries(courses.map(c => [c.code, c.id]));

  const nodes = [
    ...courses.map(c => ({
      id: c.id,
      type: 'course',
      label: c.title,
      code: c.code,
      courseType: c.course_type,
      status: c.status,
      semesterNumber: c.semester_number,
      creditHours: c.credit_hours,
    })),
    ...lessons.map(l => ({
      id: l.id,
      type: 'lesson',
      label: l.title,
      number: l.number,
      courseId: l.course_id,
      lessonType: l.lesson_type,
      estimatedMinutes: l.estimated_minutes,
      summary: l.summary,
    })),
  ];

  // Build edges
  const edges = [];

  // Course containment: course → first lesson
  const lessonsByCourse = lessons.reduce((acc, l) => {
    if (!acc[l.course_id]) acc[l.course_id] = [];
    acc[l.course_id].push(l);
    return acc;
  }, {});

  for (const c of courses) {
    const cls = lessonsByCourse[c.id] || [];

    // Course prerequisite → course edges
    const prereqs = Array.isArray(c.prerequisites) ? c.prerequisites : [];
    for (const prereqCode of prereqs) {
      const prereqId = courseNodeMap[prereqCode];
      if (prereqId) edges.push({ source: prereqId, target: c.id, type: 'course_prereq' });
    }

    // Lesson sequential edges within course
    for (let i = 0; i < cls.length - 1; i++) {
      edges.push({ source: cls[i].id, target: cls[i + 1].id, type: 'lesson_sequence' });
    }

    // Course → first lesson containment anchor
    if (cls.length) {
      edges.push({ source: c.id, target: cls[0].id, type: 'course_entry' });
    }
  }

  res.json({ nodes, edges });
}));

router.get('/:programId', asyncHandler(async (req, res) => {
  const { rows: [program] } = await query(
    'SELECT id, title, degree_type, field_of_study, total_semesters, status FROM programs WHERE id = $1 AND user_id = $2',
    [req.params.programId, req.user.id]
  );
  if (!program) return res.status(404).json({ error: 'Program not found' });
  if (program.status === 'generating') {
    return res.status(202).json({ status: 'generating', message: 'Curriculum is being generated. Check back shortly.' });
  }

  const { rows: semesters } = await query(
    'SELECT * FROM semesters WHERE program_id = $1 ORDER BY number',
    [program.id]
  );

  for (const sem of semesters) {
    const { rows: courses } = await query(
      `SELECT c.id, c.code, c.title, c.description, c.course_type, c.credit_hours,
              c.learning_objectives, c.status, c.position,
              COUNT(DISTINCT l.id) AS lesson_count,
              COUNT(DISTINCT lv.lesson_id) AS lessons_visited
       FROM courses c
       LEFT JOIN lessons l ON l.course_id = c.id
       LEFT JOIN lesson_visits lv ON lv.lesson_id = l.id AND lv.user_id = $2
       WHERE c.semester_id = $1
       GROUP BY c.id
       ORDER BY c.position`,
      [sem.id, req.user.id]
    );
    sem.courses = courses;
  }

  res.json({ program, semesters });
}));

export default router;
