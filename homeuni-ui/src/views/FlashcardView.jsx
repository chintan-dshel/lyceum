import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { flashcards as flashcardsApi } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';
import { useAuth } from '../hooks/useAuth.jsx';

// ─── Card flip component ──────────────────────────────────
function FlashCard({ front, back, flipped, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ perspective: 900, width: '100%', maxWidth: 560, cursor: flipped ? 'default' : 'pointer' }}
    >
      <div style={{
        position: 'relative', height: 260,
        transformStyle: 'preserve-3d',
        transition: 'transform 0.45s cubic-bezier(.4,0,.2,1)',
        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
      }}>
        {/* Front */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
          background: 'var(--paper)', border: '1px solid var(--rule)',
          borderRadius: 16, padding: '28px 32px',
          display: 'flex', flexDirection: 'column', gap: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,.07)',
        }}>
          <div style={{ fontSize: 10.5, fontFamily: 'var(--f-mono)', color: 'var(--ink-4)', letterSpacing: '0.1em' }}>QUESTION</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 18, lineHeight: 1.55, color: 'var(--ink)', fontWeight: 500 }}>
            {front}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', textAlign: 'center' }}>Tap to reveal answer</div>
        </div>

        {/* Back */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          background: 'var(--indigo-soft)', border: '1px solid oklch(82% 0.08 265)',
          borderRadius: 16, padding: '28px 32px',
          display: 'flex', flexDirection: 'column', gap: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,.07)',
        }}>
          <div style={{ fontSize: 10.5, fontFamily: 'var(--f-mono)', color: 'var(--indigo)', letterSpacing: '0.1em' }}>ANSWER</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 16, lineHeight: 1.6, color: 'var(--ink)' }}>
            {back}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Rating buttons ───────────────────────────────────────
const RATINGS = [
  { label: 'Again', quality: 0, desc: 'Complete blank', color: 'oklch(38% 0.12 20)', bg: 'oklch(96% 0.04 20)' },
  { label: 'Hard',  quality: 3, desc: 'With difficulty', color: 'oklch(40% 0.1 50)',  bg: 'oklch(96% 0.04 50)' },
  { label: 'Good',  quality: 4, desc: 'Comfortable',    color: 'oklch(36% 0.1 265)', bg: 'var(--indigo-soft)' },
  { label: 'Easy',  quality: 5, desc: 'Instant recall', color: 'oklch(32% 0.1 145)', bg: 'oklch(93% 0.06 145)' },
];

function RatingButtons({ onRate, submitting }) {
  return (
    <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 560 }}>
      {RATINGS.map(r => (
        <button
          key={r.label}
          onClick={() => onRate(r.quality)}
          disabled={submitting}
          style={{
            flex: 1, padding: '12px 8px', borderRadius: 10,
            border: `1px solid ${r.color}22`,
            background: r.bg, cursor: submitting ? 'default' : 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            opacity: submitting ? 0.5 : 1, transition: 'opacity 0.15s',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.label}</span>
          <span style={{ fontSize: 10, color: r.color, opacity: 0.8 }}>{r.desc}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Idle screen ──────────────────────────────────────────
function IdleScreen({ due, onStart, generating, generateMsg, onGenerate }) {
  const byLesson = due.reduce((acc, c) => {
    const key = c.lessonTitle || 'Unknown lesson';
    if (!acc[key]) acc[key] = 0;
    acc[key]++;
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 40 }}>
      {due.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>All caught up!</div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 20 }}>
            No flashcards due today. Generate decks from your lessons to get started.
          </div>
          {generateMsg ? (
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)' }}>{generateMsg}</div>
          ) : (
            <button
              onClick={onGenerate}
              disabled={generating}
              style={{
                background: 'var(--indigo)', color: 'var(--paper)', border: 'none',
                borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 600,
                cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.6 : 1,
              }}
            >
              {generating ? 'Starting…' : 'Generate flashcards'}
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--indigo)', lineHeight: 1, marginBottom: 6 }}>{due.length}</div>
            <div style={{ fontSize: 16, color: 'var(--ink-2)' }}>cards due today</div>
          </div>

          <div style={{ background: 'var(--paper-2)', borderRadius: 12, border: '1px solid var(--rule)', overflow: 'hidden', marginBottom: 24 }}>
            {Object.entries(byLesson).map(([title, count], i, arr) => (
              <div key={title} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', fontSize: 13,
                borderBottom: i < arr.length - 1 ? '1px solid var(--rule)' : 'none',
              }}>
                <span style={{ color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                <span style={{ marginLeft: 12, fontSize: 12, fontFamily: 'var(--f-mono)', color: 'var(--indigo)', background: 'var(--indigo-soft)', padding: '2px 8px', borderRadius: 6, flexShrink: 0 }}>{count}</span>
              </div>
            ))}
          </div>

          <button
            onClick={onStart}
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 600, borderRadius: 12 }}
          >
            Start Review
          </button>
        </>
      )}
    </div>
  );
}

// ─── Done screen ──────────────────────────────────────────
function DoneScreen({ reviewed, onReset }) {
  const counts = reviewed.reduce((acc, r) => { acc[r.label] = (acc[r.label] || 0) + 1; return acc; }, {});
  const mastered = (counts['Easy'] || 0) + (counts['Good'] || 0);

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', paddingTop: 48, textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🎓</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Session complete</div>
      <div style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 32 }}>
        {reviewed.length} cards reviewed · {mastered} confident
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
        {RATINGS.map(r => counts[r.label] ? (
          <div key={r.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: r.color }}>{counts[r.label]}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{r.label}</div>
          </div>
        ) : null)}
      </div>

      <button onClick={onReset} className="btn ghost" style={{ fontSize: 13 }}>
        Back to deck
      </button>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────
export default function FlashcardView() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [due, setDue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | review | done
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewed, setReviewed] = useState([]);

  useEffect(() => {
    flashcardsApi.due()
      .then(({ due: d }) => setDue(d || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function startReview() {
    setQueue([...due]);
    setCurrent(0);
    setFlipped(false);
    setReviewed([]);
    setPhase('review');
  }

  function handleFlip() {
    if (!flipped) setFlipped(true);
  }

  const handleRate = useCallback(async (quality) => {
    if (submitting) return;
    const card = queue[current];
    setSubmitting(true);

    try {
      await flashcardsApi.review(card.lessonId, card.cardIndex, quality);
    } catch {
      // fire-and-forget — don't block the session on a network error
    }

    const ratingLabel = RATINGS.find(r => r.quality === quality)?.label || 'Good';
    setReviewed(prev => [...prev, { ...card, label: ratingLabel }]);

    const next = current + 1;
    if (next >= queue.length) {
      setPhase('done');
    } else {
      setCurrent(next);
      setFlipped(false);
    }
    setSubmitting(false);
  }, [submitting, queue, current]);

  // Keyboard shortcuts during review
  useEffect(() => {
    if (phase !== 'review') return;
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' && !flipped) { e.preventDefault(); handleFlip(); }
      if (flipped) {
        if (e.key === '1') handleRate(0);
        if (e.key === '2') handleRate(3);
        if (e.key === '3') handleRate(4);
        if (e.key === '4') handleRate(5);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, flipped, handleRate, handleFlip]);

  const card = queue[current];
  const progress = queue.length > 0 ? (current / queue.length) * 100 : 0;

  return (
    <div className="app-shell">
      <Sidebar active="flashcards" />
      <div className="main-content">
        <TopBar
          crumb="STUDY TOOLS"
          crumbHref="/dashboard"
          title="Flashcards"
          actions={
            phase === 'review' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, fontFamily: 'var(--f-mono)', color: 'var(--ink-3)' }}>
                  {current + 1} / {queue.length}
                </span>
                <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => setPhase('idle')}>
                  Exit
                </button>
              </div>
            )
          }
        />

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            Loading your deck…
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', padding: '32px 24px' }}>

            {phase === 'idle' && (
              <IdleScreen
                due={due}
                onStart={startReview}
                generating={generating}
                generateMsg={generateMsg}
                onGenerate={() => {
                  setGenerating(true);
                  flashcardsApi.generateAll()
                    .then(({ generating: n }) => {
                      setGenerateMsg(n > 0
                        ? `Generating ${n} deck${n > 1 ? 's' : ''} in the background — check back in a minute.`
                        : 'No new lessons found. Complete some lessons first.');
                    })
                    .catch(() => setGenerateMsg('Could not start generation — try again.'))
                    .finally(() => setGenerating(false));
                }}
              />
            )}

            {phase === 'done' && <DoneScreen reviewed={reviewed} onReset={() => setPhase('idle')} />}

            {phase === 'review' && card && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, maxWidth: 600, margin: '0 auto' }}>
                {/* Progress bar */}
                <div style={{ width: '100%', maxWidth: 560 }}>
                  <div style={{ height: 3, background: 'var(--rule)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--indigo)', borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--ink-4)' }}>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5 }}>{card.lessonTitle}</span>
                    <span style={{ fontFamily: 'var(--f-mono)' }}>{queue.length - current} left</span>
                  </div>
                </div>

                <FlashCard
                  front={card.front}
                  back={card.back}
                  flipped={flipped}
                  onClick={handleFlip}
                />

                {flipped ? (
                  <RatingButtons onRate={handleRate} submitting={submitting} />
                ) : (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-4)', fontFamily: 'var(--f-mono)' }}>
                    SPACE to flip · 1 Again · 2 Hard · 3 Good · 4 Easy
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
