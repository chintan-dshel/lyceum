/**
 * Agent dispatcher — maps program stage to the correct agent function.
 *
 * Program stages:
 *   onboarding      → Advisor Agent (goal elicitation)
 *   program_design  → Advisor Agent (proposal + refinement)
 *   generating      → Curriculum Designer (background job)
 *   active          → Professor, Assessor, Difficulty Monitor
 *   semester_review → Advisor Agent (semester check-in)
 *   graduated       → read-only transcript
 */

import { runAdvisorAgent } from './advisor.agent.js';
import { runProfessorAgent } from './professor.agent.js';
import { runAssessorAgent } from './assessor.agent.js';

export const PROGRAM_STAGES = {
  ONBOARDING:      'onboarding',
  PROGRAM_DESIGN:  'program_design',
  GENERATING:      'generating',
  ACTIVE:          'active',
  SEMESTER_REVIEW: 'semester_review',
  GRADUATED:       'graduated',
};

/**
 * Route an advisor conversation turn based on program stage.
 */
export async function runAdvisorTurn({ user, program, messages, userMessage }) {
  return runAdvisorAgent({ user, program, messages, userMessage });
}

/**
 * Route a professor chat turn for a specific lesson.
 */
export async function runProfessorTurn({ user, course, lesson, messages, userMessage, learnerMemory = '', stream = false }) {
  return runProfessorAgent({ user, course, lesson, messages, userMessage, learnerMemory, stream });
}

/**
 * Grade a submission.
 */
export async function runAssessment({ assignment, submission, course }) {
  return runAssessorAgent({ assignment, submission, course });
}

/**
 * Grade an exam attempt.
 */
export async function runExamGrading({ exam, attempt, course }) {
  const { gradeExam } = await import('./assessor.agent.js');
  return gradeExam({ exam, attempt, course });
}
