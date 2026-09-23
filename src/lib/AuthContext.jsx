import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let done = false;

    // Hard 5s timeout on initial session fetch
    const timeout = setTimeout(() => {
      if (!done) {
        console.warn('[AuthContext] Session fetch timed out — treating as logged out');
        done = true;
        setLoading(false);
      }
    }, 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (done) return;
      // If the URL has an OAuth callback hash fragment, DON'T resolve yet —
      // let onAuthStateChange handle it. Otherwise the app briefly renders
      // the "not logged in" state before the OAuth session is detected.
      const hash = window.location.hash;
      if (hash && (hash.includes('access_token') || hash.includes('error_description'))) {
        return; // onAuthStateChange will fire shortly with the real session
      }
      done = true;
      clearTimeout(timeout);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signUp  = (email, password, meta = {}) => supabase.auth.signUp({ email, password, options: { data: meta } });
  const signOut = () => supabase.auth.signOut();
  const resetPassword = (email) => supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
