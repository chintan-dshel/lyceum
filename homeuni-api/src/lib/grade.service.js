import { query } from '../db/pool.js';

function scoreToLetter(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function letterToPoints(letter) {
  return { A: 4.0, B: 3.0, C: 2.0, D: 1.0, F: 0.0 }[letter] ?? 0;
}

export async function recomputeCourseGrade(courseId, userId) {
  const { rows: subScores } = await query(
    `SELECT DISTINCT ON (a.id) s.score
     FROM assignments a
     JOIN submissions s ON s.assignment_id = a.id AND s.user_id = $2
     WHERE a.course_id = $1 AND s.score IS NOT NULL
     ORDER BY a.id, s.submitted_at DESC NULLS LAST`,
    [courseId, userId]
  );

  const { rows: examScores } = await query(
    `SELECT DISTINCT ON (e.id) ea.score
     FROM exams e
     JOIN exam_attempts ea ON ea.exam_id = e.id AND ea.user_id = $2
     WHERE e.course_id = $1 AND ea.score IS NOT NULL
     ORDER BY e.id, ea.submitted_at DESC NULLS LAST`,
    [courseId, userId]
  );

  const allScores = [...subScores, ...examScores].map(r => parseFloat(r.score)).filter(s => !isNaN(s));
  if (allScores.length === 0) return;

  const avg = allScores.reduce((sum, s) => sum + s, 0) / allScores.length;
  const letter = scoreToLetter(avg);

  await query(
    'UPDATE courses SET final_grade = $1, grade_letter = $2 WHERE id = $3',
    [Math.round(avg), letter, courseId]
  );

  // Recompute program GPA (weighted by credit_hours)
  const { rows: [course] } = await query('SELECT program_id FROM courses WHERE id = $1', [courseId]);
  if (!course) return;

  const { rows: gradedCourses } = await query(
    'SELECT grade_letter, credit_hours FROM courses WHERE program_id = $1 AND grade_letter IS NOT NULL',
    [course.program_id]
  );
  if (gradedCourses.length === 0) return;

  const totalCredits = gradedCourses.reduce((sum, c) => sum + (c.credit_hours || 3), 0);
  const weightedPoints = gradedCourses.reduce((sum, c) => sum + (letterToPoints(c.grade_letter) * (c.credit_hours || 3)), 0);
  const gpa = totalCredits > 0 ? parseFloat((weightedPoints / totalCredits).toFixed(2)) : 0;

  await query('UPDATE programs SET gpa = $1 WHERE id = $2', [gpa, course.program_id]);
}
