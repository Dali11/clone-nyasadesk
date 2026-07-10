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
      })
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppErrorBoundary><ThemeProvider><App /></ThemeProvider></AppErrorBoundary>
)