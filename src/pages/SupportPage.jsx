import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

// Public, unauthenticated hosted "support page" — mounts the Nyasadesk widget
// in inline mode so businesses can iframe this URL into their own site as a
// dedicated Support/Contact page, or send customers straight to the link.
//
// Auto-adapts to light/dark based on the visitor's OS/browser preference.
// The embedding site can force a match with ?theme=light or ?theme=dark
// in the iframe src, e.g. .../support/WORKSPACE_ID?theme=dark
export default function SupportPage() {
  const { workspaceId } = useParams();
  const [searchParams] = useSearchParams();
  const theme = (searchParams.get('theme') || 'auto').toLowerCase();

  useEffect(() => {
    document.title = 'Chat with us · Nyasadesk';

    const container = document.getElementById('nyasa-inline-target');

    const script = document.createElement('script');
    script.src = '/widget.js';
    script.setAttribute('data-workspace-id', workspaceId || '');
    script.setAttribute('data-mode', 'inline');
    script.setAttribute('data-theme', theme);
    document.body.appendChild(script);

    return () => {
      script.remove();
      if (container) container.innerHTML = '';
      const widgetRoot = document.getElementById('nyasa-widget');
      if (widgetRoot) widgetRoot.remove();
    };
  }, [workspaceId, theme]);

  const pageClass = theme === 'dark' ? 'nyasa-force-dark' : theme === 'light' ? 'nyasa-force-light' : 'nyasa-auto';

  return (
    <div className={`nyasa-support-page ${pageClass}`} style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .nyasa-support-page { background: #ffffff; }
        .nyasa-support-page.nyasa-force-dark { background: #17181A; }
        @media (prefers-color-scheme: dark) {
          .nyasa-support-page.nyasa-auto { background: #17181A; }
        }
      `}</style>
      <div id="nyasa-inline-target" style={{ flex: 1, display: 'flex', flexDirection: 'column' }} />
    </div>
  );
}
