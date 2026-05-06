import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

export default function TopBar({ crumb, crumbHref, title, actions }) {
  const { user } = useAuth();
  const streak = user?.current_streak || 0;

  return (
    <header className="topbar">
      <div className="topbar-breadcrumb">
        {crumb && (
          crumbHref
            ? (
              <Link to={crumbHref} className="kicker" style={{ fontSize: 10, textDecoration: 'none', opacity: 0.7, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, lineHeight: 1 }}>←</span>
                {crumb}
              </Link>
            )
            : <div className="kicker" style={{ fontSize: 10 }}>{crumb}</div>
        )}
        <div className="topbar-title">{title}</div>
      </div>
      <div style={{ flex: 1 }} />
      {streak > 0 && (
        <div
          title={`${streak}-day streak`}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, fontWeight: 600,
            color: streak >= 7 ? 'oklch(55% 0.18 40)' : 'var(--ink-2)',
          }}
        >
          <span style={{ fontSize: 14 }}>🔥</span>
          <span style={{ fontFamily: 'var(--f-mono)' }}>{streak}</span>
        </div>
      )}
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>}
    </header>
  );
}
