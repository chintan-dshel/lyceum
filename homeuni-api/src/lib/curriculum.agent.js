/**
 * Curriculum Designer Agent
 *
 * Two-pass generation:
 *   Pass 1 — Program skeleton: all semesters + course titles/descriptions/objectives
 *   Pass 2 — Per-course detail: 10 lesson plans per course (run in parallel, 3 at a time)
 *
 * Also generates assignments and exams for each course (lazily, on first access).
 */

import { callClaudeJSON, MODELS } from './anthropic.js';
import { query } from '../db/pool.js';

// ── Pass 1: Program Skeleton ────────────────────────────────────────────────

export async function generateProgramSkeleton(programBrief) {
  const { title, degree_type, field_of_study, total_semesters, goals } = programBrief;

  // ── Step 1: semester titles only (~200 tokens) ─────────────────────────────
  const semesterPlan = await callClaudeJSON({
    model: MODELS.FAST,
    system: `You are a curriculum designer. Return ONLY a JSON object, no prose.`,
    messages: [{
      role: 'user',
      content: `Design semester titles for: ${title} (${degree_type} in ${field_of_study}, ${total_semesters} semesters).
Goals: ${goals || 'Comprehensive education in this field'}
Return: {"semesters":[{"number":1,"title":"Semester 1 — Foundations","theme":"8 words max"}]}`,
    }],
    maxTokens: 600,
  });

  // ── Step 2: courses per semester — one call each (~600 tokens each) ─────────
  const semesters = [];
  for (const sem of semesterPlan.semesters) {
    const result = await callClaudeJSON({
      model: MODELS.FAST,
      system: `You are a curriculum designer. Return ONLY a JSON object, no prose.`,
      messages: [{
        role: 'user',
        content: `Courses for ${sem.title} of ${title} (${degree_type} in ${field_of_study}). Semester ${sem.number}/${total_semesters}.
Design 4-5 courses. 2-3 core, rest elective. Descriptions ≤10 words. Exactly 2 objectives ≤8 words each.
Return: {"courses":[{"code":"XX101","title":"Title","description":"≤10 words.","course_type":"core","credit_hours":3,"learning_objectives":["Obj 1","Obj 2"]}]}`,
      }],
      maxTokens: 1000,
    });

    semesters.push({
      number: sem.number,
      title: sem.title,
      theme: sem.theme,
      courses: result.courses || [],
    });
  }

  return { semesters };
}

// ── Pass 2a: Lesson Stubs (titles + summaries only — fast) ──────────────────

export async function generateLessonStubs(course, programContext) {
  const result = await callClaudeJSON({
    model: MODELS.FAST,
    system: `You are a curriculum designer. Return ONLY a JSON object, no prose.`,
    messages: [{
      role: 'user',
      content: `Create 10 lesson titles and one-sentence learning outcomes for:
Course: ${course.title} (${course.code}) — ${course.description}
Objectives: ${(course.learning_objectives || []).join(', ')}
Program: ${programContext.title} — ${programContext.field_of_study}

Lessons should build logically from foundational to advanced.
Return: {"lessons":[{"number":1,"title":"Lesson title","summary":"One sentence: what the student will understand after this lesson.","lesson_type":"lecture","estimated_minutes":45}]}`,
    }],
    maxTokens: 1200,
  });
  if (!result?.lessons || !Array.isArray(result.lessons)) {
    throw new Error(`generateLessonStubs: expected {lessons:[...]}, got: ${JSON.stringify(result).slice(0, 200)}`);
  }
  return result.lessons;
}

// ── Pass 2b: Single Lesson Full Content (on demand) ─────────────────────────

export async function generateSingleLesson(stub, course, programContext) {
  const result = await callClaudeJSON({
    model: MODELS.FAST,
    system: `You are an expert academic content designer writing a substantive university lesson.
Explain clearly, use concrete real-world examples, and prompt genuine reflection.
Return ONLY a JSON object, no prose.`,
    messages: [{
      role: 'user',
      content: `Write full lesson content for:
Lesson ${stub.number}: "${stub.title}"
Course: ${course.title} (${course.code}) — ${course.description}
Objectives: ${(course.learning_objectives || []).join(', ')}
Program: ${programContext.title} — ${programContext.field_of_study}

Write exactly 4 sections:
1. "Introduction" (type: "text") — 4-5 sentences: why this topic matters, what the student will learn, a relatable hook or scenario.
2. "Core Concept: [specific name]" (type: "key_concept") — 5-6 sentences: explain clearly, give a concrete real-world example, tie to course objectives.
3. "Worked Example" (type: "example") — 4-5 sentences: step through a specific case, scenario, or application of the concept.
4. "Reflection & Summary" (type: "summary") — 3-4 sentences: recap the key idea, one reflective question for the student, brief bridge to the next lesson.

Return:
{
  "content": {
    "sections": [
      {"heading": "Introduction", "body": "...", "type": "text"},
      {"heading": "Core Concept: [Name]", "body": "...", "type": "key_concept"},
      {"heading": "Worked Example", "body": "...", "type": "example"},
      {"heading": "Reflection & Summary", "body": "...", "type": "summary"}
    ],
    "key_terms": [
      {"term": "Term", "definition": "1-2 sentence precise definition."}
    ],
    "further_reading": ["Topic or question 1", "Topic or question 2"]
  }
}`,
    }],
    maxTokens: 1500,
  });
  if (!result?.content?.sections) {
    throw new Error(`generateSingleLesson: expected {content:{sections:[...]}}, got: ${JSON.stringify(result).slice(0, 200)}`);
  }
  return result.content;
}

// ── Assignment Generation ────────────────────────────────────────────────────

// ── Assignment Generation (single, progressive) ──────────────────────────────

const ASSIGNMENT_TYPES = {
  1: { label: 'mid-course', coverage: 'the first half of the course' },
  2: { label: 'end-of-course', coverage: 'the full course' },
};

export async function generateSingleAssignment(course, lessons, position) {
  const { label, coverage } = ASSIGNMENT_TYPES[position] || ASSIGNMENT_TYPES[2];
  const lessonTitles = lessons.map(l => `${l.number}. ${l.title}`).join('\n');
  const midpoint = Math.ceil(lessons.length / 2);
  const coveredLessons = position === 1 ? lessons.slice(0, midpoint) : lessons;
  const coveredTitles = coveredLessons.map(l => `${l.number}. ${l.title}`).join('\n');

  const result = await callClaudeJSON({
    model: MODELS.FAST,
    system: `You are designing a single practice assignment for a university course.
Assignments are framed as learning exercises, not gatekeeping assessments.
Include a detailed rubric so students know exactly how their work will be evaluated.
Return ONLY a JSON object matching this exact schema — no extra keys, no markdown fences.`,
    messages: [
      {
        role: 'user',
        content: `Design the ${label} assignment for this course. It covers ${coverage}.

Course: ${course.title} (${course.code})
Description: ${course.description || ''}

All lessons in the course:
${lessonTitles}

Lessons this assignment covers:
${coveredTitles}

Return exactly this JSON shape:
{
  "title": "Mid-Course Assignment: How Banks Create Money",
  "assignment_type": "short_answer",
  "prompt": "This assignment covers the first five lessons. Complete all three parts. Part 1: ...",
  "position": ${position},
  "rubric": [
    { "criterion": "Conceptual accuracy", "description": "Correctly applies core definitions and mechanisms from the lessons.", "max_points": 40 },
    { "criterion": "Depth of analysis", "description": "Goes beyond recall — demonstrates understanding of why, not just what.", "max_points": 35 },
    { "criterion": "Clarity", "description": "Arguments are clearly structured and easy to follow.", "max_points": 25 }
  ],
  "max_score": 100
}

assignment_type must be one of: essay, short_answer, problem_set, code, project, reflection`,
      },
    ],
    maxTokens: 2000,
  });

  if (!result?.title || !result?.prompt) {
    throw new Error(`generateSingleAssignment: invalid response: ${JSON.stringify(result).slice(0, 200)}`);
  }
  return { ...result, position };
}

// ── Exam Generation (single, progressive) ────────────────────────────────────

const EXAM_TYPES = {
  1: { label: 'midterm', exam_type: 'midterm', questionCount: 8, coverage: 'the first half of the course' },
  2: { label: 'final',   exam_type: 'final',   questionCount: 12, coverage: 'the full course' },
};

export async function generateSingleExam(course, lessons, position) {
  const { label, exam_type, questionCount, coverage } = EXAM_TYPES[position] || EXAM_TYPES[2];
  const midpoint = Math.ceil(lessons.length / 2);
  const coveredLessons = position === 1 ? lessons.slice(0, midpoint) : lessons;
  const coveredTitles = coveredLessons.map(l => `${l.number}. ${l.title}`).join('\n');

  const result = await callClaudeJSON({
    model: MODELS.FAST,
    system: `You are designing a knowledge check for a university course.
Frame it as a learning tool, not a high-stakes exam.
Mix question types: roughly 60% multiple choice, 40% short answer.
For multiple choice, always include the correct answer in the correct_answer field.
Return ONLY a JSON object matching the exact schema — no extra keys, no markdown fences.`,
    messages: [
      {
        role: 'user',
        content: `Design the ${label} knowledge check (${questionCount} questions). It covers ${coverage}.

Course: ${course.title} (${course.code})

Lessons covered:
${coveredTitles}

Return exactly this JSON shape (${questionCount} questions total):
{
  "title": "Midterm Knowledge Check",
  "exam_type": "${exam_type}",
  "instructions": "Take your time — this is here to help you identify what you know well and what to revisit.",
  "time_limit_mins": null,
  "max_score": 100,
  "position": ${position},
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "question": "Which of the following best describes financial intermediation?",
      "options": ["A) The process of printing money", "B) Connecting savers with borrowers to reduce search costs", "C) Government regulation of banks", "D) Converting foreign currency"],
      "correct_answer": "B) Connecting savers with borrowers to reduce search costs",
      "points": 4,
      "topic": "Lesson 1 — The Problem Banks Solve"
    },
    {
      "id": "q2",
      "type": "short_answer",
      "question": "Explain how a bank creates money through lending. Use a specific example.",
      "correct_answer": "When a bank makes a loan it credits the borrower's account, creating a new deposit. For example, a $10,000 loan creates $10,000 of new money in the banking system, subject to reserve requirements.",
      "points": 8,
      "topic": "Lesson 3 — How Banks Create Money"
    }
  ]
}

Every question must have all fields shown above. id must be unique (q1, q2, ...).`,
      },
    ],
    maxTokens: 4000,
  });

  if (!result?.questions || !Array.isArray(result.questions)) {
    throw new Error(`generateSingleExam: invalid response: ${JSON.stringify(result).slice(0, 200)}`);
  }
  return { ...result, position };
}

// Keep bulk exports for QA pipeline back-compat
export async function generateCourseAssignments(course, lessons) {
  const [a1, a2] = await Promise.all([
    generateSingleAssignment(course, lessons, 1),
    generateSingleAssignment(course, lessons, 2),
  ]);
  return [a1, a2];
}

export async function generateCourseExams(course, lessons) {
  const [e1, e2] = await Promise.all([
    generateSingleExam(course, lessons, 1),
    generateSingleExam(course, lessons, 2),
  ]);
  return [e1, e2];
}

// ── DB Writers ───────────────────────────────────────────────────────────────

export async function writeProgramToDB({ programId, skeleton }) {
  for (const sem of skeleton.semesters) {
    const { rows: [semester] } = await query(
      `INSERT INTO semesters (program_id, number, title, theme, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id`,
      [programId, sem.number, sem.title, sem.theme || null]
    );

    for (let i = 0; i < sem.courses.length; i++) {
      const c = sem.courses[i];
      await query(
        `INSERT INTO courses
           (semester_id, program_id, code, title, description, course_type,
            credit_hours, learning_objectives, prerequisites, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          semester.id, programId,
          c.code, c.title, c.description,
          c.course_type || 'core',
          c.credit_hours || 3,
          JSON.stringify(c.learning_objectives || []),
          JSON.stringify(c.prerequisites || []),
          i,
        ]
      );
    }
  }
}

export async function writeLessonStubsToDB({ courseId, stubs }) {
  for (const stub of stubs) {
    await query(
      `INSERT INTO lessons (course_id, number, title, summary, content, lesson_type, estimated_minutes, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (course_id, number) DO UPDATE
         SET title             = EXCLUDED.title,
             summary           = EXCLUDED.summary,
             lesson_type       = EXCLUDED.lesson_type,
             estimated_minutes = EXCLUDED.estimated_minutes`,
      [
        courseId,
        stub.number,
        stub.title,
        stub.summary || null,
        JSON.stringify({}),
        stub.lesson_type || 'lecture',
        stub.estimated_minutes || 45,
        stub.number - 1,
      ]
    );
  }
}

export async function writeLessonsToDB({ courseId, lessons }) {
  for (const lesson of lessons) {
    await query(
      `INSERT INTO lessons (course_id, number, title, summary, content, lesson_type, estimated_minutes, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        courseId,
        lesson.number,
        lesson.title,
        lesson.summary || null,
        JSON.stringify(lesson.content || {}),
        lesson.lesson_type || 'lecture',
        lesson.estimated_minutes || 30,
        lesson.number - 1,
      ]
    );
  }
}

export async function writeAssignmentsToDB({ courseId, assignments }) {
  for (const a of assignments) {
    await query(
      `INSERT INTO assignments (course_id, title, description, assignment_type, prompt, rubric, max_score, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        courseId,
        a.title,
        a.prompt.slice(0, 300),     // short description = first 300 chars of prompt
        a.assignment_type || 'essay',
        a.prompt,
        JSON.stringify(a.rubric || []),
        a.max_score || 100,
        a.position || 0,
      ]
    );
  }
}

export async function writeExamsToDB({ courseId, exams }) {
  for (const e of exams) {
    await query(
      `INSERT INTO exams (course_id, title, exam_type, instructions, questions, time_limit_mins, max_score, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        courseId,
        e.title,
        e.exam_type || 'final',
        e.instructions || null,
        JSON.stringify(e.questions || []),
        e.time_limit_mins || null,
        e.max_score || 100,
        e.position || 0,
      ]
    );
  }
}
