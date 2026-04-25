import { useAuth } from '../hooks/useAuth.jsx';
import Icon from './ui/Icon.jsx';

export default function TopBar({ crumb, title, actions }) {
  const { user } = useAuth();
  const streak = user?.current_streak || 0;

  return (
    <header className="topbar">
      <div className="topbar-breadcrumb">
        {crumb && <div className="kicker" style={{ fontSize: 10 }}>{crumb}</div>}
        <div className="topbar-title">{title}</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--ink-3)' }}>
        <Icon name="search" size={15} />
        <span className="mono">⌘K</span>
      </div>
      <div style={{ width: 1, height: 22, background: 'var(--rule)' }} />
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
      <Icon name="bell" size={16} style={{ color: 'var(--ink-2)' }} />
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>}
    </header>
  );
}
