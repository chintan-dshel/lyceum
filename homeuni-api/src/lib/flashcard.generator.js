/**
 * Generates flashcards from lesson_spec + lesson content.
 * Returns [{front, back, tags}]
 */
import { callClaudeJSON, MODELS } from './anthropic.js';

export async function generateFlashcards({ lesson, lessonTitle, meta = {} }) {
  const spec = lesson.lesson_spec || {};
  const sections = lesson.content?.sections || [];

  const specText = JSON.stringify({
    worked_examples: spec.worked_examples || [],
    common_misconceptions: spec.common_misconceptions || [],
    practice_problems: (spec.practice_problems || []).slice(0, 5),
  }, null, 0);

  const contentText = sections
    .map(s => `${s.heading || ''}: ${s.body || s.content || ''}`)
    .join('\n')
    .slice(0, 2000);

  const result = await callClaudeJSON({
    model: MODELS.HAIKU,
    meta: { ...meta, agent: 'flashcard_generator' },
    system: `You generate flashcard decks for university students.
Each card has a short question/term on the front and a concise answer on the back.
Aim for 8-15 cards total. Cover definitions, key concepts, worked-example patterns, and common mistake corrections.
Return only JSON — no prose outside it.`,
    messages: [{
      role: 'user',
      content: `Lesson: ${lessonTitle}

Lesson spec:
${specText}

Lesson content:
${contentText}

Generate a flashcard deck. Return:
{
  "cards": [
    { "front": "<question or term>", "back": "<answer>", "tags": ["<tag>"] }
  ]
}`,
    }],
    maxTokens: 1500,
  });

  const cards = Array.isArray(result.cards) ? result.cards : [];
  return cards.filter(c => c.front && c.back).map(c => ({
    front: String(c.front).trim(),
    back: String(c.back).trim(),
    tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
  }));
}
