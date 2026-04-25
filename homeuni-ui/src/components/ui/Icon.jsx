const paths = {
  book:     "M4 3h12a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2z",
  play:     "M6 4l12 8-12 8V4z",
  pause:    "M6 4h4v16H6zM14 4h4v16h-4z",
  mic:      "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  hand:     "M9 11V5a2 2 0 1 1 4 0v6 M13 11V4a2 2 0 1 1 4 0v9 M17 12V6a2 2 0 1 1 4 0v10a6 6 0 0 1-6 6h-3a6 6 0 0 1-5.2-3L3 14a2 2 0 0 1 3.5-2L9 15",
  chat:     "M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4V5z",
  grid:     "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  sparkle:  "M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z M20 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2",
  send:     "M4 20L21 12 4 4l0 6 11 2-11 2 0 6z",
  plus:     "M12 5v14M5 12h14",
  check:    "M4 12l5 5L20 6",
  x:        "M5 5l14 14M19 5L5 19",
  arrow:    "M5 12h14M13 5l7 7-7 7",
  calendar: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zM4 10h16M8 2v4M16 2v4",
  clock:    "M12 6v6l4 2 M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z",
  bolt:     "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  flask:    "M9 3v6L4 18a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3M8 3h8",
  compass:  "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM16 8l-2 6-6 2 2-6 6-2z",
  target:   "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zM12 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z",
  search:   "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3",
  settings: "M12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM19 12a7 7 0 0 0-.2-1.6l2.1-1.6-2-3.4-2.4.8a7 7 0 0 0-2.8-1.6L13 2h-4l-.7 2.6a7 7 0 0 0-2.8 1.6l-2.4-.8-2 3.4 2.1 1.6A7 7 0 0 0 3 12c0 .5.1 1.1.2 1.6l-2.1 1.6 2 3.4 2.4-.8a7 7 0 0 0 2.8 1.6L9 22h4l.7-2.6a7 7 0 0 0 2.8-1.6l2.4.8 2-3.4-2.1-1.6c.1-.5.2-1.1.2-1.6z",
  bell:     "M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM10 21a2 2 0 0 0 4 0",
  user:     "M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  chevron:  "M9 6l6 6-6 6",
  chevronD: "M6 9l6 6 6-6",
  file:     "M6 3h8l6 6v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v6h6",
  pen:      "M12 19l-7 2 2-7L17 3l5 5L12 19z",
  upload:   "M12 17V3M6 9l6-6 6 6M4 21h16",
  eye:      "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  chart:    "M3 20h18M6 16V10M11 16V4M16 16v-8M21 16v-3",
  trophy:   "M7 4h10v4a5 5 0 0 1-10 0V4zM5 4H3v2a3 3 0 0 0 4 3M19 4h2v2a3 3 0 0 1-4 3M9 15h6l1 5H8l1-5z",
  layers:   "M12 2l10 5-10 5L2 7l10-5zM2 12l10 5 10-5M2 17l10 5 10-5",
  star:     "M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6-4.4-4.3 6.1-.9L12 3z",
  waveform: "M2 12h2m4 0h2m4 0h2m4 0h2M6 6v12M18 6v12M10 3v18M14 3v18",
  lock:     "M6 10V7a6 6 0 1 1 12 0v3M5 10h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1z",
  more:     "M5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  brain:    "M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 3 3c1 0 2-.4 3-1V4c-1-.6-2-1-3-1zM15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-3 3c-1 0-2-.4-3-1V4c1-.6 2-1 3-1z",
  eraser:   "M16 3l5 5L9 20H4v-5L16 3zM12 7l5 5",
  users:    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  zap:      "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
};

export default function Icon({ name, size = 16, stroke = 1.6, style, className }) {
  const d = paths[name] || paths.bolt;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
      className={className}
    >
      {d.split('M').filter(Boolean).map((seg, i) => (
        <path key={i} d={'M' + seg} />
      ))}
    </svg>
  );
}
