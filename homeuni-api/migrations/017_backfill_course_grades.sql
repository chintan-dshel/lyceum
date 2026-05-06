-- Backfill course grades from existing submissions + exam attempts.
-- After this migration the runtime grade.service.js keeps them current.

WITH latest_submissions AS (
  SELECT DISTINCT ON (a.course_id, a.id)
    a.course_id, s.score
  FROM assignments a
  JOIN submissions s ON s.assignment_id = a.id
  WHERE s.score IS NOT NULL
  ORDER BY a.course_id, a.id, s.submitted_at DESC NULLS LAST
),
latest_exams AS (
  SELECT DISTINCT ON (e.course_id, e.id)
    e.course_id, ea.score
  FROM exams e
  JOIN exam_attempts ea ON ea.exam_id = e.id
  WHERE ea.score IS NOT NULL
  ORDER BY e.course_id, e.id, ea.submitted_at DESC NULLS LAST
),
all_scores AS (
  SELECT course_id, score FROM latest_submissions
  UNION ALL
  SELECT course_id, score FROM latest_exams
),
course_avgs AS (
  SELECT course_id, AVG(score) AS avg_score
  FROM all_scores
  GROUP BY course_id
)
UPDATE courses SET
  final_grade = ROUND(ca.avg_score),
  grade_letter = CASE
    WHEN ca.avg_score >= 90 THEN 'A'
    WHEN ca.avg_score >= 80 THEN 'B'
    WHEN ca.avg_score >= 70 THEN 'C'
    WHEN ca.avg_score >= 60 THEN 'D'
    ELSE 'F'
  END
FROM course_avgs ca
WHERE courses.id = ca.course_id;

-- Backfill program GPA (weighted by credit_hours, 4.0 scale)
WITH program_gpa AS (
  SELECT
    program_id,
    SUM(
      CASE grade_letter
        WHEN 'A' THEN 4.0
        WHEN 'B' THEN 3.0
        WHEN 'C' THEN 2.0
        WHEN 'D' THEN 1.0
        ELSE 0.0
      END * COALESCE(credit_hours, 3)
    ) / NULLIF(SUM(COALESCE(credit_hours, 3)), 0) AS gpa
  FROM courses
  WHERE grade_letter IS NOT NULL
  GROUP BY program_id
)
UPDATE programs SET gpa = ROUND(pg.gpa::numeric, 2)
FROM program_gpa pg
WHERE programs.id = pg.program_id;
