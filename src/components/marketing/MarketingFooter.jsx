import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { WA_GREEN, SURFACE, SURFACE2, TEXT, MUTED, CONTACT_WHATSAPP } from '@/lib/marketingTheme';

const COLUMNS = [
  {
    title: 'Platform',
    links: [
      { label: 'Omnichannel Inbox', href: '/#product'    },
      { label: 'AI Agents',         href: '/#ai-agents'  },
      { label: 'Quotes & Invoices', href: '/#documents'  },
      { label: 'Pricing',           href: '/pricing'     },
    ],
  },
  {
    title: 'Features',
    links: [
      { label: 'Multi-Agent Inbox',        href: '/features/multi-agent'       },
      { label: 'WhatsApp Chatbots',        href: '/features/whatsapp-chatbots' },
      { label: 'Omnichannel & Broadcasts', href: '/features/omnichannel'       },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Login',       href: '/login'    },
      { label: 'Get started', href: '/register' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy'        },
      { label: 'Data Deletion',  href: '/data-deletion'  },
    ],
  },
];

export default function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer style={{ borderTop: `1px solid ${SURFACE2}`, background: SURFACE, padding: '56px 24px 28px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Grid: brand col + 4 link cols */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.5fr) repeat(4, 1fr)', gap: 40, marginBottom: 48 }} className="nyasa-footer-grid">

          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <img src="/icon-192.png" alt="Nyasadesk" style={{ width: 34, height: 34, borderRadius: 9 }} />
              <span style={{ fontWeight: 800, fontSize: 16, color: TEXT, letterSpacing: '-.01em' }}>Nyasadesk</span>
            </div>
            <p style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.65, maxWidth: 260, marginBottom: 20 }}>
              The shared sales inbox for teams who sell over WhatsApp, Messenger, email, and chat — with an AI agent that replies, quotes, and invoices on its own.
            </p>
            <a
              href={CONTACT_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: `${WA_GREEN}1E`, color: WA_GREEN,
                border: `1px solid ${WA_GREEN}44`, borderRadius: 9,
                padding: '8px 16px', fontSize: 13.5, fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <MessageCircle size={15} /> Chat with us
            </a>
          </div>

          {/* Link columns */}
          {COLUMNS.map(col => (
            <div key={col.title}>
              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 14, marginTop: 0 }}>
                {col.title}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map(l => (
                  <li key={l.label}>
                    <Link
                      to={l.href}
                      style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5, fontWeight: 500, transition: 'color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.color = TEXT}
                      onMouseLeave={e => e.currentTarget.style.color = MUTED}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: `1px solid ${SURFACE2}`, paddingTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
            © {year} Nyasadesk · Brandfletch Media Ltd · Malawi
          </p>
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
            Built for teams that close deals on WhatsApp 🇲🇼
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .nyasa-footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 480px) {
          .nyasa-footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  );
}
