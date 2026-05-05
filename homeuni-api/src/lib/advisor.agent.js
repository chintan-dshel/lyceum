/**
 * Advisor Agent
 *
 * Responsibilities:
 *  1. Onboarding conversation — understand user goals, background, pace preference
 *  2. Program proposal — suggest degree type, title, duration, structure
 *  3. Program refinement — accept user edits, confirm final brief
 *  4. Difficulty nudges — compose supportive check-in messages
 *  5. Semester review — end-of-semester reflection and progression guidance
 */

import { callClaude, callClaudeJSON, MODELS } from './anthropic.js';
import { query } from '../db/pool.js';

// ── System Prompts ──────────────────────────────────────────────────────────

const ONBOARDING_SYSTEM = `You are the Lyceum Academic Advisor — warm, encouraging, and genuinely curious about the student in front of you. Lyceum is a stress-free AI-powered university where anyone can learn anything at degree level.

Your role in this conversation is to understand:
1. What the student wants to learn and WHY (motivation matters)
2. Their prior knowledge in this area (so we pitch content right)
3. How much time they can realistically dedicate per week
4. Their preferred learning style (reading, problems, discussion, etc.)
5. Whether they want a structured degree path or something more exploratory

Your tone: friendly, human, curious — like a great personal tutor, not a registration form. Ask one or two questions at a time, not a list. Build rapport.

When you have enough to propose a program (usually after 3-5 exchanges), produce a program proposal in this EXACT JSON format at the end of your message (after your prose):

<program_proposal>
{
  "ready": true,
  "title": "BSc Computer Science",
  "degree_type": "bachelor",
  "field_of_study": "Computer Science",
  "total_semesters": 6,
  "description": "A comprehensive degree covering...",
  "goals": "User wants to...",
  "rationale": "Based on your background and goals..."
}
</program_proposal>

degree_type MUST be one of these exact values: "course", "certificate", "diploma", "associate", "bachelor", "master", "doctorate", "custom".
Use "course" for a single standalone course (1 semester, 1 course). Use "certificate" for short focused programs. Use "custom" only when no other value fits.

Until you have enough information, set "ready": false and omit the other fields.
Do not propose until you genuinely understand the student's goals.`;

const REFINEMENT_SYSTEM = `You are the Lyceum Academic Advisor helping a student refine their program proposal.
The student may want to adjust the degree type, duration, focus areas, or pace.
Be flexible and accommodating — this is their education, not a fixed catalog.
When the student is happy with the proposal, confirm it warmly and set "confirmed": true in your response tag.

Respond in the same format as before: prose first, then:
<program_proposal>
{ "ready": true, "confirmed": false/true, ...full proposal fields... }
</program_proposal>`;

const NUDGE_SYSTEM = `You are the Lyceum Academic Advisor. A student appears to be finding some content challenging.
Your message should be warm, brief (2-3 sentences), non-judgmental, and offer a concrete next step.
Never imply the student is failing or struggling "badly". Frame difficulty as a normal part of learning.
Do not be overly enthusiastic or use hollow phrases like "Great job!".
Just be genuine and helpful.`;

const SEMESTER_REVIEW_SYSTEM = `You are the Lyceum Academic Advisor doing an end-of-semester check-in.
Review the student's semester performance and write a warm, honest, encouraging reflection.
Highlight what went well, acknowledge any challenges without judgment, and set an optimistic tone for the next semester.
Keep it to 3-4 short paragraphs. End with something that makes them want to continue.`;

// ── Onboarding ──────────────────────────────────────────────────────────────

export async function runAdvisorAgent({ user, program, messages, userMessage }) {
  const stage = program?.status || 'onboarding';
  const systemPrompt = stage === 'program_design' ? REFINEMENT_SYSTEM : ONBOARDING_SYSTEM;

  const conversationMessages = [
    ...messages.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const { text } = await callClaude({
    model: MODELS.FAST,
    system: systemPrompt,
    messages: conversationMessages,
    maxTokens: 1024,
    meta: { agent: 'advisor', userId: user?.id, programId: program?.id },
  });

  // Extract program proposal if present
  const proposalMatch = text.match(/<program_proposal>([\s\S]*?)<\/program_proposal>/);
  let proposal = null;
  if (proposalMatch) {
    try {
      proposal = JSON.parse(proposalMatch[1].trim());
    } catch { /* malformed — ignore */ }
  }

  // Clean the text for display (remove the XML tag block)
  const displayText = text.replace(/<program_proposal>[\s\S]*?<\/program_proposal>/, '').trim();

  return { message: displayText, proposal };
}

// ── Difficulty Nudges ───────────────────────────────────────────────────────

const NUDGE_CONTEXT = {
  different_angle: 'The student has been revisiting the same lesson multiple times, suggesting they are not fully grasping the material.',
  prerequisite: 'The student scored low on an assignment or exam, suggesting a gap in foundational knowledge.',
  slow_down: 'The student is sending messages indicating confusion or being lost.',
  take_break: 'The student has not returned to the course for several days after encountering difficulty.',
  encouragement: 'The student has been working consistently and could use a morale boost.',
  semester_review: 'The semester has just ended.',
};

export async function runAdvisorNudge({ userId, programId, courseId, lessonId, nudgeType }) {
  // Fetch context for the nudge
  let context = NUDGE_CONTEXT[nudgeType] || '';
  let courseTitle = '';
  let lessonTitle = '';

  if (courseId) {
    const { rows } = await query('SELECT title FROM courses WHERE id = $1', [courseId]);
    courseTitle = rows[0]?.title || '';
  }
  if (lessonId) {
    const { rows } = await query('SELECT title FROM lessons WHERE id = $1', [lessonId]);
    lessonTitle = rows[0]?.title || '';
  }

  const contextStr = [
    context,
    courseTitle && `Course: ${courseTitle}`,
    lessonTitle && `Lesson: ${lessonTitle}`,
  ].filter(Boolean).join('\n');

  const { text } = await callClaude({
    model: MODELS.FAST,
    system: NUDGE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Write a ${nudgeType.replace('_', ' ')} nudge for a student.\nContext: ${contextStr}`,
      },
    ],
    maxTokens: 256,
    meta: { agent: 'advisor_nudge', userId, programId, courseId },
  });

  return text.trim();
}

// ── Semester Review ─────────────────────────────────────────────────────────

export async function runSemesterReview({ user, program, semester, courseGrades }) {
  const gradesSummary = courseGrades
    .map(c => `${c.title}: ${c.grade_letter || 'In Progress'} (${c.final_grade ?? '-'}/100)`)
    .join('\n');

  const { text } = await callClaude({
    model: MODELS.FAST,
    system: SEMESTER_REVIEW_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Student: ${user.full_name}
Program: ${program.title}
Semester ${semester.number}: ${semester.title}
GPA this semester: ${semester.gpa ?? 'N/A'}

Course grades:
${gradesSummary}

Write the semester review message.`,
      },
    ],
    maxTokens: 512,
  });

  return text.trim();
}

// ── Program Brief extraction helper ────────────────────────────────────────

export function extractProgramBrief(proposal) {
  if (!proposal?.ready) return null;
  const { title, degree_type, field_of_study, total_semesters, description, goals } = proposal;
  if (!title || !degree_type || !field_of_study) return null;
  return { title, degree_type, field_of_study, total_semesters: total_semesters || 6, description, goals };
}
