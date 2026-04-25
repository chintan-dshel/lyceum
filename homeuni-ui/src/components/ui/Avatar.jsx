export default function Avatar({ size = 28, name = 'U', hue = 265 }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: size,
      background: `oklch(88% 0.05 ${hue})`,
      color: `oklch(30% 0.08 ${hue})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 600, letterSpacing: '0.02em',
      flexShrink: 0, fontFamily: 'var(--f-display)',
    }}>
      {initials}
    </div>
  );
}
