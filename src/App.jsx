import React, { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import OfflineBanner from "@/components/OfflineBanner";
import { useOutboxSync } from "@/lib/useOutboxSync";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { NyasaAuthProvider, useNyasaAuth } from "@/lib/NyasaAuth";
import ScrollToTop from "./components/ScrollToTop";

import Landing              from "./pages/Landing";
import MultiAgentFeature   from "./pages/MultiAgentFeature";
import WhatsappChatbots    from "./pages/WhatsappChatbots";
import OmnichannelFeature  from "./pages/OmnichannelFeature";
import Pricing         from "./pages/Pricing";
import Login           from "./pages/Login";
import Register        from "./pages/Register";
import ForgotPassword  from "./pages/ForgotPassword";
import ResetPassword   from "./pages/ResetPassword";
import Onboarding      from "./pages/Onboarding";
import Inbox           from "./pages/Inbox";
import Dashboard       from "./pages/Dashboard";
import Contacts        from "./pages/Contacts";
import Broadcasts      from "./pages/Broadcasts";
import Rules           from "./pages/Rules";
import CannedResponses from "./pages/CannedResponses";
import AiAgents        from "./pages/AiAgents";
import Documents       from "./pages/Documents";
import Sales           from "./pages/Sales";
import Settings        from "./pages/Settings";
import AdminLayout     from "./pages/admin/AdminLayout";
import AdminOverview   from "./pages/admin/AdminOverview";
import AdminWorkspaces from "./pages/admin/AdminWorkspaces";
import AdminAdmins     from "./pages/admin/AdminAdmins";
import AdminPricing   from "./pages/admin/AdminPricing";
import AdminChurn      from "./pages/admin/AdminChurn";
import AdminAiUsage    from "./pages/admin/AdminAiUsage";
import AdminTransactions from "./pages/admin/AdminTransactions";
import AdminAuditLog   from "./pages/admin/AdminAuditLog";
import PrivacyPolicy   from './pages/PrivacyPolicy';
import DataDeletion    from './pages/DataDeletion';
import SupportPage     from './pages/SupportPage';
import MyCommissions    from './pages/MyCommissions';
import AdminCommissions from './pages/admin/AdminCommissions';
import AdminUsers      from './pages/admin/AdminUsers';
import { LockKeyhole } from 'lucide-react';
import InstallPrompt from './components/InstallPrompt';
import { supabase } from '@/lib/supabase';

function AppRoutes() {
  const location = useLocation();
  const navigate  = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // ── Service Worker → app navigation (notification clicks) ──────────────
  // The SW sends NOTIF_NAVIGATE when a notification is clicked and the app
  // is already open. We listen here so React Router handles it properly
  // (no full page reload, hash routing intact).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    
    // Check for pending navigation from a cold start (app was closed)
    const pending = sessionStorage.getItem('nyasa_notif_navigate');
    if (pending) {
      sessionStorage.removeItem('nyasa_notif_navigate');
      try {
        const target = new URL(pending);
        if (target.origin === window.location.origin) {
          setTimeout(() => navigate(target.pathname + target.search + target.hash), 200);
        }
      } catch {}
    }
    
    const handler = (event) => {
      if (event.data?.type === 'NOTIF_NAVIGATE' && event.data.url) {
        try {
          const target = new URL(event.data.url);
          if (target.origin === window.location.origin) {
            navigate(target.pathname + target.search + target.hash, { replace: false });
          }
        } catch {}
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [navigate]);
  const { onboardingComplete, loadingProfile, profile, workspaceOwnerId } = useNyasaAuth();
  useOutboxSync(workspaceOwnerId);

  // ── Public embeddable support page — no auth, no loading gate. ─────────
  // Meant to be iframed on a customer's own site or linked to directly, so
  // it must render instantly regardless of whether this browser has a
  // Nyasadesk session.
  if (location.pathname.startsWith('/support/')) {
    return (
      <Routes>
        <Route path="/support/:workspaceId" element={<SupportPage />} />
      </Routes>
    );
  }

  // Show spinner while restoring session / loading profile
  if (authLoading || loadingProfile) {
    return (
      <div style={{ minHeight: "100vh", background:"var(--nyasa-surface-1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #25D366", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // ── NOT logged in — show public pages only ──────────────────────────────
  if (!user) {
    return (
      <Routes>
        <Route path="/"                element={<Landing />} />
        <Route path="/pricing"         element={<Pricing />} />
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        {/* Any other path → landing */}
        <Route path="/privacy"         element={<PrivacyPolicy />} />
        <Route path="/data-deletion"    element={<DataDeletion />} />
        <Route path="/features/multi-agent" element={<MultiAgentFeature />} />
        <Route path="/features/whatsapp-chatbots" element={<WhatsappChatbots />} />
        <Route path="/features/omnichannel" element={<OmnichannelFeature />} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // ── Logged in but onboarding not done ───────────────────────────────────
  // IMPORTANT: only gate on an explicit `false` here. onboardingComplete can
  // be `null` ("we don't know yet" — profile still loading or a slow/failed
  // fetch) — treating null the same as false used to shove already-invited
  // teammates into the "create a new workspace" wizard on a slow first
  // login, which silently promoted them to admin of their own phantom
  // workspace. Only a confirmed `false` (real profile row, genuinely never
  // onboarded) should show the wizard.
  if (onboardingComplete === false) {
    return (
      <Routes>
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  }

  // ── Hard block: workspace suspended by a platform admin ─────────────────
  // Real enforcement, not cosmetic -- every route renders this instead,
  // regardless of what URL was requested. profile.subscription_status is
  // already merged from the workspace OWNER's row for invited teammates
  // (see NyasaAuth.jsx), so this correctly blocks the whole team at once.
  if (profile?.subscription_status === 'suspended') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--nyasa-surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <LockKeyhole size={26} color="#f87171" />
          </div>
          <p style={{ color: 'white', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>This account has been suspended</p>
          <p style={{ color: '#9CA3AF', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            Access to Nyasadesk has been paused for this workspace. If you believe this is a mistake, please contact support to resolve it.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <a href="mailto:support@nyasadesk.com" style={{ display: 'inline-block', background: '#25D366', color: '#0D1418', fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: 10, textDecoration: 'none' }}>
              Contact support
            </a>
            <button onClick={() => supabase.auth.signOut()} style={{ background: 'transparent', color: '#9CA3AF', fontWeight: 600, fontSize: 14, padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Fully authenticated ────────────────────────────────────────────────────
  return (
    <Routes>
      <Route path="/"           element={<Inbox />} />
      <Route path="/dashboard"  element={<Dashboard />} />
      <Route path="/contacts"   element={<Contacts />} />
      <Route path="/broadcasts" element={<Broadcasts />} />
      <Route path="/rules"      element={<Rules />} />
      <Route path="/canned"     element={<CannedResponses />} />
      <Route path="/ai-agents"  element={<AiAgents />} />
      <Route path="/documents"  element={<Documents />} />
      <Route path="/sales"      element={<Sales />} />
      <Route path="/commissions" element={<MyCommissions />} />
      <Route path="/privacy"        element={<PrivacyPolicy />} />
      <Route path="/data-deletion"   element={<DataDeletion />} />
      <Route path="/settings"   element={<Settings />} />
      <Route path="/pricing"    element={<Pricing />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index             element={<AdminOverview />} />
        <Route path="workspaces" element={<AdminWorkspaces />} />
        <Route path="admins"     element={<AdminAdmins />} />
        <Route path="pricing"    element={<AdminPricing />} />
        <Route path="churn"       element={<AdminChurn />} />
        <Route path="ai-usage"    element={<AdminAiUsage />} />
        <Route path="transactions" element={<AdminTransactions />} />
        <Route path="audit-log"   element={<AdminAuditLog />} />
        <Route path="commissions" element={<AdminCommissions />} />
        <Route path="users"       element={<AdminUsers />} />
      </Route>
      <Route path="/login"      element={<Navigate to="/" replace />} />
      <Route path="/register"   element={<Navigate to="/" replace />} />
      <Route path="*"           element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/* ── PersistentShell ───────────────────────────────────────────────────────
 * Keeps Inbox mounted at all times (display toggled via CSS, never unmounted).
 * Secondary pages are lazy-mounted on first visit and also kept alive.
 * This eliminates the "full reload" flash when navigating between pages.
 *
 * CSS strategy:
 *   - The Inbox div has `display:contents` when active, `display:none` when
 *     another route is shown — React never tears it down.
 *   - Each secondary page div is inserted into the DOM on first navigation
 *     to that route and stays there (hidden) on subsequent navigations away.
 *
 * Route matching:
 *   - "/" → Inbox (always mounted)
 *   - Everything else → secondary page, full-screen overlay
 *   - Admin routes still use their own <AdminLayout> with nested <Outlet>
 */

// Pages that live alongside Inbox (rendered once, toggled visible)
const SECONDARY_PAGES = [
  { path: '/dashboard',  Component: Dashboard       },
  { path: '/contacts',   Component: Contacts        },
  { path: '/broadcasts', Component: Broadcasts      },
  { path: '/rules',      Component: Rules           },
  { path: '/canned',     Component: CannedResponses },
  { path: '/ai-agents',  Component: AiAgents        },
  { path: '/documents',  Component: Documents       },
  { path: '/sales',      Component: Sales           },
  { path: '/commissions',Component: MyCommissions   },
  { path: '/settings',   Component: Settings        },
  { path: '/pricing',    Component: Pricing         },
  { path: '/privacy',    Component: PrivacyPolicy   },
  { path: '/data-deletion', Component: DataDeletion },
];

function PersistentShell() {
  const location = useLocation();
  const navigate  = useNavigate();
  const pathname  = location.pathname;

  // Admin routes — delegate entirely to <AdminLayout> (has its own Outlet)
  const isAdmin = pathname.startsWith('/admin');
  if (isAdmin) {
    return (
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index             element={<AdminOverview />} />
          <Route path="workspaces" element={<AdminWorkspaces />} />
          <Route path="admins"     element={<AdminAdmins />} />
          <Route path="pricing"    element={<AdminPricing />} />
          <Route path="churn"       element={<AdminChurn />} />
          <Route path="ai-usage"    element={<AdminAiUsage />} />
          <Route path="transactions" element={<AdminTransactions />} />
          <Route path="audit-log"   element={<AdminAuditLog />} />
          <Route path="commissions" element={<AdminCommissions />} />
          <Route path="users"       element={<AdminUsers />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }

  // Redirect /login, /register → home
  if (pathname === '/login' || pathname === '/register') {
    return <Navigate to="/" replace />;
  }

  // Find which secondary page (if any) is active
  const activeSecondary = SECONDARY_PAGES.find(p => pathname === p.path || pathname.startsWith(p.path + '/'));

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* ── Inbox: always mounted, hidden behind secondary pages via CSS ── */}
      {/* Using visibility:hidden + pointer-events:none (not display:none) so
          Inbox's internal flex layout stays intact and realtime subs keep running */}
      <div style={{
        position: 'absolute', inset: 0,
        visibility: activeSecondary ? 'hidden' : 'visible',
        pointerEvents: activeSecondary ? 'none' : 'auto',
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
      }}>
        <Inbox />
      </div>

      {/* ── Secondary pages: each mounted once on first visit ─────────── */}
      {SECONDARY_PAGES.map(({ path, Component }) => {
        const isActive = activeSecondary?.path === path;
        return (
          <MountOnce key={path} active={isActive}>
            <Component />
          </MountOnce>
        );
      })}

      {/* Catch-all: unknown route → redirect to inbox */}
      {!activeSecondary && pathname !== '/' && (
        <Navigate to="/" replace />
      )}
    </div>
  );
}

/**
 * MountOnce — renders children the first time `active` becomes true,
 * then keeps them mounted (hidden via CSS) on subsequent deactivations.
 * This gives us "mount once, toggle visibility" semantics without
 * needing any complex state management.
 */
function MountOnce({ active, children }) {
  const [mounted, setMounted] = React.useState(active);
  React.useEffect(() => { if (active) setMounted(true); }, [active]);
  if (!mounted) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: active ? 'flex' : 'none',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

/* ── ContactsPermissionBanner ──────────────────────────────────────────────
 * Shows once after login if the Contact Picker API is available AND the user
 * has not yet synced their phone contacts. After sync (or dismiss), stores a
 * flag in localStorage so it never appears again.
 * WhatsApp does the same on first launch — this gives Nyasadesk the same UX.
 */
function ContactsPermissionBanner() {
  const { user, profile, workspaceOwnerId } = useNyasaAuth();
  const [show, setShow]         = React.useState(false);
  const [syncing, setSyncing]   = React.useState(false);
  const [done, setDone]         = React.useState(false);

  // Only show if: Contact Picker API available + not yet synced + user is logged in
  React.useEffect(() => {
    if (!user) return;
    const synced = localStorage.getItem('nyasa_contacts_synced');
    const dismissed = localStorage.getItem('nyasa_contacts_dismissed');
    const hasApi = typeof navigator !== 'undefined'
      && 'contacts' in navigator
      && 'ContactsManager' in window;
    if (hasApi && !synced && !dismissed) {
      // Delay slightly so the app is fully rendered first
      const t = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(t);
    }
  }, [user]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { pickPhoneContacts, syncPhoneContacts } = await import('@/lib/channels');
      const wId = workspaceOwnerId || profile?.workspace_id || user?.id;
      const picked = await pickPhoneContacts();
      if (picked.length === 0) {
        localStorage.setItem('nyasa_contacts_dismissed', '1');
        setShow(false);
        return;
      }
      await syncPhoneContacts(wId, picked);
      localStorage.setItem('nyasa_contacts_synced', Date.now().toString());
      setDone(true);
      setTimeout(() => setShow(false), 2500);
    } catch (e) {
      // User cancelled or API error — mark dismissed so we don't pester them
      localStorage.setItem('nyasa_contacts_dismissed', '1');
      setShow(false);
    } finally {
      setSyncing(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('nyasa_contacts_dismissed', '1');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, width: 'calc(100% - 32px)', maxWidth: 400,
      background: '#1C2030', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 16, padding: '14px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      {/* Icon */}
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: 'rgba(37,211,102,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2"/>
          <path d="M12 18h.01"/>
          <path d="M9 7h6M9 11h6M9 15h4"/>
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {done ? (
          <p style={{ color: '#25D366', fontWeight: 700, fontSize: 14, margin: 0 }}>
            ✓ Contacts synced — names will appear in your inbox
          </p>
        ) : (
          <>
            <p style={{ color: 'white', fontWeight: 700, fontSize: 14, margin: '0 0 2px' }}>
              See names instead of numbers
            </p>
            <p style={{ color: '#9CA3AF', fontSize: 12, margin: '0 0 10px', lineHeight: 1.5 }}>
              Allow Nyasadesk to read your phone contacts so customers appear by name — just like WhatsApp.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSync}
                disabled={syncing}
                style={{
                  background: '#25D366', color: 'white', border: 'none',
                  borderRadius: 10, padding: '7px 14px', fontSize: 13,
                  fontWeight: 700, cursor: 'pointer', opacity: syncing ? 0.7 : 1,
                }}>
                {syncing ? 'Syncing…' : 'Sync contacts'}
              </button>
              <button
                onClick={handleDismiss}
                style={{
                  background: 'transparent', color: '#6B7280', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, padding: '7px 12px', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer',
                }}>
                Not now
              </button>
            </div>
          </>
        )}
      </div>

      {/* Close */}
      <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', padding: 2, marginTop: -2 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

function InstallPromptWithAuth() {
  const { workspaceOwnerId } = useNyasaAuth();
  return <InstallPrompt workspaceOwnerId={workspaceOwnerId} />;
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <NyasaAuthProvider>
          <Router>
            <ScrollToTop />
            <AppRoutes />
          </Router>
          <ContactsPermissionBanner />
          <OfflineBanner />
      <Toaster />
        <InstallPromptWithAuth />
        </NyasaAuthProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
