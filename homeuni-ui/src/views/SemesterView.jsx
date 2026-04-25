import { useParams, Link } from 'react-router-dom';
import { useCurriculum } from '../hooks/useProgram.js';
import { useProgramTelemetry } from '../hooks/useTelemetry.js';
import Sidebar from '../components/Sidebar.jsx';
import CourseCard from '../components/CourseCard.jsx';
import AdvisorNudge from '../components/AdvisorNudge.jsx';

export default function SemesterView() {
  const { programId, semesterNumber } = useParams();
  const { curriculum, loading } = useCurriculum(programId);
  const { costByCourse, programTotal } = useProgramTelemetry(programId);

  if (loading) return <div className="loading-screen">Loading...</div>;

  const semNum = parseInt(semesterNumber);
  const semester = curriculum?.semesters?.find(s => s.number === semNum);
  const allSemesters = curriculum?.semesters || [];

  if (!semester) return <div className="loading-screen">Semester not found</div>;

  const coreCourses = semester.courses?.filter(c => c.course_type === 'core') || [];
  const electiveCourses = semester.courses?.filter(c => c.course_type === 'elective') || [];


  return (
    <div className="app-shell">
      <Sidebar programId={programId} />
      <div className="main-content">
        <div className="topbar">
          <div className="topbar-breadcrumb">
            <Link to="/dashboard">Dashboard</Link>
            <span className="sep">/</span>
            <span className="current">{semester.title}</span>
          </div>
          <div className="topbar-actions">
            {semNum > 1 && (
              <Link to={`/program/${programId}/semester/${semNum - 1}`} className="btn btn-ghost btn-sm">← Prev</Link>
            )}
            {semNum < curriculum?.semesters?.length && (
              <Link to={`/program/${programId}/semester/${semNum + 1}`} className="btn btn-ghost btn-sm">Next →</Link>
            )}
          </div>
        </div>

        <div className="page-content">
          <AdvisorNudge programId={programId} />

          <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h1>{semester.title}</h1>
              {semester.theme && <p className="subtitle">{semester.theme}</p>}
            </div>
            {programTotal > 0 && (
              <div style={{
                fontSize: 11, color: 'var(--ink-3)', textAlign: 'right',
                lineHeight: 1.4, flexShrink: 0, paddingTop: 4,
              }}>
                <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Program AI cost</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontWeight: 600, color: 'var(--ink-2)', fontSize: 13 }}>
                  ${programTotal.toFixed(4)}
                </div>
              </div>
            )}
          </div>

          {/* Semester nav */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
            {allSemesters.map(s => (
              <Link
                key={s.id}
                to={`/program/${programId}/semester/${s.number}`}
                className={`btn btn-sm ${s.number === semNum ? 'btn-primary' : 'btn-ghost'}`}
              >
                Sem {s.number}
              </Link>
            ))}
          </div>

          {coreCourses.length > 0 && (
            <section style={{ marginBottom: 36 }}>
              <h2 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy-600)', marginBottom: 16 }}>
                Core Courses
              </h2>
              <div className="card-grid">
                {coreCourses.map(c => <CourseCard key={c.id} course={c} programId={programId} costUsd={costByCourse[c.id]} />)}
              </div>
            </section>
          )}

          {electiveCourses.length > 0 && (
            <section>
              <h2 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy-600)', marginBottom: 16 }}>
                Electives
              </h2>
              <div className="card-grid">
                {electiveCourses.map(c => <CourseCard key={c.id} course={c} programId={programId} costUsd={costByCourse[c.id]} />)}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
