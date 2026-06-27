import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { NyasaAuthProvider, useNyasaAuth } from '@/lib/NyasaAuth';
import ScrollToTop from './components/ScrollToTop';

// Lazy-load pages to isolate errors
import Inbox from './pages/Inbox';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Broadcasts from './pages/Broadcasts';
import Rules from './pages/Rules';
import CannedResponses from './pages/CannedResponses';
import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';

function AppRoutes() {
  const { onboardingComplete } = useNyasaAuth();
  if (!onboardingComplete) {
    return <Routes><Route path="*" element={<Onboarding />} /></Routes>;
  }
  return (
    <Routes>
      <Route path="/" element={<Inbox />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/contacts" element={<Contacts />} />
      <Route path="/broadcasts" element={<Broadcasts />} />
      <Route path="/rules" element={<Rules />} />
      <Route path="/canned" element={<CannedResponses />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const AuthenticatedApp = () => {
  const { authError, isLoadingAuth, isLoadingPublicSettings } = useAuth();
  // Don't block on loading — render app immediately with mock data
  if (authError?.type === 'user_not_registered') return <UserNotRegisteredError />;
  return <AppRoutes />;
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <NyasaAuthProvider>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </NyasaAuthProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;