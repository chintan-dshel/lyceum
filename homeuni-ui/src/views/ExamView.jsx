import { useParams, Link } from 'react-router-dom';
import { useExam } from '../hooks/useAssessment.js';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';

const Q_CARD = {
  background: 'var(--paper)', border: '1px solid var(--rule)',
  borderRadius: 12, padding: '20px 24px', marginBottom: 16,
};

const OPTION_BASE = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
  border: '1px solid var(--rule)', marginBottom: 8,
  fontSize: 14, lineHeight: 1.5, color: 'var(--ink)',
  transition: 'border-color 0.12s, background 0.12s',
  userSelect: 'none',
};

const OPTION_SELECTED = {
  ...OPTION_BASE,
  background: 'var(--indigo-soft)',
  borderColor: 'var(--indigo)',
};

export default function ExamView() {
  const { programId, examId } = useParams();
  const { exam, attempts, currentAttempt, answers, loading, submitting, result, startAttempt, setAnswer, submitExam } = useExam(examId);

  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!exam) return <div className="loading-screen">Exam not found</div>;

  const crumbHref = `/program/${programId}/course/${exam.course_id}`;
  const lastAttempt = attempts[0];

  if (result) {
    return <ResultView result={result} exam={exam} programId={programId} crumbHref={crumbHref} attempts={attempts} onRetake={startAttempt} />;
  }

  if (!currentAttempt && lastAttempt?.submitted_at) {
    return (
      <ResultView
        result={{ score: lastAttempt.score, gradeLetter: lastAttempt.grade_letter, feedback: lastAttempt.feedback }}
        exam={exam}
        programId={programId}
        crumbHref={crumbHref}
        attempts={attempts}
        onRetake={startAttempt}
      />
    );
  }

  if (!currentAttempt) {
    return (
      <div className="app-shell">
        <Sidebar programId={programId} />
        <div className="main-content">
          <TopBar
            crumb={`${exam.exam_type?.toUpperCase() || 'EXAM'}`}
            crumbHref={crumbHref}
            title={exam.title}
          />
          <div style={{ overflow: 'auto', flex: 1, padding: '32px 28px', maxWidth: 640 }}>
            <div style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Knowledge Check · {exam.exam_type}
            </div>
            <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 600, marginBottom: 20, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              {exam.title}
            </h1>
            <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)' }}>
                {exam.instructions || 'Take your time — this is here to help you identify what you know well and what to revisit.'}
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 20, fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)' }}>
                <span>{exam.questions?.length} questions</span>
                <span>{exam.max_score} pts</span>
                {attempts.length > 0 && <span>Attempted {attempts.length}×</span>}
              </div>
            </div>
            <button
              onClick={startAttempt}
              style={{
                background: 'var(--indigo)', color: 'var(--paper)', border: 'none',
                borderRadius: 10, padding: '13px 28px', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', letterSpacing: '-0.01em',
              }}
            >
              {attempts.length > 0 ? 'Retake Knowledge Check' : 'Start Knowledge Check'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar programId={programId} />
      <div className="main-content">
        <TopBar
          crumb={`${exam.exam_type?.toUpperCase() || 'EXAM'}`}
          crumbHref={crumbHref}
          title={exam.title}
          actions={
            <button
              onClick={submitExam}
              disabled={submitting}
              style={{
                background: 'var(--indigo)', color: 'var(--paper)', border: 'none',
                borderRadius: 8, padding: '7px 18px', fontSize: 13, fontWeight: 600,
                cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Grading…' : 'Submit Answers'}
            </button>
          }
        />
        <div style={{ overflow: 'auto', flex: 1, padding: '28px 28px', maxWidth: 760 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 24 }}>
            Answer at your own pace. Submit when you're ready.
          </div>

          {exam.questions?.map((q, i) => (
            <div key={q.id} style={Q_CARD}>
              <div style={{ fontSize: 10.5, fontFamily: 'var(--f-mono)', color: 'var(--ink-4)', letterSpacing: '0.08em', marginBottom: 8 }}>
                QUESTION {i + 1} · {q.points} PTS
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.55, marginBottom: 16 }}>
                {q.question}
              </div>

              {q.type === 'multiple_choice' && (
                <div>
                  {q.options?.map((opt, j) => {
                    const selected = answers[q.id] === opt;
                    return (
                      <div
                        key={j}
                        style={selected ? OPTION_SELECTED : OPTION_BASE}
                        onClick={() => setAnswer(q.id, opt)}
                        role="radio"
                        aria-checked={selected}
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && setAnswer(q.id, opt)}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${selected ? 'var(--indigo)' : 'var(--ink-4)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: selected ? 'var(--indigo)' : 'transparent',
                          transition: 'all 0.12s',
                        }}>
                          {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--paper)' }} />}
                        </div>
                        <span>{opt}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {(q.type === 'short_answer' || q.type === 'essay') && (
                <textarea
                  value={answers[q.id] || ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  placeholder="Your answer…"
                  rows={q.type === 'essay' ? 6 : 3}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 14px', borderRadius: 8,
                    border: '1px solid var(--rule)',
                    fontSize: 14, fontFamily: 'var(--f-text)', color: 'var(--ink)',
                    background: 'var(--paper-2)', outline: 'none', resize: 'vertical',
                    lineHeight: 1.6,
                  }}
                />
              )}
            </div>
          ))}

          <div style={{ padding: '8px 0 32px', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={submitExam}
              disabled={submitting}
              style={{
                background: 'var(--indigo)', color: 'var(--paper)', border: 'none',
                borderRadius: 10, padding: '13px 36px', fontSize: 14, fontWeight: 600,
                cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Grading your answers…' : 'Submit Answers'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultView({ result, exam, programId, crumbHref, attempts, onRetake }) {
  const gradeColors = { A: 'var(--sage)', B: 'oklch(48% 0.13 200)', C: 'var(--amber)', D: 'var(--amber)', F: 'var(--rose)' };
  const gradeColor = gradeColors[result.gradeLetter?.[0]] || 'var(--ink-2)';

  return (
    <div className="app-shell">
      <Sidebar programId={programId} />
      <div className="main-content">
        <TopBar
          crumb={`${exam.exam_type?.toUpperCase() || 'EXAM'}`}
          crumbHref={crumbHref}
          title={`${exam.title} — Results`}
        />
        <div style={{ overflow: 'auto', flex: 1, padding: '28px 28px', maxWidth: 720 }}>
          <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 16, padding: '36px 28px', textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 72, fontWeight: 700, color: gradeColor, lineHeight: 1, marginBottom: 8 }}>
              {result.gradeLetter || '—'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
              {result.score}/{exam.max_score}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)' }}>
              Attempt {attempts.length}
            </div>
          </div>

          {result.feedback?.length > 0 && (
            <div style={{ background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
              <div style={{ fontSize: 10.5, fontFamily: 'var(--f-mono)', color: 'var(--ink-4)', letterSpacing: '0.08em', marginBottom: 14 }}>
                QUESTION BREAKDOWN
              </div>
              {result.feedback.map((f, i) => (
                <div key={i} style={{ padding: '12px 0', borderTop: i ? '1px solid var(--rule)' : 'none', fontSize: 13.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>Question {i + 1}</span>
                    <span style={{
                      fontFamily: 'var(--f-mono)', fontSize: 12,
                      color: f.score === f.max_points ? 'var(--sage)' : 'var(--amber)',
                    }}>
                      {f.score}/{f.max_points}
                    </span>
                  </div>
                  <div style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}>{f.explanation}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              onClick={onRetake}
              style={{
                background: 'var(--indigo)', color: 'var(--paper)', border: 'none',
                borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Retake
            </button>
            <Link
              to="/dashboard"
              style={{
                display: 'inline-flex', alignItems: 'center',
                background: 'transparent', color: 'var(--ink-2)',
                border: '1px solid var(--rule)', borderRadius: 10, padding: '12px 20px',
                fontSize: 14, textDecoration: 'none',
              }}
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
