import { Link } from 'react-router-dom';
import ProgressRing from './ProgressRing.jsx';

const TYPE_COLOR = {
  core:     { accent: 'var(--indigo)',  soft: 'var(--indigo-soft)',  label: 'Core' },
  elective: { accent: 'var(--clay)',    soft: 'var(--clay-soft)',    label: 'Elective' },
};

export default function CourseCard({ course, programId, costUsd }) {
  const lessonCount  = parseInt(course.lesson_count) || 0;
  const visited      = parseInt(course.lessons_visited) || 0;
  const visitPct     = lessonCount > 0 ? Math.round((visited / lessonCount) * 100) : 0;
  const colors       = TYPE_COLOR[course.course_type] || TYPE_COLOR.core;

  return (
    <Link
      to={`/program/${programId}/course/${course.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        className="course-card-item"
        style={{
          background: '#fff',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--r-lg)',
          borderLeft: `3px solid ${colors.accent}`,
          boxShadow: 'var(--shadow-1)',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          transition: 'box-shadow .15s, transform .15s',
          cursor: 'pointer',
          height: '100%',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = 'var(--shadow-2)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = 'var(--shadow-1)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="kicker">{course.code}</span>
          <span style={{
            fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
            background: colors.soft, color: colors.accent,
          }}>{colors.label}</span>
        </div>

        <div className="serif" style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.3 }}>
          {course.title}
        </div>

        {course.description && (
          <div style={{
            fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {course.description}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {lessonCount > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ProgressRing percent={visitPct} size={28} stroke={2.5} label={null} />
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)' }}>
                {visited}/{lessonCount} lessons
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 11.5, color: 'var(--ink-4)', fontFamily: 'var(--f-mono)' }}>No lessons yet</span>
          )}
          {costUsd > 0 && (
            <span style={{ fontSize: 10, fontFamily: 'var(--f-mono)', color: 'var(--ink-4)' }}>
              ${costUsd.toFixed(3)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
