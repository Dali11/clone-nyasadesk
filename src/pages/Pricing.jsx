import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import { WA_GREEN, WA_DARK_GREEN, WA_NAVY, BG, SURFACE, SURFACE2, TEXT, MUTED } from '@/lib/marketingTheme';

const FALLBACK_PRICE = { starter: 'K15,000', growth: 'K30,000', scale: 'K120,000' };

const PLANS = [
  {
    key: 'starter', name: 'Starter', period: '/mo', seats: '2 team members',
    features: ['All channels — WhatsApp, Messenger, email, website chat', 'Shared team inbox', 'Contact CRM & deal stages', 'Canned responses', 'Basic assignment rules'],
    cta: 'Get started',
  },
  {
    key: 'growth', name: 'Growth', period: '/mo', seats: '5 team members', highlight: true,
    features: ['Everything in Starter', 'Quotes & invoices with payment tracking', 'Broadcast campaigns', 'SLA tracking & alerts', 'Round-robin & smart assignment rules'],
    cta: 'Get started',
  },
  {
    key: 'scale', name: 'Scale', period: '/mo', seats: 'Unlimited team members',
    features: ['Everything in Growth', 'AI Agent (draft or fully automated)', 'Unlimited team members', 'Unlimited channels', 'Priority support', 'Onboarding assistance'],
    cta: 'Get started',
  },
];

export default function Pricing() {
  useDocumentTitle('Pricing');
  const [prices, setPrices] = useState(FALLBACK_PRICE);

  useEffect(() => {
    fetch('/api/billing?action=plans')
      .then(r => r.json())
      .then(d => {
        if (!d?.pricing) return;
        const formatted = {};
        for (const key of Object.keys(FALLBACK_PRICE)) {
          formatted[key] = d.pricing[key] != null ? `K${d.pricing[key].toLocaleString()}` : FALLBACK_PRICE[key];
        }
        setPrices(formatted);
      })
      .catch(() => {}); // marketing page never breaks -- keeps the hardcoded fallback
  }, []);

  return (
    <div style={{ background: BG, color: TEXT, fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>
      <MarketingHeader />

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
                <span style={{ fontSize: 42, fontWeight: 800, color: TEXT }}>{prices[p.key]}</span>
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

      <MarketingFooter />
    </div>
  );
}
