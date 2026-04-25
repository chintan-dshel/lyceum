import { query } from './pool.js';

export async function getProgramById(programId, userId) {
  const { rows: [program] } = await query(
    'SELECT * FROM programs WHERE id = $1 AND user_id = $2',
    [programId, userId]
  );
  return program || null;
}

export async function updateProgramGPA(programId) {
  // Recalculate GPA from all graded courses (4.0 scale)
  const { rows: [result] } = await query(
    `UPDATE programs SET
       gpa = (
         SELECT ROUND(
           SUM(
             CASE
               WHEN c.grade_letter = 'A' THEN 4.0 * c.credit_hours
               WHEN c.grade_letter = 'B' THEN 3.0 * c.credit_hours
               WHEN c.grade_letter = 'C' THEN 2.0 * c.credit_hours
               WHEN c.grade_letter = 'D' THEN 1.0 * c.credit_hours
               ELSE 0
             END
           ) / NULLIF(SUM(c.credit_hours), 0),
           2
         )
         FROM courses c
         JOIN semesters s ON s.id = c.semester_id
         WHERE s.program_id = $1 AND c.grade_letter IS NOT NULL
       ),
       updated_at = NOW()
     WHERE id = $1
     RETURNING gpa`,
    [programId]
  );
  return result?.gpa;
}

export async function updateCourseGrade(courseId, finalGrade) {
  const gradeLetter = gradeToLetter(finalGrade);
  await query(
    `UPDATE courses SET final_grade = $1, grade_letter = $2, status = 'complete', updated_at = NOW()
     WHERE id = $3`,
    [finalGrade, gradeLetter, courseId]
  );
}

function gradeToLetter(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
