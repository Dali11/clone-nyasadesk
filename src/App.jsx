import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';

// Page imports
import Inbox from './pages/Inbox';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Rules from './pages/Rules';
import Settings from './pages/Settings';

const AuthenticatedApp = () => {
  return (
    <Routes>
      <Route path="/" element={<Inbox />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/contacts" element={<Contacts />} />
      <Route path="/rules" element={<Rules />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App