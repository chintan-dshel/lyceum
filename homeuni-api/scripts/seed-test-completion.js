/**
 * Seed test completion data for a user's program.
 *
 * Marks all lessons complete, adds visits, inserts graded submissions
 * and exam attempts for every assignment/exam in the program.
 * Then recomputes course grades and program GPA.
 *
 * Usage:
 *   node scripts/seed-test-completion.js <email>
 *   node scripts/seed-test-completion.js <email> <programId>
 */

import 'dotenv/config';
import { query } from '../src/db/pool.js';
import pool from '../src/db/pool.js';

const [,, email, targetProgramId] = process.argv;
if (!email) {
  console.error('Usage: node scripts/seed-test-completion.js <email> [programId]');
  process.exit(1);
}

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

async function run() {
  // 1. Find user
  const { rows: [user] } = await query(
    'SELECT id, full_name FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  if (!user) { console.error(`No user found for ${email}`); process.exit(1); }
  console.log(`User: ${user.full_name} (${user.id})`);

  // 2. Find program(s)
  let programQuery = 'SELECT id, title FROM programs WHERE user_id = $1';
  const programArgs = [user.id];
  if (targetProgramId) {
    programQuery += ' AND id = $2';
    programArgs.push(targetProgramId);
  }
  const { rows: programs } = await query(programQuery, programArgs);
  if (!programs.length) { console.error('No programs found.'); process.exit(1); }

  for (const program of programs) {
    console.log(`\nProgram: ${program.title} (${program.id})`);

    const { rows: courses } = await query(
      `SELECT c.id, c.code, c.title, c.course_type, c.credit_hours
       FROM courses c
       JOIN semesters s ON s.id = c.semester_id
       WHERE s.program_id = $1 ORDER BY s.number, c.position`,
      [program.id]
    );
    console.log(`  ${courses.length} courses found`);

    for (const course of courses) {
      console.log(`\n  [${course.code}] ${course.title}`);

      // 3. Lessons — mark all complete + add visits
      const { rows: lessons } = await query(
        'SELECT id FROM lessons WHERE course_id = $1 ORDER BY number',
        [course.id]
      );
      if (!lessons.length) {
        console.log('    No lessons — skipping');
        continue;
      }

      await query(
        `UPDATE lessons SET status = 'complete' WHERE course_id = $1`,
        [course.id]
      );
      console.log(`    ${lessons.length} lessons marked complete`);

      for (const lesson of lessons) {
        await query(
          `INSERT INTO lesson_visits (lesson_id, user_id, visit_count, time_spent_secs, scroll_depth)
           VALUES ($1, $2, 1, 600, 100)
           ON CONFLICT (lesson_id, user_id) DO UPDATE SET
             scroll_depth = 100, visit_count = GREATEST(lesson_visits.visit_count, 1)`,
          [lesson.id, user.id]
        );
      }
      console.log(`    lesson_visits seeded`);

      // 4. Assignments — insert graded submission if none exists
      const { rows: assignments } = await query(
        'SELECT id, title FROM assignments WHERE course_id = $1 ORDER BY position',
        [course.id]
      );
      for (const a of assignments) {
        const { rows: existing } = await query(
          'SELECT id FROM submissions WHERE assignment_id = $1 AND user_id = $2 LIMIT 1',
          [a.id, user.id]
        );
        if (existing.length) {
          console.log(`    Assignment "${a.title}" — submission already exists, skipping`);
          continue;
        }
        const score = 85;
        const letter = scoreToLetter(score);
        await query(
          `INSERT INTO submissions
             (assignment_id, user_id, content_text, attempt_number, score, grade_letter,
              feedback_text, rubric_scores, graded_at)
           VALUES ($1, $2, $3, 1, $4, $5, $6, $7, NOW())`,
          [
            a.id, user.id,
            'Test submission seeded for transcript testing.',
            score, letter,
            'Well-structured response demonstrating solid understanding of core concepts.',
            JSON.stringify([]),
          ]
        );
        console.log(`    Assignment "${a.title}" — submission seeded (${score} / ${letter})`);
      }

      // 5. Exams — insert graded attempt if none exists
      const { rows: exams } = await query(
        'SELECT id, title, questions FROM exams WHERE course_id = $1 ORDER BY position',
        [course.id]
      );
      for (const e of exams) {
        const { rows: existing } = await query(
          'SELECT id FROM exam_attempts WHERE exam_id = $1 AND user_id = $2 LIMIT 1',
          [e.id, user.id]
        );
        if (existing.length) {
          console.log(`    Exam "${e.title}" — attempt already exists, skipping`);
          continue;
        }
        const score = 82;
        const letter = scoreToLetter(score);
        // Build stub answers from questions
        const questions = Array.isArray(e.questions) ? e.questions : [];
        const answers = Object.fromEntries(questions.map(q => [q.id, q.correct_answer || 'A']));
        await query(
          `INSERT INTO exam_attempts
             (exam_id, user_id, answers, attempt_number, score, grade_letter, feedback, submitted_at)
           VALUES ($1, $2, $3, 1, $4, $5, $6, NOW())`,
          [
            e.id, user.id,
            JSON.stringify(answers),
            score, letter,
            JSON.stringify([]),
          ]
        );
        console.log(`    Exam "${e.title}" — attempt seeded (${score} / ${letter})`);
      }

      // 6. Recompute course grade
      const { rows: subScores } = await query(
        `SELECT DISTINCT ON (a.id) s.score FROM assignments a
         JOIN submissions s ON s.assignment_id = a.id AND s.user_id = $2
         WHERE a.course_id = $1 AND s.score IS NOT NULL
         ORDER BY a.id, s.submitted_at DESC NULLS LAST`,
        [course.id, user.id]
      );
      const { rows: examScores } = await query(
        `SELECT DISTINCT ON (e.id) ea.score FROM exams e
         JOIN exam_attempts ea ON ea.exam_id = e.id AND ea.user_id = $2
         WHERE e.course_id = $1 AND ea.score IS NOT NULL
         ORDER BY e.id, ea.submitted_at DESC NULLS LAST`,
        [course.id, user.id]
      );
      const allScores = [...subScores, ...examScores].map(r => parseFloat(r.score));
      if (allScores.length) {
        const avg = allScores.reduce((s, v) => s + v, 0) / allScores.length;
        const letter = scoreToLetter(avg);
        await query(
          'UPDATE courses SET final_grade = $1, grade_letter = $2 WHERE id = $3',
          [Math.round(avg), letter, course.id]
        );
        console.log(`    Course grade: ${Math.round(avg)} / ${letter}`);
      }
    }

    // 7. Recompute program GPA
    const { rows: gradedCourses } = await query(
      'SELECT grade_letter, credit_hours FROM courses WHERE id IN (SELECT c.id FROM courses c JOIN semesters s ON s.id = c.semester_id WHERE s.program_id = $1) AND grade_letter IS NOT NULL',
      [program.id]
    );
    if (gradedCourses.length) {
      const totalCredits = gradedCourses.reduce((s, c) => s + (c.credit_hours || 3), 0);
      const weighted = gradedCourses.reduce((s, c) => s + (letterToPoints(c.grade_letter) * (c.credit_hours || 3)), 0);
      const gpa = parseFloat((weighted / totalCredits).toFixed(2));
      await query('UPDATE programs SET gpa = $1 WHERE id = $2', [gpa, program.id]);
      console.log(`\n  Program GPA: ${gpa}`);
    }
  }

  console.log('\nDone. Open the transcript and certificate pages to verify.');
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
