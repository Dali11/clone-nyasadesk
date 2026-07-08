import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { WA_GREEN, SURFACE, SURFACE2, TEXT, MUTED, CONTACT_WHATSAPP } from '@/lib/marketingTheme';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Omnichannel Inbox', href: '/#product' },
      { label: 'AI Agents',         href: '/#ai-agents' },
      { label: 'Quotes & Invoices', href: '/#documents' },
      { label: 'Pricing',           href: '/pricing' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Login',        href: '/login' },
      { label: 'Get started',  href: '/register' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Data Deletion',  href: '/data-deletion' },
    ],
  },
];

export default function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer style={{ borderTop: `1px solid ${SURFACE2}`, background: SURFACE, padding: '56px 24px 28px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(3, 1fr)', gap: 32 }} className="nyasa-footer-grid">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <img src="/icon-192.png" alt="Nyasadesk" style={{ width: 32, height: 32, borderRadius: 9 }} />
              <span style={{ fontWeight: 700, fontSize: 16, color: TEXT }}>Nyasadesk</span>
            </div>
            <p style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.6, maxWidth: 260, marginBottom: 16 }}>
              The shared team inbox for sales teams who sell over WhatsApp, Messenger, email and chat — now with an AI agent that can reply, quote, and invoice on its own.
            </p>
            <a href={CONTACT_WHATSAPP} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none', color: WA_GREEN, fontSize: 13.5, fontWeight: 600,
            }}>
              <MessageCircle size={15} /> Chat with us on WhatsApp
            </a>
          </div>

          {COLUMNS.map(col => (
            <div key={col.title}>
              <p style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>{col.title}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map(l => (
                  <Link key={l.label} to={l.href} style={{ fontSize: 14, color: TEXT, textDecoration: 'none' }}>{l.label}</Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${SURFACE2}`, marginTop: 44, paddingTop: 20, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 13, color: MUTED }}>© {year} Nyasadesk. All rights reserved.</span>
          <span style={{ fontSize: 13, color: MUTED }}>A Brandfletch Media product</span>
        </div>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .nyasa-footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </footer>
  );
}
