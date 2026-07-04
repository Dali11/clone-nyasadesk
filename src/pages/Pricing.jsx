import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const WA_GREEN      = '#25D366';
const WA_DARK_GREEN = '#128C7E';
const WA_NAVY       = '#075E54';
const BG            = '#111B21';
const SURFACE       = '#1F2C34';
const SURFACE2      = '#2A3942';
const TEXT          = '#E9EDF0';
const MUTED         = '#8696A0';

const PLANS = [
  {
    key: 'starter', name: 'Starter', price: 'K15,000', period: '/mo', seats: '2 team members',
    features: ['All channels — WhatsApp, Messenger, email, website chat', 'Shared team inbox', 'Contact CRM & deal stages', 'Canned responses', 'Basic assignment rules'],
    cta: 'Get started',
  },
  {
    key: 'growth', name: 'Growth', price: 'K30,000', period: '/mo', seats: '5 team members', highlight: true,
    features: ['Everything in Starter', 'Broadcast campaigns', 'SLA tracking & alerts', 'Round-robin & smart assignment rules', 'Priority email support'],
    cta: 'Get started',
  },
  {
    key: 'scale', name: 'Scale', price: 'K120,000', period: '/mo', seats: 'Unlimited team members',
    features: ['Everything in Growth', 'Unlimited team members', 'Unlimited channels', 'Priority support', 'Onboarding assistance'],
    cta: 'Get started',
  },
];

export default function Pricing() {
  useDocumentTitle('Pricing');

  return (
    <div style={{ background: BG, color: TEXT, fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>
      {/* NAV */}
      <nav style={{ background: SURFACE, borderBottom: `1px solid ${SURFACE2}`, position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: WA_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>N</span>
            </div>
            <span style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>Nyasadesk</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Link to="/" style={{ color: MUTED, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>Home</Link>
            <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '8px 18px', borderRadius: 8 }}>
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* HEADER */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 24px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, color: TEXT, marginBottom: 16 }}>Simple, transparent pricing</h1>
        <p style={{ color: MUTED, fontSize: 16, maxWidth: 520, margin: '0 auto' }}>
          Every plan includes all channels — WhatsApp, Messenger, email, and website chat. Pick the tier that matches your team size.
        </p>
      </section>

      {/* PLANS */}
      <section style={{ padding: '32px 24px 96px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'start' }}>
          {PLANS.map(p => (
            <div key={p.key} style={{
              background: p.highlight ? `linear-gradient(135deg, ${WA_NAVY}, ${WA_DARK_GREEN})` : SURFACE,
              borderRadius: 20, padding: '32px 28px',
              border: p.highlight ? `2px solid ${WA_GREEN}` : `1px solid ${SURFACE2}`,
              position: 'relative',
            }}>
              {p.highlight && (
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: WA_GREEN, color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 999 }}>
                  Most popular
                </div>
              )}
              <p style={{ color: MUTED, fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{p.name}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 42, fontWeight: 800, color: TEXT }}>{p.price}</span>
                <span style={{ color: MUTED, fontSize: 14 }}>{p.period}</span>
              </div>
              <p style={{ color: MUTED, fontSize: 13, marginBottom: 24 }}>{p.seats}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {p.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: TEXT }}>
                    <Check size={16} color={WA_GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/register" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', textDecoration: 'none',
                background: p.highlight ? WA_GREEN : SURFACE2,
                color: '#fff', fontWeight: 700, fontSize: 14,
                padding: '12px 0', borderRadius: 10,
              }}>
                {p.cta} <ArrowRight size={16} />
              </Link>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: MUTED, fontSize: 13, marginTop: 40 }}>
          Need something custom or more than 5 team members without going straight to Scale? <Link to="/register" style={{ color: WA_GREEN, textDecoration: 'none', fontWeight: 600 }}>Get in touch</Link>.
        </p>
      </section>

      {/* FOOTER */}
      <div style={{ borderTop: `1px solid ${SURFACE2}`, padding: '32px 24px', display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
        <Link to="/" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>Home</Link>
        <Link to="/privacy" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>Privacy Policy</Link>
        <Link to="/data-deletion" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>Data Deletion</Link>
        <span style={{ fontSize: 13, color: MUTED }}>© 2026 Nyasadesk</span>
      </div>
    </div>
  );
}
