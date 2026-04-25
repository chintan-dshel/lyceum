export default function LessonContent({ lesson }) {
  if (!lesson) return null;
  const { content } = lesson;
  const references = lesson.lesson_spec?.references || [];
  if (!content?.sections) return <p style={{ color: 'var(--text-secondary)' }}>No content available for this lesson.</p>;

  return (
    <div className="lesson-content-area">
      {content.sections.map((section, i) => (
        <div key={i} className={`content-section ${section.type || 'text'}`}>
          {section.heading && <h2>{section.heading}</h2>}
          <p>{section.body}</p>
        </div>
      ))}

      {content.key_terms?.length > 0 && (
        <div className="key-terms">
          <h3>Key Terms</h3>
          {content.key_terms.map((term, i) => (
            <div key={i} className="key-term">
              <div className="key-term-name">{term.term}</div>
              <div className="key-term-def">{term.definition}</div>
            </div>
          ))}
        </div>
      )}

      {content.further_reading?.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy-600)', marginBottom: 12 }}>
            Further Reading
          </h3>
          <ul style={{ paddingLeft: 20, color: 'var(--gray-700)', fontSize: '0.875rem', lineHeight: 2 }}>
            {content.further_reading.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}

      {references.length > 0 && (
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy-600)', margin: 0 }}>
              Sources
            </h3>
            <span style={{ fontSize: 11, color: 'var(--ink-4)', fontStyle: 'italic' }}>
              AI-suggested — verify independently
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {references.map((ref, i) => (
              <div key={i} style={{ fontSize: '0.875rem', color: 'var(--ink-2)', paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
                <span style={{ fontWeight: 500 }}>{ref.title}</span>
                {ref.author && <span style={{ color: 'var(--ink-3)' }}> — {ref.author}</span>}
                {ref.year && <span style={{ color: 'var(--ink-4)' }}> ({ref.year})</span>}
                {ref.note && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2, fontStyle: 'italic' }}>{ref.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
