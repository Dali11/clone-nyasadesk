import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

const NyasaAuthContext = createContext(null);

export function NyasaAuthProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile]                       = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loadingProfile, setLoadingProfile]         = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setProfile(null);
      setOnboardingComplete(false);
      setLoadingProfile(false);
      return;
    }

    let cancelled = false;

    // Hard 4s timeout — never leave the user on a blank screen
    const timeout = setTimeout(() => {
      if (!cancelled) {
        console.warn('[NyasaAuth] Profile load timed out — proceeding without profile');
        setLoadingProfile(false);
      }
    }, 4000);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (cancelled) return;

        if (data) {
          setProfile(data);
          setOnboardingComplete(!!data.onboarding_complete);
        } else {
          setProfile(null);
          setOnboardingComplete(false);
        }
      } catch (e) {
        if (!cancelled) console.error('[NyasaAuth] Profile load error:', e);
      } finally {
        if (!cancelled) {
          clearTimeout(timeout);
          setLoadingProfile(false);
        }
      }
    })();

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [user?.id, authLoading]);

  const nyasaUser = user ? {
    id:           user.id,
    email:        user.email,
    full_name:    profile?.full_name ?? user.user_metadata?.full_name ?? user.email,
    role:         profile?.role ?? 'user',
    avatar:       profile?.avatar_url ?? null,
    workspace_id: profile?.workspace_id ?? null,
    status:       'online',
  } : null;

  return (
    <NyasaAuthContext.Provider value={{ user: nyasaUser, profile, onboardingComplete, setOnboardingComplete, loadingProfile }}>
      {children}
    </NyasaAuthContext.Provider>
  );
}

export function useNyasaAuth() {
  const ctx = useContext(NyasaAuthContext);
  if (!ctx) throw new Error('useNyasaAuth must be used inside NyasaAuthProvider');
  return ctx;
}
