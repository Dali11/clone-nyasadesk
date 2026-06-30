import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { UserPlus, Mail, Lock, Loader2, CheckCircle2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import GoogleIcon from '@/components/GoogleIcon';

export default function Register() {
  const { signUp, signInWithGoogle } = useAuth();
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [done, setDone]                 = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    const { error: err } = await signUp(email, password);
    setLoading(false);
    if (err) { setError(err.message || 'Registration failed'); return; }
    setDone(true);
  };

  if (done) {
    return (
      <AuthLayout icon={CheckCircle2} title="Check your email" subtitle={`We sent a confirmation link to ${email}`}>
        <p className="text-sm text-muted-foreground text-center">
          Click the link in your email to activate your account, then come back to log in.
        </p>
        <Link to="/login">
          <Button className="w-full h-12 mt-6">Back to login</Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Start your free Nyasadesk trial"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
        </>
      }
    >
      <Button variant="outline" className="w-full h-12 text-sm font-medium mb-6" onClick={signInWithGoogle}>
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="email" type="email" placeholder="you@company.com" className="pl-10 h-12"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="password" type="password" placeholder="Min. 8 characters" className="pl-10 h-12"
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="confirm" type="password" placeholder="••••••••" className="pl-10 h-12"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          </div>
        </div>
        <Button type="submit" className="w-full h-12" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
