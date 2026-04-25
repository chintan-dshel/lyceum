import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { flashcards as flashcardsApi } from '../lib/api.js';
import LyceumLogo from './ui/LyceumLogo.jsx';
import Icon from './ui/Icon.jsx';
import Avatar from './ui/Avatar.jsx';

export default function Sidebar({ programId, active, termLabel, weekProgress }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    flashcardsApi.due()
      .then(({ count }) => setDueCount(count || 0))
      .catch(() => {});
  }, []);

  const isActive = (id) => active === id || location.pathname.includes(`/${id}`);

  const navItems = [
    { id: 'dashboard',   icon: 'grid',     label: 'Dashboard',       to: '/dashboard' },
    { id: 'courses',     icon: 'book',     label: 'My Courses',      to: programId ? `/program/${programId}/semester/1` : '/dashboard' },
    { id: 'lecture',     icon: 'play',     label: "Today's Lecture", badge: 'Live', to: null },
    { id: 'flashcards',      icon: 'layers',   label: 'Flashcards',    to: '/flashcards', badge: dueCount > 0 ? String(dueCount) : null, badgeDue: true },
    { id: 'knowledge-graph', icon: 'compass',  label: 'Knowledge Map', to: programId ? `/program/${programId}/knowledge-graph` : null },
    { id: 'study',           icon: 'chat',     label: 'Study Groups',  to: programId ? `/program/${programId}/study` : null },
    { id: 'transcript',  icon: 'chart',    label: 'Transcript',      to: programId ? `/program/${programId}/transcript` : null },
  ];

  const initials = user?.full_name
    ? user.full_name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <LyceumLogo size={22} />
        <div className="sidebar-logo-text">Lyceum</div>
        <span className="kicker" style={{ marginLeft: 'auto', fontSize: 9.5 }}>α</span>
      </div>

      <div className="kicker sidebar-section-label">Workspace</div>

      {navItems.map(item => {
        const active = isActive(item.id);
        const El = item.to ? Link : 'button';
        const props = item.to
          ? { to: item.to }
          : { onClick: () => {}, type: 'button' };

        return (
          <El
            key={item.id}
            className={`sidebar-link${active ? ' active' : ''}`}
            style={!item.to ? { opacity: 0.5, cursor: 'default' } : {}}
            {...props}
          >
            <Icon name={item.icon} size={15} stroke={1.7} />
            <span>{item.label}</span>
            {item.badge && (
              <span style={{
                marginLeft: 'auto',
                fontSize: 9.5,
                fontFamily: 'var(--f-mono)',
                background: item.badgeDue
                  ? (active ? 'rgba(255,255,255,.15)' : 'var(--indigo-soft)')
                  : (active ? 'rgba(255,255,255,.15)' : 'var(--sage-soft)'),
                color: item.badgeDue
                  ? (active ? 'var(--paper)' : 'var(--indigo)')
                  : (active ? 'var(--paper)' : 'var(--sage)'),
                padding: '2px 6px',
                borderRadius: 4,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>{item.badge}</span>
            )}
          </El>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Term progress */}
      {termLabel && (
        <>
          <div className="kicker sidebar-section-label">{termLabel}</div>
          {weekProgress != null && (
            <div style={{ padding: '10px 10px', background: 'var(--paper-2)', borderRadius: 8, fontSize: 12, color: 'var(--ink-2)', margin: '0 0 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Progress</span>
                <span className="mono" style={{ color: 'var(--ink-3)' }}>{weekProgress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${weekProgress}%` }} />
              </div>
            </div>
          )}
        </>
      )}

      {/* User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px' }}>
        <Avatar name={initials} size={26} hue={265} />
        <div style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.full_name || 'Student'}
          </div>
          <button
            onClick={logout}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--ink-3)', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
