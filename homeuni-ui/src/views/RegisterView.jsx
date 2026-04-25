import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import LyceumLogo from '../components/ui/LyceumLogo.jsx';

const inputStyle = {
  width: '100%', padding: '10px 13px', borderRadius: 8,
  border: '1px solid var(--rule)', fontSize: 14,
  fontFamily: 'var(--f-text)', color: 'var(--ink)',
  background: 'var(--paper-2)', outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
};

export default function RegisterView() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.email, form.password, form.full_name);
      navigate('/onboarding');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--paper)', padding: '24px 16px',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 36 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <LyceumLogo size={28} />
          <div>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>Lyceum</div>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: -1 }}>Your AI-powered university</div>
          </div>
        </div>

        <div className="serif" style={{ fontSize: 22, fontWeight: 500, marginBottom: 6, letterSpacing: '-0.01em' }}>
          Begin your education
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 24 }}>
          Your AI advisor will design a custom degree program for you.
        </div>

        {error && (
          <div style={{
            background: 'oklch(95% 0.04 15)', color: 'var(--rose)',
            padding: '9px 13px', borderRadius: 8, fontSize: 13, marginBottom: 18,
            border: '1px solid oklch(88% 0.06 15)',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div className="kicker" style={{ marginBottom: 6 }}>Your name</div>
            <input
              type="text"
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Alex Chen"
              required
              style={inputStyle}
            />
          </div>
          <div>
            <div className="kicker" style={{ marginBottom: 6 }}>Email</div>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
              required
              style={inputStyle}
            />
          </div>
          <div>
            <div className="kicker" style={{ marginBottom: 6 }}>Password</div>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="At least 8 characters"
              minLength={8}
              required
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            className="btn primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            disabled={loading}
          >
            {loading ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Creating account…</> : 'Start learning'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--indigo)', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
