import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

// Public, unauthenticated hosted "support page" — mounts the Nyasadesk widget
// in inline mode so businesses can iframe this URL into their own site as a
// dedicated Support/Contact page, or send customers straight to the link.
export default function SupportPage() {
  const { workspaceId } = useParams();

  useEffect(() => {
    document.title = 'Chat with us · Nyasadesk';

    const container = document.getElementById('nyasa-inline-target');

    const script = document.createElement('script');
    script.src = '/widget.js';
    script.setAttribute('data-workspace-id', workspaceId || '');
    script.setAttribute('data-mode', 'inline');
    document.body.appendChild(script);

    return () => {
      script.remove();
      if (container) container.innerHTML = '';
      const widgetRoot = document.getElementById('nyasa-widget');
      if (widgetRoot) widgetRoot.remove();
    };
  }, [workspaceId]);

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: '#ECE5DD', display: 'flex', flexDirection: 'column' }}>
      <div id="nyasa-inline-target" style={{ flex: 1, display: 'flex', flexDirection: 'column' }} />
    </div>
  );
}
