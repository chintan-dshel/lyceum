/**
 * In-process job queue — no Redis required.
 * Runs curriculum generation as a background async task.
 * For production scale, swap this for BullMQ + Redis.
 */
import { processCurriculumJob } from './curriculum.job.js';
import { startStreakJob } from './streak.job.js';

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

      // 2. Courses with a stuck generation_phase (QA pipeline crashed mid-run)
      const { rows: stuckCourses } = await query(
        "SELECT id, code, generation_phase FROM courses WHERE generation_phase IS NOT NULL"
      );
      if (stuckCourses.length > 0) {
        console.log(`[Queue] Found ${stuckCourses.length} course(s) with stuck QA pipeline — clearing phase label`);
        for (const c of stuckCourses) {
          console.log(`[Queue]   → ${c.code} was stuck at: "${c.generation_phase}"`);
          await query("UPDATE courses SET generation_phase = NULL WHERE id = $1", [c.id]);
        }
      }

      // 3. Programs flagged as needs_review — surface count for ops awareness
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
