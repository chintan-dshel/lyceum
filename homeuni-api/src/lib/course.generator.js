/**
 * Course Generator — Phases 1–4
 *
 * Phase 1–3: Single DEEP call → course_spec JSON
 *   { phase1: learner_spec, phase2: calibration_anchors, phase3: curriculum_architecture }
 *
 * Phase 4: Per-lesson DEEP calls (fan-out, max 3 concurrent)
 *   Each call receives: lesson spec, prerequisite specs, terminal outcomes served
 *
 * Retry contract:
 *   - JSON schema validation after each call; one retry with explicit error on failure
 *   - Spec retry: caller passes prior spec + structured reviewer critique
 *   - Lesson retry: caller passes prior lesson + structured reviewer critique
 */

import { callClaude, MODELS } from './anthropic.js';

// ── System prompt (verbatim) ────────────────────────────────────────────────

const GENERATOR_SYSTEM = `You are the Course Architect for Lyceum, an AI university. Your job is to design and write university-level courses that meet a verifiable quality bar. You do not produce surface-level content that "looks like" a syllabus. You produce courses that actually teach.

You will work through FOUR PHASES in order. You must complete each phase before starting the next. Phases 1–3 produce a structured spec; Phase 4 writes the lessons against that spec.

═══════════════════════════════════════════════
PHASE 1 — LEARNER & OUTCOME SPECIFICATION
═══════════════════════════════════════════════

Based on the clarifying conversation with the learner, produce a JSON block:

{
  "topic": "<exact subject>",
  "learner_profile": {
    "assumed_background": "<concrete prerequisites, e.g. 'single-variable calculus, no prior linear algebra'>",
    "stated_goal": "<what the learner said they want>",
    "inferred_goal": "<what they likely actually need, if different>"
  },
  "course_level": "<one of: short_course | undergraduate_intro | undergraduate_advanced | graduate_seminar | professional_certificate>",
  "estimated_hours": <integer>,
  "terminal_learning_outcomes": [
    // 4–8 outcomes, each must:
    //   - Start with an observable verb (derive, implement, critique, design, prove, diagnose, NOT "understand" or "know")
    //   - Specify the cognitive level (Bloom: Remember/Understand/Apply/Analyze/Evaluate/Create)
    //   - Be assessable — you must be able to imagine a task that demonstrates it
  ]
}

If any outcome uses "understand," "know," "be familiar with," "appreciate," or "learn about," REWRITE IT. These are not measurable.

═══════════════════════════════════════════════
PHASE 2 — CALIBRATION ANCHORS
═══════════════════════════════════════════════

Before designing the curriculum, identify 2–3 real-world reference curricula or canonical texts that exist in the field. State explicitly how this course's scope and depth maps to them. This is for YOUR calibration — it forces grounding.

{
  "anchors": [
    {
      "reference": "<e.g. 'Abbott, Understanding Analysis, 2nd ed.'>",
      "scope_mapping": "<which chapters/units this course covers at comparable depth>",
      "what_we_omit": "<what's in the reference but not here, and why>",
      "what_we_add": "<anything beyond the reference, and why>"
    }
  ],
  "depth_calibration_statement": "<1–2 sentences: 'A learner who completes this course should be able to do roughly what a student who completed [X chapters of Y] can do.'>"
}

If the topic has no canonical reference (rare, interdisciplinary, or emerging fields), instead identify 2–3 adjacent fields with established canons and state how you're synthesizing.

═══════════════════════════════════════════════
PHASE 3 — CURRICULUM ARCHITECTURE
═══════════════════════════════════════════════

Produce the full course structure BEFORE writing any lesson content.

{
  "modules": [
    {
      "module_id": "M1",
      "title": "...",
      "purpose": "<what this module enables that wasn't possible before>",
      "lessons": [
        {
          "lesson_id": "L1.1",
          "title": "...",
          "prerequisites": ["<lesson_ids or 'none'>"],
          "objectives": ["<2–4 lesson-level objectives, also using observable verbs and Bloom levels>"],
          "key_concepts": ["..."],
          "estimated_minutes": <int>
        }
      ]
    }
  ],
  "dependency_graph": "<a brief textual map: which lessons depend on which. Flag any orphan lessons (not used downstream and not a terminal outcome) — these should usually be cut.>",
  "assessment_blueprint": [
    {
      "assessment_id": "A1",
      "type": "<formative_quiz | problem_set | project | midterm | final | capstone>",
      "after_lesson": "<lesson_id>",
      "outcomes_assessed": ["<terminal_outcome indices and lesson objective ids>"],
      "format": "<short answer, derivation, code, essay, oral defense, etc.>",
      "rationale": "<why this format actually measures these outcomes at the right Bloom level>"
    }
  ]
}

Hard requirements before proceeding to Phase 4:
- Every terminal outcome must be assessed by at least one assessment.
- Every lesson must either be a prerequisite for a later lesson, contribute to an assessment, or directly serve a terminal outcome. If not — cut it.
- The assessment blueprint must include at least one task at each Bloom level claimed in the terminal outcomes. If a terminal outcome claims "Create" but every assessment is multiple choice, the blueprint fails.

═══════════════════════════════════════════════
PHASE 4 — LESSON WRITING (PER-LESSON CONTRACT)
═══════════════════════════════════════════════

Write each lesson as a structured object. Every lesson MUST contain every field below. Empty or token-thin fields = lesson fails.

{
  "lesson_id": "...",
  "title": "...",
  "objectives_recap": [...],
  "prerequisites_check": "<2–3 sentences reminding the learner of the specific prior concepts needed; reference earlier lesson_ids>",

  "core_content": {
    // The actual teaching. Subject to ANTI-SLOP RULES below.
    // Structure as conceptual progression: motivation → definition → mechanism → example → generalization.
    // This field should contain the substantive lesson body as structured prose, not a placeholder.
  },

  "worked_examples": [
    // MINIMUM 2 fully worked examples per lesson.
    // Each example shows the reasoning step by step, including dead ends or alternative approaches where instructive.
    // Not just "here is the answer" — show the thinking.
  ],

  "common_misconceptions": [
    // MINIMUM 2. Real misconceptions actual learners have, not strawmen.
    // Format: "Learners often think X. This is wrong because Y. The correct intuition is Z."
  ],

  "practice_problems": [
    // MINIMUM 3, with full worked solutions.
    // Range across Bloom levels claimed in the lesson objectives.
    // At least one should be non-trivial — requiring the learner to combine ideas, not regurgitate.
  ],

  "connection_forward": "<1–2 sentences: what this enables in upcoming lessons; reference specific lesson_ids>",

  "open_questions_or_limits": "<honest acknowledgment: what does this lesson NOT cover, what's debated in the field, where does the simplified treatment break down>",

  "blackboard_cues": [
    // For the professor agent's blackboard feature: 3–6 visual elements (diagrams, equations, tables, sketches) that should appear at specific moments. Each cue specifies WHEN in the lesson and WHAT to draw/show.
  ],

  "references": [
    // 2–3 real sources a learner can verify. Name actual textbooks, papers, or articles that exist.
    // Be specific: author, title, chapter or section where relevant.
    // If uncertain about a detail, note it in the "note" field — do not fabricate.
    // Format: { "title": "...", "author": "...", "year": 2019, "type": "textbook|paper|article", "note": "optional caveat" }
  ]
}

═══════════════════════════════════════════════
ANTI-SLOP RULES (apply throughout Phase 4)
═══════════════════════════════════════════════

BANNED phrasings and patterns:
- "In this lesson, we will explore the fascinating world of..."
- "It's important to note that..." / "It's worth mentioning that..."
- "Let's dive into..." / "Let's embark on a journey..."
- Recap intros that re-state what the lesson title already says
- "In conclusion" wrappers
- Filler transitions like "Now that we've covered X, let's move on to Y" without substantive bridging
- Listing terms with one-line definitions and no mechanism

REQUIRED of every paragraph:
A paragraph must do at least one of: (a) introduce a new concept with a precise definition, (b) demonstrate a concept with a concrete instance, (c) explain a mechanism (the *why* or *how*), or (d) prompt the learner to apply or test understanding. If a paragraph does none of these, cut it.

DEPTH RULES:
- Every abstract claim is paired with a concrete instance.
- Every definition is followed by either an example, a non-example, or a derivation showing where it comes from.
- For technical material: show the derivation or proof sketch, don't just state the result. If you must omit, explicitly say "we omit the proof; see [reference]."
- Use precise language. "Roughly," "kind of," "sort of," "various," "many" are signals you're being lazy — replace with specifics or cut.

VOICE:
- Address the learner as "you." Avoid "we" except for genuine collaborative reasoning ("we now want to show that...").
- The professor speaks like a knowledgeable human who respects the learner's time, not a textbook narrator.

═══════════════════════════════════════════════
LEVEL CALIBRATION CHECK
═══════════════════════════════════════════════

Before finalizing each lesson, ask yourself:
- For undergraduate_intro: Would this lesson teach a motivated beginner something they couldn't get from a 10-minute Wikipedia skim?
- For undergraduate_advanced: Does this require the learner to actually do work beyond reading? Are there derivations, proofs, or non-trivial applications?
- For graduate_seminar: Are open problems, recent literature, methodological debates, and original synthesis present?
- For professional_certificate: Are the examples and practice problems drawn from realistic professional scenarios, not toy cases?

If the answer is no, the lesson is mis-calibrated. Rewrite.

═══════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════

Output Phases 1–3 as JSON, then Phase 4 as a sequence of lesson objects. Do not skip phases. Do not write lessons before completing the architecture. The reviewer agent will check every requirement above.`;

// ── JSON schema validators ──────────────────────────────────────────────────

function validatePhase1(p) {
  const required = ['topic', 'learner_profile', 'course_level', 'terminal_learning_outcomes'];
  const missing = required.filter(k => !p[k]);
  if (missing.length) throw new Error(`Phase 1 missing fields: ${missing.join(', ')}`);
  if (!Array.isArray(p.terminal_learning_outcomes) || p.terminal_learning_outcomes.length < 4) {
    throw new Error('Phase 1: terminal_learning_outcomes must have 4–8 items');
  }
}

function validatePhase2(p) {
  if (!Array.isArray(p.anchors) || p.anchors.length < 2) {
    throw new Error('Phase 2: anchors must have 2–3 items');
  }
  if (!p.depth_calibration_statement) {
    throw new Error('Phase 2: depth_calibration_statement required');
  }
}

function validatePhase3(p) {
  if (!Array.isArray(p.modules) || p.modules.length === 0) {
    throw new Error('Phase 3: modules array required');
  }
  if (!Array.isArray(p.assessment_blueprint) || p.assessment_blueprint.length === 0) {
    throw new Error('Phase 3: assessment_blueprint required');
  }
  for (const mod of p.modules) {
    if (!Array.isArray(mod.lessons) || mod.lessons.length === 0) {
      throw new Error(`Phase 3: module ${mod.module_id} has no lessons`);
    }
  }
}

function validateLesson(lesson) {
  const required = [
    'lesson_id', 'title', 'objectives_recap', 'prerequisites_check',
    'core_content', 'worked_examples', 'common_misconceptions',
    'practice_problems', 'connection_forward', 'open_questions_or_limits',
  ];
  const missing = required.filter(k => lesson[k] == null || lesson[k] === '');
  if (missing.length) throw new Error(`Lesson ${lesson.lesson_id || '?'} missing: ${missing.join(', ')}`);
  if (!Array.isArray(lesson.worked_examples) || lesson.worked_examples.length < 2) {
    throw new Error(`Lesson ${lesson.lesson_id}: requires 2+ worked_examples`);
  }
  if (!Array.isArray(lesson.common_misconceptions) || lesson.common_misconceptions.length < 2) {
    throw new Error(`Lesson ${lesson.lesson_id}: requires 2+ common_misconceptions`);
  }
  if (!Array.isArray(lesson.practice_problems) || lesson.practice_problems.length < 3) {
    throw new Error(`Lesson ${lesson.lesson_id}: requires 3+ practice_problems`);
  }
}

// ── Shared JSON extraction with schema validation + one retry ──────────────

async function callAndValidate(callOpts, validator) {
  const { text, stopReason } = await callClaude(callOpts);
  if (stopReason === 'max_tokens') {
    console.warn(`[Generator] Response hit max_tokens (${callOpts.maxTokens}) — JSON likely truncated`);
  }
  const parsed = extractJSON(text);

  try {
    validator(parsed);
    return parsed;
  } catch (validationErr) {
    const retryMessages = [
      ...callOpts.messages,
      { role: 'assistant', content: text },
      {
        role: 'user',
        content: `Your output failed schema validation: ${validationErr.message}. Correct this and return only the valid JSON object wrapped in <json>...</json> tags, no prose.`,
      },
    ];
    const retry = await callClaude({ ...callOpts, messages: retryMessages });
    const reparsed = extractJSON(retry.text);
    validator(reparsed);
    return reparsed;
  }
}

function extractJSON(text) {
  // 1. Raw parse
  try { return JSON.parse(text.trim()); } catch {}

  // 2. Strip outermost markdown fence
  const stripped = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  try { return JSON.parse(stripped); } catch {}

  // 3. Extract from <json>...</json> tags
  const tagMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagMatch) { try { return JSON.parse(tagMatch[1].trim()); } catch {} }

  // 4. Find all JSON blocks; prefer the one that starts with {"phase
  const allBlocks = [];
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) { allBlocks.push(text.slice(start, i + 1)); start = -1; }
    }
  }
  // Try largest block first, then blocks starting with {"phase
  const sorted = [...allBlocks].sort((a, b) => b.length - a.length);
  for (const block of sorted) {
    try { return JSON.parse(block); } catch {}
  }

  console.error('[Generator] JSON extraction failed. Response snippet:\n', text.slice(0, 800));
  throw new Error('Could not extract valid JSON from response');
}

// ── Phase 1–3: single DEEP call ─────────────────────────────────────────────

/**
 * Run phases 1–3 for a single course.
 *
 * @param {object} course         - DB course row (code, title, description, learning_objectives)
 * @param {object} programContext - { title, degree_type, field_of_study }
 * @param {object} learnerProfile - output of clarifier.inferLearnerProfile()
 * @param {object} [critique]     - reviewer verdict from previous attempt (for regeneration)
 * @returns {{ phase1, phase2, phase3 }}
 */
export async function runPhases123(course, programContext, learnerProfile, critique = null, meta = {}) {
  const critiqueSection = critique
    ? `\n\n═══ REVIEWER CRITIQUE FROM PREVIOUS ATTEMPT ═══\nThe previous spec failed quality review. Address every item below before producing the new spec:\n${JSON.stringify(critique.regeneration_targets, null, 2)}\n`
    : '';

  const messages = [{
    role: 'user',
    content: `Design a course using Phases 1–3 only. Do NOT write any lesson content yet.

COURSE CONTEXT
Course: ${course.title} (${course.code})
Description: ${course.description}
Current learning objectives: ${(course.learning_objectives || []).join('; ')}
Program: ${programContext.title} (${programContext.degree_type} in ${programContext.field_of_study})

LEARNER PROFILE (from Clarifier)
${JSON.stringify(learnerProfile, null, 2)}
${critiqueSection}
Output a single JSON object wrapped in <json>...</json> tags with this exact shape:
<json>
{
  "phase1": { ...Phase 1 output... },
  "phase2": { ...Phase 2 output... },
  "phase3": { ...Phase 3 output... }
}
</json>

Do not write Phase 4 lesson content. Stop after the curriculum architecture.`,
  }];

  const result = await callAndValidate(
    { model: MODELS.DEEP, system: GENERATOR_SYSTEM, messages, maxTokens: 16000, meta: { ...meta, agent: 'generator_spec' } },
    (r) => {
      if (!r.phase1 || !r.phase2 || !r.phase3) {
        throw new Error('Response must have phase1, phase2, phase3 top-level keys');
      }
      validatePhase1(r.phase1);
      validatePhase2(r.phase2);
      validatePhase3(r.phase3);
    }
  );

  console.log(`[Generator] Phases 1–3 complete: ${result.phase3.modules.length} modules, ${countLessons(result.phase3)} lesson specs`);
  return result;
}

function countLessons(phase3) {
  return (phase3.modules || []).reduce((n, m) => n + (m.lessons?.length || 0), 0);
}

// ── Phase 3 patch for REVISE verdict ────────────────────────────────────────

/**
 * Patch a spec in-place for REVISE verdict (lighter than full REGENERATE).
 * Sends only the spec + critique and asks Claude to return a corrected spec.
 */
export async function reviseSpec(courseSpec, verdict, course, programContext, learnerProfile, meta = {}) {
  const messages = [{
    role: 'user',
    content: `The course spec below needs targeted revisions (REVISE, not REGENERATE). Fix only the flagged items; preserve everything that passed review.

CURRENT SPEC:
${JSON.stringify(courseSpec, null, 2)}

REVIEWER'S REQUIRED REVISIONS:
${JSON.stringify(verdict.regeneration_targets, null, 2)}

Return the complete corrected spec wrapped in <json>...</json> tags with phase1, phase2, phase3 keys.`,
  }];

  const result = await callAndValidate(
    { model: MODELS.DEEP, system: GENERATOR_SYSTEM, messages, maxTokens: 16000, meta: { ...meta, agent: 'generator_revise' } },
    (r) => {
      if (!r.phase1 || !r.phase2 || !r.phase3) {
        throw new Error('Revised spec must have phase1, phase2, phase3 keys');
      }
      validatePhase1(r.phase1);
      validatePhase2(r.phase2);
      validatePhase3(r.phase3);
    }
  );

  return result;
}

// ── Phase 4: per-lesson fan-out ─────────────────────────────────────────────

/**
 * Build a flat index of all lesson specs from phase3.modules for quick lookup.
 */
export function buildLessonSpecIndex(phase3) {
  const index = {};
  for (const mod of phase3.modules || []) {
    for (const lesson of mod.lessons || []) {
      index[lesson.lesson_id] = { ...lesson, module_id: mod.module_id, module_title: mod.title };
    }
  }
  return index;
}

/**
 * Determine which terminal outcomes a lesson serves.
 * A lesson serves an outcome if it feeds an assessment that assesses that outcome.
 */
function getTerminalOutcomesForLesson(lessonId, phase3, phase1) {
  const assessmentsForLesson = (phase3.assessment_blueprint || []).filter(a => {
    const lessonsInModule = [];
    for (const mod of phase3.modules || []) {
      for (const l of mod.lessons || []) {
        if (a.after_lesson === l.lesson_id) lessonsInModule.push(l.lesson_id);
      }
    }
    return a.after_lesson === lessonId || lessonsInModule.includes(lessonId);
  });

  const outcomeIndices = new Set();
  for (const assessment of assessmentsForLesson) {
    for (const ref of assessment.outcomes_assessed || []) {
      const match = ref.match(/\d+/);
      if (match) outcomeIndices.add(parseInt(match[0], 10) - 1);
    }
  }

  const outcomes = phase1.terminal_learning_outcomes || [];
  return outcomeIndices.size > 0
    ? [...outcomeIndices].map(i => outcomes[i]).filter(Boolean)
    : outcomes; // fall back to all outcomes if we can't determine specific ones
}

/**
 * Build a trimmed course context for a single lesson write.
 * Sends only phase1, a condensed phase2, and the current module + blueprint from phase3.
 * Avoids serialising all 30+ lesson specs for every lesson call (~15k → ~3k input tokens).
 */
function buildLessonContext(courseSpec, lessonSpec) {
  const { phase1, phase2, phase3 } = courseSpec;
  const currentModule = (phase3.modules || []).find(m =>
    (m.lessons || []).some(l => l.lesson_id === lessonSpec.lesson_id)
  );
  return {
    phase1,
    phase2: {
      anchors: (phase2.anchors || []).map(a => ({
        reference: a.reference,
        scope_mapping: a.scope_mapping,
      })),
      depth_calibration_statement: phase2.depth_calibration_statement,
    },
    phase3_summary: {
      current_module: currentModule,
      assessment_blueprint: phase3.assessment_blueprint,
      dependency_graph: phase3.dependency_graph,
    },
  };
}

/**
 * Write a single lesson (Phase 4).
 *
 * @param {object} lessonSpec     - from phase3 lesson index
 * @param {object} courseSpec     - full { phase1, phase2, phase3 }
 * @param {object} course         - DB course row
 * @param {object} [critique]     - reviewer verdict for retry
 * @returns {object}              - full Phase 4 lesson object
 */
export async function writeSingleLesson(lessonSpec, courseSpec, course, critique = null, meta = {}) {
  const { phase1, phase3 } = courseSpec;
  const specIndex = buildLessonSpecIndex(phase3);

  // Resolve prerequisite lesson specs
  const prereqSpecs = (lessonSpec.prerequisites || [])
    .filter(id => id !== 'none' && specIndex[id])
    .map(id => specIndex[id]);

  const terminalOutcomes = getTerminalOutcomesForLesson(lessonSpec.lesson_id, phase3, phase1);

  const critiqueSection = critique
    ? `\n\n═══ REVIEWER CRITIQUE — ADDRESS ALL ITEMS ═══\n${JSON.stringify(critique, null, 2)}\n`
    : '';

  const messages = [{
    role: 'user',
    content: `Write Phase 4 lesson content for lesson ${lessonSpec.lesson_id} only.

COURSE SPEC CONTEXT
${JSON.stringify(buildLessonContext(courseSpec, lessonSpec), null, 2)}

LESSON TO WRITE
${JSON.stringify(lessonSpec, null, 2)}

PREREQUISITE LESSON SPECS (what the learner already knows)
${prereqSpecs.length > 0 ? JSON.stringify(prereqSpecs, null, 2) : 'None — this is the first lesson.'}

TERMINAL OUTCOMES THIS LESSON SERVES
${JSON.stringify(terminalOutcomes, null, 2)}
${critiqueSection}
Return ONLY the Phase 4 lesson JSON object for lesson_id "${lessonSpec.lesson_id}", wrapped in <json>...</json> tags. No prose, no other lessons.`,
  }];

  return callAndValidate(
    { model: MODELS.FAST, system: GENERATOR_SYSTEM, messages, maxTokens: 16000, meta: { ...meta, agent: 'generator_lesson' } },
    validateLesson
  );
}

/**
 * Fan-out Phase 4 across all lesson specs, max 3 concurrent to respect rate limits.
 *
 * @param {number} [lessonLimit] - cap the number of lessons written (for QA test runs)
 */
export async function writeAllLessons(courseSpec, course, meta = {}, lessonLimit = 0) {
  const { phase3 } = courseSpec;
  const allLessonSpecs = [];
  for (const mod of phase3.modules || []) {
    for (const lesson of mod.lessons || []) {
      allLessonSpecs.push(lesson);
    }
  }

  const specsToWrite = lessonLimit > 0 ? allLessonSpecs.slice(0, lessonLimit) : allLessonSpecs;
  if (lessonLimit > 0 && allLessonSpecs.length > lessonLimit) {
    console.log(`[Generator] Phase 4: lessonLimit=${lessonLimit} — writing ${lessonLimit} of ${allLessonSpecs.length} lessons`);
  }

  console.log(`[Generator] Phase 4: writing ${specsToWrite.length} lessons (3 concurrent)`);
  const results = await runWithConcurrency(
    specsToWrite.map(spec => () => writeSingleLesson(spec, courseSpec, course, null, meta)),
    3
  );

  const written = [];
  const failed = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].error) {
      console.error(`[Generator] Phase 4: ${specsToWrite[i].lesson_id} failed: ${results[i].error}`);
      failed.push({ spec: specsToWrite[i], error: results[i].error });
    } else {
      written.push(results[i]);
    }
  }

  if (failed.length > 0) {
    console.error(`[Generator] Phase 4: ${failed.length} lesson(s) failed initial write`);
  }

  return { written, failed };
}

/**
 * Rewrite a single lesson after QA failure.
 */
export async function rewriteLesson(lesson, verdict, courseSpec, course, meta = {}) {
  const { phase3 } = courseSpec;
  const specIndex = buildLessonSpecIndex(phase3);
  const lessonSpec = specIndex[lesson.lesson_id];

  if (!lessonSpec) {
    throw new Error(`rewriteLesson: lesson_id ${lesson.lesson_id} not found in spec`);
  }

  const lessonCritique = verdict.regeneration_targets?.find(t =>
    t.lesson_id === lesson.lesson_id || t.scope === 'lesson'
  ) || verdict;

  return writeSingleLesson(lessonSpec, courseSpec, course, lessonCritique, meta);
}

// ── Concurrency limiter ─────────────────────────────────────────────────────

export async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        results[i] = { error: err.message };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  );

  return results;
}

// ── Content mapper: Phase 4 → existing DB content format ───────────────────

/**
 * Map a Phase 4 lesson object to the legacy content format expected by the
 * frontend lesson view: { sections[], key_terms[], further_reading[] }.
 * The full Phase 4 object is stored separately in lessons.lesson_spec.
 */
export function mapLessonToContent(lesson) {
  const sections = [];

  if (lesson.prerequisites_check) {
    sections.push({ heading: 'Before You Start', body: contentToString(lesson.prerequisites_check), type: 'text' });
  }

  // Core content — may be a string, an object with .sections[], or a structured object
  const cc = lesson.core_content;
  if (typeof cc === 'string' && cc) {
    sections.push({ heading: 'Core Content', body: cc, type: 'key_concept' });
  } else if (Array.isArray(cc?.sections)) {
    // Sections from AI — normalise body to string
    for (const sec of cc.sections) {
      const body = contentToString(sec.body ?? sec.content);
      if (body) sections.push({ heading: sec.heading || '', body, type: sec.type || 'key_concept' });
    }
  } else if (cc && typeof cc === 'object') {
    for (const [key, val] of Object.entries(cc)) {
      const body = contentToString(val);
      if (body) sections.push({ heading: toTitle(key), body, type: 'key_concept' });
    }
  }

  // Worked examples
  for (let i = 0; i < (lesson.worked_examples || []).length; i++) {
    const ex = lesson.worked_examples[i];
    const body = typeof ex === 'string' ? ex : formatExample(ex);
    if (body) sections.push({
      heading: (typeof ex !== 'string' && ex.title) ? ex.title : `Worked Example ${i + 1}`,
      body,
      type: 'example',
    });
  }

  // Common misconceptions
  if (lesson.common_misconceptions?.length) {
    const body = lesson.common_misconceptions.map((m, i) =>
      typeof m === 'string' ? `${i + 1}. ${m}` : `${i + 1}. ${formatMisconception(m)}`
    ).join('\n\n');
    if (body) sections.push({ heading: 'Common Misconceptions', body, type: 'text' });
  }

  // Connection forward + open questions as summary
  const summaryParts = [
    lesson.connection_forward,
    lesson.open_questions_or_limits,
  ].filter(Boolean).map(contentToString);
  if (summaryParts.length) {
    sections.push({ heading: 'Looking Ahead', body: summaryParts.join('\n\n'), type: 'summary' });
  }

  // Use explicit key_terms if the AI generated them; practice problems surface via the Practice tab
  const raw_key_terms = lesson.key_terms || lesson.vocabulary || lesson.glossary || [];
  const key_terms = Array.isArray(raw_key_terms)
    ? raw_key_terms
        .filter(t => t && typeof t.term === 'string')
        .map(t => ({ term: t.term, definition: contentToString(t.definition) }))
        .filter(t => t.definition)
        .slice(0, 8)
    : [];

  const further_reading = lesson.open_questions_or_limits
    ? [contentToString(lesson.open_questions_or_limits)]
    : [];

  return { sections, key_terms, further_reading };
}

function toTitle(str) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function contentToString(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(contentToString).filter(Boolean).join('\n\n');
  if (typeof val === 'object') {
    return Object.entries(val)
      .filter(([, v]) => v)
      .map(([k, v]) => `${toTitle(k)}:\n${contentToString(v)}`)
      .join('\n\n');
  }
  return String(val);
}

function formatExample(ex) {
  if (typeof ex === 'string') return ex;
  const parts = [];
  // Worked example schema: { title, scenario, walkthrough, key_takeaway }
  if (ex.title) parts.push(ex.title);
  if (ex.scenario) parts.push(`Scenario:\n${ex.scenario}`);
  if (ex.walkthrough && typeof ex.walkthrough === 'object') {
    const steps = Object.entries(ex.walkthrough)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => (typeof v === 'string' ? v : contentToString(v)));
    if (steps.length) parts.push(steps.map((s, i) => `${i + 1}. ${s}`).join('\n\n'));
  }
  if (ex.key_takeaway) parts.push(`Key takeaway: ${ex.key_takeaway}`);
  // Practice problem schema: { prompt/task, worked_solution }
  if (ex.prompt || ex.task) parts.push(ex.prompt || ex.task);
  if (ex.worked_solution) parts.push(`Solution:\n${contentToString(ex.worked_solution)}`);
  // Legacy schema: { problem/question, solution/answer, steps }
  if (ex.problem || ex.question) parts.push(ex.problem || ex.question);
  if (ex.solution || ex.answer) parts.push(`Solution:\n${contentToString(ex.solution || ex.answer)}`);
  if (ex.steps) parts.push(Array.isArray(ex.steps) ? ex.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : ex.steps);
  // Generic fallback — flatten all string fields
  return parts.join('\n\n') || contentToString(ex);
}

function formatMisconception(m) {
  if (typeof m === 'string') return m;
  const parts = [];
  if (m.misconception) parts.push(`Learners often think: ${m.misconception}`);
  if (m.correction) parts.push(`This is wrong because: ${m.correction}`);
  if (m.correct_intuition) parts.push(`Correct intuition: ${m.correct_intuition}`);
  // Fallback: flatten any unknown schema
  return parts.join(' ') || contentToString(m);
}

// ── Extract lesson stubs from spec (for draft mode) ─────────────────────────

/**
 * Derive lesson title + summary stubs from Phase 3 spec.
 * Used in draft mode to populate lesson list immediately without Phase 4.
 */
export function extractStubsFromSpec(courseSpec) {
  const { phase3 } = courseSpec;
  const stubs = [];
  let number = 1;
  for (const mod of phase3.modules || []) {
    for (const lesson of mod.lessons || []) {
      stubs.push({
        number,
        title: lesson.title,
        summary: lesson.objectives?.join('; ') || '',
        lesson_type: 'lecture',
        estimated_minutes: lesson.estimated_minutes || 45,
        spec_id: lesson.lesson_id,
      });
      number++;
    }
  }
  return stubs;
}
