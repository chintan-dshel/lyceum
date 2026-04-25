import { Link } from 'react-router-dom';
import ProgressRing from './ProgressRing.jsx';

export default function CourseCard({ course, programId, costUsd }) {
  const lessonCount = parseInt(course.lesson_count) || 0;
  const visitPct = lessonCount > 0
    ? Math.round((parseInt(course.lessons_visited) / lessonCount) * 100)
    : 0;

  return (
    <Link
      to={`/program/${programId}/course/${course.id}`}
      className="course-card"
    >
      <div className="course-card-code">{course.code}</div>
      <div className="course-card-title">{course.title}</div>
      <div className="course-card-desc">{course.description}</div>
      <div className="course-card-footer">
        <span className={`course-card-type ${course.course_type}`}>
          {course.course_type}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {costUsd > 0 && (
            <span style={{
              fontSize: 10, fontFamily: 'var(--f-mono)',
              color: 'var(--ink-3)', letterSpacing: '0.02em',
            }}>
              ${costUsd.toFixed(3)}
            </span>
          )}
          {lessonCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ProgressRing
                percent={visitPct}
                size={32}
                stroke={3}
                label={`${visitPct}%`}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {parseInt(course.lessons_visited) || 0}/{lessonCount} lessons
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
