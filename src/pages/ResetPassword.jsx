import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

// Supabase's password-recovery flow doesn't hand you a manual "token" query
// param — clicking the emailed link lands you back here with the recovery
// info in the URL hash, which the Supabase client (detectSessionInUrl: true)
// parses automatically and turns into a temporary logged-in session, firing
// a PASSWORD_RECOVERY auth event. From there you just call
// supabase.auth.updateUser({ password }) — no token handling needed at all.
// (Old code expected ?token=... and called a dead base44.auth.resetPassword()
// that had nothing to do with our real Supabase auth — it never worked.)
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') { setReady(true); setChecking(false); }
    });

    // Also check immediately in case the recovery session was already
    // established (e.g. detectSessionInUrl parsed the hash before this
    // listener attached).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) setReady(true);
      setChecking(false);
    });

    // Give it a moment to parse the URL hash before giving up
    const timeout = setTimeout(() => { if (!cancelled) setChecking(false); }, 3000);

    return () => { cancelled = true; subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

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
      const { error: err } = await supabase.auth.updateUser({ password: passwordVal });
      if (err) throw err;
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <AuthLayout icon={Lock} title="Verifying link…" subtitle="Just a moment">
        <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </AuthLayout>
    );
  }

  if (!ready) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Invalid or expired link"
        subtitle="This password reset link is missing, invalid, or has expired"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          Please request a new password reset email and use the link within a few minutes of receiving it.
        </p>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout icon={Lock} title="Password updated" subtitle="Redirecting you to sign in…">
        <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title="New password"
      subtitle="Enter your new password below"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Resetting...
            </>
          ) : (
            "Reset password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
