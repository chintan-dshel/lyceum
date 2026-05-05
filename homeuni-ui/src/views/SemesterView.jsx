import { useParams, Link } from 'react-router-dom';
import { useCurriculum } from '../hooks/useProgram.js';
import { useProgramTelemetry } from '../hooks/useTelemetry.js';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';
import CourseCard from '../components/CourseCard.jsx';
import AdvisorNudge from '../components/AdvisorNudge.jsx';

export default function SemesterView() {
  const { programId, semesterNumber } = useParams();
  const { curriculum, loading } = useCurriculum(programId);
  const { costByCourse, programTotal } = useProgramTelemetry(programId);

  if (loading) return <div className="loading-screen">Loading...</div>;

  const semNum    = parseInt(semesterNumber);
  const semester  = curriculum?.semesters?.find(s => s.number === semNum);
  const allSemesters = curriculum?.semesters || [];

  if (!semester) return <div className="loading-screen">Semester not found</div>;

  const coreCourses     = semester.courses?.filter(c => c.course_type === 'core')     || [];
  const electiveCourses = semester.courses?.filter(c => c.course_type === 'elective') || [];

  return (
    <div className="app-shell">
      <Sidebar programId={programId} />
      <div className="main-content">
        <TopBar
          crumb="Curriculum"
          crumbHref="/dashboard"
          title={semester.title}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {semNum > 1 && (
                <Link to={`/program/${programId}/semester/${semNum - 1}`} className="btn ghost" style={{ textDecoration: 'none' }}>
                  ← Prev
                </Link>
              )}
              {semNum < allSemesters.length && (
                <Link to={`/program/${programId}/semester/${semNum + 1}`} className="btn ghost" style={{ textDecoration: 'none' }}>
                  Next →
                </Link>
              )}
              {programTotal > 0 && (
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)', paddingLeft: 8 }}>
                  AI cost ${programTotal.toFixed(4)}
                </div>
              )}
            </div>
          }
        />

        <div style={{ overflow: 'auto', flex: 1, padding: '24px 32px' }}>
          <AdvisorNudge programId={programId} />

          {semester.theme && (
            <div style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 20, lineHeight: 1.5 }}>
              {semester.theme}
            </div>
          )}

          {/* Semester tabs */}
          {allSemesters.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap' }}>
              {allSemesters.map(s => (
                <Link
                  key={s.id}
                  to={`/program/${programId}/semester/${s.number}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
                    background: s.number === semNum ? 'var(--ink)' : 'var(--paper-2)',
                    color: s.number === semNum ? 'var(--paper)' : 'var(--ink-2)',
                    border: `1px solid ${s.number === semNum ? 'var(--ink)' : 'var(--rule)'}`,
                    cursor: 'pointer', transition: 'all .1s',
                  }}>
                    Semester {s.number}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {coreCourses.length > 0 && (
            <section style={{ marginBottom: 36 }}>
              <div className="kicker" style={{ marginBottom: 14 }}>Core Courses</div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16,
              }}>
                {coreCourses.map(c => (
                  <CourseCard key={c.id} course={c} programId={programId} costUsd={costByCourse[c.id]} />
                ))}
              </div>
            </section>
          )}

          {electiveCourses.length > 0 && (
            <section>
              <div className="kicker" style={{ marginBottom: 14 }}>Electives</div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16,
              }}>
                {electiveCourses.map(c => (
                  <CourseCard key={c.id} course={c} programId={programId} costUsd={costByCourse[c.id]} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
