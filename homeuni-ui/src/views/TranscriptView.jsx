import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { progress } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';
import Icon from '../components/ui/Icon.jsx';

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
          title="Your transcript"
          actions={<button className="btn"><Icon name="upload" size={13} /> Download PDF</button>}
        />

        <div style={{ overflow: 'auto', flex: 1 }}>
          <div style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 28 }}>
            {/* Left: transcript rows */}
            <div>
              <div className="serif" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--ink-2)', marginBottom: 4 }}>
                {name} <span style={{ color: 'var(--ink-4)' }}>· {p?.degree_type} {p?.field_of_study}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 28 }}>
                {p?.title} · {p?.total_semesters} semesters
              </div>

              {transcript?.semesters?.map((sem, si) => (
                <div key={sem.id} style={{ marginTop: si === 0 ? 0 : 28 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 10 }}>
                    <div className="kicker">{sem.title}</div>
                    {sem.gpa && (
                      <span className="pill" style={{ fontSize: 10 }}>GPA {sem.gpa}</span>
                    )}
                    <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px 50px 60px', fontSize: 11, color: 'var(--ink-3)', padding: '4px 0 8px', letterSpacing: '0.04em', fontFamily: 'var(--f-mono)' }}>
                    <span>CODE</span><span>COURSE</span><span>TYPE</span><span>CR</span><span>GRADE</span>
                  </div>
                  {sem.courses?.map((c, ci) => (
                    <div key={c.code} style={{
                      display: 'grid', gridTemplateColumns: '80px 1fr 120px 50px 60px',
                      padding: '11px 0', borderTop: '1px solid var(--rule)', alignItems: 'center', fontSize: 13,
                    }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.code}</span>
                      <span className="serif" style={{ fontSize: 14 }}>{c.title}</span>
                      <span style={{ fontSize: 12, color: 'var(--ink-2)', textTransform: 'capitalize' }}>{c.course_type}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{c.credit_hours}</span>
                      <span style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 14, color: c.grade_letter ? 'var(--ink)' : 'var(--ink-4)' }}>
                        {c.grade_letter || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Right aside */}
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
              {/* GPA card */}
              <div className="card" style={{ padding: 20, textAlign: 'center' }}>
                <div className="kicker">Cumulative GPA</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 56, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 8 }}>
                  {p?.gpa > 0 ? p.gpa.toFixed(2) : '—'}
                </div>
              </div>

              {/* Graduation status */}
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

              {/* Program info */}
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
