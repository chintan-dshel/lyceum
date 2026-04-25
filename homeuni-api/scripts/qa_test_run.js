/**
 * QA Pipeline Test Runner
 *
 * Generates three validation courses, runs the full QA pipeline on each,
 * and writes results + reviewer verdicts to scripts/qa_results/.
 *
 * Run: node scripts/qa_test_run.js
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { query } from '../src/db/pool.js';
import { runQAPipeline } from '../src/lib/qa.pipeline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'qa_results');
mkdirSync(OUT_DIR, { recursive: true });

// ── Test course definitions ──────────────────────────────────────────────────

const PROGRAM_ID   = '0d707a89-4ce7-4cfd-a2d1-f901c3a4080b';
const SEMESTER_ID  = 'f5eded30-a117-4e8c-9e61-af743481ed9f';  // Semester 1

const TEST_COURSES = [
  {
    slug: '01_linear_algebra',
    code: 'TEST101',
    title: 'Introduction to Linear Algebra',
    description: 'Core concepts of linear algebra: vectors, matrices, linear transformations, eigenvalues, and their applications.',
    course_type: 'core',
    credit_hours: 3,
    learning_objectives: [
      'Understand vector spaces and linear independence',
      'Perform matrix operations and solve linear systems',
      'Compute eigenvalues and eigenvectors',
      'Apply linear algebra to real-world problems',
    ],
    programBrief: {
      title: 'BSc Mathematics',
      degree_type: 'bachelor',
      field_of_study: 'Mathematics',
      total_semesters: 6,
      goals: 'Build strong mathematical foundations including proof-writing, linear algebra, calculus, and analysis.',
      description: 'A rigorous undergraduate mathematics degree covering pure and applied topics.',
    },
  },
  {
    slug: '02_mechanism_design',
    code: 'TEST601',
    title: 'Mechanism Design in Auction Theory',
    description: 'Graduate-level study of mechanism design, incentive compatibility, revenue equivalence, and auction formats.',
    course_type: 'core',
    credit_hours: 4,
    learning_objectives: [
      'Derive and apply revelation principle and envelope theorem',
      'Analyze Bayesian Nash equilibria in auction formats',
      'Design mechanisms satisfying incentive compatibility and individual rationality',
      'Critique optimal auction design under asymmetric information',
    ],
    programBrief: {
      title: 'MSc Economics — Microeconomic Theory',
      degree_type: 'master',
      field_of_study: 'Economics',
      total_semesters: 4,
      goals: 'Deep mastery of microeconomic theory, game theory, and mechanism design for academic research.',
      description: 'A research-oriented graduate program in microeconomic theory and market design.',
    },
  },
  {
    slug: '03_computational_decipherment',
    code: 'TEST401',
    title: 'Computational Approaches to Ancient Language Decipherment',
    description: 'Interdisciplinary course bridging computational linguistics, machine learning, and ancient language scholarship for undeciphered scripts.',
    course_type: 'elective',
    credit_hours: 3,
    learning_objectives: [
      'Apply NLP and statistical methods to undeciphered script analysis',
      'Critique historical decipherment methods using modern computational tools',
      'Implement sequence models for script segmentation and pattern discovery',
      'Synthesize evidence from archaeology, linguistics, and ML to hypothesize decipherment pathways',
    ],
    programBrief: {
      title: 'MSc Computational Linguistics',
      degree_type: 'master',
      field_of_study: 'Computational Linguistics',
      total_semesters: 4,
      goals: 'Apply computational methods to natural language understanding, with a focus on historical and low-resource languages.',
      description: 'An interdisciplinary graduate program combining linguistics, computer science, and cognitive science.',
    },
  },
];

// ── Runner ──────────────────────────────────────────────────────────────────

async function runTestCourse(spec, options = {}) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`TEST: ${spec.title}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Insert test course row (clean up any previous test run first)
  await query(`DELETE FROM courses WHERE code = $1 AND program_id = $2`, [spec.code, PROGRAM_ID]);

  const { rows: [course] } = await query(
    `INSERT INTO courses
       (semester_id, program_id, code, title, description, course_type,
        credit_hours, learning_objectives, prerequisites, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]', 99)
     RETURNING *`,
    [
      SEMESTER_ID, PROGRAM_ID,
      spec.code, spec.title, spec.description,
      spec.course_type, spec.credit_hours,
      JSON.stringify(spec.learning_objectives),
    ]
  );

  // Fetch the program row with program_brief
  const { rows: [program] } = await query(
    `SELECT * FROM programs WHERE id = $1`, [PROGRAM_ID]
  );

  // Temporarily override program_brief with the test spec's brief
  const testProgram = {
    ...program,
    program_brief: spec.programBrief,
    draft_mode: false,
    learner_profile: null,   // force clarifier to run
  };

  const programContext = {
    title: spec.programBrief.title,
    degree_type: spec.programBrief.degree_type,
    field_of_study: spec.programBrief.field_of_study,
  };

  const startMs = Date.now();
  let result;
  try {
    result = await runQAPipeline(course, testProgram, programContext, options);
  } catch (err) {
    result = { status: 'error', error: err.message };
    console.error(`Pipeline error:`, err.message);
  }
  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

  // Fetch persisted data for the report
  const { rows: courseSpec } = await query(
    `SELECT spec FROM course_specs WHERE course_id = $1`, [course.id]
  );
  const { rows: lessons } = await query(
    `SELECT number, title, qa_status, regen_count,
            jsonb_array_length(lesson_spec->'worked_examples') AS worked_examples,
            jsonb_array_length(lesson_spec->'common_misconceptions') AS misconceptions,
            jsonb_array_length(lesson_spec->'practice_problems') AS practice_problems
     FROM lessons WHERE course_id = $1 ORDER BY number`,
    [course.id]
  );
  const { rows: verdicts } = await query(
    `SELECT scope, rubric_set, verdict, attempt_num, critique, created_at
     FROM qa_verdicts WHERE course_id = $1 ORDER BY created_at`,
    [course.id]
  );

  const report = {
    course: { code: spec.code, title: spec.title, slug: spec.slug },
    pipeline_status: result.status,
    elapsed_seconds: parseFloat(elapsedSec),
    lesson_count: lessons.length,
    lessons_flagged: lessons.filter(l => l.qa_status === 'flagged').length,
    lessons_needs_review: lessons.filter(l => l.qa_status === 'needs_review').length,
    lessons_passed: lessons.filter(l => l.qa_status === 'passed').length,
    lesson_summary: lessons.map(l => ({
      number: l.number,
      title: l.title,
      qa_status: l.qa_status,
      regen_count: l.regen_count,
      worked_examples: l.worked_examples,
      misconceptions: l.misconceptions,
      practice_problems: l.practice_problems,
    })),
    verdicts: verdicts.map(v => ({
      scope: v.scope,
      rubric_set: v.rubric_set,
      verdict: v.verdict,
      attempt_num: v.attempt_num,
      critique_count: Array.isArray(v.critique) ? v.critique.length : 0,
    })),
    course_spec: courseSpec[0]?.spec || null,
  };

  // Write report
  const outPath = join(OUT_DIR, `${spec.slug}_report.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n→ Report written: ${outPath}`);
  console.log(`  Status: ${result.status} | ${lessons.length} lessons | ${elapsedSec}s`);
  console.log(`  Verdicts: ${verdicts.map(v => `${v.rubric_set}=${v.verdict}`).join(', ')}`);
  console.log(`  Lesson QA: ${lessons.filter(l=>l.qa_status==='passed').length} passed, ${lessons.filter(l=>l.qa_status==='flagged').length} flagged`);

  return report;
}

async function main() {
  const lessonLimit = parseInt(process.env.LESSON_LIMIT || '0', 10);

  console.log('Lyceum QA Pipeline — Test Run');
  console.log(`Results → ${OUT_DIR}\n`);
  console.log(`REVIEWER_ENABLED: ${process.env.REVIEWER_ENABLED !== 'false'}`);
  if (lessonLimit > 0) console.log(`LESSON_LIMIT: ${lessonLimit} lessons per course`);

  const summaries = [];
  for (const spec of TEST_COURSES) {
    const summary = await runTestCourse(spec, { lessonLimit });
    summaries.push(summary);
  }

  // Write combined summary
  writeFileSync(
    join(OUT_DIR, '_summary.json'),
    JSON.stringify({ run_at: new Date().toISOString(), courses: summaries }, null, 2)
  );

  console.log(`\n${'═'.repeat(60)}`);
  console.log('All three test courses complete. Review qa_results/ for full reports.');
  console.log('═'.repeat(60));

  process.exit(0);
}

main().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
