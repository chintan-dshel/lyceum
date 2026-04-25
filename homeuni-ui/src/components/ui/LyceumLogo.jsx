export default function LyceumLogo({ size = 22, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ display: 'inline-block', flexShrink: 0 }}>
      <rect x="2" y="2" width="28" height="28" rx="8" fill={color || 'var(--ink)'} />
      <circle cx="11.5" cy="15" r="3" fill="var(--paper)" />
      <circle cx="20.5" cy="15" r="3" fill="var(--paper)" />
      <circle cx="11.5" cy="15" r="1.2" fill="var(--ink)" />
      <circle cx="20.5" cy="15" r="1.2" fill="var(--ink)" />
      <path d="M10 22c1.5 1.5 4 1.5 6 0c2 1.5 4.5 1.5 6 0" stroke="var(--paper)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
