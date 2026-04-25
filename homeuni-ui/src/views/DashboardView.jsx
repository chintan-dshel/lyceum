import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { usePrograms } from '../hooks/useProgram.js';
import { useTelemetrySummary } from '../hooks/useTelemetry.js';
import { programs as programsApi, flashcards as flashcardsApi } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';
import Icon from '../components/ui/Icon.jsx';

export default function DashboardView() {
  const { user } = useAuth();
  const { programs, loading, refresh } = usePrograms();
  const { data: telemetry } = useTelemetrySummary();
  const navigate = useNavigate();
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    flashcardsApi.due().then(({ count }) => setDueCount(count || 0)).catch(() => {});
  }, []);

  const firstName = user?.full_name?.split(' ')[0] || 'there';

  const deleteProgram = useCallback(async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await programsApi.delete(id);
      refresh();
    } catch (err) {
      alert(`Could not delete: ${err.message}`);
    }
  }, [refresh]);

  if (loading) return <div className="loading-screen">Loading Lyceum…</div>;

  const activePrograms = programs.filter(p => ['active', 'generating', 'onboarding'].includes(p.status));
  const completedPrograms = programs.filter(p => p.status === 'graduated');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="app-shell">
      <Sidebar active="dashboard" />
      <div className="main-content">
        <TopBar
          crumb="HOME"
          title={`${greeting}, ${firstName}`}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {telemetry?.totals?.total_cost_usd > 0 && (
                <div style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'right', lineHeight: 1.4 }}>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 1 }}>Total AI cost</div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontWeight: 600, color: 'var(--ink-2)', fontSize: 13 }}>
                    ${parseFloat(telemetry.totals.total_cost_usd).toFixed(4)}
                  </div>
                </div>
              )}
              <button className="btn primary" onClick={() => navigate('/onboarding')}>
                <Icon name="plus" size={13} /> New program
              </button>
            </div>
          }
        />

        <div className="page-content">
          {dueCount > 0 && (
            <div
              onClick={() => navigate('/flashcards')}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', marginBottom: 24,
                background: 'oklch(95% 0.06 265)', border: '1px solid oklch(82% 0.1 265)',
                borderRadius: 12, cursor: 'pointer', transition: 'box-shadow .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="sparkle" size={16} style={{ color: '#fff' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                  {dueCount} flashcard{dueCount !== 1 ? 's' : ''} due for review
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>
                  Spaced repetition keeps concepts fresh — takes just a few minutes.
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--indigo)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                Review now <Icon name="arrow" size={12} style={{ color: 'var(--indigo)' }} />
              </div>
            </div>
          )}

          {programs.length === 0 ? (
            <EmptyState navigate={navigate} />
          ) : (
            <>
              {activePrograms.length > 0 && (
                <section style={{ marginBottom: 36 }}>
                  <div className="kicker" style={{ marginBottom: 14 }}>Active programs</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                    {activePrograms.map(p => (
                      <ProgramCard key={p.id} program={p} onDelete={deleteProgram} navigate={navigate} />
                    ))}
                  </div>
                </section>
              )}

              {completedPrograms.length > 0 && (
                <section>
                  <div className="kicker" style={{ marginBottom: 14 }}>Completed</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                    {completedPrograms.map(p => (
                      <ProgramCard key={p.id} program={p} onDelete={deleteProgram} navigate={navigate} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgramCard({ program, onDelete, navigate }) {
  const isClickable = program.status === 'active';
  const isGenerating = program.status === 'generating';

  const hueMap = {
    Physics: 265, Mathematics: 155, 'Computer Science': 155,
    Philosophy: 50, Economics: 20, Biology: 145,
  };
  const hue = hueMap[program.field_of_study] || 265;

  const prog = program.progress_pct ?? 0;

  const statusColors = {
    active:     { bg: 'var(--sage-soft)',   fg: 'var(--sage)' },
    generating: { bg: 'var(--amber-soft)',  fg: 'oklch(48% 0.13 75)' },
    graduated:  { bg: 'var(--indigo-soft)', fg: 'var(--indigo)' },
    onboarding: { bg: 'var(--paper-3)',     fg: 'var(--ink-3)' },
  };
  const sc = statusColors[program.status] || statusColors.onboarding;

  return (
    <div
      className="card"
      style={{
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        cursor: isClickable ? 'pointer' : 'default',
        opacity: program.status === 'onboarding' ? 0.65 : 1,
        transition: 'box-shadow .15s',
      }}
      onClick={() => isClickable && navigate(`/program/${program.id}/semester/1`)}
      onMouseEnter={e => isClickable && (e.currentTarget.style.boxShadow = 'var(--shadow-2)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: `oklch(92% 0.05 ${hue})`,
          color: `oklch(35% 0.12 ${hue})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
        }}>
          {program.degree_type?.slice(0, 2).toUpperCase() || 'PG'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="kicker" style={{ fontSize: 10, marginBottom: 3 }}>
            {program.degree_type} · {program.field_of_study}
          </div>
          <div className="display" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: 'var(--ink)' }}>
            {program.title}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{
            fontSize: 10.5, padding: '3px 9px', borderRadius: 99, fontWeight: 500,
            background: sc.bg, color: sc.fg,
          }}>
            {isGenerating ? (
              <><span className="spinner" style={{ width: 8, height: 8, marginRight: 5, verticalAlign: 'middle', borderTopColor: sc.fg }} />Generating…</>
            ) : (
              { active: 'Active', generating: 'Generating', graduated: 'Graduated', onboarding: 'Incomplete' }[program.status] || program.status
            )}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDelete(program.id, program.title); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', fontSize: 14, lineHeight: 1, padding: '2px 4px' }}
            title="Delete"
          >×</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--ink-2)' }}>
        {program.gpa > 0 && (
          <div>
            <div className="kicker" style={{ fontSize: 9.5, marginBottom: 2 }}>GPA</div>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>{program.gpa.toFixed(2)}</div>
          </div>
        )}
        <div>
          <div className="kicker" style={{ fontSize: 9.5, marginBottom: 2 }}>Semesters</div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>{program.total_semesters}</div>
        </div>
        {program.credits_completed != null && (
          <div>
            <div className="kicker" style={{ fontSize: 9.5, marginBottom: 2 }}>Credits</div>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>{program.credits_completed}</div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {prog > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)', marginBottom: 5 }}>
            <span>Overall progress</span>
            <span className="mono">{prog}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${prog}%`, background: `oklch(40% 0.12 ${hue})` }} />
          </div>
        </div>
      )}

      {isClickable && (
        <button
          className="btn"
          style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
          onClick={e => { e.stopPropagation(); navigate(`/program/${program.id}/semester/1`); }}
        >
          Continue <Icon name="arrow" size={12} />
        </button>
      )}
    </div>
  );
}

function EmptyState({ navigate }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 480, gap: 20, textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: 'var(--indigo-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="book" size={32} style={{ color: 'var(--indigo)' }} />
      </div>
      <div>
        <div className="display" style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
          Start your university journey
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink-3)', maxWidth: 380 }}>
          Tell the advisor what you want to study. Lyceum will build a full university curriculum — courses, lectures, assignments, grades.
        </div>
      </div>
      <button className="btn primary" style={{ padding: '10px 24px', fontSize: 14 }} onClick={() => navigate('/onboarding')}>
        <Icon name="sparkle" size={14} /> Create my program
      </button>
    </div>
  );
}
