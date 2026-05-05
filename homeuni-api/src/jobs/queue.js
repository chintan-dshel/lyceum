/**
 * In-process job queue — no Redis required.
 * Runs curriculum generation as a background async task.
 * For production scale, swap this for BullMQ + Redis.
 */
import { processCurriculumJob } from './curriculum.job.js';
import { startStreakJob } from './streak.job.js';
import { generateNextLesson } from '../lib/qa.pipeline.js';
import {
  generateCourseAssignments,
  generateCourseExams,
  writeAssignmentsToDB,
  writeExamsToDB,
} from '../lib/curriculum.agent.js';

// Minimal job object that matches the BullMQ interface the job file expects
function makeJob(data) {
  let _progress = 0;
  return {
    data,
    id: `inline-${Date.now()}`,
    updateProgress: async (p) => { _progress = p; },
    getProgress: () => _progress,
  };
}

export const curriculumQueue = {
  add: async (name, data, opts) => {
    const job = makeJob(data);

    // Fire-and-forget: run in background, don't block the HTTP response
    setImmediate(async () => {
      try {
        await processCurriculumJob(job);
        console.log(`[Queue] Curriculum generation complete for program ${data.programId}`);
      } catch (err) {
        console.error(`[Queue] Curriculum generation failed for program ${data.programId}:`, err.message);
      }
    });

    return job;
  },
};

// On startup, recover any interrupted generation work
export function startWorkers() {
  console.log('[Queue] Using in-process queue (no Redis required)');

  startStreakJob();

  setImmediate(async () => {
    try {
      const { query } = await import('../db/pool.js');

      // 1. Programs stuck mid-skeleton (status = 'generating')
      const { rows: stuckGenerating } = await query(
        "SELECT id FROM programs WHERE status = 'generating'"
      );
      if (stuckGenerating.length > 0) {
        console.log(`[Queue] Found ${stuckGenerating.length} program(s) stuck in 'generating' — re-queuing`);
        for (const { id } of stuckGenerating) {
          await curriculumQueue.add('generate', { programId: id });
        }
      }

      // 2. Courses with a stuck generation_phase (spec pipeline crashed mid-run) — clear label
      const { rows: stuckCourses } = await query(
        "SELECT id, code, generation_phase FROM courses WHERE generation_phase IS NOT NULL"
      );
      if (stuckCourses.length > 0) {
        console.log(`[Queue] Found ${stuckCourses.length} course(s) with stuck pipeline — clearing phase label`);
        for (const c of stuckCourses) {
          console.log(`[Queue]   → ${c.code} was stuck at: "${c.generation_phase}"`);
          await query("UPDATE courses SET generation_phase = NULL WHERE id = $1", [c.id]);
        }
      }

      // 3. Courses with a stored spec but missing lesson content (pipeline died mid-generation)
      //    Resume from the first lesson that has no content.
      const { rows: resumable } = await query(
        `SELECT c.id, c.code
         FROM courses c
         JOIN course_specs cs ON cs.course_id = c.id
         WHERE c.generation_phase IS NULL
           AND c.qa_status IS DISTINCT FROM 'error'
           AND EXISTS (
             SELECT 1 FROM lessons l
             WHERE l.course_id = c.id
               AND (l.content IS NULL OR l.content = '{}' OR l.content::text = '"{}"')
           )
         LIMIT 10`
      );
      if (resumable.length > 0) {
        console.log(`[Queue] Found ${resumable.length} course(s) with missing lessons — resuming`);
        for (const c of resumable) {
          const { rows: [firstMissing] } = await query(
            `SELECT number FROM lessons
             WHERE course_id = $1
               AND (content IS NULL OR content = '{}' OR content::text = '"{}"')
             ORDER BY number ASC LIMIT 1`,
            [c.id]
          );
          if (firstMissing) {
            console.log(`[Queue]   → ${c.code}: resuming from lesson ${firstMissing.number}`);
            const courseId = c.id;
            const lessonNumber = firstMissing.number;
            setImmediate(() =>
              generateNextLesson(courseId, lessonNumber).catch(err =>
                console.error(`[Queue] Resume failed for ${c.code}:`, err.message)
              )
            );
          }
        }
      }

      // 4. Courses with lessons generated but no assignments/exams yet
      //    (pipeline was killed between lesson-1 write and assignments generation)
      const { rows: needsAssignments } = await query(
        `SELECT c.id, c.code, c.title, c.description, c.learning_objectives, c.degree_type
         FROM courses c
         WHERE c.generation_phase IS NULL
           AND c.qa_status IS DISTINCT FROM 'error'
           AND EXISTS (
             SELECT 1 FROM lessons l WHERE l.course_id = c.id
               AND l.content IS NOT NULL
               AND l.content::text NOT IN ('{}', '"{}"')
           )
           AND NOT EXISTS (SELECT 1 FROM assignments WHERE course_id = c.id)
         LIMIT 5`
      );
      if (needsAssignments.length > 0) {
        console.log(`[Queue] Found ${needsAssignments.length} course(s) missing assignments/exams — generating`);
        for (const c of needsAssignments) {
          const { rows: stubs } = await query(
            'SELECT number, title FROM lessons WHERE course_id = $1 ORDER BY number',
            [c.id]
          );
          if (!stubs.length) continue;
          setImmediate(async () => {
            try {
              const [assignments, exams] = await Promise.all([
                generateCourseAssignments(c, stubs),
                generateCourseExams(c, stubs),
              ]);
              await writeAssignmentsToDB({ courseId: c.id, assignments });
              await writeExamsToDB({ courseId: c.id, exams });
              console.log(`[Queue] ✓ ${c.code} assignments + exams ready`);
            } catch (err) {
              console.error(`[Queue] ✗ ${c.code} assignments/exams failed:`, err.message);
            }
          });
        }
      }

      // 5. Programs flagged as needs_review — surface count for ops awareness
      const { rows: [{ cnt: reviewCount }] } = await query(
        "SELECT COUNT(*) AS cnt FROM programs WHERE qa_status = 'needs_review'"
      );
      if (parseInt(reviewCount) > 0) {
        console.warn(`[Queue] ${reviewCount} program(s) have courses flagged for human review (qa_status = 'needs_review')`);
      }

    } catch (err) {
      console.error('[Queue] Failed to recover programs:', err.message);
    }
  });
}
