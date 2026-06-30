import { Link } from 'react-router-dom';
import { MessageSquare, Users, Zap, Shield, Globe, ChevronRight, Check, ArrowRight } from 'lucide-react';

const WA_GREEN      = '#25D366';
const WA_DARK_GREEN = '#128C7E';
const WA_NAVY       = '#075E54';
const BG            = '#111B21';
const SURFACE       = '#1F2C34';
const SURFACE2      = '#2A3942';
const TEXT          = '#E9EDF0';
const MUTED         = '#8696A0';

const FEATURES = [
  { icon: MessageSquare, title: 'Omnichannel Inbox',   desc: 'WhatsApp, email, live chat — all in one place. No more tab-switching.' },
  { icon: Users,         title: 'Team Collaboration',  desc: 'Assign conversations, leave internal notes, see who\u2019s online in real time.' },
  { icon: Zap,           title: 'Smart Automation',    desc: 'Auto-assign by keyword, SLA alerts, canned responses, broadcast campaigns.' },
  { icon: Shield,        title: 'Built for Sales',     desc: 'Deal stages, contact CRM, pipeline overview — your sales context lives here.' },
  { icon: Globe,         title: 'Any Channel',         desc: 'Connect WhatsApp Business, Facebook Messenger, email or a website widget.' },
];

const PLANS = [
  { name: 'Starter', price: '$29', period: '/mo', seats: '3 agents', features: ['1 channel', 'Shared inbox', 'Canned responses', 'Basic reports'], cta: 'Start free trial' },
  { name: 'Growth',  price: '$79', period: '/mo', seats: '10 agents', features: ['5 channels', 'All Starter features', 'Broadcasts', 'SLA management', 'API access'], cta: 'Start free trial', highlight: true },
  { name: 'Scale',   price: '$199',period: '/mo', seats: 'Unlimited', features: ['Unlimited channels', 'All Growth features', 'Custom workflows', 'Priority support', 'SSO'], cta: 'Contact sales' },
];

const MOCK_MSGS = [
  { from: 'Sarah Chen',    msg: 'Hi! Interested in the Growth plan pricing',   time: '09:41', unread: true  },
  { from: 'James Okafor',  msg: 'When does the proposal expire?',              time: '09:38', unread: true  },
  { from: 'Priya Nair',    msg: 'Can we schedule a demo this week?',           time: '09:30', unread: false },
  { from: 'Carlos Mendez', msg: 'Contract signed — thanks for the follow up!', time: '09:15', unread: false },
];

export default function Landing() {
  return (
    <div style={{ background: BG, color: TEXT, fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ background: SURFACE, borderBottom: `1px solid ${SURFACE2}`, position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: WA_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>N</span>
            </div>
            <span style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>Nyasadesk</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
<Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '8px 18px', borderRadius: 8 }}>
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px 60px', display: 'flex', alignItems: 'center', gap: 60, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 400px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${WA_GREEN}18`, border: `1px solid ${WA_GREEN}40`, borderRadius: 999, padding: '6px 14px', marginBottom: 24 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: WA_GREEN, display: 'inline-block' }} />
            <span style={{ color: WA_GREEN, fontSize: 13, fontWeight: 500 }}>Now in beta — free until launch</span>
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, color: TEXT }}>
            Your team's shared<br />
            <span style={{ color: WA_GREEN }}>sales inbox.</span>
          </h1>
          <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.7, marginBottom: 36, maxWidth: 460 }}>
            Nyasadesk brings WhatsApp, email, and live chat into one inbox your whole sales team can work from — with contacts, deal stages, and automation built in.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '14px 28px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              Start for free <ArrowRight size={18} />
            </Link>
            <a href="#features" style={{ background: SURFACE2, color: TEXT, textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '14px 28px', borderRadius: 12 }}>
              See how it works
            </a>
          </div>
          <p style={{ marginTop: 16, fontSize: 13, color: MUTED }}>No credit card required · Free 14-day trial</p>
        </div>

        {/* Mock inbox preview */}
        <div style={{ flex: '1 1 320px', maxWidth: 380 }}>
          <div style={{ background: SURFACE, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', border: `1px solid ${SURFACE2}` }}>
            {/* Header */}
            <div style={{ background: WA_NAVY, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: TEXT, fontWeight: 700, fontSize: 16 }}>Nyasadesk</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#25D366','#FFC107','#FF5252'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
              </div>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${SURFACE2}`, background: SURFACE }}>
              {['All','Open','Snoozed','Closed'].map((t,i) => (
                <div key={t} style={{ flex: 1, textAlign: 'center', padding: '10px 0', fontSize: 12, color: i === 0 ? WA_GREEN : MUTED, borderBottom: i === 0 ? `2px solid ${WA_GREEN}` : '2px solid transparent', cursor: 'pointer', fontWeight: i===0?600:400 }}>
                  {t}
                </div>
              ))}
            </div>
            {/* Conversation rows */}
            {MOCK_MSGS.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${SURFACE2}`, background: i === 0 ? `${SURFACE2}88` : 'transparent' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: [WA_NAVY,WA_DARK_GREEN,'#2A3942','#1F2C34'][i], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>
                  {m.from[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: TEXT }}>{m.from}</span>
                    <span style={{ fontSize: 11, color: MUTED }}>{m.time}</span>
                  </div>
                  <span style={{ fontSize: 12, color: MUTED, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.msg}</span>
                </div>
                {m.unread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: WA_GREEN, flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ borderTop: `1px solid ${SURFACE2}`, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: TEXT, marginBottom: 12 }}>Everything your sales team needs</h2>
            <p style={{ color: MUTED, fontSize: 16 }}>Built from the ground up for teams that close deals over messaging.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} style={{ background: SURFACE, borderRadius: 16, padding: '28px 24px', border: `1px solid ${SURFACE2}` }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${WA_GREEN}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Icon size={20} color={WA_GREEN} />
                </div>
                <h3 style={{ fontWeight: 700, fontSize: 16, color: TEXT, marginBottom: 8 }}>{title}</h3>
                <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ borderTop: `1px solid ${SURFACE2}`, padding: '80px 24px', background: SURFACE }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: TEXT, marginBottom: 12 }}>Simple, transparent pricing</h2>
            <p style={{ color: MUTED, fontSize: 16 }}>Start free. Scale as you grow.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, alignItems: 'start' }}>
            {PLANS.map(p => (
              <div key={p.name} style={{
                background: p.highlight ? `linear-gradient(135deg, ${WA_NAVY}, ${WA_DARK_GREEN})` : BG,
                borderRadius: 20, padding: '32px 28px',
                border: p.highlight ? `2px solid ${WA_GREEN}` : `1px solid ${SURFACE2}`,
                position: 'relative'
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
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: TEXT }}>
                      <Check size={16} color={WA_GREEN} style={{ flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/register" style={{
                  display: 'block', textAlign: 'center', textDecoration: 'none',
                  background: p.highlight ? WA_GREEN : SURFACE2,
                  color: '#fff', fontWeight: 700, fontSize: 14,
                  padding: '12px 0', borderRadius: 10
                }}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FOOTER */}
      <section style={{ borderTop: `1px solid ${SURFACE2}`, padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: WA_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 32 }}>N</span>
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 800, color: TEXT, marginBottom: 16 }}>Ready to close more deals?</h2>
          <p style={{ color: MUTED, fontSize: 16, marginBottom: 36, lineHeight: 1.7 }}>
            Join teams already using Nyasadesk to manage their sales conversations at scale.
          </p>
          <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 16, padding: '16px 36px', borderRadius: 14, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            Get started free <ArrowRight size={20} />
          </Link>
          <p style={{ marginTop: 16, fontSize: 13, color: MUTED }}>No credit card · 14-day free trial · Cancel anytime</p>
        </div>
        <div style={{ borderTop: `1px solid ${SURFACE2}`, marginTop: 80, paddingTop: 32, display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
          {['© 2026 Nyasadesk','Privacy Policy','Terms of Service','Contact'].map(item => (
            <span key={item} style={{ fontSize: 13, color: MUTED, cursor: 'pointer' }}>{item}</span>
          ))}
        </div>
      </section>
    </div>
  );
}