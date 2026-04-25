/**
 * QA Pipeline Orchestrator
 *
 * Wires: Clarifier → Generator (Phases 1–3) → Reviewer (spec) →
 *        Generator (Phase 4) → Reviewer (lesson sample) → regen loop → persist
 *
 * Feature flags (both independently toggleable for A/B testing):
 *   program.draft_mode         — skip Phase 4 + reviewer entirely (fast path)
 *   process.env.REVIEWER_ENABLED !== 'false' — run generator but skip reviewer
 *
 * Retry caps:
 *   Spec:   1 regeneration attempt, then flag course as needs_review
 *   Lesson: 2 regeneration attempts, then flag lesson as flagged
 */

import { query } from '../db/pool.js';
import { inferLearnerProfile } from './clarifier.agent.js';
import {
  runPhases123, reviseSpec, writeAllLessons, rewriteLesson,
  extractStubsFromSpec, mapLessonToContent, buildLessonSpecIndex,
} from './course.generator.js';
import { reviewSpec, reviewLessons } from './reviewer.agent.js';
import { writeLessonStubsToDB } from './curriculum.agent.js';

// ── Config ──────────────────────────────────────────────────────────────────

const REVIEWER_ENABLED = () => process.env.REVIEWER_ENABLED !== 'false';

const PROGRESS_LABELS = {
  clarifier:       'Analyzing your learning profile…',
  spec:            'Designing curriculum architecture…',
  spec_calibrate:  'Calibrating to reference standards…',
  spec_review:     'Reviewing curriculum structure…',
  spec_revise:     'Revising curriculum (targeted fixes)…',
  spec_regen:      'Redesigning curriculum (structural revision)…',
  phase4:          'Writing lessons…',
  lesson_review:   'Quality review in progress…',
  lesson_retry:    'Rewriting lessons that need improvement…',
  persisting:      'Saving your course…',
};

// ── DB helpers ──────────────────────────────────────────────────────────────

async function setPhase(courseId, label) {
  await query(
    'UPDATE courses SET generation_phase = $1 WHERE id = $2',
    [label || null, courseId]
  );
}

async function persistVerdict({ programId, courseId, lessonId = null, scope, rubricSet, verdict, attemptNum = 1 }) {
  await query(
    `INSERT INTO qa_verdicts (program_id, course_id, lesson_id, scope, rubric_set, verdict, critique, raw_output, attempt_num)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      programId, courseId, lessonId, scope, rubricSet,
      verdict.overall_verdict,
      JSON.stringify(verdict.regeneration_targets || []),
      JSON.stringify(verdict),
      attemptNum,
    ]
  );
}

async function persistCourseSpec(courseId, courseSpec) {
  await query(
    `INSERT INTO course_specs (course_id, spec)
     VALUES ($1, $2)
     ON CONFLICT (course_id) DO UPDATE SET spec = EXCLUDED.spec, created_at = NOW()`,
    [courseId, JSON.stringify(courseSpec)]
  );
}

// ── Main pipeline ───────────────────────────────────────────────────────────

/**
 * Run the full QA pipeline for a single course.
 *
 * @param {object} course         - DB course row (id, code, title, description, learning_objectives, program_id)
 * @param {object} program        - DB program row (id, program_brief, draft_mode, learner_profile)
 * @param {object} programContext - { title, degree_type, field_of_study }
 * @param {object} [options]      - { lessonLimit: number } — cap Phase 4 writes (QA test runs)
 * @returns {{ status: 'complete'|'complete_draft'|'needs_review' }}
 */
export async function runQAPipeline(course, program, programContext, options = {}) {
  const draftMode = program.draft_mode === true;
  const reviewerEnabled = REVIEWER_ENABLED();
  const lessonLimit = options.lessonLimit || 0;
  const log = makeLogger(course.id, program.id);

  log.info(`Starting QA pipeline (draft=${draftMode}, reviewer=${reviewerEnabled})`);

  const meta = { programId: program.id, courseId: course.id };

  try {
    // ── Step 1: Clarifier ────────────────────────────────────────────────────
    await setPhase(course.id, PROGRESS_LABELS.clarifier);

    let learnerProfile = program.learner_profile;
    if (!learnerProfile) {
      learnerProfile = await inferLearnerProfile(program.program_brief, course, meta);
      await query(
        'UPDATE programs SET learner_profile = $1 WHERE id = $2',
        [JSON.stringify(learnerProfile), program.id]
      );
      log.info('Clarifier: learner profile inferred');
    } else {
      log.info('Clarifier: reusing existing learner profile');
    }

    // ── Step 2: Generator Phases 1–3 ────────────────────────────────────────
    await setPhase(course.id, PROGRESS_LABELS.spec);
    log.info('Generator: starting phases 1–3');

    let courseSpec = await runPhases123(course, programContext, learnerProfile, null, meta);
    log.phase('spec', courseSpec);
    await setPhase(course.id, PROGRESS_LABELS.spec_calibrate);

    // ── Step 3: Reviewer on spec (rubrics 1, 4, 5) ─────────────────────────
    if (reviewerEnabled && !draftMode) {
      await setPhase(course.id, PROGRESS_LABELS.spec_review);
      log.info('Reviewer: reviewing spec (rubrics 1, 4, 5)');

      const specVerdict = await reviewSpec(courseSpec, programContext, meta);
      await persistVerdict({ programId: program.id, courseId: course.id, scope: 'spec', rubricSet: 'structural', verdict: specVerdict, attemptNum: 1 });
      log.verdict('spec', specVerdict);

      if (specVerdict.overall_verdict === 'REGENERATE') {
        await setPhase(course.id, PROGRESS_LABELS.spec_regen);
        log.info('Reviewer: spec REGENERATE — one retry');

        const regen = await runPhases123(course, programContext, learnerProfile, specVerdict, meta);
        const regenVerdict = await reviewSpec(regen, programContext, meta);
        await persistVerdict({ programId: program.id, courseId: course.id, scope: 'spec', rubricSet: 'structural', verdict: regenVerdict, attemptNum: 2 });
        log.verdict('spec_regen', regenVerdict);

        if (regenVerdict.overall_verdict === 'REGENERATE') {
          log.info('Spec retry cap hit — flagging course for human review');
          await flagCourseForReview(course.id, program.id);
          await setPhase(course.id, null);
          return { status: 'needs_review' };
        }

        courseSpec = regenVerdict.overall_verdict === 'REVISE'
          ? await applyRevision(regen, regenVerdict, course, programContext, learnerProfile, program.id, meta)
          : regen;

      } else if (specVerdict.overall_verdict === 'REVISE') {
        await setPhase(course.id, PROGRESS_LABELS.spec_revise);
        courseSpec = await applyRevision(courseSpec, specVerdict, course, programContext, learnerProfile, program.id, meta);
      }
    }

    // Persist the approved spec
    await persistCourseSpec(course.id, courseSpec);

    // ── Draft mode: write stubs only and stop ───────────────────────────────
    if (draftMode) {
      log.info('Draft mode: writing lesson stubs from spec');
      const stubs = extractStubsFromSpec(courseSpec);
      await writeLessonStubsToDB({ courseId: course.id, stubs });
      await setPhase(course.id, null);
      return { status: 'complete_draft' };
    }

    // ── Step 4: Generator Phase 4 — write all lessons ───────────────────────
    await setPhase(course.id, PROGRESS_LABELS.phase4);
    log.info('Generator: starting Phase 4 lesson writing');

    // Write lesson stubs immediately so the course page shows structure while Phase 4 runs
    const stubs = extractStubsFromSpec(courseSpec);
    await writeLessonStubsToDB({ courseId: course.id, stubs });

    const { written: writtenLessons, failed: failedInitial } = await writeAllLessons(courseSpec, course, meta, lessonLimit);

    if (failedInitial.length > 0) {
      log.info(`Phase 4: ${failedInitial.length} lessons failed initial write — will flag`);
    }

    // ── Step 5: Reviewer on lesson sample (rubrics 2, 3, 6) ─────────────────
    let finalLessons = writtenLessons;

    if (reviewerEnabled && writtenLessons.length > 0) {
      await setPhase(course.id, PROGRESS_LABELS.lesson_review);

      const sample = writtenLessons.slice(0, Math.min(3, writtenLessons.length));
      log.info(`Reviewer: sampling ${sample.length} lessons (rubrics 2, 3, 6)`);

      const sampleVerdict = await reviewLessons(sample, courseSpec, meta);
      await persistVerdict({
        programId: program.id, courseId: course.id,
        scope: 'lesson', rubricSet: 'content', verdict: sampleVerdict, attemptNum: 1,
      });
      log.verdict('lesson_sample', sampleVerdict);

      if (sampleVerdict.overall_verdict !== 'PASS') {
        await setPhase(course.id, PROGRESS_LABELS.lesson_retry);

        finalLessons = await reviewAndRetryAllLessons(writtenLessons, courseSpec, course, program.id, meta);
      }
    }

    // ── Step 6: Persist lessons + assessments ──────────────────────────────
    await setPhase(course.id, PROGRESS_LABELS.persisting);
    await persistAllLessons(course.id, finalLessons, courseSpec);

    const flaggedCount = finalLessons.filter(l => l._qaStatus === 'flagged').length;
    if (failedInitial.length > 0 || flaggedCount > 0) {
      await query("UPDATE courses SET qa_status = 'needs_review' WHERE id = $1", [course.id]);
      await query(
        "UPDATE programs SET qa_status = 'needs_review' WHERE id = $1",
        [program.id]
      );
      log.info(`Pipeline complete with flags: ${flaggedCount} lessons flagged, ${failedInitial.length} failed to write`);
    } else {
      await query("UPDATE courses SET qa_status = 'passed' WHERE id = $1", [course.id]);
    }

    await setPhase(course.id, null);
    log.info('QA pipeline complete');
    return { status: 'complete' };

  } catch (err) {
    log.error(err);
    await query("UPDATE courses SET qa_status = 'error' WHERE id = $1", [course.id]).catch(() => {});
    await setPhase(course.id, null).catch(() => {});
    throw err;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function applyRevision(courseSpec, verdict, course, programContext, learnerProfile, programId, meta = {}) {
  const revised = await reviseSpec(courseSpec, verdict, course, programContext, learnerProfile, meta);
  await persistVerdict({ programId, courseId: course.id, scope: 'spec', rubricSet: 'structural', verdict: { overall_verdict: 'REVISE', regeneration_targets: verdict.regeneration_targets }, attemptNum: 1 });
  return revised;
}

async function reviewAndRetryAllLessons(lessons, courseSpec, course, programId, meta = {}) {
  const results = [];

  for (const lesson of lessons) {
    const verdict = await reviewLessons([lesson], courseSpec, meta);
    await persistVerdict({
      programId, courseId: course.id,
      scope: 'lesson', rubricSet: 'content', verdict, attemptNum: 1,
    });

    if (verdict.overall_verdict === 'PASS') {
      lesson._qaStatus = 'passed';
      results.push(lesson);
      continue;
    }

    let current = lesson;
    let passed = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`[QA] Rewriting lesson ${current.lesson_id} (attempt ${attempt}/2)`);
      try {
        const rewritten = await rewriteLesson(current, verdict, courseSpec, course, meta);
        rewritten._regenCount = attempt;

        const retryVerdict = await reviewLessons([rewritten], courseSpec, meta);
        await persistVerdict({
          programId, courseId: course.id,
          scope: 'lesson', rubricSet: 'content', verdict: retryVerdict, attemptNum: attempt + 1,
        });

        if (retryVerdict.overall_verdict === 'PASS') {
          rewritten._qaStatus = 'passed';
          results.push(rewritten);
          passed = true;
          break;
        }
        current = rewritten;
      } catch (err) {
        console.error(`[QA] Lesson ${lesson.lesson_id} retry ${attempt} failed:`, err.message);
      }
    }

    if (!passed) {
      console.warn(`[QA] Lesson ${lesson.lesson_id} exceeded retry cap — flagging for human review`);
      current._qaStatus = 'flagged';
      current._regenCount = 2;
      results.push(current);
    }
  }

  return results;
}

async function persistAllLessons(courseId, lessons, courseSpec) {
  const { phase3 } = courseSpec;
  const specIndex = buildLessonSpecIndex(phase3);

  // Build ordered list of lesson specs for numbering
  const orderedSpecs = [];
  for (const mod of phase3.modules || []) {
    for (const l of mod.lessons || []) orderedSpecs.push(l);
  }

  // Map lesson_id → number
  const numberMap = {};
  orderedSpecs.forEach((s, i) => { numberMap[s.lesson_id] = i + 1; });

  for (const lesson of lessons) {
    const lessonSpec = specIndex[lesson.lesson_id];
    const lessonNumber = numberMap[lesson.lesson_id] || 1;
    const content = mapLessonToContent(lesson);
    const qaStatus = lesson._qaStatus || 'passed';
    const regenCount = lesson._regenCount || 0;

    await query(
      `UPDATE lessons
       SET content = $1, lesson_spec = $2, qa_status = $3, regen_count = $4, summary = $5
       WHERE course_id = $6 AND number = $7`,
      [
        JSON.stringify(content),
        JSON.stringify(lesson),
        qaStatus,
        regenCount,
        lessonSpec?.objectives?.join('; ') || lesson.objectives_recap?.join('; ') || '',
        courseId,
        lessonNumber,
      ]
    );
  }
}

async function flagCourseForReview(courseId, programId) {
  await query("UPDATE courses SET qa_status = 'flagged' WHERE id = $1", [courseId]);
  await query("UPDATE programs SET qa_status = 'needs_review' WHERE id = $1", [programId]);
}

// ── Structured logger ────────────────────────────────────────────────────────

function makeLogger(courseId, programId) {
  const prefix = `[QA course=${courseId.slice(0, 8)} program=${programId.slice(0, 8)}]`;
  return {
    info: (msg) => console.log(`${prefix} ${msg}`),
    error: (err) => console.error(`${prefix} ERROR: ${err.message}`),
    phase: (name, data) => {
      const summary = summarizeSpec(name, data);
      console.log(`${prefix} Phase output — ${name}: ${summary}`);
    },
    verdict: (scope, verdict) => {
      console.log(`${prefix} Verdict (${scope}): ${verdict.overall_verdict} | targets: ${verdict.regeneration_targets?.length || 0}`);
    },
  };
}

function summarizeSpec(name, data) {
  if (name === 'spec') {
    const lessons = (data.phase3?.modules || []).reduce((n, m) => n + (m.lessons?.length || 0), 0);
    return `${data.phase3?.modules?.length || 0} modules, ${lessons} lessons, ${data.phase1?.terminal_learning_outcomes?.length || 0} outcomes`;
  }
  return JSON.stringify(data).slice(0, 100);
}
