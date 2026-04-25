/**
 * Layer 3 — E2E pipeline contract tests.
 *
 * These tests call the real Claude API (Clarifier + Generator Phases 1–4).
 * They run against the live DB, not mocks.
 *
 * Cost per run: ~$0.10–0.15 (Haiku clarifier + Sonnet spec + Sonnet 1 lesson)
 * Run: npm run test:e2e
 * NOT included in the default `npm test` suite.
 *
 * What is verified here that the mocked integration tests cannot:
 *   - The Clarifier actually returns a valid learner_profile from a real LLM call
 *   - The Generator Phases 1–3 return a parseable spec with required structure
 *   - The Generator Phase 4 writes a lesson that passes schema validation
 *   - The pipeline persists data to the real DB correctly
 *   - lessonLimit correctly caps Phase 4 output
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../../db/pool.js';
import { runQAPipeline } from '../../lib/qa.pipeline.js';
import { createTestUser, } from '../helpers/auth.js';
import { createTestProgram, createTestSemester, createTestCourse, cleanup } from '../helpers/db.js';

let testUser;
let program;
let course;
let pipelineResult;

const PROGRAM_BRIEF = {
  title: 'BSc Mathematics (E2E Test)',
  degree_type: 'bachelor',
  field_of_study: 'Mathematics',
  total_semesters: 4,
  goals: 'Build strong mathematical foundations.',
  description: 'Undergraduate mathematics covering analysis, algebra, and applied topics.',
};

const PROGRAM_CONTEXT = {
  title: PROGRAM_BRIEF.title,
  degree_type: PROGRAM_BRIEF.degree_type,
  field_of_study: PROGRAM_BRIEF.field_of_study,
};

beforeAll(async () => {
  testUser = await createTestUser();
  program = await createTestProgram(testUser.id, { title: PROGRAM_BRIEF.title });

  // Write program_brief into the programs row (createTestProgram doesn't set it)
  await query(
    'UPDATE programs SET program_brief = $1 WHERE id = $2',
    [JSON.stringify(PROGRAM_BRIEF), program.id]
  );

  const semester = await createTestSemester(program.id);
  course = await createTestCourse(semester.id, program.id, {
    code: `E2E-${Date.now()}`,
    title: 'Introduction to Real Analysis',
    description: 'Rigorous foundations of real analysis: limits, continuity, differentiation, integration.',
    course_type: 'core',
  });

  // Fetch the full program row (pipeline needs all columns)
  const { rows: [fullProgram] } = await query('SELECT * FROM programs WHERE id = $1', [program.id]);
  const testProgram = {
    ...fullProgram,
    program_brief: PROGRAM_BRIEF,
    draft_mode: false,
    learner_profile: null,
  };

  // Fetch the full course row
  const { rows: [fullCourse] } = await query('SELECT * FROM courses WHERE id = $1', [course.id]);

  pipelineResult = await runQAPipeline(fullCourse, testProgram, PROGRAM_CONTEXT, { lessonLimit: 1 });
}, 600000);

afterAll(async () => {
  await cleanup(testUser?.id);
});

// ── Pipeline status ───────────────────────────────────────────────────────────

describe('pipeline outcome', () => {
  it('returns status: complete (not error or needs_review)', () => {
    expect(pipelineResult.status).toBe('complete');
  });
});

// ── Course spec persisted ─────────────────────────────────────────────────────

describe('course spec (Phases 1–3)', () => {
  let spec;

  beforeAll(async () => {
    const { rows: [row] } = await query(
      'SELECT spec FROM course_specs WHERE course_id = $1',
      [course.id]
    );
    spec = row?.spec;
  });

  it('persists a course_spec row', () => {
    expect(spec).not.toBeNull();
  });

  it('spec has phase1 with terminal_learning_outcomes', () => {
    expect(Array.isArray(spec.phase1?.terminal_learning_outcomes)).toBe(true);
    expect(spec.phase1.terminal_learning_outcomes.length).toBeGreaterThanOrEqual(4);
  });

  it('phase1 outcomes use observable verbs (not "understand" or "know")', () => {
    const banned = /\b(understand|know|be familiar|appreciate|learn about)\b/i;
    for (const outcome of spec.phase1.terminal_learning_outcomes) {
      const text = typeof outcome === 'string' ? outcome : JSON.stringify(outcome);
      expect(text).not.toMatch(banned);
    }
  });

  it('spec has phase2 with calibration anchors', () => {
    expect(Array.isArray(spec.phase2?.anchors)).toBe(true);
    expect(spec.phase2.anchors.length).toBeGreaterThanOrEqual(2);
    expect(spec.phase2.depth_calibration_statement).toBeTruthy();
  });

  it('spec has phase3 with at least one module', () => {
    expect(Array.isArray(spec.phase3?.modules)).toBe(true);
    expect(spec.phase3.modules.length).toBeGreaterThanOrEqual(1);
  });

  it('phase3 has assessment_blueprint with at least one entry', () => {
    expect(Array.isArray(spec.phase3?.assessment_blueprint)).toBe(true);
    expect(spec.phase3.assessment_blueprint.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Lesson written (Phase 4) ──────────────────────────────────────────────────

describe('lesson content (Phase 4)', () => {
  let lessons;

  beforeAll(async () => {
    // lesson_spec IS NOT NULL filters out stub rows created before Phase 4
    const { rows } = await query(
      `SELECT number, title, qa_status, regen_count, lesson_spec, content
       FROM lessons WHERE course_id = $1 AND lesson_spec IS NOT NULL ORDER BY number`,
      [course.id]
    );
    lessons = rows;
  });

  it('exactly 1 lesson written (lessonLimit=1)', () => {
    expect(lessons.length).toBe(1);
  });

  it('lesson has qa_status passed', () => {
    expect(lessons[0].qa_status).toBe('passed');
  });

  it('lesson_spec has required Phase 4 fields', () => {
    const spec = lessons[0].lesson_spec;
    expect(spec).toMatchObject({
      lesson_id: expect.any(String),
      title: expect.any(String),
      objectives_recap: expect.any(Array),
      prerequisites_check: expect.any(String),
      connection_forward: expect.any(String),
    });
  });

  it('lesson has >= 2 worked_examples', () => {
    expect(lessons[0].lesson_spec.worked_examples.length).toBeGreaterThanOrEqual(2);
  });

  it('lesson has >= 2 common_misconceptions', () => {
    expect(lessons[0].lesson_spec.common_misconceptions.length).toBeGreaterThanOrEqual(2);
  });

  it('lesson has >= 3 practice_problems', () => {
    expect(lessons[0].lesson_spec.practice_problems.length).toBeGreaterThanOrEqual(3);
  });

  it('lesson content (mapped format) has sections and key_terms', () => {
    const content = lessons[0].content;
    expect(Array.isArray(content?.sections)).toBe(true);
    expect(content.sections.length).toBeGreaterThan(0);
    expect(Array.isArray(content?.key_terms)).toBe(true);
  });
});

// ── Learner profile persisted ─────────────────────────────────────────────────

describe('learner profile (Clarifier)', () => {
  it('persists a learner_profile on the program row', async () => {
    const { rows: [p] } = await query(
      'SELECT learner_profile FROM programs WHERE id = $1',
      [program.id]
    );
    expect(p.learner_profile).not.toBeNull();
    expect(p.learner_profile).toMatchObject({
      exact_topic: expect.any(String),
      assumed_background: expect.any(String),
    });
  });
});
