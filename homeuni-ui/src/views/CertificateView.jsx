import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { certificates } from '../lib/api.js';
import LyceumLogo from '../components/ui/LyceumLogo.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function degreeLabel(degreeType) {
  const map = {
    bachelor:    'Bachelor of',
    master:      'Master of',
    phd:         'Doctor of Philosophy in',
    certificate: 'Certificate in',
    associate:   'Associate of',
    course:      'Course Completion in',
  };
  return map[degreeType] || (degreeType ? degreeType.charAt(0).toUpperCase() + degreeType.slice(1) + ' in' : 'Degree in');
}

export default function CertificateView() {
  const { code } = useParams();
  const [cert, setCert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    certificates.verify(code)
      .then(({ certificate }) => setCert(certificate))
      .catch(() => setError('Certificate not found or invalid code.'))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Georgia, serif', color: '#666' }}>
      Verifying certificate…
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Georgia, serif', gap: 12 }}>
      <div style={{ fontSize: 48 }}>✗</div>
      <div style={{ fontSize: 20, color: '#c00' }}>Invalid Certificate</div>
      <div style={{ fontSize: 14, color: '#888' }}>{error}</div>
    </div>
  );

  return (
    <>
      {/* Print button — hidden when printing */}
      <div className="no-print" style={{
        position: 'fixed', top: 16, right: 16, zIndex: 100,
        display: 'flex', gap: 8,
      }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '8px 18px', borderRadius: 8, border: '1px solid #d0c8b0',
            background: '#fffdf7', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            color: '#5a4a2a', fontWeight: 500,
          }}
        >
          Print / Save PDF
        </button>
      </div>

      {/* Certificate */}
      <div style={{
        minHeight: '100vh', background: '#faf8f3',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px',
        fontFamily: 'Georgia, "Times New Roman", serif',
      }}>
        <div style={{
          width: 760, background: '#fffdf7',
          border: '1px solid #d0c8b0',
          boxShadow: '0 4px 40px rgba(0,0,0,.08)',
          padding: '56px 72px',
          position: 'relative',
          textAlign: 'center',
        }}>
          {/* Decorative border */}
          <div style={{
            position: 'absolute', inset: 12,
            border: '1px solid #c8b87a',
            pointerEvents: 'none',
          }} />

          {/* Corner ornaments */}
          {['topleft','topright','bottomleft','bottomright'].map(pos => (
            <div key={pos} style={{
              position: 'absolute',
              top: pos.startsWith('top') ? 8 : 'auto',
              bottom: pos.startsWith('bottom') ? 8 : 'auto',
              left: pos.endsWith('left') ? 8 : 'auto',
              right: pos.endsWith('right') ? 8 : 'auto',
              width: 20, height: 20,
              borderTop: pos.startsWith('top') ? '2px solid #c8b87a' : 'none',
              borderBottom: pos.startsWith('bottom') ? '2px solid #c8b87a' : 'none',
              borderLeft: pos.endsWith('left') ? '2px solid #c8b87a' : 'none',
              borderRight: pos.endsWith('right') ? '2px solid #c8b87a' : 'none',
            }} />
          ))}

          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 28 }}>
            <LyceumLogo size={28} />
            <span style={{ fontSize: 20, letterSpacing: '0.18em', color: '#5a4a2a', fontFamily: 'Georgia, serif', fontWeight: 400 }}>
              LYCEUM
            </span>
          </div>

          <div style={{ fontSize: 11, letterSpacing: '0.25em', color: '#8a7a5a', marginBottom: 32, textTransform: 'uppercase' }}>
            AI-Powered University
          </div>

          <div style={{ fontSize: 13, letterSpacing: '0.15em', color: '#8a7a5a', marginBottom: 16, textTransform: 'uppercase' }}>
            This certifies that
          </div>

          <div style={{ fontSize: 42, color: '#2a1a0a', marginBottom: 20, fontStyle: 'italic', lineHeight: 1.2 }}>
            {cert.full_name}
          </div>

          <div style={{ width: 120, height: 1, background: '#c8b87a', margin: '0 auto 20px' }} />

          <div style={{ fontSize: 14, color: '#5a4a2a', marginBottom: 8, letterSpacing: '0.08em' }}>
            has successfully completed the requirements for the
          </div>

          <div style={{ fontSize: 12, letterSpacing: '0.2em', color: '#8a7a5a', marginBottom: 10, textTransform: 'uppercase' }}>
            {degreeLabel(cert.degree_type)}
          </div>
          <div style={{ fontSize: 26, color: '#2a1a0a', fontWeight: 700, marginBottom: 6, letterSpacing: '0.03em' }}>
            {cert.field_of_study}
          </div>

          <div style={{ fontSize: 15, color: '#5a4a2a', marginBottom: cert.gpa ? 8 : 28, fontStyle: 'italic' }}>
            {cert.program_title}
          </div>

          {cert.gpa && (
            <div style={{ fontSize: 13, color: '#8a7a5a', marginBottom: 28 }}>
              Cumulative GPA: <strong style={{ color: '#2a1a0a' }}>{parseFloat(cert.gpa).toFixed(2)}</strong>
            </div>
          )}

          <div style={{ fontSize: 13, color: '#8a7a5a', marginBottom: 40 }}>
            Awarded {formatDate(cert.issued_at)} · {cert.total_semesters} semesters
          </div>

          {/* Signature line */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 80, marginBottom: 36 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 140, height: 1, background: '#a08060', marginBottom: 6 }} />
              <div style={{ fontSize: 11, letterSpacing: '0.1em', color: '#8a7a5a', textTransform: 'uppercase' }}>
                Dean of Studies
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 140, height: 1, background: '#a08060', marginBottom: 6 }} />
              <div style={{ fontSize: 11, letterSpacing: '0.1em', color: '#8a7a5a', textTransform: 'uppercase' }}>
                Academic Director
              </div>
            </div>
          </div>

          {/* Verification */}
          <div style={{
            marginTop: 8, padding: '10px 16px',
            background: '#f5f0e4', borderRadius: 6,
            display: 'inline-block',
          }}>
            <div style={{ fontSize: 9.5, letterSpacing: '0.12em', color: '#8a7a5a', textTransform: 'uppercase', marginBottom: 3 }}>
              Verification Code
            </div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#3a2a0a', letterSpacing: '0.08em' }}>
              {cert.verification_code}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
        }
      `}</style>
    </>
  );
}
