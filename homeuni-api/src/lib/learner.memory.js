/**
 * Learner Memory Service
 *
 * Maintains a persistent store of facts the professor has learned about
 * each student across all lesson sessions.
 *
 * Facts are extracted from conversation history by a Haiku call and stored
 * as a JSONB array (newest first, capped at MAX_FACTS).
 * Extraction runs every EXTRACT_EVERY professor turns to avoid per-message cost.
 */

import { query } from '../db/pool.js';
import { callClaudeJSON, MODELS } from './anthropic.js';

const MAX_FACTS   = 30;
const EXTRACT_EVERY = 4;  // extract after every 4th professor reply

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the student's current memory facts.
 * Returns an empty array if no memory exists yet.
 */
export async function getMemory(userId) {
  const { rows: [row] } = await query(
    'SELECT facts FROM learner_memory WHERE user_id = $1',
    [userId]
  );
  return row?.facts || [];
}

// ── Write (fire-and-forget) ───────────────────────────────────────────────────

/**
 * Extract facts from a conversation and append to learner memory.
 * Call this fire-and-forget after every EXTRACT_EVERY professor turns.
 *
 * @param {string} userId
 * @param {string} lessonId
 * @param {string} lessonTitle
 * @param {Array}  conversationHistory  - [{role, content}] last N turns
 */
export async function extractAndAppend(userId, lessonId, lessonTitle, conversationHistory) {
  if (!conversationHistory || conversationHistory.length < 2) return;

  const transcript = conversationHistory
    .map(m => `${m.role === 'user' ? 'Student' : 'Professor'}: ${m.content}`)
    .join('\n');

  let extracted;
  try {
    extracted = await callClaudeJSON({
      model: MODELS.HAIKU,
      system: `You are a teaching assistant reading a student-professor conversation to extract memorable facts about the student's learning.

Extract 1-3 concise, specific facts that would help the professor personalise future sessions. Focus on:
- Concepts the student struggled with or got wrong
- Misconceptions revealed during the conversation
- Prior knowledge gaps that emerged
- Learning preferences shown (prefers examples, analogies, step-by-step, etc.)
- Concepts the student understood exceptionally well

Do NOT extract trivial or generic observations. Only extract facts that would genuinely change how a professor should teach this student.

Return a JSON array of fact objects:
[
  { "content": "Struggled to distinguish between limit and derivative; kept conflating the two.", "type": "struggle" },
  { "content": "Responds well to geometric analogies — the 'slope of a curve' framing clicked immediately.", "type": "preference" }
]

If there is nothing memorable to extract, return an empty array [].`,
      messages: [{
        role: 'user',
        content: `Lesson: ${lessonTitle}\n\nConversation:\n${transcript.slice(0, 4000)}`,
      }],
      maxTokens: 400,
      meta: { agent: 'memory_extractor', userId, lessonId },
    });
  } catch (err) {
    console.error('[LearnerMemory] extraction failed:', err.message);
    return;
  }

  if (!Array.isArray(extracted) || extracted.length === 0) return;

  const newFacts = extracted.map(f => ({
    content: String(f.content || '').trim(),
    type: f.type || 'general',
    lesson_id: lessonId,
    lesson_title: lessonTitle,
    created_at: new Date().toISOString(),
  })).filter(f => f.content.length > 10);

  if (newFacts.length === 0) return;

  // Upsert: prepend new facts then trim to MAX_FACTS in one statement
  await query(
    `INSERT INTO learner_memory (user_id, facts, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET facts = (
         SELECT jsonb_agg(elem)
         FROM (
           SELECT elem
           FROM jsonb_array_elements($2::jsonb || learner_memory.facts) AS elem
           LIMIT $3
         ) sub
       ),
       updated_at = NOW()`,
    [userId, JSON.stringify(newFacts), MAX_FACTS]
  );

  console.log(`[LearnerMemory] +${newFacts.length} facts for user ${userId.slice(0, 8)}`);
}

/**
 * Returns true when extraction should run based on conversation length.
 * Call after saving each professor reply.
 */
export function shouldExtract(professorTurnCount) {
  return professorTurnCount > 0 && professorTurnCount % EXTRACT_EVERY === 0;
}

// ── Format for system prompt ──────────────────────────────────────────────────

/**
 * Format memory facts as a compact system prompt section.
 * Returns empty string if no facts.
 */
export function formatMemoryForPrompt(facts) {
  if (!facts || facts.length === 0) return '';

  const lines = facts.slice(0, 15).map(f => {
    const tag = f.type && f.type !== 'general' ? ` [${f.type}]` : '';
    const lesson = f.lesson_title ? ` (from: ${f.lesson_title})` : '';
    return `• ${f.content}${tag}${lesson}`;
  }).join('\n');

  return `\n\n═══ WHAT YOU KNOW ABOUT THIS STUDENT ═══\nFrom past sessions, you have observed:\n${lines}\n\nUse this to personalise your teaching — but never make the student feel profiled or judged.`;
}
