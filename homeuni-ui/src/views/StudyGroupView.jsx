import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { study } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';
import Icon from '../components/ui/Icon.jsx';

function MemberDot({ hue, name, isUser, online = true }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 16,
          background: isUser
            ? 'radial-gradient(circle at 35% 35%, oklch(80% 0.1 265), oklch(55% 0.2 265))'
            : `radial-gradient(circle at 35% 35%, oklch(80% 0.1 ${hue}), oklch(55% 0.2 ${hue}))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, color: '#fff', fontFamily: 'var(--f-display)',
        }}>
          {initials}
        </div>
        {online && (
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 9, height: 9, borderRadius: 5,
            background: 'var(--sage)', border: '1.5px solid var(--paper)',
          }} />
        )}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{name}</div>
        {!isUser && <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>AI classmate</div>}
      </div>
    </div>
  );
}

function ChatMessage({ msg, userName }) {
  const isUser = msg.role === 'user';
  const displayName = isUser ? (userName || 'You') : (msg.name || msg.persona);
  const hue = msg.hue;

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      flexDirection: isUser ? 'row-reverse' : 'row',
      marginBottom: 14,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 14, flexShrink: 0,
        background: isUser
          ? 'radial-gradient(circle at 35% 35%, oklch(80% 0.1 265), oklch(55% 0.2 265))'
          : `radial-gradient(circle at 35% 35%, oklch(80% 0.1 ${hue || 200}), oklch(55% 0.2 ${hue || 200}))`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color: '#fff', fontFamily: 'var(--f-display)',
      }}>
        {(displayName || '?')[0].toUpperCase()}
      </div>
      <div style={{ maxWidth: '68%' }}>
        <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 3, textAlign: isUser ? 'right' : 'left' }}>
          {isUser ? 'You' : displayName}
        </div>
        <div style={{
          background: isUser ? 'var(--indigo)' : 'var(--paper-2)',
          color: isUser ? '#fff' : 'var(--ink)',
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          padding: '9px 13px', fontSize: 13.5, lineHeight: 1.5,
          border: isUser ? 'none' : '1px solid var(--rule)',
        }}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

function Timer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const base = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
    setElapsed(Math.floor(base / 1000));
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const fmt = n => String(n).padStart(2, '0');

  return (
    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 28, fontWeight: 500, letterSpacing: '0.04em', color: 'var(--ink)', textAlign: 'center', lineHeight: 1 }}>
      {h > 0 && <>{fmt(h)}:</>}{fmt(m)}:{fmt(s)}
    </div>
  );
}

export default function StudyGroupView() {
  const { programId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [classmates, setClassmates] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [scratchpad, setScratchpad] = useState('');
  const [topic, setTopic] = useState('');
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [goals, setGoals] = useState(['', '', '']);
  const [goalsChecked, setGoalsChecked] = useState([false, false, false]);

  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function handleStart() {
    if (!topic.trim()) return;
    setStarting(true);
    try {
      const data = await study.createSession(programId, { topic: topic.trim() });
      setSession(data.session);
      setClassmates(data.classmates);
      setStarted(true);
    } finally {
      setStarting(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || sending || !session) return;
    const content = input.trim();
    setInput('');
    setSending(true);

    const userMsg = { role: 'user', content, id: `tmp-${Date.now()}` };
    setMessages(prev => [...prev, userMsg]);

    try {
      const data = await study.sendMessage(programId, session.id, { content });
      setMessages(prev => [...prev, data.message]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'classmate', persona: 'mia', name: 'Mia', hue: 320,
        content: '(connection error — try again)',
        id: `err-${Date.now()}`,
      }]);
    } finally {
      setSending(false);
    }
  }

  async function handleLeave() {
    if (session) {
      await study.endSession(programId, session.id).catch(() => {});
    }
    navigate(`/dashboard`);
  }

  if (!started) {
    return (
      <div className="app-shell">
        <Sidebar programId={programId} active="study" />
        <div className="main-content">
          <TopBar crumb="STUDY GROUP" title="Start a session" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <div className="card" style={{ padding: 36, width: 460, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div className="kicker" style={{ marginBottom: 6 }}>What are you studying today?</div>
                <input
                  id="study-topic"
                  name="study-topic"
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleStart()}
                  placeholder="e.g. Thermodynamics — entropy and free energy"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--rule)', fontSize: 14,
                    fontFamily: 'var(--f-text)', color: 'var(--ink)',
                    background: 'var(--paper-2)', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <div className="kicker" style={{ marginBottom: 8 }}>Session goals (optional)</div>
                {goals.map((g, i) => (
                  <input
                    key={i}
                    id={`session-goal-${i + 1}`}
                    name={`session-goal-${i + 1}`}
                    type="text"
                    value={g}
                    onChange={e => setGoals(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                    placeholder={`Goal ${i + 1}…`}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8, marginBottom: 6,
                      border: '1px solid var(--rule)', fontSize: 13,
                      fontFamily: 'var(--f-text)', color: 'var(--ink)',
                      background: 'var(--paper-2)', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {[{id:'mia',hue:320},{id:'leo',hue:200},{id:'zoe',hue:140},{id:'kai',hue:45}].map(c => (
                  <div key={c.id} style={{
                    width: 36, height: 36, borderRadius: 18,
                    background: `radial-gradient(circle at 35% 35%, oklch(80% 0.1 ${c.hue}), oklch(55% 0.2 ${c.hue}))`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: '#fff',
                    fontFamily: 'var(--f-display)',
                    title: c.id,
                  }}>
                    {c.id[0].toUpperCase()}
                  </div>
                ))}
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Mia, Leo, Zoe & Kai will join</span>
              </div>
              <button
                className="btn primary"
                onClick={handleStart}
                disabled={!topic.trim() || starting}
                style={{ alignSelf: 'flex-start' }}
              >
                {starting ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Starting…</> : <><Icon name="sparkle" size={13} /> Start session</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar programId={programId} active="study" />
      <div className="main-content">
        <TopBar
          crumb="STUDY GROUP"
          title={topic}
          actions={
            <button className="btn" onClick={handleLeave} style={{ color: 'var(--rose)' }}>
              <Icon name="x" size={13} /> Leave
            </button>
          }
        />

        <div style={{ overflow: 'hidden', flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 240px' }}>

          {/* Left rail — members */}
          <div style={{ borderRight: '1px solid var(--rule)', padding: '20px 16px', overflowY: 'auto' }}>
            <div className="kicker" style={{ marginBottom: 12 }}>In this room</div>
            <MemberDot name={user?.full_name || 'You'} isUser />
            {classmates.map(c => (
              <MemberDot key={c.id} name={c.name} hue={c.hue} />
            ))}
          </div>

          {/* Center — scratchpad + chat */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Scratchpad */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--rule)',
              background: 'oklch(97% 0.005 80)',
            }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Shared scratchpad</div>
              <textarea
                id="scratchpad"
                name="scratchpad"
                value={scratchpad}
                onChange={e => setScratchpad(e.target.value)}
                placeholder="Jot down equations, diagrams, ideas…"
                style={{
                  width: '100%', height: 90, padding: '8px 10px', borderRadius: 6,
                  border: '1px solid var(--rule)', fontSize: 14,
                  fontFamily: 'Caveat, cursive', color: 'var(--ink)',
                  background: 'transparent', outline: 'none', resize: 'none', lineHeight: 1.5,
                  boxSizing: 'border-box',
                  backgroundImage: 'radial-gradient(circle, var(--rule) 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              />
            </div>

            {/* Chat */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 13, marginTop: 32 }}>
                  Say something to get the group going…
                </div>
              )}
              {messages.map((msg, i) => (
                <ChatMessage key={msg.id || i} msg={msg} userName={user?.full_name} />
              ))}
              {sending && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--ink-4)', fontSize: 12.5, paddingLeft: 38 }}>
                  <span className="spinner" style={{ width: 10, height: 10 }} /> classmate is typing…
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 10 }}>
              <input
                id="group-chat"
                name="group-chat"
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Ask the group a question…"
                disabled={sending}
                style={{
                  flex: 1, padding: '9px 13px', borderRadius: 8,
                  border: '1px solid var(--rule)', fontSize: 13.5,
                  fontFamily: 'var(--f-text)', color: 'var(--ink)',
                  background: 'var(--paper-2)', outline: 'none',
                }}
              />
              <button
                className="btn primary"
                onClick={handleSend}
                disabled={!input.trim() || sending}
              >
                <Icon name="send" size={13} />
              </button>
            </div>
          </div>

          {/* Right rail — session panel */}
          <div style={{ borderLeft: '1px solid var(--rule)', padding: '20px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Timer */}
            <div className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div className="kicker" style={{ marginBottom: 10 }}>Session time</div>
              <Timer startedAt={session?.started_at} />
            </div>

            {/* Goals */}
            {goals.some(g => g.trim()) && (
              <div className="card" style={{ padding: 14 }}>
                <div className="kicker" style={{ marginBottom: 10 }}>Goals</div>
                {goals.map((g, i) => g.trim() ? (
                  <div
                    key={i}
                    onClick={() => setGoalsChecked(prev => prev.map((v, j) => j === i ? !v : v))}
                    style={{
                      display: 'flex', gap: 8, alignItems: 'flex-start',
                      padding: '5px 0', cursor: 'pointer',
                      opacity: goalsChecked[i] ? 0.45 : 1,
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                      border: `1.5px solid ${goalsChecked[i] ? 'var(--sage)' : 'var(--rule)'}`,
                      background: goalsChecked[i] ? 'var(--sage)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {goalsChecked[i] && <Icon name="check" size={10} style={{ color: '#fff' }} />}
                    </div>
                    <span style={{ fontSize: 12.5, color: 'var(--ink-2)', textDecoration: goalsChecked[i] ? 'line-through' : 'none' }}>{g}</span>
                  </div>
                ) : null)}
              </div>
            )}

            {/* Classmate legend */}
            <div className="card" style={{ padding: 14 }}>
              <div className="kicker" style={{ marginBottom: 8 }}>The group</div>
              {[
                { name: 'Mia', hue: 320, role: 'Curious connector' },
                { name: 'Leo', hue: 200, role: 'Rigorous thinker' },
                { name: 'Zoe', hue: 140, role: 'Visual analogist' },
                { name: 'Kai', hue: 45, role: 'Socratic guide' },
              ].map(c => (
                <div key={c.name} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10, flexShrink: 0,
                    background: `radial-gradient(circle at 35% 35%, oklch(80% 0.1 ${c.hue}), oklch(55% 0.2 ${c.hue}))`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, color: '#fff', fontFamily: 'var(--f-display)',
                  }}>
                    {c.name[0]}
                  </div>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 5 }}>{c.role}</span>
                  </div>
                </div>
              ))}
            </div>

            <button className="btn" onClick={handleLeave} style={{ color: 'var(--rose)', marginTop: 'auto' }}>
              <Icon name="x" size={13} /> End session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
