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
    const handler = (event) => {
      if (event.data?.type === 'NOTIF_NAVIGATE' && event.data.url) {
        try {
          const target = new URL(event.data.url);
          // Only handle same-origin navigation
          if (target.origin === window.location.origin) {
            navigate(target.pathname + target.search + target.hash, { replace: false });
          }
        } catch { /* ignore malformed URLs */ }
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

  // ── Fully authenticated — go straight to inbox, never landing ──────────
  return (
    <Routes>
      {/* / always goes to Inbox — not Landing */}
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
      {/* Dedicated admin section — own shell/menu, see AdminLayout */}
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
      {/* Redirect /login and /register back to inbox when already logged in */}
      <Route path="/login"      element={<Navigate to="/" replace />} />
      <Route path="/register"   element={<Navigate to="/" replace />} />
      <Route path="*"           element={<Navigate to="/" replace />} />
    </Routes>
  );
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
          <OfflineBanner />
      <Toaster />
        <InstallPrompt />
        </NyasaAuthProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
