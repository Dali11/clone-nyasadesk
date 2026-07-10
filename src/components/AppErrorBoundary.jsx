import React from 'react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary] Caught crash:', error, info);
  }

  render() {
    if (this.state.hasError) {
      // If a custom fallback was provided, use it
      if (this.props.fallback) return this.props.fallback;

      // Otherwise show a visible error screen — never a black void
      return (
        <div style={{
          minHeight: '100vh',
          background: '#111B21',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          <div style={{ maxWidth: 360, textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: 'rgba(239,68,68,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: 28,
            }}>⚠️</div>
            <p style={{ color: '#E9EDF0', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
              Something went wrong
            </p>
            <p style={{ color: '#8696A0', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              The app ran into an unexpected error. Try refreshing — if it keeps happening, contact support.
            </p>
            <p style={{ color: '#4B5563', fontSize: 11, marginBottom: 20, fontFamily: 'monospace', background: '#0B141A', padding: '8px 12px', borderRadius: 8, wordBreak: 'break-all' }}>
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#25D366', color: '#000',
                border: 'none', borderRadius: 10,
                padding: '12px 28px', fontWeight: 700,
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
