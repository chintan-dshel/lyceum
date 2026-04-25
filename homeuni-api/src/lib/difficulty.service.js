/**
 * Difficulty Detection Service
 *
 * Aggregates passive signals from user behaviour and fires
 * advisor nudges when thresholds are breached.
 *
 * Signal weights:
 *   low       = 1 point
 *   medium    = 2 points
 *   high      = 3 points
 *   immediate = triggers nudge instantly (no threshold needed)
 *
 * Nudge threshold: 3+ points from the same lesson/course within 7 days.
 * Cooldown: no more than 1 nudge per lesson per 48 hours.
 */

import { query } from '../db/pool.js';
import { runAdvisorNudge } from './advisor.agent.js';

const WEIGHT_POINTS = { low: 1, medium: 2, high: 3, immediate: 99 };
const NUDGE_THRESHOLD = 3;
const COOLDOWN_HOURS = parseInt(process.env.DIFFICULTY_NUDGE_COOLDOWN_HOURS || '48');
const ROLLING_WINDOW_DAYS = 7;

// Thresholds (from env with fallbacks)
const T = {
  lessonTimeMultiplier: parseFloat(process.env.DIFFICULTY_LESSON_TIME_MULTIPLIER || '2'),
  lessonReopenCount: parseInt(process.env.DIFFICULTY_LESSON_REOPEN_COUNT || '3'),
  assignmentScoreThreshold: parseInt(process.env.DIFFICULTY_ASSIGNMENT_SCORE_THRESHOLD || '60'),
  examScoreThreshold: parseInt(process.env.DIFFICULTY_EXAM_SCORE_THRESHOLD || '50'),
  sessionGapDays: parseInt(process.env.DIFFICULTY_SESSION_GAP_DAYS || '3'),
};

/**
 * Record a difficulty signal and evaluate whether a nudge should fire.
 */
export async function recordSignal({
  userId,
  programId,
  courseId = null,
  lessonId = null,
  signal,
  weight,
  metadata = {},
}) {
  // Insert the event
  await query(
    `INSERT INTO difficulty_events
       (user_id, program_id, course_id, lesson_id, signal, weight, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, programId, courseId, lessonId, signal, weight, JSON.stringify(metadata)]
  );

  // Immediate signals skip threshold evaluation
  if (weight === 'immediate') {
    await maybeSendNudge({ userId, programId, courseId, lessonId, forceType: 'different_angle' });
    return;
  }

  await evaluateThreshold({ userId, programId, courseId, lessonId });
}

async function evaluateThreshold({ userId, programId, courseId, lessonId }) {
  const windowStart = new Date(Date.now() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { rows } = await query(
    `SELECT signal, weight FROM difficulty_events
     WHERE user_id = $1
       AND program_id = $2
       AND ($3::uuid IS NULL OR lesson_id = $3)
       AND resolved = FALSE
       AND created_at >= $4`,
    [userId, programId, lessonId, windowStart]
  );

  const totalPoints = rows.reduce((sum, r) => sum + (WEIGHT_POINTS[r.weight] || 0), 0);

  if (totalPoints >= NUDGE_THRESHOLD) {
    await maybeSendNudge({ userId, programId, courseId, lessonId });
  }
}

async function maybeSendNudge({ userId, programId, courseId, lessonId, forceType }) {
  // Check cooldown
  const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const { rows } = await query(
    `SELECT id FROM nudges
     WHERE user_id = $1
       AND ($2::uuid IS NULL OR lesson_id = $2)
       AND created_at >= $3
     LIMIT 1`,
    [userId, lessonId, cooldownSince]
  );

  if (rows.length > 0) return; // still in cooldown

  // Determine nudge type from signal mix
  const nudgeType = forceType || await determineNudgeType(userId, programId, lessonId);

  // Generate nudge message via Advisor Agent
  const message = await runAdvisorNudge({ userId, programId, courseId, lessonId, nudgeType });

  // Persist nudge
  await query(
    `INSERT INTO nudges (user_id, program_id, course_id, lesson_id, nudge_type, message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, programId, courseId, lessonId, nudgeType, message]
  );

  // Mark contributing events as resolved
  await query(
    `UPDATE difficulty_events
     SET resolved = TRUE
     WHERE user_id = $1 AND program_id = $2
       AND ($3::uuid IS NULL OR lesson_id = $3)
       AND resolved = FALSE`,
    [userId, programId, lessonId]
  );
}

async function determineNudgeType(userId, programId, lessonId) {
  const { rows } = await query(
    `SELECT signal FROM difficulty_events
     WHERE user_id = $1 AND program_id = $2
       AND ($3::uuid IS NULL OR lesson_id = $3)
       AND resolved = FALSE
     ORDER BY created_at DESC
     LIMIT 10`,
    [userId, programId, lessonId]
  );

  const signals = rows.map(r => r.signal);

  if (signals.includes('session_gap')) return 'take_break';
  if (signals.includes('lesson_reopened')) return 'different_angle';
  if (signals.includes('assignment_low_score') || signals.includes('exam_low_score')) return 'prerequisite';
  if (signals.includes('confusion_keyword')) return 'slow_down';
  return 'encouragement';
}

// ── Convenience signal recorders ───────────────────────────────────────────

export async function signalLessonTimeExceeded({ userId, programId, courseId, lessonId, timeSpentSecs, estimatedSecs }) {
  if (timeSpentSecs < estimatedSecs * T.lessonTimeMultiplier) return;
  await recordSignal({ userId, programId, courseId, lessonId, signal: 'lesson_time_exceeded', weight: 'low', metadata: { timeSpentSecs, estimatedSecs } });
}

export async function signalLessonReopened({ userId, programId, courseId, lessonId, visitCount }) {
  if (visitCount < T.lessonReopenCount) return;
  await recordSignal({ userId, programId, courseId, lessonId, signal: 'lesson_reopened', weight: 'medium', metadata: { visitCount } });
}

export async function signalConfusionKeyword({ userId, programId, courseId, lessonId, keyword }) {
  await recordSignal({ userId, programId, courseId, lessonId, signal: 'confusion_keyword', weight: 'medium', metadata: { keyword } });
}

export async function signalAssignmentLowScore({ userId, programId, courseId, score }) {
  if (score >= T.assignmentScoreThreshold) return;
  await recordSignal({ userId, programId, courseId, signal: 'assignment_low_score', weight: 'high', metadata: { score } });
}

export async function signalExamLowScore({ userId, programId, courseId, score }) {
  if (score >= T.examScoreThreshold) return;
  await recordSignal({ userId, programId, courseId, signal: 'exam_low_score', weight: 'high', metadata: { score } });
}

export async function signalUserExplicit({ userId, programId, courseId, lessonId }) {
  await recordSignal({ userId, programId, courseId, lessonId, signal: 'user_explicit', weight: 'immediate' });
}

// Detect confusion keywords in professor chat messages
const CONFUSION_KEYWORDS = [
  "don't understand", "dont understand", "confused", "confusing", "lost",
  "makes no sense", "doesn't make sense", "not following", "can you explain again",
  "what does that mean", "i'm stuck", "im stuck", "help me understand",
  "not clear", "unclear", "overwhelmed",
];

export function detectConfusionKeywords(text) {
  const lower = text.toLowerCase();
  return CONFUSION_KEYWORDS.find(kw => lower.includes(kw)) || null;
}
