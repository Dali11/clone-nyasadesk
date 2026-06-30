import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { NyasaAuthProvider, useNyasaAuth } from "@/lib/NyasaAuth";
import ScrollToTop from "./components/ScrollToTop";

import Landing        from "./pages/Landing";
import Login          from "./pages/Login";
import Register       from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword  from "./pages/ResetPassword";
import Onboarding     from "./pages/Onboarding";
import Inbox          from "./pages/Inbox";
import Dashboard      from "./pages/Dashboard";
import Contacts       from "./pages/Contacts";
import Broadcasts     from "./pages/Broadcasts";
import Rules          from "./pages/Rules";
import CannedResponses from "./pages/CannedResponses";
import Settings       from "./pages/Settings";

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { onboardingComplete, loadingProfile } = useNyasaAuth();

  if (authLoading || loadingProfile) {
    return (
      <div style={{ minHeight: "100vh", background: "#111B21", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #25D366", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/"                element={<Landing />} />
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (!onboardingComplete) {
    return (
      <Routes>
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/"           element={<Inbox />} />
      <Route path="/dashboard"  element={<Dashboard />} />
      <Route path="/contacts"   element={<Contacts />} />
      <Route path="/broadcasts" element={<Broadcasts />} />
      <Route path="/rules"      element={<Rules />} />
      <Route path="/canned"     element={<CannedResponses />} />
      <Route path="/settings"   element={<Settings />} />
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
          <Toaster />
        </NyasaAuthProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
