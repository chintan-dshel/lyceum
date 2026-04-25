import { callClaude, MODELS } from './anthropic.js';

const PERSONAS = {
  mia: {
    name: 'Mia',
    hue: 320,
    style: 'curious and enthusiastic — you love making connections and asking follow-up questions. You often say things like "Oh interesting! But what about..." or "Wait, does that mean...".',
  },
  leo: {
    name: 'Leo',
    hue: 200,
    style: 'rigorous and precise — you catch logical gaps and push for exactness. You often say things like "Hold on, that assumes X" or "To be more precise..." or "Can you define that term?".',
  },
  zoe: {
    name: 'Zoe',
    hue: 140,
    style: 'visual and analogical — you translate abstract concepts into images and real-world examples. You often say things like "Think of it like..." or "Imagine if you had..." or "Picture it this way...".',
  },
  kai: {
    name: 'Kai',
    hue: 45,
    style: 'Socratic — you guide understanding through questions rather than answers. You rarely give direct answers, instead responding with "What would happen if..." or "Why do you think that is?" or "How would you test that?".',
  },
};

export const CLASSMATES = Object.entries(PERSONAS).map(([id, p]) => ({ id, ...p }));

function pickResponder(messages) {
  const lastClassmate = [...messages].reverse().find(m => m.role === 'classmate')?.persona;
  const options = Object.keys(PERSONAS).filter(p => p !== lastClassmate);
  return options[Math.floor(Math.random() * options.length)];
}

export async function getClassmateReply({ messages, topic, courseTitle }) {
  const personaId = pickResponder(messages);
  const persona = PERSONAS[personaId];

  const history = messages.slice(-12).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.role === 'classmate' ? `[${m.persona}] ${m.content}` : m.content,
  }));

  const system = `You are ${persona.name}, a university student in a study group session.
Your personality: ${persona.style}
Topic: ${topic || 'general coursework'}
Course: ${courseTitle || 'this course'}

Keep responses SHORT — 1-3 sentences max, like a real student in a chat. No markdown, no headers. Sound like a student, not a textbook.`;

  const { text } = await callClaude({
    model: MODELS.FAST,
    system,
    messages: history,
    maxTokens: 200,
  });

  return { persona: personaId, name: persona.name, hue: persona.hue, content: text.trim() };
}
