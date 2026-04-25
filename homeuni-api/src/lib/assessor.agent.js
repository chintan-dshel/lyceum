/**
 * Assessor Agent
 *
 * Grades assignment submissions and exam attempts.
 * Uses extended thinking for fair, rubric-based grading.
 * Language philosophy: feedback is developmental, not verdictive.
 */

import { callClaudeJSON, MODELS } from './anthropic.js';

// ── Assignment Grading ───────────────────────────────────────────────────────

export async function runAssessorAgent({ assignment, submission, course }) {
  const rubricDescription = (assignment.rubric || [])
    .map(r => `- ${r.criterion} (${r.max_points} pts): ${r.description}`)
    .join('\n');

  const result = await callClaudeJSON({
    model: MODELS.FAST,
    system: `You are an encouraging, constructive academic assessor at Lyceum University.
Your role is to provide developmental feedback that helps students grow, not to judge.

Grading principles:
- Score each rubric criterion honestly and fairly
- Feedback should be specific, actionable, and kind
- Always highlight what was done well before discussing areas for improvement
- Frame improvement areas as "to strengthen this further" not "you failed to"
- Never use language like "wrong", "incorrect", "failed", "poor" — use "could be developed", "consider adding", "would benefit from"
- The total score is the sum of rubric criterion scores

Return ONLY a JSON object.`,
    messages: [
      {
        role: 'user',
        content: `Grade this submission.

Course: ${course.title}
Assignment: ${assignment.title}
Type: ${assignment.assignment_type}

Assignment prompt:
${assignment.prompt}

Rubric:
${rubricDescription}
Total possible: ${assignment.max_score} points

Student submission:
${submission.content_text || '[No text submitted]'}

Return:
{
  "rubric_scores": [
    {
      "criterion": "criterion name",
      "score": 35,
      "max_points": 40,
      "feedback": "Specific, constructive feedback for this criterion..."
    }
  ],
  "total_score": 85,
  "grade_letter": "B",
  "overall_feedback": "2-3 paragraph overall feedback — start with strengths, then growth areas, end encouragingly",
  "strengths": ["specific strength 1", "specific strength 2"],
  "growth_areas": ["area to develop 1", "area to develop 2"]
}`,
      },
    ],
    extendedThinking: true,
    thinkingBudget: 5000,
    maxTokens: 3000,
  });

  return {
    rubricScores: result.rubric_scores,
    score: result.total_score,
    gradeLetter: result.grade_letter || scoreToLetter(result.total_score, assignment.max_score),
    feedbackText: result.overall_feedback,
    strengths: result.strengths || [],
    growthAreas: result.growth_areas || [],
  };
}

// ── Exam Grading ─────────────────────────────────────────────────────────────

export async function gradeExam({ exam, attempt, course }) {
  const questions = exam.questions;
  const answers = attempt.answers || {};

  // Grade multiple choice automatically
  const autoGraded = [];
  const shortAnswerQuestions = [];

  for (const q of questions) {
    if (q.type === 'multiple_choice') {
      const userAnswer = answers[q.id] || '';
      const correct = userAnswer.trim() === (q.correct_answer || '').trim();
      autoGraded.push({
        question_id: q.id,
        score: correct ? q.points : 0,
        max_points: q.points,
        correct_answer: q.correct_answer,
        explanation: correct
          ? 'Correct!'
          : `The correct answer is: ${q.correct_answer}`,
      });
    } else {
      shortAnswerQuestions.push(q);
    }
  }

  // Grade short answer / essay questions with AI
  let aiGraded = [];
  if (shortAnswerQuestions.length > 0) {
    const questionsText = shortAnswerQuestions.map(q =>
      `Q${q.id} (${q.points} pts, topic: ${q.topic || 'general'}):
Question: ${q.question}
Model answer: ${q.correct_answer || 'N/A'}
Student answer: ${answers[q.id] || '[No answer provided]'}`
    ).join('\n\n');

    const result = await callClaudeJSON({
      model: MODELS.FAST,
      system: `You are grading short answer and essay questions for a university knowledge check.
Be fair, specific, and encouraging in your feedback.
Return ONLY JSON.`,
      messages: [
        {
          role: 'user',
          content: `Course: ${course.title}
Exam: ${exam.title}

Grade these questions:
${questionsText}

Return:
{
  "graded": [
    {
      "question_id": "q2",
      "score": 4,
      "max_points": 6,
      "correct_answer": "...",
      "explanation": "Your answer covered X well. To strengthen it further, consider adding Y."
    }
  ]
}`,
        },
      ],
      maxTokens: 2000,
    });
    aiGraded = result.graded || [];
  }

  const allFeedback = [...autoGraded, ...aiGraded];
  const totalScore = allFeedback.reduce((sum, f) => sum + (f.score || 0), 0);
  const maxScore = exam.max_score;

  return {
    feedback: allFeedback,
    score: Math.round((totalScore / questions.reduce((s, q) => s + q.points, 0)) * maxScore),
    gradeLetter: scoreToLetter(totalScore, questions.reduce((s, q) => s + q.points, 0)),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreToLetter(score, maxScore) {
  const pct = (score / maxScore) * 100;
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}
