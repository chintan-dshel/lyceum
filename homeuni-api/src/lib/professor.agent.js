/**
 * Professor Agent
 *
 * Handles per-lesson Q&A, alternative explanations, deeper dives.
 * Context: current lesson content + course objectives + last 10 conversation turns.
 * Optionally streams response for real-time chat feel.
 */

import { callClaude, streamClaude, MODELS } from './anthropic.js';

function buildSpecContext(spec) {
  if (!spec) return '';
  const parts = [];

  if (spec.prerequisites_check) {
    parts.push(`Prerequisites this student should have: ${spec.prerequisites_check}`);
  }

  if (Array.isArray(spec.common_misconceptions) && spec.common_misconceptions.length) {
    const items = spec.common_misconceptions.map((m, i) => {
      const text = typeof m === 'string' ? m : (m.misconception || m.description || JSON.stringify(m));
      return `  ${i + 1}. ${text}`;
    }).join('\n');
    parts.push(`Common misconceptions to watch for:\n${items}`);
  }

  if (Array.isArray(spec.worked_examples) && spec.worked_examples.length) {
    const titles = spec.worked_examples.map((ex, i) =>
      typeof ex === 'string' ? `Example ${i + 1}` : (ex.title || ex.problem || `Example ${i + 1}`)
    ).join(', ');
    parts.push(`Worked examples in this lesson: ${titles}`);
  }

  if (Array.isArray(spec.practice_problems) && spec.practice_problems.length) {
    const problems = spec.practice_problems.map((p, i) => {
      const q = typeof p === 'string' ? p : (p.problem || p.question || `Problem ${i + 1}`);
      return `  ${i + 1}. ${q.slice(0, 150)}`;
    }).join('\n');
    parts.push(`Practice problems available (you can direct students toward these):\n${problems}`);
  }

  if (Array.isArray(spec.blackboard_cues) && spec.blackboard_cues.length) {
    const cues = spec.blackboard_cues.map((c, i) => {
      const desc = typeof c === 'string' ? c : (c.description || c.what || JSON.stringify(c));
      return `  ${i + 1}. ${desc}`;
    }).join('\n');
    parts.push(`Visual elements you can describe/sketch when relevant:\n${cues}`);
  }

  return parts.length ? `\n\n═══ LESSON SPECIFICATION ═══\n${parts.join('\n\n')}` : '';
}

const PROFESSOR_SYSTEM = (course, lesson, learnerMemory = '') => `You are a university professor teaching "${course.title}" at Lyceum, a stress-free AI-powered university.

Your current lesson: "${lesson.title}"
Course: ${course.title} (${course.code})
Course objectives: ${(course.learning_objectives || []).join('; ')}

Lesson summary: ${lesson.summary || 'No summary available.'}

Your teaching philosophy:
- Patient, encouraging, never condescending
- Use concrete examples and analogies when explaining abstract concepts
- If a student says they're confused, try a completely different approach — different angle, different analogy, simpler terms
- Ask follow-up questions to check understanding, but don't make them feel tested
- Celebrate curiosity and good questions
- If a student wants to go deeper than the lesson, go with them
- If a student asks about something off-topic but interesting, engage briefly then gently redirect
- Never say "as I mentioned" or "as we covered" — each explanation should stand alone

Lesson content for your reference:
${JSON.stringify(lesson.content?.sections?.map(s => `${s.heading}: ${s.body}`).join('\n\n') || '', null, 0).slice(0, 3000)}${buildSpecContext(lesson.lesson_spec)}${learnerMemory}`;

export async function runProfessorAgent({ user, course, lesson, messages, userMessage, learnerMemory = '', stream = false }) {
  const systemPrompt = PROFESSOR_SYSTEM(course, lesson, learnerMemory);
  const meta = { agent: 'professor', userId: user?.id, programId: lesson?.program_id, courseId: course?.id };

  const conversationMessages = [
    ...messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  if (stream) {
    return streamClaude({
      model: MODELS.FAST,
      system: systemPrompt,
      messages: conversationMessages,
      maxTokens: 1024,
      meta,
    });
  }

  const { text } = await callClaude({
    model: MODELS.FAST,
    system: systemPrompt,
    messages: conversationMessages,
    maxTokens: 1024,
    meta,
  });

  return { message: text };
}

// ── Alternative Explanation ─────────────────────────────────────────────────
// Called when difficulty signal fires and user wants a different take

export async function generateAlternativeExplanation({ course, lesson, concept, previousExplanation }) {
  const { text } = await callClaude({
    model: MODELS.FAST,
    system: `You are explaining a concept using a completely different approach than was used before.
Use a fresh analogy, different vocabulary, or a more visual description.
Keep it focused and concise — 2-4 paragraphs.`,
    messages: [
      {
        role: 'user',
        content: `Concept to re-explain: ${concept || lesson.title}
Course: ${course.title}
Previous explanation approach: ${previousExplanation ? previousExplanation.slice(0, 500) : 'standard textbook explanation'}

Please explain this from a completely different angle.`,
      },
    ],
    maxTokens: 600,
  });

  return text.trim();
}
