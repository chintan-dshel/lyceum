import { describe, it, expect } from 'vitest';
import {
  buildLessonSpecIndex,
  mapLessonToContent,
  extractStubsFromSpec,
} from '../../lib/course.generator.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FIXTURE_PHASE3 = {
  modules: [
    {
      module_id: 'M1',
      title: 'Foundations',
      lessons: [
        {
          lesson_id: 'L1.1',
          title: 'Vectors',
          prerequisites: ['none'],
          objectives: ['Define a vector', 'Perform vector addition'],
          key_concepts: ['vector', 'magnitude'],
          estimated_minutes: 45,
        },
        {
          lesson_id: 'L1.2',
          title: 'Matrices',
          prerequisites: ['L1.1'],
          objectives: ['Define a matrix', 'Multiply matrices'],
          key_concepts: ['matrix', 'multiplication'],
          estimated_minutes: 60,
        },
      ],
    },
    {
      module_id: 'M2',
      title: 'Applications',
      lessons: [
        {
          lesson_id: 'L2.1',
          title: 'Eigenvalues',
          prerequisites: ['L1.2'],
          objectives: ['Compute eigenvalues'],
          key_concepts: ['eigenvalue', 'eigenvector'],
          estimated_minutes: 75,
        },
      ],
    },
  ],
  assessment_blueprint: [],
  dependency_graph: 'L1.1 → L1.2 → L2.1',
};

const FIXTURE_LESSON = {
  lesson_id: 'L1.1',
  title: 'Vectors',
  objectives_recap: ['Define a vector', 'Perform vector addition'],
  prerequisites_check: 'No prerequisites — this is the first lesson.',
  core_content: 'A vector is a quantity with magnitude and direction.',
  worked_examples: [
    { title: 'Addition', problem: 'Add (1,2) and (3,4)', solution: '(4,6)' },
    { title: 'Scaling', problem: 'Scale (1,2) by 3', solution: '(3,6)' },
  ],
  common_misconceptions: [
    'Learners often think vectors must start at the origin. They need not.',
    'Learners often think magnitude is always positive. Correct: it is.',
  ],
  practice_problems: [
    { problem: 'Compute (2,3) + (1,4)', solution: '(3,7)' },
    { problem: 'Scale (0,1) by 5', solution: '(0,5)' },
    { problem: 'Find the magnitude of (3,4)', solution: '5' },
  ],
  connection_forward: 'This prepares you for matrix operations in L1.2.',
  open_questions_or_limits: 'We omit infinite-dimensional vector spaces here.',
  blackboard_cues: [{ when: 'definition', what: 'Draw an arrow' }],
  references: [{ title: 'Linear Algebra Done Right', author: 'Axler', year: 2015, type: 'textbook' }],
};

// ── buildLessonSpecIndex ─────────────────────────────────────────────────────

describe('buildLessonSpecIndex', () => {
  it('returns a flat object keyed by lesson_id', () => {
    const index = buildLessonSpecIndex(FIXTURE_PHASE3);
    expect(Object.keys(index)).toEqual(['L1.1', 'L1.2', 'L2.1']);
  });

  it('each entry includes module_id and module_title', () => {
    const index = buildLessonSpecIndex(FIXTURE_PHASE3);
    expect(index['L1.1'].module_id).toBe('M1');
    expect(index['L1.1'].module_title).toBe('Foundations');
    expect(index['L2.1'].module_id).toBe('M2');
    expect(index['L2.1'].module_title).toBe('Applications');
  });

  it('preserves lesson fields', () => {
    const index = buildLessonSpecIndex(FIXTURE_PHASE3);
    expect(index['L1.2'].title).toBe('Matrices');
    expect(index['L1.2'].prerequisites).toEqual(['L1.1']);
  });

  it('returns empty object for no modules', () => {
    expect(buildLessonSpecIndex({ modules: [] })).toEqual({});
    expect(buildLessonSpecIndex({})).toEqual({});
  });
});

// ── extractStubsFromSpec ─────────────────────────────────────────────────────

describe('extractStubsFromSpec', () => {
  it('returns one stub per lesson across all modules', () => {
    const stubs = extractStubsFromSpec({ phase3: FIXTURE_PHASE3 });
    expect(stubs).toHaveLength(3);
  });

  it('numbers stubs sequentially starting at 1', () => {
    const stubs = extractStubsFromSpec({ phase3: FIXTURE_PHASE3 });
    expect(stubs.map(s => s.number)).toEqual([1, 2, 3]);
  });

  it('stubs have correct titles', () => {
    const stubs = extractStubsFromSpec({ phase3: FIXTURE_PHASE3 });
    expect(stubs[0].title).toBe('Vectors');
    expect(stubs[1].title).toBe('Matrices');
    expect(stubs[2].title).toBe('Eigenvalues');
  });

  it('each stub has required fields', () => {
    const stubs = extractStubsFromSpec({ phase3: FIXTURE_PHASE3 });
    for (const stub of stubs) {
      expect(stub).toMatchObject({
        number: expect.any(Number),
        title: expect.any(String),
        lesson_type: 'lecture',
        estimated_minutes: expect.any(Number),
      });
    }
  });

  it('uses spec estimated_minutes', () => {
    const stubs = extractStubsFromSpec({ phase3: FIXTURE_PHASE3 });
    expect(stubs[0].estimated_minutes).toBe(45);
    expect(stubs[1].estimated_minutes).toBe(60);
    expect(stubs[2].estimated_minutes).toBe(75);
  });
});

// ── mapLessonToContent ───────────────────────────────────────────────────────

describe('mapLessonToContent', () => {
  it('returns { sections, key_terms, further_reading }', () => {
    const content = mapLessonToContent(FIXTURE_LESSON);
    expect(content).toHaveProperty('sections');
    expect(content).toHaveProperty('key_terms');
    expect(content).toHaveProperty('further_reading');
  });

  it('sections is a non-empty array', () => {
    const { sections } = mapLessonToContent(FIXTURE_LESSON);
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(0);
  });

  it('each section has heading, body, type', () => {
    const { sections } = mapLessonToContent(FIXTURE_LESSON);
    for (const s of sections) {
      expect(s).toMatchObject({
        heading: expect.any(String),
        body: expect.any(String),
        type: expect.any(String),
      });
    }
  });

  it('includes a section for each worked example', () => {
    const { sections } = mapLessonToContent(FIXTURE_LESSON);
    const exampleSections = sections.filter(s => s.type === 'example');
    expect(exampleSections).toHaveLength(FIXTURE_LESSON.worked_examples.length);
  });

  it('includes a misconceptions section', () => {
    const { sections } = mapLessonToContent(FIXTURE_LESSON);
    const misconceptionSection = sections.find(s => s.heading === 'Common Misconceptions');
    expect(misconceptionSection).toBeDefined();
    expect(misconceptionSection.body).toContain('Learners often think');
  });

  it('key_terms maps from practice_problems (up to 3)', () => {
    const { key_terms } = mapLessonToContent(FIXTURE_LESSON);
    expect(key_terms.length).toBeLessThanOrEqual(3);
    expect(key_terms[0]).toMatchObject({ term: expect.any(String), definition: expect.any(String) });
  });

  it('handles string core_content', () => {
    const lesson = { ...FIXTURE_LESSON, core_content: 'Plain string content.' };
    const { sections } = mapLessonToContent(lesson);
    const coreSection = sections.find(s => s.heading === 'Core Content');
    expect(coreSection).toBeDefined();
    expect(coreSection.body).toBe('Plain string content.');
  });

  it('handles object core_content with sections array', () => {
    const lesson = {
      ...FIXTURE_LESSON,
      core_content: {
        sections: [{ heading: 'Intro', body: 'Intro content', type: 'text' }],
      },
    };
    const { sections } = mapLessonToContent(lesson);
    expect(sections.find(s => s.heading === 'Intro')).toBeDefined();
  });
});
