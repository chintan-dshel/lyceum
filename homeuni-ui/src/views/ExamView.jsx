import { useParams, Link } from 'react-router-dom';
import { useExam } from '../hooks/useAssessment.js';
import Sidebar from '../components/Sidebar.jsx';

export default function ExamView() {
  const { programId, examId } = useParams();
  const { exam, attempts, currentAttempt, answers, loading, submitting, result, startAttempt, setAnswer, submitExam } = useExam(examId);

  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!exam) return <div className="loading-screen">Exam not found</div>;

  const lastAttempt = attempts[0];

  // Show results if just submitted
  if (result) {
    return <ResultView result={result} exam={exam} programId={programId} attempts={attempts} onRetake={startAttempt} />;
  }

  // Show previous result if no active attempt
  if (!currentAttempt && lastAttempt?.submitted_at) {
    return (
      <ResultView
        result={{ score: lastAttempt.score, gradeLetter: lastAttempt.grade_letter, feedback: lastAttempt.feedback }}
        exam={exam}
        programId={programId}
        attempts={attempts}
        onRetake={startAttempt}
      />
    );
  }

  // Not started yet
  if (!currentAttempt) {
    return (
      <div className="app-shell">
        <Sidebar programId={programId} />
        <div className="main-content">
          <div className="topbar">
            <div className="topbar-breadcrumb">
              <Link to="/dashboard">Dashboard</Link>
              <span className="sep">/</span>
              <span className="current">{exam.title}</span>
            </div>
          </div>
          <div className="page-content" style={{ maxWidth: 640 }}>
            <div className="page-header">
              <div style={{ fontSize: '0.75rem', color: 'var(--amber-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Knowledge Check · {exam.exam_type}
              </div>
              <h1>{exam.title}</h1>
            </div>
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ fontSize: '0.875rem', lineHeight: 1.7, color: 'var(--gray-700)' }}>
                {exam.instructions || "Take your time — this is here to help you identify what you know well and what to revisit. There's no pressure."}
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 24, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>{exam.questions?.length} questions</span>
                <span>{exam.max_score} points</span>
                {attempts.length > 0 && <span>Attempted {attempts.length}x</span>}
              </div>
            </div>
            <button className="btn btn-accent btn-lg" onClick={startAttempt}>
              {attempts.length > 0 ? 'Retake Knowledge Check' : 'Start Knowledge Check'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active attempt
  return (
    <div className="app-shell">
      <Sidebar programId={programId} />
      <div className="main-content">
        <div className="topbar">
          <div className="topbar-breadcrumb">
            <span className="current">{exam.title}</span>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-accent" onClick={submitExam} disabled={submitting}>
              {submitting ? 'Grading...' : 'Submit Answers'}
            </button>
          </div>
        </div>
        <div className="page-content" style={{ maxWidth: 760 }}>
          <div className="page-header">
            <h1>{exam.title}</h1>
            <p className="subtitle">Answer at your own pace. Submit when you're ready.</p>
          </div>

          {exam.questions?.map((q, i) => (
            <div key={q.id} className="exam-question">
              <div className="exam-question-number">Question {i + 1} · {q.points} points</div>
              <div className="exam-question-text">{q.question}</div>
              {q.type === 'multiple_choice' && (
                <div className="exam-options">
                  {q.options?.map((opt, j) => (
                    <div
                      key={j}
                      className={`exam-option ${answers[q.id] === opt ? 'selected' : ''}`}
                      onClick={() => setAnswer(q.id, opt)}
                    >
                      <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid', borderColor: answers[q.id] === opt ? 'var(--navy-600)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {answers[q.id] === opt && <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--navy-600)' }} />}
                      </div>
                      {opt}
                    </div>
                  ))}
                </div>
              )}
              {(q.type === 'short_answer' || q.type === 'essay') && (
                <textarea
                  id="exam-answer"
                  name="exam-answer"
                  className="form-input"
                  value={answers[q.id] || ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  placeholder="Your answer..."
                  rows={q.type === 'essay' ? 6 : 3}
                  style={{ marginTop: 8 }}
                />
              )}
            </div>
          ))}

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button className="btn btn-accent btn-lg" onClick={submitExam} disabled={submitting}>
              {submitting ? 'Grading your answers...' : 'Submit Answers'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultView({ result, exam, programId, attempts, onRetake }) {
  return (
    <div className="app-shell">
      <Sidebar programId={programId} />
      <div className="main-content">
        <div className="topbar">
          <div className="topbar-breadcrumb">
            <Link to="/dashboard">Dashboard</Link>
            <span className="sep">/</span>
            <span className="current">{exam.title} — Results</span>
          </div>
        </div>
        <div className="page-content" style={{ maxWidth: 720 }}>
          <div className="page-header">
            <h1>Knowledge Check Complete</h1>
          </div>

          <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 24 }}>
            <div className={`grade-chip grade-${result.gradeLetter}`} style={{ width: 64, height: 64, fontSize: '1.8rem', margin: '0 auto 16px' }}>
              {result.gradeLetter}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--navy-800)' }}>
              {result.score}/{exam.max_score}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              Attempt {attempts.length}
            </div>
          </div>

          {result.feedback?.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-title" style={{ marginBottom: 16 }}>Question Breakdown</div>
              {result.feedback.map((f, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontWeight: 500, color: 'var(--navy-800)' }}>Question {i + 1}</div>
                    <div style={{ color: f.score === f.max_points ? 'var(--green-600)' : 'var(--amber-600)' }}>
                      {f.score}/{f.max_points}
                    </div>
                  </div>
                  <div style={{ color: 'var(--gray-700)', lineHeight: 1.6 }}>{f.explanation}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost" onClick={onRetake}>Retake</button>
            <Link to={`/dashboard`} className="btn btn-primary">Back to Dashboard</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
