import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X, Inbox, Bot, Users2, MessageCircle, Megaphone, RefreshCw } from 'lucide-react';
import { WA_GREEN, SURFACE, SURFACE2, TEXT, MUTED, CONTACT_WHATSAPP } from '@/lib/marketingTheme';

// ─── Product dropdown items ───────────────────────────────────────────────────
// Split into two visual groups: core platform + dedicated feature pages
const CORE_ITEMS = [
  { icon: Inbox,       title: 'Omnichannel Inbox',    desc: 'WhatsApp, Messenger, Instagram, Telegram, email & chat — one inbox.',   href: '/#product'     },
  { icon: Bot,         title: 'AI Agents',             desc: 'An AI teammate that replies, drafts, or works fully autonomously.',       href: '/#ai-agents'   },
  { icon: RefreshCw,   title: 'Automation & Rules',    desc: 'Round-robin, SLA tracking, and smart assignment — built for teams.',      href: '/#product'     },
];

const FEATURE_ITEMS = [
  { icon: Users2,      title: 'Multi-Agent Inbox',         desc: 'One WhatsApp number shared across your whole team.',                   href: '/features/multi-agent'        },
  { icon: Bot,         title: 'WhatsApp Chatbots',         desc: 'AI chatbot included in Scale — qualifies leads 24/7.',                href: '/features/whatsapp-chatbots'  },
  { icon: Megaphone,   title: 'Omnichannel & Broadcasts',  desc: '6 channels in one inbox, plus broadcasts and follow-ups.',            href: '/features/omnichannel'        },
];

export default function MarketingHeader() {
  const location = useLocation();
  const [productOpen, setProductOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close everything on navigation
  useEffect(() => {
    setMobileOpen(false);
    setProductOpen(false);
  }, [location.pathname, location.hash]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setProductOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const isActive = (path) => location.pathname === path;

  const navLink = (active) => ({
    color: active ? TEXT : MUTED,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    transition: 'color 0.15s',
  });

  const DropdownItem = ({ icon: Icon, title, desc, href }) => (
    <Link
      to={href}
      style={{ display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 10, textDecoration: 'none' }}
      onMouseEnter={e => e.currentTarget.style.background = SURFACE2}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ width: 34, height: 34, borderRadius: 9, background: `${WA_GREEN}1E`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={WA_GREEN} />
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: TEXT }}>{title}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.4 }}>{desc}</p>
      </div>
    </Link>
  );

  return (
    <nav style={{ background: SURFACE, borderBottom: `1px solid ${SURFACE2}`, position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/icon-192.png" alt="Nyasadesk" style={{ width: 36, height: 36, borderRadius: 10 }} />
          <span style={{ fontWeight: 800, fontSize: 18, color: TEXT, letterSpacing: '-.01em' }}>Nyasadesk</span>
        </Link>

        {/* Desktop nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="nyasa-desktop-nav">

          {/* Product dropdown */}
          <div
            ref={dropdownRef}
            style={{ position: 'relative' }}
            onMouseEnter={() => setProductOpen(true)}
            onMouseLeave={() => setProductOpen(false)}
          >
            <button
              onClick={() => setProductOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', ...navLink(false) }}
            >
              Product <ChevronDown size={14} style={{ transform: productOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {productOpen && (
              <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', paddingTop: 14 }}>
                <div style={{
                  width: 380, background: SURFACE, border: `1px solid ${SURFACE2}`, borderRadius: 18,
                  boxShadow: '0 24px 56px rgba(0,0,0,0.5)', padding: '12px 10px',
                }}>
                  {/* Core platform */}
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, letterSpacing: '.08em', textTransform: 'uppercase', padding: '2px 12px 6px', margin: 0 }}>
                    Platform
                  </p>
                  {CORE_ITEMS.map(item => <DropdownItem key={item.title} {...item} />)}

                  {/* Divider */}
                  <div style={{ height: 1, background: SURFACE2, margin: '10px 10px' }} />

                  {/* Feature pages */}
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, letterSpacing: '.08em', textTransform: 'uppercase', padding: '2px 12px 6px', margin: 0 }}>
                    Features
                  </p>
                  {FEATURE_ITEMS.map(item => <DropdownItem key={item.title} {...item} />)}
                </div>
              </div>
            )}
          </div>

          <a href="/#sales-flow" style={navLink(false)}>Solutions</a>
          <a href="/#channels" style={navLink(false)}>Channels</a>
          <a href="/#ai-agents" style={navLink(false)}>AI Agents</a>

          <Link to="/pricing" style={navLink(isActive('/pricing'))}>Pricing</Link>

          <a href="/#resources" style={navLink(false)}>Resources</a>

          <a
            href={CONTACT_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...navLink(false), display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <MessageCircle size={15} /> Chat with us
          </a>

          <Link to="/login" style={navLink(isActive('/login'))}>Log in</Link>

          <Link to="/register" style={{
            background: WA_GREEN, color: '#fff', textDecoration: 'none',
            fontSize: 14, fontWeight: 700, padding: '8px 20px', borderRadius: 8,
            letterSpacing: '-.01em',
          }}>
            Get started
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="nyasa-mobile-toggle"
          onClick={() => setMobileOpen(o => !o)}
          style={{ display: 'none', background: 'transparent', border: 'none', color: TEXT, cursor: 'pointer', padding: 6 }}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div style={{ borderTop: `1px solid ${SURFACE2}`, padding: '16px 24px 28px', display: 'flex', flexDirection: 'column', gap: 2 }} className="nyasa-mobile-menu">
          <p style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.08em', margin: '8px 0 6px' }}>Platform</p>
          {CORE_ITEMS.map(({ icon: Icon, title, href }) => (
            <Link key={title} to={href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600 }}>
              <Icon size={16} color={WA_GREEN} /> {title}
            </Link>
          ))}

          <div style={{ height: 1, background: SURFACE2, margin: '10px 0' }} />

          <p style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 6px' }}>Features</p>
          {FEATURE_ITEMS.map(({ icon: Icon, title, href }) => (
            <Link key={title} to={href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600 }}>
              <Icon size={16} color={WA_GREEN} /> {title}
            </Link>
          ))}

          <div style={{ height: 1, background: SURFACE2, margin: '10px 0' }} />

          <a href="/#sales-flow" style={{ padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600 }}>Solutions</a>
          <a href="/#channels" style={{ padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600 }}>Channels</a>
          <a href="/#ai-agents" style={{ padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600 }}>AI Agents</a>
          <Link to="/pricing" style={{ padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600 }}>Pricing</Link>
          <a href="/#resources" style={{ padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600 }}>Resources</a>
          <a href={CONTACT_WHATSAPP} target="_blank" rel="noopener noreferrer" style={{ padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageCircle size={16} /> Chat with us
          </a>
          <Link to="/login" style={{ padding: '10px 4px', textDecoration: 'none', color: TEXT, fontSize: 15, fontWeight: 600 }}>Log in</Link>
          <Link to="/register" style={{ marginTop: 10, textAlign: 'center', background: WA_GREEN, color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px 0', borderRadius: 10, letterSpacing: '-.01em' }}>
            Get started free
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
