import { query } from '../../db/pool.js';

export async function createTestProgram(userId, overrides = {}) {
  const { rows: [program] } = await query(
    `INSERT INTO programs (user_id, title, degree_type, field_of_study, total_semesters)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      userId,
      overrides.title ?? 'Test Program',
      overrides.degree_type ?? 'bachelor',
      overrides.field_of_study ?? 'Testing',
      overrides.total_semesters ?? 2,
    ]
  );
  return program;
}

export async function createTestSemester(programId) {
  const { rows: [sem] } = await query(
    `INSERT INTO semesters (program_id, number, title) VALUES ($1, 1, 'Semester 1') RETURNING *`,
    [programId]
  );
  return sem;
}

export async function createTestCourse(semesterId, programId, overrides = {}) {
  const { rows: [course] } = await query(
    `INSERT INTO courses (semester_id, program_id, code, title, description, course_type, credit_hours, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      semesterId, programId,
      overrides.code ?? `TC-${Date.now()}`,
      overrides.title ?? 'Test Course',
      overrides.description ?? 'A test course',
      overrides.course_type ?? 'core',
      overrides.credit_hours ?? 3,
      overrides.position ?? 1,
    ]
  );
  return course;
}

export async function createTestLesson(courseId, overrides = {}) {
  const { rows: [lesson] } = await query(
    `INSERT INTO lessons (course_id, number, title, summary, lesson_type, estimated_minutes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      courseId,
      overrides.number ?? 1,
      overrides.title ?? 'Test Lesson',
      overrides.summary ?? 'A test lesson',
      overrides.lesson_type ?? 'lecture',
      overrides.estimated_minutes ?? 45,
    ]
  );
  return lesson;
}

export async function insertCertificate(userId, programId, overrides = {}) {
  const { rows: [cert] } = await query(
    `INSERT INTO certificates (program_id, user_id, full_name, program_title, degree_type, field_of_study, total_semesters)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      programId, userId,
      overrides.full_name ?? 'Test Student',
      overrides.program_title ?? 'Bachelor of Testing',
      overrides.degree_type ?? 'bachelor',
      overrides.field_of_study ?? 'Testing',
      overrides.total_semesters ?? 2,
    ]
  );
  return cert;
}

export async function insertFlashcardDeck(lessonId, cards) {
  const { rows: [deck] } = await query(
    `INSERT INTO flashcard_decks (lesson_id, cards)
     VALUES ($1, $2)
     ON CONFLICT (lesson_id) DO UPDATE SET cards = EXCLUDED.cards
     RETURNING *`,
    [lessonId, JSON.stringify(cards)]
  );
  return deck;
}

export async function cleanup(...userIds) {
  for (const id of userIds.filter(Boolean)) {
    await query('DELETE FROM users WHERE id = $1', [id]);
  }
}
