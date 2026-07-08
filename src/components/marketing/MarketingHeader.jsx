import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X, Inbox, Bot, FileText, Users2, MessageCircle } from 'lucide-react';
import { WA_GREEN, SURFACE, SURFACE2, TEXT, MUTED, CONTACT_WHATSAPP } from '@/lib/marketingTheme';

const PRODUCT_ITEMS = [
  { icon: Inbox,      title: 'Omnichannel Inbox', desc: 'WhatsApp, Messenger, Instagram, Telegram, email & website chat — one inbox.', href: '/#product' },
  { icon: Bot,        title: 'AI Agents',         desc: 'An AI teammate that replies, drafts, or works fully autonomously.',           href: '/#ai-agents' },
  { icon: FileText,   title: 'Quotes & Invoices', desc: 'Branded PDFs, sent straight from the chat, with payment tracking.',           href: '/#documents' },
  { icon: Users2,     title: 'Automation & Team', desc: 'Assignment rules, SLA tracking, roles — built for real sales teams.',         href: '/#product' },
];

export default function MarketingHeader() {
  const location = useLocation();
  const [productOpen, setProductOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    setMobileOpen(false);
    setProductOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setProductOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const navLinkStyle = (active) => ({
    color: active ? TEXT : MUTED,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
  });

  return (
    <nav style={{ background: SURFACE, borderBottom: `1px solid ${SURFACE2}`, position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/icon-192.png" alt="Nyasadesk" style={{ width: 36, height: 36, borderRadius: 10 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>Nyasadesk</span>
        </Link>

        {/* Desktop nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="nyasa-desktop-nav">
          <div ref={dropdownRef} style={{ position: 'relative' }}
            onMouseEnter={() => setProductOpen(true)}
            onMouseLeave={() => setProductOpen(false)}
          >
            <button
              onClick={() => setProductOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', ...navLinkStyle(false) }}
            >
              Product <ChevronDown size={14} style={{ transform: productOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
            {productOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', paddingTop: 14,
              }}>
                <div style={{
                  width: 360, background: SURFACE, border: `1px solid ${SURFACE2}`, borderRadius: 16,
                  boxShadow: '0 24px 48px rgba(0,0,0,0.45)', padding: 10,
                }}>
                  {PRODUCT_ITEMS.map(({ icon: Icon, title, desc, href }) => (
                    <Link key={title} to={href} style={{
                      display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 10, textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = SURFACE2}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${WA_GREEN}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={17} color={WA_GREEN} />
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>{title}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.4 }}>{desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link to="/pricing" style={navLinkStyle(location.pathname === '/pricing')}>Pricing</Link>

          <a href={CONTACT_WHATSAPP} target="_blank" rel="noopener noreferrer"
            style={{ ...navLinkStyle(false), display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageCircle size={15} /> Chat with us
          </a>

          <Link to="/login" style={navLinkStyle(location.pathname === '/login')}>Login</Link>

          <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '8px 18px', borderRadius: 8 }}>
            Get started
          </Link>
        </div>

        {/* Mobile toggle */}
        <button className="nyasa-mobile-toggle" onClick={() => setMobileOpen(o => !o)}
          style={{ display: 'none', background: 'transparent', border: 'none', color: TEXT, cursor: 'pointer', padding: 6 }}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div style={{ borderTop: `1px solid ${SURFACE2}`, padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 4 }} className="nyasa-mobile-menu">
          <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, margin: '8px 0 4px' }}>Product</p>
          {PRODUCT_ITEMS.map(({ icon: Icon, title, href }) => (
            <Link key={title} to={href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600 }}>
              <Icon size={17} color={WA_GREEN} /> {title}
            </Link>
          ))}
          <div style={{ height: 1, background: SURFACE2, margin: '12px 0' }} />
          <Link to="/pricing" style={{ padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600 }}>Pricing</Link>
          <a href={CONTACT_WHATSAPP} target="_blank" rel="noopener noreferrer" style={{ padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageCircle size={16} /> Chat with us
          </a>
          <Link to="/login" style={{ padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600 }}>Login</Link>
          <Link to="/register" style={{ marginTop: 8, textAlign: 'center', background: WA_GREEN, color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '12px 0', borderRadius: 10 }}>
            Get started
          </Link>
        </div>
      )}

      <style>{`
        @media (max-width: 860px) {
          .nyasa-desktop-nav { display: none !important; }
          .nyasa-mobile-toggle { display: flex !important; align-items: center; }
        }
      `}</style>
    </nav>
  );
}
