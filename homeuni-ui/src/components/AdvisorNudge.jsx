import { useNudges } from '../hooks/useProgram.js';

export default function AdvisorNudge({ programId }) {
  const { nudges, dismiss } = useNudges(programId);

  if (!nudges.length) return null;

  // Show only the most recent nudge
  const nudge = nudges[0];

  return (
    <div className="nudge-banner">
      <span className="nudge-icon">✦</span>
      <div className="nudge-text">
        <strong style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: '#92400e' }}>
          A note from your advisor
        </strong>
        {nudge.message}
      </div>
      <button
        className="nudge-dismiss"
        onClick={() => dismiss(nudge.id)}
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
