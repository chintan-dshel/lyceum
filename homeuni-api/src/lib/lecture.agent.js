/**
 * Lecture Agent
 *
 * Generates a complete lecture script + whiteboard timeline for a given lesson.
 *
 * Whiteboard timeline shape:
 *   [{ order, heading, content, equations, annotation }]
 *
 * Each segment maps to a whiteboard "frame" displayed during the lecture.
 */

import { callClaudeJSON, MODELS } from './anthropic.js';

const SYSTEM = (course, lesson) => `You are designing a university lecture for "${lesson.title}" in the course "${course.title}" (${course.code}).

Lesson summary: ${lesson.summary || 'No summary provided.'}

Learning objectives for the course:
${(course.learning_objectives || []).join('\n')}

Generate a complete lecture as structured JSON.`;

const USER_PROMPT = (lesson) => `Generate a lecture script and whiteboard timeline for this lesson:
Title: ${lesson.title}
Number: ${lesson.number}
Content available: ${JSON.stringify(lesson.content?.sections?.slice(0, 4) || [], null, 0).slice(0, 1500)}

Return a JSON object with this exact shape:
{
  "script": "Full lecture script written in first-person professor voice. Natural, conversational, ~800-1200 words. Includes transitions like 'Let me put this on the board', 'Notice that...', 'Now here is the key insight...'",
  "whiteboard": [
    {
      "order": 1,
      "heading": "Short heading for this board section (max 60 chars)",
      "content": "Main handwritten text on board (1-3 sentences, max 120 chars, conversational)",
      "equations": ["equation1", "equation2"],
      "annotation": "Optional annotation text pointing to something on the board"
    }
  ]
}

Rules:
- whiteboard array must have 3-6 segments (one per major concept)
- equations use Unicode math symbols (no LaTeX backslashes): e.g. "x(t) = v₀·t", "F = ma", "E = mc²"
- headings are short, in CAPS style, handwritten feel
- content is written as if with chalk — incomplete sentences fine
- script should reference the whiteboard naturally ("as you can see here", "let me write this out")
- Return only the JSON object, no markdown`;

export async function generateLectureScript(lesson, course) {
  const result = await callClaudeJSON({
    model: MODELS.DEEP,
    system: SYSTEM(course, lesson),
    messages: [{ role: 'user', content: USER_PROMPT(lesson) }],
    maxTokens: 4096,
  });

  if (!result.script || !Array.isArray(result.whiteboard)) {
    throw new Error('Invalid lecture script structure from Claude');
  }

  return {
    script_text: result.script,
    whiteboard_timeline: result.whiteboard,
  };
}
