// NyasaAuth: thin workspace/onboarding layer on top of Supabase auth.
// Keeps the same hook API so existing pages don't need rewrites.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

const NyasaAuthContext = createContext(null);

export function NyasaAuthProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile]                     = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loadingProfile, setLoadingProfile]        = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfile(null);
      setOnboardingComplete(false);
      setLoadingProfile(false);
      return;
    }

    // Load workspace profile from Supabase `profiles` table
    (async () => {
      setLoadingProfile(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Profile load error:', error);
      }

      if (data) {
        setProfile(data);
        setOnboardingComplete(!!data.onboarding_complete);
      } else {
        // First login — no profile yet, needs onboarding
        setProfile(null);
        setOnboardingComplete(false);
      }
      setLoadingProfile(false);
    })();
  }, [user, authLoading]);

  // Expose a merged user object compatible with the existing codebase
  const nyasaUser = user
    ? {
        id:           user.id,
        email:        user.email,
        full_name:    profile?.full_name ?? user.user_metadata?.full_name ?? user.email,
        role:         profile?.role ?? 'user',
        avatar:       profile?.avatar_url ?? null,
        workspace_id: profile?.workspace_id ?? null,
        status:       'online',
      }
    : null;

  return (
    <NyasaAuthContext.Provider
      value={{ user: nyasaUser, profile, onboardingComplete, setOnboardingComplete, loadingProfile }}
    >
      {children}
    </NyasaAuthContext.Provider>
  );
}

export function useNyasaAuth() {
  const ctx = useContext(NyasaAuthContext);
  if (!ctx) throw new Error('useNyasaAuth must be used inside NyasaAuthProvider');
  return ctx;
}
