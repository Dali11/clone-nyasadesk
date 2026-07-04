import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

const NyasaAuthContext = createContext(null);

export function NyasaAuthProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile]                       = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loadingProfile, setLoadingProfile]         = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin]       = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setProfile(null);
      setOnboardingComplete(false);
      setIsPlatformAdmin(false);
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
        const [{ data, error }, adminCheck] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          // Platform-admin allowlist check — RLS only lets a user see their
          // OWN row here (self_check policy: email = auth.email()), so this
          // never leaks the admin list to anyone else. Purely for showing/
          // hiding the "Admin Panel" nav link — real access is re-verified
          // server-side by every /api/admin/* endpoint.
          supabase.from('platform_admin_emails').select('email').eq('email', user.email).maybeSingle(),
        ]);

        if (cancelled) return;

        setIsPlatformAdmin(!!adminCheck?.data);

        if (data) {
          // If this is an invited teammate (not the workspace owner), the
          // shared workspace-level fields — workspace_name, sla_hours, plan —
          // live on the OWNER's profile row, not this one. Reading data.* directly
          // was a real bug: every teammate saw a blank workspace name in the
          // header, and Settings > Workspace/SLA saves were silently writing to
          // their own dead orphan profile row instead of the real workspace.
          let merged = data;
          if (data.workspace_id && data.workspace_id !== user.id) {
            const { data: ownerProfile } = await supabase.from('profiles')
              .select('workspace_name, sla_hours, plan, subscription_status, trial_ends_at, current_period_end, billing_currency')
              .eq('id', data.workspace_id)
              .maybeSingle();
            if (ownerProfile) {
              merged = { ...data, workspace_name: ownerProfile.workspace_name, sla_hours: ownerProfile.sla_hours, plan: ownerProfile.plan, subscription_status: ownerProfile.subscription_status, trial_ends_at: ownerProfile.trial_ends_at, current_period_end: ownerProfile.current_period_end, billing_currency: ownerProfile.billing_currency };
            }
          }
          setProfile(merged);
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

  // The actual workspace/owner id — this row's own id if they own the
  // workspace, or profile.workspace_id if they're an invited teammate. Any
  // write that touches shared workspace-level data (workspace_name, sla_hours,
  // channel_configs, rules) must target THIS id, never user.id directly.
  const workspaceOwnerId = profile?.workspace_id || user?.id || null;
  const isWorkspaceAdmin = !profile?.workspace_id || profile?.role === 'admin';
  // Chat visibility (separate from isWorkspaceAdmin, which gates
  // Settings/Channels/Rules management): owner, admin, or sales_manager see
  // every conversation in the workspace. Plain agents only see unassigned
  // chats plus whatever's assigned to them — enforced for real via RLS
  // (conversations_select/messages_select), this flag just drives the UI.
  const canViewAllChats = !profile?.workspace_id || profile?.role === 'admin' || profile?.role === 'sales_manager';

  return (
    <NyasaAuthContext.Provider value={{ user: nyasaUser, profile, onboardingComplete, setOnboardingComplete, loadingProfile, isPlatformAdmin, workspaceOwnerId, isWorkspaceAdmin, canViewAllChats }}>
      {children}
    </NyasaAuthContext.Provider>
  );
}

export function useNyasaAuth() {
  const ctx = useContext(NyasaAuthContext);
  if (!ctx) throw new Error('useNyasaAuth must be used inside NyasaAuthProvider');
  return ctx;
}
