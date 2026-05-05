import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useAssignment } from '../hooks/useAssessment.js';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';
import Icon from '../components/ui/Icon.jsx';

export default function AssignmentView() {
  const { programId, assignmentId } = useParams();
  const { assignment, submissions, loading, submitting, submit } = useAssignment(assignmentId);
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  if (loading) return <div className="loading-screen">Loading assignment…</div>;
  if (!assignment) return <div className="loading-screen">Assignment not found</div>;

  async function handleSubmit() {
    setSubmitError(null);
    try {
      const feedback = await submit(text);
      if (feedback) { setResult(feedback); setText(''); }
    } catch (err) {
      setSubmitError(err.message || 'Grading failed — please try again.');
    }
  }

  const latestSubmission = submissions[0];
  const displayResult = result || (latestSubmission ? {
    score: latestSubmission.score,
    gradeLetter: latestSubmission.grade_letter,
    feedbackText: latestSubmission.feedback_text,
    rubricScores: latestSubmission.rubric_scores,
  } : null);

  const attemptNumber = submissions.length + 1;

  return (
    <div className="app-shell">
      <Sidebar programId={programId} active="assign" />
      <div className="main-content">
        <TopBar
          crumb={`ASSIGNMENT · ${assignment.assignment_type?.toUpperCase()}`}
          crumbHref={`/program/${programId}/course/${assignment.course_id}`}
          title={assignment.title}
          actions={<button className="btn"><Icon name="upload" size={13} /> Export</button>}
        />
        <div style={{ overflow: 'auto', flex: 1 }}>
          <div style={{ padding: '22px 28px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, alignItems: 'flex-start' }}>
            {/* Left: prompt + submission */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* The task */}
              <div className="card" style={{ padding: 24 }}>
                <div className="kicker" style={{ marginBottom: 6 }}>The task</div>
                <p className="serif" style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.4, marginBottom: 16 }}>
                  {assignment.prompt}
                </p>
                {assignment.rubric?.length > 0 && (
                  <>
                    <div className="kicker" style={{ marginBottom: 8 }}>Rubric</div>
                    {assignment.rubric.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--rule)' : 'none', alignItems: 'center' }}>
                        <Icon name="check" size={14} style={{ color: 'var(--sage)', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, flex: 1 }}>{r.criterion}</span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{r.max_points} pts</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Submission area */}
              <div className="card" style={{ padding: 20 }}>
                <div className="kicker" style={{ marginBottom: 4 }}>
                  Your response {submissions.length > 0 && `· attempt ${attemptNumber}`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 14 }}>
                  Submit as many times as you like — each submission gets fresh feedback.
                </div>
                <textarea
                  id="answer"
                  name="answer"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Write your response here…"
                  style={{
                    width: '100%', minHeight: 180,
                    padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--rule)',
                    fontSize: 14, fontFamily: 'var(--f-text)', color: 'var(--ink)',
                    background: 'var(--paper-2)', outline: 'none', resize: 'vertical',
                    lineHeight: 1.6,
                  }}
                />
                {submitError && (
                  <div style={{ color: 'var(--rose)', fontSize: 12.5, marginTop: 8 }}>{submitError}</div>
                )}
                <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                  <button
                    className="btn primary"
                    onClick={handleSubmit}
                    disabled={!text.trim() || submitting}
                  >
                    {submitting
                      ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Grading…</>
                      : <><Icon name="send" size={13} /> Submit for feedback</>
                    }
                  </button>
                </div>
              </div>
            </div>

            {/* Right: feedback */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {displayResult ? (
                <>
                  {/* Score */}
                  <div className="card" style={{ padding: 20, textAlign: 'center' }}>
                    <div className="kicker" style={{ marginBottom: 4 }}>Score</div>
                    <div style={{ fontFamily: 'var(--f-display)', fontSize: 64, fontWeight: 600, letterSpacing: '-0.04em', color: 'var(--sage)', lineHeight: 1, marginTop: 6 }}>
                      {displayResult.gradeLetter || '—'}
                    </div>
                    {displayResult.score != null && (
                      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>
                        {displayResult.score} / {assignment.max_score} points
                      </div>
                    )}
                  </div>

                  {/* Professor feedback */}
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 11, background: 'radial-gradient(circle at 35% 35%, oklch(80% 0.08 265), var(--indigo))' }} />
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Prof. AI's feedback</div>
                    </div>
                    <div className="serif" style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                      "{displayResult.feedbackText}"
                    </div>
                  </div>

                  {/* Rubric breakdown */}
                  {displayResult.rubricScores?.length > 0 && (
                    <div className="card" style={{ padding: 14 }}>
                      <div className="kicker" style={{ marginBottom: 10 }}>Rubric breakdown</div>
                      {displayResult.rubricScores.map((r, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--rule)' : 'none', alignItems: 'center', fontSize: 12.5 }}>
                          <Icon name={r.score >= r.max_points * 0.7 ? 'check' : 'x'} size={13}
                            style={{ color: r.score >= r.max_points * 0.7 ? 'var(--sage)' : 'var(--rose)', flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>{r.criterion}</span>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{r.score}/{r.max_points}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {submissions.length > 1 && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-4)', textAlign: 'center' }}>
                      {submissions.length} total submissions
                    </div>
                  )}
                </>
              ) : (
                <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--indigo-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <Icon name="sparkle" size={20} style={{ color: 'var(--indigo)' }} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                    Submit your response and Professor AI will give you detailed, rubric-driven feedback.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
