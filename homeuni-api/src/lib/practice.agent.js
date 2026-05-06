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
    system: `You are a university tutor grading a student's practice answer in the lesson "${lessonTitle}".
Evaluate understanding of the specific concept being tested, not just surface correctness.
Feedback must be specific to what the student wrote — name what they got right or wrong, reference the actual concept.
Never write generic praise like "good effort" — always tie praise or criticism to the content.
Return only JSON, no prose outside it.`,
    messages: [{
      role: 'user',
      content: `Lesson: ${lessonTitle}

Problem:
${problemText}
${solutionText ? `\nExpected solution / key ideas:\n${solutionText}` : ''}

Student's answer:
${studentAnswer}

Grade and return:
{
  "score": <0-100 integer>,
  "verdict": "correct" | "partial" | "incorrect",
  "feedback": "<2-3 sentences: cite what was specifically right or wrong in the student's answer and why it matters in ${lessonTitle}>",
  "hint": "<1 concrete sentence pointing to the gap, or null if score >= 80>"
}`,
    }],
    maxTokens: 500,
  });

  return {
    score: Math.max(0, Math.min(100, result.score ?? 0)),
    verdict: result.verdict || 'incorrect',
    feedback: result.feedback || 'Could not evaluate answer.',
    hint: result.hint || null,
  };
}
