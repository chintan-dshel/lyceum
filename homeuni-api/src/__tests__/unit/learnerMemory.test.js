import { describe, it, expect } from 'vitest';
import { shouldExtract, formatMemoryForPrompt } from '../../lib/learner.memory.js';

describe('shouldExtract', () => {
  it('returns false for turn 0', () => expect(shouldExtract(0)).toBe(false));
  it('returns true at turn 4',   () => expect(shouldExtract(4)).toBe(true));
  it('returns false at turn 5',  () => expect(shouldExtract(5)).toBe(false));
  it('returns true at turn 8',   () => expect(shouldExtract(8)).toBe(true));
  it('returns true at turn 12',  () => expect(shouldExtract(12)).toBe(true));
  it('returns false at turn 3',  () => expect(shouldExtract(3)).toBe(false));
  it('returns false at turn 7',  () => expect(shouldExtract(7)).toBe(false));
});

describe('formatMemoryForPrompt', () => {
  it('returns empty string for empty array', () => {
    expect(formatMemoryForPrompt([])).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatMemoryForPrompt(null)).toBe('');
    expect(formatMemoryForPrompt(undefined)).toBe('');
  });

  it('includes the section header', () => {
    const result = formatMemoryForPrompt([
      { content: 'Struggles with limits', type: 'struggle', lesson_title: 'Calculus I' },
    ]);
    expect(result).toContain('WHAT YOU KNOW ABOUT THIS STUDENT');
    expect(result).toContain('Struggles with limits');
  });

  it('includes type tag and lesson title', () => {
    const result = formatMemoryForPrompt([
      { content: 'Prefers visual analogies', type: 'preference', lesson_title: 'Vectors' },
    ]);
    expect(result).toContain('[preference]');
    expect(result).toContain('from: Vectors');
  });

  it('omits type tag when type is general', () => {
    const result = formatMemoryForPrompt([
      { content: 'Some general note', type: 'general', lesson_title: 'Lesson A' },
    ]);
    expect(result).not.toContain('[general]');
    expect(result).toContain('Some general note');
  });

  it('caps output at 15 facts', () => {
    const facts = Array.from({ length: 20 }, (_, i) => ({
      content: `Fact number ${i}`,
      type: 'struggle',
      lesson_title: 'Lesson X',
    }));
    const result = formatMemoryForPrompt(facts);
    expect(result).toContain('Fact number 0');
    expect(result).not.toContain('Fact number 15');
  });

  it('includes the personalisation reminder', () => {
    const result = formatMemoryForPrompt([{ content: 'Anything', type: 'struggle', lesson_title: 'L' }]);
    expect(result).toContain('never make the student feel profiled');
  });
});
