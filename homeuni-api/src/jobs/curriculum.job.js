/**
 * Curriculum Generation Background Job — Pass 1 only (Skeleton)
 *
 * Generates semesters + course shells, then sets program to 'active'.
 * Course content (lessons, assignments, exams) is generated lazily when
 * the student first opens each course — see routes/curriculum.js.
 *
 * Idempotent: skips Pass 1 if semesters already exist, so safe to re-run
 * after a restart.
 */

import { query } from '../db/pool.js';
import {
  generateProgramSkeleton,
  writeProgramToDB,
} from '../lib/curriculum.agent.js';

export async function processCurriculumJob(job) {
  const { programId } = job.data;

  const { rows: [program] } = await query(
    'SELECT * FROM programs WHERE id = $1',
    [programId]
  );
  if (!program) throw new Error(`Program ${programId} not found`);
  if (!program.program_brief) throw new Error(`Program ${programId} has no program_brief — cannot generate curriculum`);

  // ── Skeleton (skip if already exists) ──────────────────────────────────────
  const { rows: [{ cnt: semCount }] } = await query(
    'SELECT COUNT(*) AS cnt FROM semesters WHERE program_id = $1',
    [programId]
  );

  if (parseInt(semCount) === 0) {
    await updateProgramStatus(programId, 'generating');
    console.log(`[Curriculum] Generating skeleton for "${program.title}"`);
    let skeleton;
    try {
      skeleton = await generateProgramSkeleton(program.program_brief);
    } catch (err) {
      console.error(`[Curriculum] Skeleton generation failed for "${program.title}":`, err.message);
      await updateProgramStatus(programId, 'onboarding'); // signals failure to UI
      throw err;
    }
    await writeProgramToDB({ programId, skeleton });
    console.log(`[Curriculum] Skeleton written — activating program`);
  } else {
    console.log(`[Curriculum] Skeleton already exists (${semCount} semesters) — skipping`);
  }

  // Activate so the user can access the program immediately.
  // Course content is generated lazily on first open.
  await updateProgramStatus(programId, 'active');
  await job.updateProgress(100);

  return { success: true, programId };
}

async function updateProgramStatus(programId, status) {
  await query(
    'UPDATE programs SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, programId]
  );
}
