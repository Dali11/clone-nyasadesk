import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const WA_GREEN = '#25D366';
const BG = '#111B21';
const SURFACE = '#1F2C34';
const SURFACE2 = '#2A3942';
const TEXT = '#E9EDF0';
const MUTED = '#8696A0';

export default function Login() {
  useDocumentTitle('Sign In');
  const { signIn } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // Read the actual DOM values via FormData, not just React state — some
    // browsers' autofill/password-manager fills the input visually without
    // firing a React-visible 'input' event, leaving controlled state empty
    // even though the field looks filled. This was the root cause of the
    // "missing email or phone" bug: state was '' at submit time despite the
    // field showing text. FormData reads what's actually in the DOM.
    const fd = new FormData(e.currentTarget);
    const emailVal = (fd.get('email') || email || '').toString().trim();
    const passwordVal = (fd.get('password') || password || '').toString();
    if (!emailVal || !passwordVal) { setError('Please enter your email and password'); return; }
    setLoading(true);
    const { error: err } = await signIn(emailVal, passwordVal);
    if (err) { setError(err.message || 'Invalid email or password'); setLoading(false); }
  };

  const inputStyle = {
    width: '100%', background: SURFACE2, border: 'none', borderRadius: 12,
    padding: '14px 16px 14px 44px', color: TEXT, fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', sans-serif" }}>
      {/* Logo */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <img src="/icon-192.png" alt="Nyasadesk" style={{ width: 72, height: 72, borderRadius: 22, margin: '0 auto 16px', display: 'block' }} />
        <h1 style={{ color: TEXT, fontSize: 26, fontWeight: 800, margin: 0 }}>Welcome back</h1>
        <p style={{ color: MUTED, fontSize: 14, marginTop: 6 }}>Sign in to your Nyasadesk workspace</p>
      </div>

      <div style={{ width: '100%', maxWidth: 400 }}>

        {error && (
          <div style={{ background: '#FF525220', border: '1px solid #FF525240', borderRadius: 10, padding: '10px 14px', color: '#FF8A80', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            <Mail size={16} color={MUTED} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input name="email" autoComplete="email" style={inputStyle} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div style={{ position: 'relative' }}>
            <Lock size={16} color={MUTED} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input name="password" autoComplete="current-password" style={{ ...inputStyle, paddingRight: 44 }} type={showPw ? 'text' : 'password'} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0 }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Link to="/forgot-password" style={{ color: WA_GREEN, fontSize: 13, textDecoration: 'none' }}>Forgot password?</Link>
          </div>
          <button type="submit" disabled={loading} style={{
            background: WA_GREEN, color: '#fff', border: 'none', borderRadius: 14,
            padding: '15px', fontWeight: 700, fontSize: 15, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: loading ? 0.7 : 1
          }}>
            {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : null}
            Sign in
          </button>
        </form>

        <p style={{ textAlign: 'center', color: MUTED, fontSize: 14, marginTop: 28 }}>
          No account?{' '}
          <Link to="/register" style={{ color: WA_GREEN, fontWeight: 600, textDecoration: 'none' }}>Create one free</Link>
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
