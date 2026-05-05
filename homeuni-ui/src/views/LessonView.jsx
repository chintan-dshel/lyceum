import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLesson, useLessonTracking } from '../hooks/useLesson.js';
import { streamProfessorChat, lessons as lessonsApi, practice as practiceApi } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';
import Icon from '../components/ui/Icon.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import { useAuth } from '../hooks/useAuth.jsx';

// ─── Lesson article ───────────────────────────────────────

function bodyToString(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(bodyToString).join('\n\n');
  if (typeof val === 'object') {
    // flatten object values as labelled prose
    return Object.entries(val)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${bodyToString(v)}`)
      .join('\n\n');
  }
  return String(val);
}

function ArticleSection({ sec }) {
  const type = sec.type || 'text';
  const body = bodyToString(sec.body ?? sec.content);

  if (type === 'example') {
    return (
      <div style={{
        background: 'oklch(97% 0.02 265)', border: '1px solid oklch(90% 0.04 265)',
        borderLeft: '3px solid var(--indigo)', borderRadius: '0 10px 10px 0', padding: '16px 20px',
      }}>
        {sec.heading && (
          <div style={{ fontSize: 10.5, fontFamily: 'var(--f-mono)', color: 'var(--indigo)', letterSpacing: '0.1em', marginBottom: 8 }}>
            {sec.heading.toUpperCase()}
          </div>
        )}
        {body && <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--ink)', whiteSpace: 'pre-line' }}>{body}</div>}
      </div>
    );
  }

  if (type === 'key_concept') {
    return (
      <div style={{ borderLeft: '3px solid oklch(70% 0.1 265)', paddingLeft: 18 }}>
        {sec.heading && (
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>{sec.heading}</div>
        )}
        {body && <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--ink)', whiteSpace: 'pre-line' }}>{body}</div>}
      </div>
    );
  }

  if (type === 'summary') {
    return (
      <div style={{
        background: 'oklch(97% 0.03 75)', borderRadius: 10, padding: '16px 20px',
        border: '1px solid oklch(90% 0.05 75)',
      }}>
        {sec.heading && (
          <div style={{ fontSize: 10.5, fontFamily: 'var(--f-mono)', color: 'oklch(46% 0.12 75)', letterSpacing: '0.1em', marginBottom: 8 }}>
            {sec.heading.toUpperCase()}
          </div>
        )}
        {body && <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--ink)', whiteSpace: 'pre-line' }}>{body}</div>}
      </div>
    );
  }

  // Default — plain text section
  return (
    <div>
      {sec.heading && (
        <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px', lineHeight: 1.4 }}>
          {sec.heading}
        </h2>
      )}
      {body && (
        <div style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--ink-2)', whiteSpace: 'pre-line' }}>{body}</div>
      )}
    </div>
  );
}

function KeyTerms({ terms }) {
  return (
    <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--rule)' }}>
      <div style={{ fontSize: 10.5, fontFamily: 'var(--f-mono)', color: 'var(--ink-3)', letterSpacing: '0.1em', marginBottom: 16 }}>
        KEY TERMS
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {terms.map((t, i) => (
          <div key={i} style={{ padding: '12px 14px', background: 'var(--paper-2)', borderRadius: 8, border: '1px solid var(--rule)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{t.term}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6 }}>{bodyToString(t.definition)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function parseLessonContent(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

function LessonArticle({ lesson, onAskProf }) {
  const content = parseLessonContent(lesson.content);
  const hasContent = content?.sections?.length > 0;
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, text }

  const handleContextMenu = useCallback((e) => {
    const selected = window.getSelection()?.toString().trim();
    if (!selected) return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, text: selected });
  }, []);

  // Dismiss on click elsewhere
  useEffect(() => {
    if (!ctxMenu) return;
    const dismiss = () => setCtxMenu(null);
    window.addEventListener('mousedown', dismiss);
    return () => window.removeEventListener('mousedown', dismiss);
  }, [ctxMenu]);

  return (
    <div
      style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '32px 32px 40px' }}
      onContextMenu={handleContextMenu}
    >
      {/* Context menu */}
      {ctxMenu && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 999,
            background: 'var(--ink)', borderRadius: 8, padding: '4px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
        >
          <button
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 12.5, color: 'var(--paper)', borderRadius: 5, width: '100%', whiteSpace: 'nowrap',
            }}
            onClick={() => {
              onAskProf(`Explain this: "${ctxMenu.text.slice(0, 200)}"`);
              setCtxMenu(null);
            }}
          >
            <div style={{ width: 18, height: 18, borderRadius: 9, background: 'radial-gradient(circle at 35% 35%, oklch(80% 0.08 265), var(--indigo))' }} />
            Ask Prof to explain
          </button>
        </div>
      )}

      {hasContent ? (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {/* Article header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--f-mono)', color: 'var(--ink-3)', letterSpacing: '0.1em', marginBottom: 10 }}>
              {lesson.course_code} · LECTURE {lesson.number}
              {lesson.estimated_minutes && (
                <span style={{ marginLeft: 12, color: 'var(--ink-4)' }}>~{lesson.estimated_minutes} min read</span>
              )}
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.3, color: 'var(--ink)', margin: 0 }}>
              {lesson.title}
            </h1>
          </div>

          <div style={{ height: 1, background: 'var(--rule)', marginBottom: 32 }} />

          {/* Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {content.sections.map((sec, i) => (
              <ArticleSection key={i} sec={sec} />
            ))}
          </div>

          {/* Key terms */}
          {content.key_terms?.length > 0 && (
            <KeyTerms terms={content.key_terms} />
          )}
        </div>
      ) : (
        <div style={{ maxWidth: 700, margin: '80px auto', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          <div style={{ marginBottom: 10 }}>Preparing lecture content…</div>
          <span className="spinner" style={{ width: 16, height: 16, display: 'inline-block' }} />
        </div>
      )}
    </div>
  );
}

// ─── Lesson navigation (prev / next only) ────────────────

function LessonNav({ navigation, programId, navigate, nextGenerating }) {
  if (!navigation?.prev && !navigation?.next) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 24px', borderTop: '1px solid var(--rule)', background: 'var(--paper)',
    }}>
      {navigation?.prev ? (
        <button className="btn ghost" style={{ fontSize: 12 }}
          onClick={() => navigate(`/program/${programId}/lesson/${navigation.prev.id}`)}>
          <Icon name="chevron" size={14} style={{ transform: 'scaleX(-1)' }} /> Prev
        </button>
      ) : <div />}
      {navigation?.next ? (
        <button className="btn ghost" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => navigate(`/program/${programId}/lesson/${navigation.next.id}`)}>
          Next
          {nextGenerating
            ? <span className="spinner" style={{ width: 11, height: 11 }} />
            : <Icon name="chevron" size={14} />}
        </button>
      ) : <div />}
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
    correct:   { bg: 'oklch(93% 0.06 145)', text: 'oklch(32% 0.1 145)',  label: 'Correct' },
    partial:   { bg: 'oklch(95% 0.07 75)',  text: 'oklch(38% 0.1 75)',   label: 'Partial' },
    incorrect: { bg: 'oklch(95% 0.06 20)',  text: 'oklch(38% 0.12 20)',  label: 'Incorrect' },
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
      .then(({ problems: p, attempts: a }) => { setProblems(p || []); setAttempts(a || []); })
      .finally(() => setLoading(false));
  }, [lessonId]);

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
    } finally { setSubmitting(false); }
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--ink-3)', fontSize: 13 }}>Loading practice problems…</div>;
  if (!problems.length) return (
    <div style={{ padding: 32, color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' }}>
      No practice problems yet for this lesson.
    </div>
  );

  const prob = problems[current];
  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {problems.map((_, i) => {
          const a = attempts.find(at => at.problem_index === i);
          const good = a?.score >= 80;
          return (
            <button key={i} onClick={() => setCurrent(i)} style={{
              width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: i === current ? 'var(--ink)' : a ? (good ? 'oklch(88% 0.08 145)' : 'oklch(92% 0.06 20)') : 'var(--paper-2)',
              color: i === current ? 'var(--paper)' : a ? (good ? 'oklch(32% 0.1 145)' : 'oklch(35% 0.12 20)') : 'var(--ink-3)',
              outline: i === current ? '2px solid var(--ink)' : 'none', outlineOffset: 2,
            }}>{i + 1}</button>
          );
        })}
      </div>

      <div style={{ background: 'var(--paper-2)', borderRadius: 12, padding: '18px 20px', border: '1px solid var(--rule)' }}>
        <div style={{ fontSize: 10.5, fontFamily: 'var(--f-mono)', color: 'var(--ink-3)', letterSpacing: '0.08em', marginBottom: 10 }}>
          PROBLEM {current + 1} OF {problems.length}
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink)' }}>{prob.question}</div>
      </div>

      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <VerdictBadge verdict={result.verdict} score={result.score} />
          <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)', background: 'var(--paper-2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--rule)' }}>
            {result.feedback}
          </div>
          {result.hint && (
            <div style={{ fontSize: 12.5, color: 'oklch(38% 0.1 75)', background: 'oklch(97% 0.04 75)', borderRadius: 10, padding: '10px 14px', border: '1px solid oklch(88% 0.06 75)' }}>
              Hint: {result.hint}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => { setResult(null); setAnswer(''); }}>Try again</button>
            {current < problems.length - 1 && (
              <button className="btn primary" style={{ fontSize: 12 }} onClick={() => setCurrent(c => c + 1)}>Next problem</button>
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
            id="lesson-answer"
            name="lesson-answer"
            value={answer} onChange={e => setAnswer(e.target.value)}
            placeholder="Type your answer here…" rows={5}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--rule)', fontSize: 13.5, fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', outline: 'none', background: '#fff', color: 'var(--ink)', boxSizing: 'border-box' }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn primary" onClick={handleSubmit} disabled={!answer.trim() || submitting}>
              {submitting ? <span className="spinner" style={{ width: 13, height: 13 }} /> : 'Submit'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>Cmd/Ctrl+Enter</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────

export default function LessonView() {
  const { programId, lessonId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { lesson, navigation, generating, generationFailed, loading, retry } = useLesson(lessonId);
  const { nextGenerating } = useLessonTracking(lessonId, lesson?.estimated_minutes);

  const initials = user?.full_name?.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'U';

  const [activeTab, setActiveTab] = useState('lecture');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const scrollRef = useRef(null);
  const controllerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!lessonId) return;
    lessonsApi.professorHistory(lessonId)
      .then(({ messages: hist }) => setMessages(hist || []))
      .catch(() => {});
  }, [lessonId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, streamingText]);

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || streaming) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', content: msg }]);
    setStreaming(true);
    setStreamingText('');

    let accumulated = '';
    controllerRef.current = streamProfessorChat(
      lessonId, msg,
      (chunk) => { accumulated += chunk; setStreamingText(accumulated); },
      () => {
        setMessages(m => [...m, { role: 'assistant', content: accumulated }]);
        setStreamingText('');
        setStreaming(false);
      }
    );
  }, [lessonId, input, streaming]);

  // When "Ask Prof" is triggered from the article, prefill and send
  const handleAskProf = useCallback((text) => {
    sendMessage(text);
    // Scroll chat into view on mobile / small screens
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [sendMessage]);

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
            <span className="pill sage" style={{ gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--sage)', animation: 'apulse 1.5s infinite' }} />
              LIVE TEACHING
            </span>
          }
        />

        {generating && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 22px',
            background: 'var(--amber-soft)', fontSize: 12.5, color: 'oklch(40% 0.1 75)',
            borderBottom: '1px solid oklch(88% 0.06 75)',
          }}>
            <span className="spinner" style={{ width: 12, height: 12, borderTopColor: 'oklch(48% 0.13 75)' }} />
            Preparing lecture content…
          </div>
        )}

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', minHeight: 0 }}>
          {/* Article + nav */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, padding: '12px 22px 0', borderBottom: '1px solid var(--rule)' }}>
              {[{ id: 'lecture', label: 'Lecture' }, { id: 'practice', label: 'Practice' }].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  padding: '7px 16px', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer',
                  borderRadius: '8px 8px 0 0', background: activeTab === t.id ? 'var(--paper)' : 'transparent',
                  color: activeTab === t.id ? 'var(--ink)' : 'var(--ink-3)',
                  borderBottom: activeTab === t.id ? '2px solid var(--ink)' : '2px solid transparent',
                  marginBottom: -1,
                }}>{t.label}</button>
              ))}
            </div>

            {activeTab === 'lecture' ? (
              <>
                <LessonArticle lesson={lesson} onAskProf={handleAskProf} />
                <LessonNav navigation={navigation} programId={programId} navigate={navigate} nextGenerating={nextGenerating} />
              </>
            ) : (
              <div style={{ flex: 1, overflow: 'auto' }}>
                <PracticePanel lessonId={lessonId} />
              </div>
            )}
          </div>

          {/* Right rail — professor chat */}
          <div style={{ borderLeft: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0, background: 'radial-gradient(circle at 35% 35%, oklch(80% 0.08 265), var(--indigo))' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Prof. AI <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· Socratic</span></div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{lesson.course_title}</div>
              </div>
            </div>

            <div style={{ padding: '12px 18px 8px', borderBottom: '1px solid var(--rule)' }}>
              <div className="kicker">Discussion</div>
            </div>

            <div ref={scrollRef} style={{ flex: 1, padding: '12px 18px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {messages.length === 0 && !streaming && (
                <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic', textAlign: 'center', marginTop: 16 }}>
                  Ask a question or select text and right-click to start a discussion
                </div>
              )}
              {messages.map((msg, i) => <TranscriptLine key={i} msg={msg} initials={initials} />)}
              {streaming && (
                <TranscriptLine msg={{ role: 'assistant', content: streamingText || '…' }} initials={initials} />
              )}
            </div>

            <div style={{ padding: 14, borderTop: '1px solid var(--rule)', background: 'var(--paper-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--rule)', borderRadius: 10, padding: '8px 10px' }}>
                <Icon name="chat" size={15} style={{ color: 'var(--ink-3)' }} />
                <input
                  id="lesson-professor-chat"
                  name="lesson-professor-chat"
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Ask the professor…"
                  disabled={streaming}
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', background: 'transparent', color: 'var(--ink)' }}
                />
                <button className="btn primary" style={{ padding: '5px 10px' }} onClick={() => sendMessage()} disabled={streaming}>
                  <Icon name="send" size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {['Explain again', 'Give an example', "What's next?"].map(s => (
                  <button key={s} className="btn ghost"
                    style={{ fontSize: 11, padding: '4px 8px', background: 'var(--paper)', border: '1px solid var(--rule)' }}
                    onClick={() => sendMessage(s)}
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
