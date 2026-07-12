import { supabase } from '@/lib/supabase'
import React from 'react'
import { ThemeProvider } from '@/lib/ThemeContext'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import AppErrorBoundary from '@/components/AppErrorBoundary'
import '@/index.css'


// ── Service Worker registration ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW] Registered, scope:', reg.scope);
        // Check for updates every 60s
        setInterval(() => reg.update(), 60_000);

        // Inject the inline-reply secret into the SW so it can authenticate
        // notif-reply API calls without a user session.
        // The secret is stored in the SW's cache (survives restarts).
        const injectSecret = async (worker) => {
          if (!worker) return;
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const secret = session?.access_token || import.meta.env.VITE_NOTIF_REPLY_SECRET || '';
            if (secret) {
              worker.postMessage({ type: 'SET_REPLY_SECRET', secret });
            }
          } catch (err) {
            console.warn('[SW] Failed to get session for reply secret:', err);
          }
        };

        // Inject into the currently active SW (if any)
        if (reg.active) injectSecret(reg.active);
        // Also inject when a new SW takes over
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') injectSecret(newWorker);
            });
          }
        });
        // And whenever the controller changes
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          injectSecret(navigator.serviceWorker.controller);
        });

        // Listen to auth state changes to dynamically update the reply secret
        supabase.auth.onAuthStateChange((_event, session) => {
          const secret = session?.access_token || '';
          if (secret && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SET_REPLY_SECRET', secret });
          }
        });

        // When the new SW activates and sends SW_UPDATED, reload to pick up fresh JS
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SW_UPDATED') {
            console.log('[SW] New version active — reloading for fresh bundle');
            window.location.reload();
          }
        });
      })
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppErrorBoundary><ThemeProvider><App /></ThemeProvider></AppErrorBoundary>
)