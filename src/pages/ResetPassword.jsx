// Password reset landing page. The reset email links here as
// /reset-password?token=<better-auth verification token>; this page posts
// the token + new password to /api/auth/reset-password.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const passwordVal = (fd.get('password') || newPassword || '').toString();
    const confirmVal  = (fd.get('confirm')  || confirmPassword || '').toString();
    if (passwordVal !== confirmVal) { setError("Passwords do not match"); return; }
    if (passwordVal.length < 8)     { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: passwordVal }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.message || 'This reset link is invalid or has expired.');
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 1800);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please request a new reset link.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#13131d' }}>
        <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <h2 className="text-lg font-semibold text-white mb-2">Invalid reset link</h2>
          <p className="text-sm text-white/60 mb-4">This page needs a valid reset token from your email.</p>
          <button onClick={() => navigate('/login')} className="w-full py-2.5 rounded-lg bg-white/10 text-white text-sm">
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#13131d' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <h2 className="text-lg font-semibold text-white mb-4">Choose a new password</h2>
        {done ? (
          <p className="text-sm text-emerald-400 mb-4">Password updated. Redirecting to login…</p>
        ) : (
          <>
            <input type="password" name="password" placeholder="New password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} required minLength={8}
              className="w-full mb-3 px-3 py-2.5 rounded-lg bg-white/5 text-white text-sm outline-none" />
            <input type="password" name="confirm" placeholder="Confirm new password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8}
              className="w-full mb-3 px-3 py-2.5 rounded-lg bg-white/5 text-white text-sm outline-none" />
            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg bg-white text-[#13131d] text-sm font-medium disabled:opacity-50">
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
