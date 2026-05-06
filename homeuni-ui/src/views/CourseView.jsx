import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { curriculum } from '../lib/api.js';
import { useAssignments, useExams } from '../hooks/useAssessment.js';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';
import Icon from '../components/ui/Icon.jsx';

const MAX_ASSIGNMENTS = 2;
const MAX_EXAMS = 2;

export default function CourseView() {
  const { programId, courseId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [lessonList, setLessonList] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('lessons');
  const [loading, setLoading] = useState(true);
  const [generatingAssignment, setGeneratingAssignment] = useState(false);
  const [generatingExam, setGeneratingExam] = useState(false);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);
  const assignmentPollRef = useRef(null);
  const examPollRef = useRef(null);

  const { assignments, refetch: refetchAssignments } = useAssignments(courseId);
  const { exams, refetch: refetchExams } = useExams(courseId);

  const handleGenerateNextAssignment = useCallback(async () => {
    if (generatingAssignment || assignments.length >= MAX_ASSIGNMENTS) return;
    setGeneratingAssignment(true);
    try {
      await curriculum.nextAssignment(courseId);
      // Poll until new assignment appears
      const poll = () => {
        assignmentPollRef.current = setTimeout(async () => {
          refetchAssignments();
          // Keep polling until count increases
          assignmentPollRef.current = null;
        }, 4000);
      };
      // Simple approach: poll every 4s for up to 60s
      let attempts = 0;
      const prevCount = assignments.length;
      const interval = setInterval(() => {
        refetchAssignments();
        attempts++;
        if (attempts > 15) { clearInterval(interval); setGeneratingAssignment(false); }
      }, 4000);
      // Stop polling when count increases
      const check = setInterval(() => {
        if (assignments.length > prevCount || attempts > 15) {
          clearInterval(interval);
          clearInterval(check);
          setGeneratingAssignment(false);
        }
      }, 500);
    } catch {
      setGeneratingAssignment(false);
    }
  }, [courseId, assignments.length, generatingAssignment, refetchAssignments]);

  const handleGenerateNextExam = useCallback(async () => {
    if (generatingExam || exams.length >= MAX_EXAMS) return;
    setGeneratingExam(true);
    try {
      await curriculum.nextExam(courseId);
      let attempts = 0;
      const prevCount = exams.length;
      const interval = setInterval(() => {
        refetchExams();
        attempts++;
        if (attempts > 15) { clearInterval(interval); setGeneratingExam(false); }
      }, 4000);
      const check = setInterval(() => {
        if (exams.length > prevCount || attempts > 15) {
          clearInterval(interval);
          clearInterval(check);
          setGeneratingExam(false);
        }
      }, 500);
    } catch {
      setGeneratingExam(false);
    }
  }, [courseId, exams.length, generatingExam, refetchExams]);

  async function fetchCourse() {
    try {
      const { course, lessons, generating: gen } = await curriculum.getCourse(courseId);
      if (!mountedRef.current) return;
      setCourse(course);
      setLessonList(lessons);
      setGenerating(!!gen);
      return { lessons, generating: !!gen };
    } catch { return null; }
  }

  useEffect(() => {
    mountedRef.current = true;
    fetchCourse().finally(() => { if (mountedRef.current) setLoading(false); });
    return () => { mountedRef.current = false; clearTimeout(pollRef.current); };
  }, [courseId]);

  useEffect(() => {
    if (!generating) { clearTimeout(pollRef.current); return; }
    function scheduleNext() {
      pollRef.current = setTimeout(async () => {
        const result = await fetchCourse();
        if (mountedRef.current && result?.generating) scheduleNext();
      }, 3000);
    }
    scheduleNext();
    return () => clearTimeout(pollRef.current);
  }, [generating, courseId]);

  if (loading) return <div className="loading-screen">Loading course…</div>;
  if (!course) return <div className="loading-screen">Course not found</div>;

  const completedLessons = lessonList.filter(l => l.status === 'complete').length;
  const prog = lessonList.length ? Math.round((completedLessons / lessonList.length) * 100) : 0;

  const tabs = [
    { key: 'lessons',     label: `Lessons (${lessonList.length})` },
    { key: 'assignments', label: `Assignments (${assignments.length})` },
    { key: 'exams',       label: `Exams (${exams.length})` },
  ];

  return (
    <div className="app-shell">
      <Sidebar programId={programId} active="courses" />
      <div className="main-content">
        <TopBar
          crumb={`${course.code} · SEMESTER ${course.semester_number}`}
          crumbHref={`/program/${programId}/semester/${course.semester_number}`}
          title={course.title}
          actions={
            lessonList.length > 0 && (
              <button
                className="btn primary"
                onClick={() => {
                  const next = lessonList.find(l => l.status !== 'complete') || lessonList[0];
                  if (next) navigate(`/program/${programId}/lesson/${next.id}`);
                }}
              >
                <Icon name="play" size={13} /> {completedLessons > 0 ? 'Resume' : 'Start'} course
              </button>
            )
          }
        />

        <div style={{ overflow: 'auto', flex: 1 }}>
          {/* Hero / editorial header */}
          <div style={{ padding: '28px 32px 22px', borderBottom: '1px solid var(--rule)' }}>
            <div className="kicker">{course.code} · {course.course_type?.toUpperCase()}</div>
            <div className="serif" style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: 8, maxWidth: 680 }}>
              {course.description || course.title}
            </div>
            <div style={{ display: 'flex', gap: 28, marginTop: 18, fontSize: 13, color: 'var(--ink-2)', flexWrap: 'wrap' }}>
              <MetaStat label="Professor" value="AI" />
              <MetaStat label="Lessons" value={lessonList.length} />
              <MetaStat label="Completion" value={`${prog}%`} highlight={prog > 0} />
              {course.estimated_hours && <MetaStat label="Est. hours" value={course.estimated_hours} />}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', padding: '24px 32px', gap: 28 }}>
            <div>
              {/* Learning objectives */}
              {course.learning_objectives?.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <div className="kicker" style={{ marginBottom: 8 }}>What you'll learn</div>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {course.learning_objectives.map((obj, i) => (
                      <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                        <Icon name="check" size={14} style={{ color: 'var(--sage)', flexShrink: 0, marginTop: 2 }} />
                        {obj}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Generating banner */}
              {generating && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'var(--amber-soft)', border: '1px solid oklch(85% 0.06 75)',
                  borderRadius: 10, padding: '12px 16px', marginBottom: 20,
                  fontSize: 13, color: 'oklch(40% 0.1 75)',
                }}>
                  <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'oklch(48% 0.13 75)' }} />
                  Preparing lessons — updates in a moment.
                </div>
              )}

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--rule)', marginBottom: 20 }}>
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    style={{
                      padding: '8px 16px', border: 'none', background: 'transparent',
                      fontSize: 13, fontWeight: activeTab === t.key ? 600 : 400,
                      color: activeTab === t.key ? 'var(--ink)' : 'var(--ink-3)',
                      borderBottom: `2px solid ${activeTab === t.key ? 'var(--ink)' : 'transparent'}`,
                      cursor: 'pointer', transition: 'all .1s',
                    }}
                  >{t.label}</button>
                ))}
              </div>

              {/* Lessons */}
              {activeTab === 'lessons' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {lessonList.length === 0 && !generating && (
                    <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '20px 0' }}>No lessons yet.</div>
                  )}
                  {lessonList.map(lesson => {
                    const st = lesson.status || 'not_started';
                    const dotColor = st === 'complete' ? 'var(--sage)' : st === 'in_progress' ? 'var(--indigo)' : '#fff';
                    const dotBorder = st === 'not_started' ? '1.5px solid var(--rule-strong)' : 'none';
                    const statusLabel = st === 'complete' ? 'Complete' : st === 'in_progress' ? 'In Progress' : 'Not Started';
                    const statusColor = st === 'complete' ? 'var(--sage)' : st === 'in_progress' ? 'var(--indigo)' : 'var(--ink-4)';
                    return (
                      <Link
                        key={lesson.id}
                        to={`/program/${programId}/lesson/${lesson.id}`}
                        style={{
                          display: 'grid', gridTemplateColumns: '50px 20px 1fr auto',
                          alignItems: 'center', gap: 12,
                          padding: '13px 0', borderTop: '1px solid var(--rule)',
                          textDecoration: 'none', color: 'inherit',
                        }}
                      >
                        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>
                          LEC {String(lesson.number).padStart(2, '0')}
                        </span>
                        <div style={{
                          width: 10, height: 10, borderRadius: 5,
                          background: dotColor, border: dotBorder,
                        }} />
                        <div>
                          <div className="serif" style={{ fontSize: 15, color: st === 'complete' ? 'var(--ink-3)' : 'var(--ink)' }}>{lesson.title}</div>
                          {lesson.summary && (
                            <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 2 }}>
                              {lesson.summary.slice(0, 110)}{lesson.summary.length > 110 ? '…' : ''}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="kicker" style={{ color: statusColor }}>{statusLabel}</span>
                          {lesson.estimated_minutes && (
                            <span style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--f-mono)' }}>
                              {lesson.estimated_minutes}m
                            </span>
                          )}
                          <Icon name="chevron" size={13} style={{ color: 'var(--ink-4)' }} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Assignments */}
              {activeTab === 'assignments' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {assignments.map(a => (
                    <Link
                      key={a.id}
                      to={`/program/${programId}/assignment/${a.id}`}
                      className="card"
                      style={{ textDecoration: 'none', padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}
                    >
                      <Icon name="file" size={16} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{a.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{a.assignment_type}</div>
                      </div>
                      {a.grade_letter && (
                        <span style={{
                          fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 16,
                          color: 'var(--sage)', background: 'var(--sage-soft)',
                          padding: '4px 10px', borderRadius: 8,
                        }}>{a.grade_letter}</span>
                      )}
                      <Icon name="chevron" size={13} style={{ color: 'var(--ink-4)' }} />
                    </Link>
                  ))}
                  {assignments.length < MAX_ASSIGNMENTS && (
                    <button
                      className="btn ghost"
                      onClick={handleGenerateNextAssignment}
                      disabled={generatingAssignment}
                      style={{ marginTop: 8, fontSize: 12.5, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      {generatingAssignment
                        ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Generating…</>
                        : <><Icon name="plus" size={12} /> {assignments.length === 0 ? 'Generate first assignment' : 'Generate next assignment'}</>
                      }
                    </button>
                  )}
                </div>
              )}

              {/* Exams */}
              {activeTab === 'exams' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {exams.map(e => (
                    <Link
                      key={e.id}
                      to={`/program/${programId}/exam/${e.id}`}
                      className="card"
                      style={{ textDecoration: 'none', padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}
                    >
                      <Icon name="target" size={16} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{e.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                          {e.exam_type} · {e.question_count} questions
                        </div>
                      </div>
                      {e.grade_letter && (
                        <span style={{
                          fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 16,
                          color: 'var(--sage)', background: 'var(--sage-soft)',
                          padding: '4px 10px', borderRadius: 8,
                        }}>{e.grade_letter}</span>
                      )}
                      <Icon name="chevron" size={13} style={{ color: 'var(--ink-4)' }} />
                    </Link>
                  ))}
                  {exams.length < MAX_EXAMS && (
                    <button
                      className="btn ghost"
                      onClick={handleGenerateNextExam}
                      disabled={generatingExam}
                      style={{ marginTop: 8, fontSize: 12.5, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      {generatingExam
                        ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Generating…</>
                        : <><Icon name="plus" size={12} /> {exams.length === 0 ? 'Generate first exam' : 'Generate next exam'}</>
                      }
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right aside */}
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
              {/* Progress card */}
              <div className="card" style={{ padding: 16 }}>
                <div className="kicker" style={{ marginBottom: 8 }}>Your progress</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                  <div style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 32 }}>{prog}%</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{completedLessons} of {lessonList.length} lessons</div>
                </div>
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${prog}%` }} />
                </div>
              </div>

              {/* Next lesson */}
              {lessonList.length > 0 && (
                <div className="card" style={{ padding: 14 }}>
                  <div className="kicker" style={{ marginBottom: 8 }}>
                    {completedLessons > 0 ? 'Next up' : 'Start here'}
                  </div>
                  {(() => {
                    const next = lessonList.find(l => !l.visit_count) || lessonList[lessonList.length - 1];
                    return (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{next.title}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 10 }}>
                          Lecture {next.number}{next.estimated_minutes ? ` · ${next.estimated_minutes}m` : ''}
                        </div>
                        <Link
                          to={`/program/${programId}/lesson/${next.id}`}
                          className="btn primary"
                          style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                        >
                          <Icon name="play" size={12} /> Enter lecture
                        </Link>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Professor card */}
              <div className="card" style={{ padding: 14 }}>
                <div className="kicker" style={{ marginBottom: 8 }}>Professor · AI</div>
                <div className="serif" style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)', fontStyle: 'italic' }}>
                  "Attend every lecture. Ask questions freely — I remember every conversation we've had."
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaStat({ label, value, highlight }) {
  return (
    <div>
      <div className="kicker" style={{ fontSize: 9.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: highlight ? 'var(--sage)' : 'var(--ink)' }}>{value}</div>
    </div>
  );
}
