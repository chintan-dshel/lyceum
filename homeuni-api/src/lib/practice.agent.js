/**
 * Practice Agent
 *
 * Grades a student's answer to a practice problem from lesson_spec.practice_problems.
 * Returns a score (0-100), targeted feedback, and a hint if the answer was wrong.
 */

import { callClaudeJSON, MODELS } from './anthropic.js';

export async function gradePracticeAnswer({ problem, studentAnswer, lessonTitle, meta = {} }) {
  const problemText = typeof problem === 'string'
    ? problem
    : (problem.problem || problem.question || JSON.stringify(problem));

  const solutionText = typeof problem === 'object'
    ? (problem.solution || problem.worked_solution || problem.answer || null)
    : null;

  const result = await callClaudeJSON({
    model: MODELS.HAIKU,
    meta: { ...meta, agent: 'practice' },
    system: `You are a fair, encouraging university tutor grading a student's answer to a practice problem.
Evaluate whether the student understood the core concept, not just surface correctness.
Be constructive — if wrong, explain the gap without being harsh.
Return only JSON, no prose outside it.`,
    messages: [{
      role: 'user',
      content: `Lesson: ${lessonTitle}

Problem:
${problemText}
${solutionText ? `\nExpected solution / key ideas:\n${solutionText}` : ''}

Student's answer:
${studentAnswer}

Grade this answer and return:
{
  "score": <0-100 integer>,
  "verdict": "correct" | "partial" | "incorrect",
  "feedback": "<2-4 sentences: what was right, what was missing or wrong, why it matters>",
  "hint": "<1 sentence nudge toward the right approach, or null if score >= 80>"
}`,
    }],
    maxTokens: 400,
  });

  return {
    score: Math.max(0, Math.min(100, result.score ?? 0)),
    verdict: result.verdict || 'incorrect',
    feedback: result.feedback || 'Could not evaluate answer.',
    hint: result.hint || null,
  };
}
