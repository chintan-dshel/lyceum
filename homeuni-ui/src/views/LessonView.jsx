import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useLesson, useLessonTracking } from '../hooks/useLesson.js';
import { streamProfessorChat, lessons as lessonsApi, practice as practiceApi } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';
import Icon from '../components/ui/Icon.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import { useAuth } from '../hooks/useAuth.jsx';

// ─── Professor voice orb ──────────────────────────────────
function ProfOrb({ wave, playing, size = 68 }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: -6, borderRadius: size,
        background: 'conic-gradient(from 0deg, var(--indigo) 0deg, var(--clay) 120deg, var(--indigo) 240deg, var(--indigo) 360deg)',
        opacity: playing ? 0.3 : 0.15,
        animation: playing ? 'spin 8s linear infinite' : 'none',
        filter: 'blur(8px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: size,
        background: 'radial-gradient(circle at 35% 35%, oklch(80% 0.08 265), var(--indigo))',
        boxShadow: '0 4px 16px oklch(52% 0.13 265 / 0.3), inset 0 -4px 12px oklch(40% 0.12 265)',
      }} />
      <div style={{
        position: 'absolute', top: '20%', left: '26%',
        width: '30%', height: '18%', borderRadius: '50%',
        background: 'oklch(94% 0.03 265 / 0.7)', filter: 'blur(2px)',
      }} />
      {/* Waveform overlay when playing */}
      {wave && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: size,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5,
          overflow: 'hidden',
        }}>
          {wave.slice(0, 12).map((v, i) => (
            <div key={i} style={{
              width: 2, borderRadius: 2,
              height: `${Math.max(playing ? 8 : 3, v * 26)}px`,
              background: 'rgba(255,255,255,0.5)',
              transition: 'height .08s ease-out',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Whiteboard component ─────────────────────────────────
function Whiteboard({ lesson }) {
  const hasContent = lesson.content?.sections?.length > 0;

  return (
    <div style={{
      position: 'relative', flex: 1, borderRadius: 14,
      background: 'var(--board-dark)',
      backgroundImage: `
        radial-gradient(ellipse 80% 60% at 50% 30%, oklch(32% 0.02 180) 0%, transparent 60%),
        radial-gradient(ellipse 40% 60% at 20% 90%, oklch(22% 0.02 180) 0%, transparent 60%)
      `,
      boxShadow: 'inset 0 0 0 1px oklch(40% 0.02 180), inset 0 8px 30px oklch(20% 0.02 180), 0 20px 40px rgba(0,0,0,.15)',
      color: 'var(--board-chalk)',
      overflow: 'auto',
      minHeight: 320,
    }}>
      {/* Chalk dust texture */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.05, pointerEvents: 'none' }}>
        <filter id="wbnoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0"/>
        </filter>
        <rect width="100%" height="100%" filter="url(#wbnoise)" />
      </svg>

      {/* Header */}
      <div style={{ position: 'relative', padding: '18px 24px 0', display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <div style={{ fontFamily: 'var(--f-hand)', fontSize: 26, color: 'var(--board-chalk)', transform: 'rotate(-0.5deg)' }}>
          {lesson.title}
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--board-chalk-2)', opacity: 0.6, letterSpacing: '0.1em' }}>
          LECTURE {lesson.number}
        </div>
      </div>
      <div style={{ margin: '10px 24px 0', height: 1, background: 'oklch(65% 0.03 75)', opacity: 0.25 }} />

      {/* Content */}
      <div style={{ padding: '16px 24px 24px', position: 'relative' }}>
        {hasContent ? (
          <WhiteboardContent sections={lesson.content.sections} />
        ) : (
          <div style={{ fontFamily: 'var(--f-hand)', fontSize: 20, color: 'var(--board-chalk-2)', opacity: 0.7, marginTop: 24 }}>
            Lecture content is being prepared…
          </div>
        )}
      </div>

      {/* Chalk tray */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 6,
        background: 'linear-gradient(180deg, oklch(38% 0.02 75), oklch(28% 0.02 75))',
        boxShadow: 'inset 0 1px 0 oklch(48% 0.03 75)',
      }} />
    </div>
  );
}

function WhiteboardContent({ sections }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {sections.map((sec, i) => (
        <div key={i}>
          {sec.heading && (
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--amber)', letterSpacing: '0.1em', marginBottom: 8 }}>
              {sec.heading.toUpperCase()}
            </div>
          )}
          {sec.content && (
            <div style={{ fontFamily: 'var(--f-hand)', fontSize: 20, lineHeight: 1.7, color: 'var(--board-chalk)', transform: `rotate(${(i % 2 === 0 ? -0.3 : 0.2)}deg)` }}>
              {sec.content}
            </div>
          )}
          {sec.equations?.map((eq, j) => (
            <div key={j} style={{ fontFamily: 'var(--f-serif)', fontStyle: 'italic', fontSize: 24, color: 'var(--board-chalk)', margin: '8px 0' }}>
              {eq}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Transcript line ──────────────────────────────────────
function TranscriptLine({ msg, initials }) {
  const isYou = msg.role === 'user';
  return (
    <div style={{ display: 'flex', gap: 9, animation: 'fadeIn .2s ease' }}>
      {isYou
        ? <Avatar size={22} name={initials} hue={50} />
        : <div style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, background: 'radial-gradient(circle at 35% 35%, oklch(80% 0.08 265), var(--indigo))' }} />
      }
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: isYou ? 'var(--ink-2)' : 'var(--ink)', flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600, color: isYou ? 'oklch(48% 0.12 50)' : 'var(--indigo)', marginRight: 6 }}>
          {isYou ? 'You' : 'Prof.'}
        </span>
        {msg.content}
      </div>
    </div>
  );
}

// ─── Practice Panel ───────────────────────────────────────
function VerdictBadge({ verdict, score }) {
  const colors = {
    correct: { bg: 'oklch(93% 0.06 145)', text: 'oklch(32% 0.1 145)', label: 'Correct' },
    partial: { bg: 'oklch(95% 0.07 75)', text: 'oklch(38% 0.1 75)', label: 'Partial' },
    incorrect: { bg: 'oklch(95% 0.06 20)', text: 'oklch(38% 0.12 20)', label: 'Incorrect' },
  };
  const c = colors[verdict] || colors.incorrect;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 12, background: c.bg, color: c.text, fontSize: 12, fontWeight: 600 }}>
      {c.label} · {score}/100
    </span>
  );
}

function PracticePanel({ lessonId }) {
  const [problems, setProblems] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    setLoading(true);
    practiceApi.list(lessonId)
      .then(({ problems: p, attempts: a }) => {
        setProblems(p || []);
        setAttempts(a || []);
      })
      .finally(() => setLoading(false));
  }, [lessonId]);

  // Reset result when switching problems
  useEffect(() => { setResult(null); setAnswer(''); }, [current]);

  const lastAttempt = attempts.find(a => a.problem_index === current);

  async function handleSubmit() {
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await practiceApi.submit(lessonId, current, answer.trim());
      setResult(res);
      setAttempts(prev => [{ problem_index: current, ...res, created_at: new Date().toISOString() }, ...prev.filter(a => a.problem_index !== current)]);
    } catch (err) {
      setResult({ verdict: 'incorrect', score: 0, feedback: err.message, hint: null });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--ink-3)', fontSize: 13 }}>Loading practice problems…</div>;

  if (!problems.length) return (
    <div style={{ padding: 32, color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' }}>
      No practice problems yet for this lesson.<br />
      <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>They are generated during the QA pipeline.</span>
    </div>
  );

  const prob = problems[current];

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, height: '100%', overflow: 'auto' }}>
      {/* Problem nav */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {problems.map((_, i) => {
          const a = attempts.find(at => at.problem_index === i);
          const done = !!a;
          const good = a?.score >= 80;
          return (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              style={{
                width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: i === current ? 'var(--ink)' : done ? (good ? 'oklch(88% 0.08 145)' : 'oklch(92% 0.06 20)') : 'var(--paper-2)',
                color: i === current ? 'var(--paper)' : done ? (good ? 'oklch(32% 0.1 145)' : 'oklch(35% 0.12 20)') : 'var(--ink-3)',
                outline: i === current ? '2px solid var(--ink)' : 'none',
                outlineOffset: 2,
              }}
            >{i + 1}</button>
          );
        })}
      </div>

      {/* Problem */}
      <div style={{ background: 'var(--paper-2)', borderRadius: 12, padding: '18px 20px', border: '1px solid var(--rule)' }}>
        <div style={{ fontSize: 10.5, fontFamily: 'var(--f-mono)', color: 'var(--ink-3)', letterSpacing: '0.08em', marginBottom: 10 }}>
          PROBLEM {current + 1} OF {problems.length}
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink)' }}>{prob.question}</div>
      </div>

      {/* Result or input */}
      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <VerdictBadge verdict={result.verdict} score={result.score} />
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)', background: 'var(--paper-2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--rule)' }}>
            {result.feedback}
          </div>
          {result.hint && (
            <div style={{ fontSize: 12.5, color: 'oklch(38% 0.1 75)', background: 'oklch(97% 0.04 75)', borderRadius: 10, padding: '10px 14px', border: '1px solid oklch(88% 0.06 75)' }}>
              Hint: {result.hint}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => { setResult(null); setAnswer(''); }}>
              Try again
            </button>
            {current < problems.length - 1 && (
              <button className="btn primary" style={{ fontSize: 12 }} onClick={() => setCurrent(c => c + 1)}>
                Next problem
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lastAttempt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Last attempt:</span>
              <VerdictBadge verdict={lastAttempt.verdict} score={lastAttempt.score} />
            </div>
          )}
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder="Type your answer here…"
            rows={5}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--rule)', fontSize: 13.5, fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', outline: 'none', background: '#fff', color: 'var(--ink)', boxSizing: 'border-box' }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn primary"
              onClick={handleSubmit}
              disabled={!answer.trim() || submitting}
            >
              {submitting ? <span className="spinner" style={{ width: 13, height: 13 }} /> : 'Submit'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>Cmd/Ctrl+Enter to submit</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LessonView() {
  const { programId, lessonId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { lesson, navigation, generating, generationFailed, loading, retry } = useLesson(lessonId);
  useLessonTracking(lessonId, lesson?.estimated_minutes);

  const initials = user?.full_name?.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'U';

  const [activeTab, setActiveTab] = useState('lecture');
  const [playing, setPlaying] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [wave, setWave] = useState(Array.from({ length: 40 }, () => 0.3));
  const scrollRef = useRef(null);
  const controllerRef = useRef(null);

  // Load professor history
  useEffect(() => {
    if (!lessonId) return;
    lessonsApi.professorHistory(lessonId)
      .then(({ messages: hist }) => setMessages(hist || []))
      .catch(() => {});
  }, [lessonId]);

  // Animate waveform
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setWave(w => w.map((_, i) => 0.2 + Math.abs(Math.sin(Date.now() / 180 + i * 0.5)) * 0.8 * (Math.random() * 0.5 + 0.5)));
    }, 80);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, streamingText]);

  async function sendMessage() {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', content: text }]);
    setStreaming(true);
    setStreamingText('');

    controllerRef.current = streamProfessorChat(
      lessonId,
      text,
      (chunk) => setStreamingText(t => t + chunk),
      (full) => {
        setMessages(m => [...m, { role: 'assistant', content: full }]);
        setStreamingText('');
        setStreaming(false);
      }
    );
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying(p => !p); }
      if (e.key === 'h' || e.key === 'H') setHandRaised(h => !h);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loading) return <div className="loading-screen">Loading lecture…</div>;
  if (!lesson) return <div className="loading-screen">Lesson not found</div>;

  return (
    <div className="app-shell">
      <Sidebar programId={programId} active="lecture" />
      <div className="main-content">
        <TopBar
          crumb={`${lesson.course_code || 'COURSE'} · LECTURE ${lesson.number}`}
          title={lesson.title}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="pill sage" style={{ gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--sage)', animation: 'apulse 1.5s infinite' }} />
                LIVE TEACHING
              </span>
              <button className="btn ghost"><Icon name="upload" size={14} /> Notes</button>
            </div>
          }
        />

        {generating && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 22px',
            background: 'var(--amber-soft)', fontSize: 12.5, color: 'oklch(40% 0.1 75)',
            borderBottom: '1px solid oklch(88% 0.06 75)',
          }}>
            <span className="spinner" style={{ width: 12, height: 12, borderTopColor: 'oklch(48% 0.13 75)' }} />
            Preparing lecture content — will appear on the board shortly.
          </div>
        )}

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', minHeight: 0 }}>
          {/* Board + controls */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, padding: '12px 22px 0', borderBottom: '1px solid var(--rule)' }}>
              {[{ id: 'lecture', label: 'Lecture' }, { id: 'practice', label: 'Practice' }].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: '7px 16px', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer',
                    borderRadius: '8px 8px 0 0', background: activeTab === t.id ? 'var(--paper)' : 'transparent',
                    color: activeTab === t.id ? 'var(--ink)' : 'var(--ink-3)',
                    borderBottom: activeTab === t.id ? '2px solid var(--ink)' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >{t.label}</button>
              ))}
            </div>

            {activeTab === 'lecture' ? (
              <div style={{ padding: '18px 22px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Whiteboard lesson={lesson} />
                <LectureControls
                  playing={playing} setPlaying={setPlaying}
                  handRaised={handRaised} setHandRaised={setHandRaised}
                  navigation={navigation} programId={programId} navigate={navigate}
                />
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto' }}>
                <PracticePanel lessonId={lessonId} />
              </div>
            )}
          </div>

          {/* Right rail */}
          <div style={{ borderLeft: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Professor panel */}
            <div style={{ padding: '22px 18px 16px', borderBottom: '1px solid var(--rule)', display: 'flex', gap: 16, alignItems: 'center' }}>
              <ProfOrb wave={wave} playing={playing} size={68} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Prof. AI <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· Socratic</span></div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 8 }}>{lesson.course_title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 22 }}>
                  {wave.map((v, i) => (
                    <div key={i} style={{
                      width: 2.5, borderRadius: 2,
                      height: `${Math.max(playing ? 14 : 4, v * 22)}px`,
                      background: i < wave.length / 2 ? 'var(--indigo)' : 'var(--clay)',
                      opacity: playing ? 0.85 : 0.35,
                      transition: 'height .08s ease-out',
                    }} />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 18px 8px', borderBottom: '1px solid var(--rule)' }}>
              <div className="kicker">Discussion</div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{ flex: 1, padding: '12px 18px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {messages.length === 0 && !streaming && (
                <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic', textAlign: 'center', marginTop: 16 }}>
                  Ask a question to start a discussion
                </div>
              )}
              {messages.map((msg, i) => <TranscriptLine key={i} msg={msg} initials={initials} />)}
              {streaming && (
                <TranscriptLine msg={{ role: 'assistant', content: streamingText || '…' }} initials={initials} />
              )}
              {handRaised && (
                <div style={{
                  padding: '10px 12px', background: 'var(--amber-soft)', borderRadius: 10,
                  fontSize: 12, color: 'oklch(40% 0.1 75)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Icon name="hand" size={14} /> Hand raised — Professor will call on you soon.
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: 14, borderTop: '1px solid var(--rule)', background: 'var(--paper-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--rule)', borderRadius: 10, padding: '8px 10px' }}>
                <Icon name="chat" size={15} style={{ color: 'var(--ink-3)' }} />
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Ask the professor…"
                  disabled={streaming}
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', background: 'transparent', color: 'var(--ink)' }}
                />
                <button className="btn primary" style={{ padding: '5px 10px' }} onClick={sendMessage} disabled={streaming}>
                  <Icon name="send" size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {['Explain again', 'Give an example', 'What\'s next?'].map(s => (
                  <button
                    key={s}
                    className="btn ghost"
                    style={{ fontSize: 11, padding: '4px 8px', background: 'var(--paper)', border: '1px solid var(--rule)' }}
                    onClick={() => { setInput(s); }}
                  >{s}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LectureControls({ playing, setPlaying, handRaised, setHandRaised, navigation, programId, navigate }) {
  const chapters = [
    { at: 0, label: 'Intro' },
    { at: 25, label: 'Core' },
    { at: 55, label: 'Examples' },
    { at: 80, label: 'Review' },
  ];
  const progress = 34;

  return (
    <div style={{ padding: '14px 2px 16px' }}>
      {/* Timeline */}
      <div style={{ position: 'relative', height: 34, marginBottom: 10 }}>
        <div style={{ position: 'absolute', top: 16, left: 0, right: 0, height: 2, background: 'var(--rule)', borderRadius: 2 }} />
        <div style={{ position: 'absolute', top: 16, left: 0, width: `${progress}%`, height: 2, background: 'var(--ink)', borderRadius: 2 }} />
        {chapters.map((c, i) => (
          <div key={i} style={{ position: 'absolute', top: 12, left: `${c.at}%`, transform: 'translateX(-50%)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: c.at <= progress ? 'var(--ink)' : '#fff', border: '1.5px solid var(--ink)' }} />
            <div style={{ fontSize: 9.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', transform: 'translateX(-50%)', marginLeft: 5, marginTop: 4, fontFamily: 'var(--f-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</div>
          </div>
        ))}
        <div style={{ position: 'absolute', top: 10, left: `${progress}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: 7, background: 'var(--ink)', border: '2px solid var(--paper)', boxShadow: '0 0 0 1px var(--ink)' }} />
      </div>

      {/* Transport */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--paper-2)', borderRadius: 12, border: '1px solid var(--rule)' }}>
        {navigation?.prev && (
          <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => navigate(`/program/${programId}/lesson/${navigation.prev.id}`)}>
            <Icon name="chevron" size={14} style={{ transform: 'scaleX(-1)' }} /> Prev
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setPlaying(!playing)}
          style={{ width: 42, height: 42, borderRadius: 21, background: 'var(--ink)', color: 'var(--paper)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <button
          className={'btn' + (handRaised ? ' primary' : '')}
          onClick={() => setHandRaised(h => !h)}
          style={handRaised ? { background: 'var(--amber)', borderColor: 'var(--amber)', color: 'var(--ink)' } : {}}
        >
          <Icon name="hand" size={14} /> {handRaised ? 'Lower hand' : 'Raise hand'}
        </button>
        {navigation?.next && (
          <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => navigate(`/program/${programId}/lesson/${navigation.next.id}`)}>
            Next <Icon name="chevron" size={14} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10.5, color: 'var(--ink-3)', justifyContent: 'center', fontFamily: 'var(--f-mono)', letterSpacing: '0.04em' }}>
        <span>SPACE · PLAY/PAUSE</span>
        <span>·</span>
        <span>H · RAISE HAND</span>
      </div>
    </div>
  );
}
