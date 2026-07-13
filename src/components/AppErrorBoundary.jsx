import React from 'react';

// How many times we'll auto-reload before giving up and showing a minimal message
const MAX_AUTO_RELOADS = 2;
const RELOAD_KEY = '__nyasa_error_reloads__';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, gaveUp: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Log to console only — never surface raw errors to users
    console.error('[AppErrorBoundary]', error?.message, info?.componentStack?.slice(0, 300));

    // Track how many times we've auto-reloaded to avoid infinite reload loops
    const reloads = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
    if (reloads < MAX_AUTO_RELOADS) {
      sessionStorage.setItem(RELOAD_KEY, String(reloads + 1));
      // Small delay so the console log flushes, then silent reload
      setTimeout(() => window.location.reload(), 300);
    } else {
      // After MAX_AUTO_RELOADS attempts, stop looping and show minimal UI
      sessionStorage.removeItem(RELOAD_KEY);
      this.setState({ gaveUp: true });
    }
  }

  render() {
    if (this.state.hasError && this.state.gaveUp) {
      // Minimal, non-scary fallback — no raw error message, no stack trace
      return (
        <div style={{
          minHeight: '100vh',
          background: 'var(--nyasa-surface-1, #0B141A)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          <div style={{ maxWidth: 320, textAlign: 'center' }}>
            <p style={{ color: 'var(--nyasa-text, #E9EDEF)', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>
              Couldn't load
            </p>
            <p style={{ color: 'var(--nyasa-text-muted, #8696A0)', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
              Something went wrong. Tap below to try again.
            </p>
            <button
              onClick={() => { sessionStorage.removeItem(RELOAD_KEY); window.location.reload(); }}
              style={{
                background: '#25D366', color: '#000',
                border: 'none', borderRadius: 24,
                padding: '12px 32px', fontWeight: 700,
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    if (this.state.hasError) {
      // Show nothing while the auto-reload is in progress (300ms)
      return null;
    }

    // Clear reload counter on successful render
    if (sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.removeItem(RELOAD_KEY);
    }

    return this.props.children;
  }
}
