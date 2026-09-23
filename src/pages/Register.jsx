import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Loader2, Mail, Lock, Eye, EyeOff, User, CheckCircle2 } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const WA_GREEN = '#25D366';
const BG = '#111B21';
const SURFACE = '#1F2C34';
const SURFACE2 = '#2A3942';
const TEXT = '#E9EDF0';
const MUTED = '#8696A0';

export default function Register() {
  useDocumentTitle('Create Account');
  const { signUp } = useAuth();
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // FormData fallback — same fix as Login.jsx: some browsers'
    // autofill/password-manager fills fields without firing React's
    // onChange, leaving controlled state empty at submit time.
    const fd = new FormData(e.currentTarget);
    const nameVal     = (fd.get('name') || name || '').toString().trim();
    const emailVal    = (fd.get('email') || email || '').toString().trim();
    const passwordVal = (fd.get('password') || password || '').toString();
    const confirmVal  = (fd.get('confirm') || confirm || '').toString();
    if (!nameVal || !emailVal) { setError('Please fill in all fields'); return; }
    if (passwordVal !== confirmVal) { setError('Passwords do not match'); return; }
    if (passwordVal.length < 8)     { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    const { error: err } = await signUp(emailVal, passwordVal, { full_name: nameVal });
    setLoading(false);
    if (err) { setError(err.message || 'Registration failed'); return; }
    setDone(true);
  };

  const inputStyle = {
    width: '100%', background: SURFACE2, border: 'none', borderRadius: 12,
    padding: '14px 16px 14px 44px', color: TEXT, fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  };

  if (done) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', sans-serif" }}>
      <CheckCircle2 size={64} color={WA_GREEN} style={{ marginBottom: 24 }} />
      <h2 style={{ color: TEXT, fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Check your email</h2>
      <p style={{ color: MUTED, fontSize: 15, textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
        We sent a confirmation link to <strong style={{ color: TEXT }}>{email}</strong>. Click it to activate your account.
      </p>
      <Link to="/login" style={{ marginTop: 32, background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '14px 36px', borderRadius: 12 }}>
        Back to sign in
      </Link>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <img src="/icon-192.png" alt="Nyasadesk" style={{ width: 72, height: 72, borderRadius: 22, margin: '0 auto 16px', display: 'block' }} />
        <h1 style={{ color: TEXT, fontSize: 26, fontWeight: 800, margin: 0 }}>Create your workspace</h1>
        <p style={{ color: MUTED, fontSize: 14, marginTop: 6 }}>Free 14-day trial · No credit card needed</p>
      </div>

      <div style={{ width: '100%', maxWidth: 400 }}>

        {error && <div style={{ background: '#FF525220', border: '1px solid #FF525240', borderRadius: 10, padding: '10px 14px', color: '#FF8A80', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            <User size={16} color={MUTED} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input name="name" autoComplete="name" style={inputStyle} type="text" placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div style={{ position: 'relative' }}>
            <Mail size={16} color={MUTED} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input name="email" autoComplete="email" style={inputStyle} type="email" placeholder="Work email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div style={{ position: 'relative' }}>
            <Lock size={16} color={MUTED} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input name="password" autoComplete="new-password" style={{ ...inputStyle, paddingRight: 44 }} type={showPw ? 'text' : 'password'} placeholder="Password (min. 8 chars)" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0 }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Lock size={16} color={MUTED} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input name="confirm" autoComplete="new-password" style={inputStyle} type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          <button type="submit" disabled={loading} style={{ background: WA_GREEN, color: '#fff', border: 'none', borderRadius: 14, padding: '15px', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.7 : 1, marginTop: 4 }}>
            {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : null}
            Create account
          </button>
        </form>

        <p style={{ textAlign: 'center', color: MUTED, fontSize: 14, marginTop: 28 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: WA_GREEN, fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
