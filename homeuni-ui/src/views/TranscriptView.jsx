import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { progress } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';
import Icon from '../components/ui/Icon.jsx';

function CourseRow({ c }) {
  const [open, setOpen] = useState(false);
  const hasDetails = (c.assignments?.length > 0) || (c.examAttempts?.length > 0);

  return (
    <div style={{ borderTop: '1px solid var(--rule)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 110px 44px 56px 20px',
          padding: '11px 0', alignItems: 'center', fontSize: 13,
          cursor: hasDetails ? 'pointer' : 'default',
        }}
        onClick={() => hasDetails && setOpen(o => !o)}
      >
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.code}</span>
        <span className="serif" style={{ fontSize: 14 }}>{c.title}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-2)', textTransform: 'capitalize' }}>{c.course_type}</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{c.credit_hours}</span>
        <span style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 15, color: c.grade_letter ? 'var(--ink)' : 'var(--ink-4)' }}>
          {c.grade_letter || '—'}
        </span>
        {hasDetails && (
          <span style={{ color: 'var(--ink-4)', fontSize: 12, transition: 'transform 0.15s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
        )}
      </div>

      {open && hasDetails && (
        <div style={{ paddingBottom: 14, paddingLeft: 80 }}>
          {c.assignments?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--f-mono)', color: 'var(--ink-4)', letterSpacing: '0.08em', marginBottom: 6 }}>ASSIGNMENTS</div>
              {c.assignments.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, fontSize: 12.5, color: 'var(--ink-2)', padding: '5px 0', borderTop: i ? '1px solid var(--rule)' : 'none', alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>{a.title}</span>
                  <span className="mono" style={{ fontSize: 11 }}>{a.score != null ? `${a.score} pts` : '—'}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: a.grade_letter ? 'var(--ink)' : 'var(--ink-4)', width: 22, textAlign: 'right' }}>
                    {a.grade_letter || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {c.examAttempts?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontFamily: 'var(--f-mono)', color: 'var(--ink-4)', letterSpacing: '0.08em', marginBottom: 6 }}>EXAMS</div>
              {c.examAttempts.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, fontSize: 12.5, color: 'var(--ink-2)', padding: '5px 0', borderTop: i ? '1px solid var(--rule)' : 'none', alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>{e.title} <span style={{ color: 'var(--ink-4)', fontSize: 11, textTransform: 'capitalize' }}>· {e.exam_type}</span></span>
                  <span className="mono" style={{ fontSize: 11 }}>{e.score != null ? `${e.score} pts` : '—'}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: e.grade_letter ? 'var(--ink)' : 'var(--ink-4)', width: 22, textAlign: 'right' }}>
                    {e.grade_letter || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TranscriptView() {
  const { programId } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [graduation, setGraduation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cert, setCert] = useState(null);
  const [certLoading, setCertLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      progress.transcript(programId),
      progress.graduation(programId),
    ]).then(([t, g]) => { setData(t); setGraduation(g); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [programId]);

  if (loading) return <div className="loading-screen">Loading transcript…</div>;

  const { transcript } = data || {};
  const p = transcript?.program;
  const name = user?.full_name || p?.full_name || 'Student';

  return (
    <div className="app-shell">
      <Sidebar programId={programId} active="transcript" />
      <div className="main-content">
        <TopBar
          crumb="ACADEMIC RECORD"
          crumbHref="/dashboard"
          title="Transcript"
          actions={<button className="btn no-print" onClick={() => window.print()}><Icon name="upload" size={13} /> Download PDF</button>}
        />

        <div style={{ overflow: 'auto', flex: 1 }}>
          <div style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr 272px', gap: 28 }}>
            {/* Left: transcript rows */}
            <div>
              {/* Header — restrained, not huge */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: 2 }}>
                  {name}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                  {p?.degree_type} · {p?.field_of_study} · {p?.total_semesters} semesters
                </div>
              </div>

              {transcript?.semesters?.map((sem, si) => (
                <div key={sem.id} style={{ marginTop: si === 0 ? 0 : 32 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
                    <div className="kicker">{sem.title}</div>
                    {sem.gpa && (
                      <span className="pill" style={{ fontSize: 10 }}>GPA {sem.gpa}</span>
                    )}
                    <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 44px 56px 20px', fontSize: 10.5, color: 'var(--ink-4)', padding: '4px 0 6px', letterSpacing: '0.05em', fontFamily: 'var(--f-mono)' }}>
                    <span>CODE</span><span>COURSE</span><span>TYPE</span><span>CR</span><span>GRADE</span><span />
                  </div>
                  {sem.courses?.map((c) => (
                    <CourseRow key={c.code} c={c} />
                  ))}
                </div>
              ))}
            </div>

            {/* Right aside */}
            <aside className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
              <div className="card" style={{ padding: 20, textAlign: 'center' }}>
                <div className="kicker">Cumulative GPA</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 56, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 8 }}>
                  {p?.gpa > 0 ? parseFloat(p.gpa).toFixed(2) : '—'}
                </div>
              </div>

              {graduation && (
                <div className="card" style={{ padding: 14, borderColor: graduation.eligible ? 'var(--sage)' : 'var(--rule)' }}>
                  <div className="kicker" style={{ marginBottom: 8, color: graduation.eligible ? 'var(--sage)' : 'var(--ink-3)' }}>
                    {graduation.eligible ? 'Graduation eligible' : 'Graduation progress'}
                  </div>
                  {graduation.eligible ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sage)' }}>
                        <Icon name="trophy" size={16} style={{ color: 'var(--amber)' }} />
                        All requirements met
                      </div>
                      {cert ? (
                        <Link
                          to={`/certificate/${cert.verification_code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--sage)', textDecoration: 'none', fontWeight: 500 }}
                        >
                          <Icon name="award" size={13} />
                          View certificate
                        </Link>
                      ) : (
                        <button
                          className="btn"
                          style={{ fontSize: 12, padding: '6px 12px' }}
                          disabled={certLoading}
                          onClick={() => {
                            setCertLoading(true);
                            progress.issueCertificate(programId)
                              .then(({ certificate }) => setCert(certificate))
                              .catch(() => {})
                              .finally(() => setCertLoading(false));
                          }}
                        >
                          <Icon name="award" size={13} />
                          {certLoading ? 'Issuing…' : 'Get certificate'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {graduation.requirements?.filter(r => !r.met).slice(0, 5).map((r, i) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--ink-3)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--amber)', flexShrink: 0 }}>○</span>
                          <span>{r.courseCode}: {!r.hasSubmission ? 'needs submission · ' : ''}{!r.hasLessonProgress ? `${r.lessonVisitPercent || 0}% lessons visited · ` : ''}{!r.hasExamAttempt ? 'needs exam' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {p && (
                <div className="card" style={{ padding: 14 }}>
                  <div className="kicker" style={{ marginBottom: 8 }}>Program</div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 4 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {p.degree_type} · {p.field_of_study}<br />
                    {p.total_semesters} semesters
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
