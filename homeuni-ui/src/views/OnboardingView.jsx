import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { programs } from '../lib/api.js';
import { useProgramStatus } from '../hooks/useProgram.js';
import LyceumLogo from '../components/ui/LyceumLogo.jsx';
import Icon from '../components/ui/Icon.jsx';
import Avatar from '../components/ui/Avatar.jsx';

// Orb — voice-only professor avatar (static in onboarding context = advisor)
function AdvisorOrb({ size = 52, pulsing = false }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: -5, borderRadius: size,
        background: 'conic-gradient(from 0deg, var(--indigo) 0deg, var(--clay) 120deg, var(--indigo) 240deg, var(--indigo) 360deg)',
        opacity: pulsing ? 0.3 : 0.15,
        animation: pulsing ? 'spin 8s linear infinite' : 'none',
        filter: 'blur(6px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: size,
        background: 'radial-gradient(circle at 35% 35%, oklch(80% 0.08 265), var(--indigo))',
        boxShadow: '0 4px 16px oklch(52% 0.13 265 / 0.3)',
      }} />
      <div style={{
        position: 'absolute', top: '22%', left: '28%', width: '35%', height: '22%',
        borderRadius: '50%', background: 'oklch(94% 0.03 265 / 0.7)', filter: 'blur(2px)',
      }} />
    </div>
  );
}

function ProposalCard({ proposal, onConfirm, onAdjust, confirming }) {
  return (
    <div style={{
      margin: '8px 0',
      background: '#fff',
      border: '1px solid var(--rule)',
      borderRadius: 16,
      padding: 20,
      boxShadow: 'var(--shadow-2)',
      animation: 'fadeIn .25s ease',
    }}>
      <div className="kicker" style={{ marginBottom: 6 }}>Program proposal</div>
      <div className="display" style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{proposal.title}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="pill indigo">{proposal.degree_type}</span>
        <span className="pill">{proposal.field_of_study}</span>
        <span className="pill">{proposal.total_semesters} semesters</span>
      </div>
      {proposal.rationale && (
        <p className="serif" style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)', marginBottom: 16 }}>
          {proposal.rationale}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={onConfirm} disabled={confirming}>
          {confirming
            ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Building…</>
            : <><Icon name="arrow" size={13} /> Confirm &amp; start</>
          }
        </button>
        <button className="btn ghost" onClick={onAdjust}>Adjust</button>
      </div>
    </div>
  );
}

export default function OnboardingView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.full_name?.split(' ')[0] || 'there';
  const initials = user?.full_name?.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'U';

  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: `Hello ${firstName}! I'm your academic advisor at Lyceum. I'll help you design a learning journey that fits exactly what you want to achieve.\n\nTell me — what would you love to study, and what draws you to it?`,
  }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [programId, setProgramId] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useProgramStatus(programId, () => navigate('/dashboard'));

  async function sendMessage() {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    setMessages(m => [...m, { role: 'user', content: text }]);
    try {
      const { message, proposal: p } = await programs.chat({ message: text });
      setMessages(m => [...m, { role: 'assistant', content: message }]);
      if (p?.ready) setProposal(p);
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `Something went wrong: ${err.message}` }]);
    } finally {
      setSending(false);
    }
  }

  async function confirmProgram() {
    if (!proposal || confirming) return;
    setConfirming(true);
    try {
      const { program } = await programs.confirm(proposal);
      setProgramId(program.id);
      setMessages(m => [...m, {
        role: 'assistant',
        content: `Excellent! Building your ${proposal.title} program now. You'll be redirected to your dashboard in about 30 seconds.`,
      }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `Something went wrong: ${err.message}` }]);
      setConfirming(false);
    }
  }

  const isGenerating = !!programId;

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--paper)',
    }}>
      {/* Header */}
      <header style={{
        height: 56, borderBottom: '1px solid var(--rule)',
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 10,
        background: '#fff', flexShrink: 0,
      }}>
        <LyceumLogo size={22} />
        <div className="display" style={{ fontWeight: 600, fontSize: 16 }}>Lyceum</div>
        <div style={{ flex: 1 }} />
        <div className="kicker" style={{ fontSize: 10 }}>Academic Advisor</div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 760, margin: '0 auto', width: '100%', padding: '0 24px', minHeight: 0 }}>
        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '28px 0 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
              {msg.role === 'assistant'
                ? <AdvisorOrb size={38} pulsing={sending && i === messages.length - 1} />
                : <Avatar name={initials} size={38} hue={50} />
              }
              <div style={{
                maxWidth: '78%',
                padding: '12px 16px',
                borderRadius: 14,
                background: msg.role === 'user' ? 'var(--ink)' : '#fff',
                color: msg.role === 'user' ? 'var(--paper)' : 'var(--ink)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--rule)',
                boxShadow: msg.role === 'assistant' ? 'var(--shadow-1)' : 'none',
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                animation: 'fadeIn .2s ease',
              }}>
                {msg.content}
              </div>
            </div>
          ))}

          {sending && (
            <div style={{ display: 'flex', gap: 14 }}>
              <AdvisorOrb size={38} pulsing />
              <div style={{
                padding: '12px 16px', borderRadius: 14,
                background: '#fff', border: '1px solid var(--rule)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Thinking…</span>
              </div>
            </div>
          )}

          {proposal?.ready && !isGenerating && (
            <ProposalCard
              proposal={proposal}
              onConfirm={confirmProgram}
              onAdjust={() => {
                setProposal(null);
                setMessages(m => [...m, { role: 'user', content: "I'd like to adjust the proposal." }]);
              }}
              confirming={confirming}
            />
          )}

          {isGenerating && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px 20px', background: 'var(--indigo-soft)',
              border: '1px solid transparent', borderRadius: 14,
              fontSize: 13, color: 'var(--indigo)',
            }}>
              <span className="spinner" style={{ width: 14, height: 14, borderTopColor: 'var(--indigo)' }} />
              Building your program skeleton — redirecting soon…
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {!isGenerating && (
          <div style={{
            padding: '12px 0 20px',
            display: 'flex', gap: 10, alignItems: 'flex-end',
          }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 10,
              background: '#fff', border: '1px solid var(--rule)', borderRadius: 12,
              padding: '10px 14px', boxShadow: 'var(--shadow-1)',
            }}>
              <Icon name="sparkle" size={15} style={{ color: 'var(--indigo)', flexShrink: 0 }} />
              <textarea
                id="onboarding-chat"
                name="onboarding-chat"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Tell me what you'd like to learn…"
                disabled={sending}
                rows={1}
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  fontSize: 14, fontFamily: 'var(--f-text)', color: 'var(--ink)',
                  background: 'transparent', resize: 'none',
                  lineHeight: 1.5,
                }}
              />
            </div>
            <button
              className="btn primary"
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              style={{ height: 44, padding: '0 18px' }}
            >
              <Icon name="send" size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
