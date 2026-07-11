// src/pages/MultiAgentFeature.jsx
// Dedicated feature landing page: "One number. Your whole team."
// Sells the multi-agent + omnichannel story with pricing.

import { Link } from 'react-router-dom';
import {
  Users, MessageSquare, Zap, Check, ArrowRight, Phone,
  Mail, Globe, Instagram, Bot, ShieldCheck, BarChart3,
  ChevronRight, Star, Hash, Layers,
} from 'lucide-react';
import MarketingLayout, { Pill } from '@/components/marketing/MarketingLayout';
import {
  WA_GREEN, WA_DARK_GREEN, WA_NAVY, SURFACE, SURFACE2, MUTED, CONTACT_WHATSAPP,
} from '@/lib/marketingTheme';

const AGENTS = [
  { name: 'Thandi M.',   role: 'Sales',   color: '#25D366', avatar: 'TM', online: true  },
  { name: 'James K.',    role: 'Support', color: '#3B8BF5', avatar: 'JK', online: true  },
  { name: 'Lucia N.',    role: 'Billing', color: '#F5A623', avatar: 'LN', online: false },
  { name: 'Chisomo B.',  role: 'Sales',   color: '#B06EF7', avatar: 'CB', online: true  },
];

const CHANNELS = [
  { icon: '💬', label: 'WhatsApp',  color: '#25D366', count: 18 },
  { icon: '📧', label: 'Email',     color: '#3B8BF5', count: 7  },
  { icon: '🌐', label: 'Web Chat',  color: '#F5A623', count: 4  },
  { icon: '📸', label: 'Instagram', color: '#E1306C', count: 3  },
  { icon: '💼', label: 'Messenger', color: '#0084FF', count: 2  },
];

const CONVS = [
  { name: 'Sarah C.',  msg: 'Interested in the Growth plan…',  ch: 'WhatsApp',  agent: 'TM', time: '09:41', unread: 2  },
  { name: 'James O.',  msg: 'When does the proposal expire?',  ch: 'Email',     agent: 'JK', time: '09:38', unread: 1  },
  { name: 'Priya N.',  msg: 'Can we schedule a demo?',         ch: 'Web Chat',  agent: 'CB', time: '09:30', unread: 0  },
  { name: 'Carlos M.', msg: 'Contract signed — thanks!',       ch: 'Instagram', agent: 'LN', time: '09:15', unread: 0  },
];

const CH_COLOR = { WhatsApp: '#25D366', Email: '#3B8BF5', 'Web Chat': '#F5A623', Instagram: '#E1306C', Messenger: '#0084FF' };

const PLANS = [
  {
    key: 'starter', name: 'Starter', price: 'K25,000', period: '/mo',
    seats: '2 agents', highlight: false,
    features: [
      'All channels — WhatsApp, Messenger, email, website chat',
      'Shared inbox with real-time updates',
      'Contact CRM & deal stages',
      'Canned responses',
      'Basic assignment rules',
    ],
    cta: 'Start free trial',
  },
  {
    key: 'growth', name: 'Growth', price: 'K50,000', period: '/mo',
    seats: '5 agents', highlight: true,
    features: [
      'Everything in Starter',
      'Branded quotes & invoices with payment tracking',
      'Broadcast campaigns to your contact list',
      'SLA tracking & breach alerts',
      'Round-robin & smart auto-assignment',
    ],
    cta: 'Start free trial',
  },
  {
    key: 'scale', name: 'Scale', price: 'K120,000', period: '/mo',
    seats: 'Unlimited agents', highlight: false,
    features: [
      'Everything in Growth',
      'AI Agent — draft or fully autonomous mode',
      'Unlimited team members & channels',
      'Priority support & onboarding assistance',
    ],
    cta: 'Talk to us',
  },
];

const WHY_ITEMS = [
  { icon: ShieldCheck, title: 'One number, unlimited agents', body: 'Your WhatsApp number stays the same. Any agent on your team can reply — customers never notice the join.' },
  { icon: Zap,         title: 'Auto-assignment that actually works', body: 'Round-robin, by channel, by ad source, or by keyword — chats land on the right desk automatically.' },
  { icon: BarChart3,   title: 'See everything, manage nothing', body: 'Real-time agent performance, resolution rates, SLA countdowns — from one dashboard any manager can read.' },
  { icon: Bot,         title: 'AI holds the fort overnight', body: 'Your AI agent handles FAQs, qualifies leads, and hands off the moment a human takes the keyboard.' },
  { icon: Layers,      title: 'Every channel, one inbox', body: 'WhatsApp, Messenger, Instagram DMs, email, and website chat — sorted, searched, and replied to from one screen.' },
  { icon: Users,       title: 'Built for teams from day one', body: 'Roles, collision detection, internal notes, agent performance reports — this isn\'t adapted for teams, it\'s built for them.' },
];

const TESTIMONIALS = [
  { quote: 'We went from 3 phones and a WhatsApp group to one inbox our whole team works from. Game changer.', name: 'Brandfletch Media', role: 'Digital Agency, Blantyre' },
  { quote: 'The auto-assignment alone saved us two hours a day. Now every lead goes to the right person instantly.', name: 'Techno Mart', role: 'Electronics Retailer, Lilongwe' },
];

export default function MultiAgentFeature() {
  return (
    <MarketingLayout title="Multi-Agent Inbox">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 64px', display: 'flex', alignItems: 'center', gap: 60, flexWrap: 'wrap' }}>

        {/* Copy */}
        <div style={{ flex: '1 1 400px' }}>
          {<Pill label="Multi-Agent Inbox" />}
          <h1 style={{ fontSize: 'clamp(34px, 5vw, 58px)', fontWeight: 800, lineHeight: 1.08, margin: '20px 0 24px', color: '#E9EDF0' }}>
            One WhatsApp number.<br />
            <span style={{ color: WA_GREEN }}>Your whole team.</span>
          </h1>
          <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.75, marginBottom: 40, maxWidth: 480 }}>
            Stop juggling phones. Nyasadesk puts every WhatsApp, email, and DM
            into one shared inbox — so your entire team can reply, assign, and
            close without stepping on each other.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '15px 30px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              Get started free <ArrowRight size={18} />
            </Link>
            <a href={CONTACT_WHATSAPP} target="_blank" rel="noreferrer" style={{ background: SURFACE2, color: '#E9EDF0', textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '15px 28px', borderRadius: 12 }}>
              Chat with us
            </a>
          </div>
          <p style={{ marginTop: 18, fontSize: 13, color: MUTED }}>No credit card required &nbsp;·&nbsp; Setup in under 5 minutes</p>
        </div>

        {/* Inbox preview */}
        <div style={{ flex: '1 1 320px', maxWidth: 400 }}>
          <div style={{ background: SURFACE, borderRadius: 20, overflow: 'hidden', boxShadow: '0 28px 80px rgba(0,0,0,.55)', border: `1px solid ${SURFACE2}` }}>
            {/* App bar */}
            <div style={{ background: WA_NAVY, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#E9EDF0', fontWeight: 700, fontSize: 15 }}>Nyasadesk · Shared Inbox</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#25D366','#FFC107','#FF5252'].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />)}
              </div>
            </div>

            {/* Online agents strip */}
            <div style={{ background: `${WA_NAVY}88`, borderBottom: `1px solid ${SURFACE2}`, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: MUTED, whiteSpace: 'nowrap' }}>Online now:</span>
              {AGENTS.map(a => (
                <div key={a.name} title={`${a.name} · ${a.role}`} style={{ position: 'relative' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: a.color + '33', border: `2px solid ${a.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: a.color }}>
                    {a.avatar}
                  </div>
                  {a.online && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: WA_GREEN, border: `1.5px solid ${SURFACE}` }} />}
                </div>
              ))}
              <span style={{ fontSize: 11, color: WA_GREEN, marginLeft: 'auto', fontWeight: 600 }}>3 active</span>
            </div>

            {/* Channel filter pills */}
            <div style={{ display: 'flex', gap: 6, padding: '8px 14px', background: SURFACE, overflowX: 'auto' }}>
              {['All', 'WhatsApp', 'Email', 'Instagram'].map((t, i) => (
                <div key={t} style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: i === 0 ? WA_GREEN : SURFACE2, color: i === 0 ? '#fff' : MUTED, cursor: 'pointer' }}>
                  {t}
                </div>
              ))}
            </div>

            {/* Conversation rows */}
            {CONVS.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 16px', borderBottom: `1px solid ${SURFACE2}`, background: i === 0 ? `${SURFACE2}88` : 'transparent' }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: SURFACE2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#E9EDF0' }}>
                  {c.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: '#E9EDF0' }}>{c.name}</span>
                    <span style={{ fontSize: 10, color: MUTED }}>{c.time}</span>
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{c.msg}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, background: `${CH_COLOR[c.ch]}22`, color: CH_COLOR[c.ch], borderRadius: 999, padding: '1px 7px', fontWeight: 600 }}>{c.ch}</span>
                    <span style={{ fontSize: 10, color: MUTED }}>→ {c.agent}</span>
                  </div>
                </div>
                {c.unread > 0 && <div style={{ minWidth: 18, height: 18, borderRadius: 999, background: WA_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{c.unread}</div>}
              </div>
            ))}

            <div style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, color: MUTED, background: SURFACE }}>
              32 more conversations · 0 missed
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF STRIP ───────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${SURFACE2}`, borderBottom: `1px solid ${SURFACE2}`, background: SURFACE }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px', display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          {[['10+', 'businesses using Nyasadesk'], ['5 channels', 'in one inbox'], ['<2 min', 'avg first response'], ['100%', 'cloud API — no bans']].map(([v, l]) => (
            <div key={v} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: WA_GREEN }}>{v}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── THE PROBLEM ──────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '80px 24px 60px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          {<Pill label="The problem" color="#FF5252" />}
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, margin: '16px 0 14px' }}>
            One phone. Three sales reps.<br />What could go wrong?
          </h2>
          <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.7, maxWidth: 560, margin: '0 auto' }}>
            Most Malawian businesses run their entire sales operation from a single
            WhatsApp on someone's personal phone. When that person is busy, on lunch,
            or leaves the company — your pipeline dies with it.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {[
            { emoji: '😤', title: 'Agents reply from their personal phones', desc: 'Customer data is scattered across 5 WhatsApps. Nobody has the full picture.' },
            { emoji: '🔇', title: 'Leads go cold while the phone owner is busy', desc: 'A missed message at 3pm is a lost sale by 5pm. No one else can step in.' },
            { emoji: '👻', title: 'Conversations vanish when staff leave', desc: 'The chat history and relationships walk out the door with the phone.' },
            { emoji: '❓', title: 'No idea who\'s handling what', desc: 'Customers get two different answers. Agents double-reply. Chaos.' },
          ].map(it => (
            <div key={it.title} style={{ background: SURFACE, border: `1px solid ${SURFACE2}`, borderRadius: 14, padding: '22px 20px' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{it.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#E9EDF0' }}>{it.title}</div>
              <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65 }}>{it.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ background: SURFACE, padding: '80px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            {<Pill label="How it works" />}
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, margin: '16px 0 14px' }}>
              Set up in minutes. Scale forever.
            </h2>
            <p style={{ color: MUTED, fontSize: 16, maxWidth: 540, margin: '0 auto' }}>
              Connect your WhatsApp Business number once, invite your team, and you're live.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {[
              { step: '01', title: 'Connect your WhatsApp Business number', body: 'One click via Meta\'s Embedded Signup — no technical setup. Your existing number, now powerable by your whole team. Works with Meta\'s official Cloud API, so there\'s zero ban risk.' },
              { step: '02', title: 'Invite your agents', body: 'Add team members by email. Set their role — Agent, Sales Manager, or Admin. Each agent gets their own login and sees the conversations assigned to them. You control the view.' },
              { step: '03', title: 'Turn on auto-assignment', body: 'Let the rules engine route incoming chats automatically — round-robin, by channel, by keyword, or by which ad the lead clicked. Nobody manually shuffles chats again.' },
              { step: '04', title: 'Reply from any device, any channel', body: 'Add email, Messenger, Instagram DMs, and website chat alongside WhatsApp. Everything lands in the same inbox. Your team replies from one screen, customers never know the difference.' },
            ].map(s => (
              <div key={s.step} style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: `${WA_GREEN}22`, border: `2px solid ${WA_GREEN}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: 16, color: WA_GREEN }}>
                  {s.step}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: '#E9EDF0' }}>{s.title}</div>
                  <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.7 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY NYASADESK ───────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          {<Pill label="Why Nyasadesk" />}
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, margin: '16px 0 14px' }}>
            Built for Malawian sales teams
          </h2>
          <p style={{ color: MUTED, fontSize: 16, maxWidth: 520, margin: '0 auto' }}>
            Not adapted from a Western SaaS. Built from scratch for how businesses here actually sell.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>
          {WHY_ITEMS.map(it => (
            <div key={it.title} style={{ background: SURFACE, border: `1px solid ${SURFACE2}`, borderRadius: 16, padding: '26px 22px', display: 'flex', gap: 16 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: `${WA_GREEN}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <it.icon size={20} color={WA_GREEN} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 7, color: '#E9EDF0' }}>{it.title}</div>
                <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65 }}>{it.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── OMNICHANNEL VISUAL ───────────────────────────────────────────── */}
      <section style={{ background: SURFACE, padding: '80px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 56, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Channels diagram */}
          <div style={{ flex: '1 1 280px' }}>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {CHANNELS.map(ch => (
                <div key={ch.label} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#111B21', borderRadius: 12, padding: '14px 18px', border: `1px solid ${SURFACE2}` }}>
                  <span style={{ fontSize: 22 }}>{ch.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#E9EDF0' }}>{ch.label}</div>
                    <div style={{ fontSize: 11, color: MUTED }}>{ch.count} open conversations</div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: ch.color }} />
                  <ChevronRight size={14} color={MUTED} />
                  <div style={{ fontWeight: 700, fontSize: 12, color: WA_GREEN }}>Inbox</div>
                </div>
              ))}
            </div>
          </div>

          {/* Copy */}
          <div style={{ flex: '1 1 320px' }}>
            {<Pill label="Omnichannel" />}
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 800, margin: '16px 0 16px', lineHeight: 1.15 }}>
              Every channel.<br />One inbox.<br />
              <span style={{ color: WA_GREEN }}>Zero context-switching.</span>
            </h2>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.75, marginBottom: 28 }}>
              WhatsApp, Messenger, Instagram DMs, email, and your website live chat — all land in the same shared inbox. Your team never has to jump between apps to catch up with a customer.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['One conversation thread per customer, across all channels', 'Filter by channel, agent, or status in one click', 'Broadcast to WhatsApp contacts without leaving the inbox', 'Website widget installs in 2 minutes — no developer needed'].map(f => (
                <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: MUTED }}>
                  <Check size={16} color={WA_GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '13px 26px', borderRadius: 10 }}>
              Connect your channels <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ maxWidth: 1060, margin: '0 auto', padding: '88px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          {<Pill label="Pricing" />}
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, margin: '16px 0 14px' }}>
            Pick the size that fits your team
          </h2>
          <p style={{ color: MUTED, fontSize: 16, maxWidth: 520, margin: '0 auto' }}>
            All plans include every channel — WhatsApp, Messenger, email, and website chat.
            Pay in Malawi Kwacha. No USD surprises.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'start' }}>
          {PLANS.map(plan => (
            <div key={plan.key} style={{ background: SURFACE, border: `2px solid ${plan.highlight ? WA_GREEN : SURFACE2}`, borderRadius: 20, padding: '32px 28px', position: 'relative', overflow: 'hidden' }}>
              {plan.highlight && (
                <div style={{ position: 'absolute', top: 0, right: 0, background: WA_GREEN, color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 16px', borderBottomLeftRadius: 12, letterSpacing: '.04em' }}>
                  MOST POPULAR
                </div>
              )}
              <div style={{ fontWeight: 800, fontSize: 17, color: '#E9EDF0', marginBottom: 6 }}>{plan.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: plan.highlight ? WA_GREEN : '#E9EDF0' }}>{plan.price}</span>
                <span style={{ color: MUTED, fontSize: 14 }}>{plan.period}</span>
              </div>
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${SURFACE2}` }}>
                Up to {plan.seats}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: MUTED, lineHeight: 1.5 }}>
                    <Check size={15} color={WA_GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to={plan.key === 'scale' ? `https://wa.me/265980011467?text=Hi, I'd like to discuss the Scale plan` : '/register'}
                style={{
                  display: 'block', textAlign: 'center', textDecoration: 'none', fontWeight: 700, fontSize: 14,
                  padding: '13px', borderRadius: 10,
                  background: plan.highlight ? WA_GREEN : SURFACE2,
                  color: plan.highlight ? '#fff' : '#E9EDF0',
                  border: `1px solid ${plan.highlight ? WA_GREEN : SURFACE2}`,
                }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: MUTED }}>
          Prices in Malawi Kwacha. Processed securely via PayChangu. &nbsp;·&nbsp;{' '}
          <Link to="/pricing" style={{ color: WA_GREEN, textDecoration: 'none', fontWeight: 600 }}>See full feature comparison →</Link>
        </p>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section style={{ background: SURFACE, padding: '64px 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          {TESTIMONIALS.map(t => (
            <div key={t.name} style={{ background: '#111B21', border: `1px solid ${SURFACE2}`, borderRadius: 16, padding: '28px 26px' }}>
              <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
                {[...Array(5)].map((_, i) => <Star key={i} size={14} fill={WA_GREEN} color={WA_GREEN} />)}
              </div>
              <p style={{ fontSize: 15, color: '#E9EDF0', lineHeight: 1.75, marginBottom: 20, fontStyle: 'italic' }}>"{t.quote}"</p>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#E9EDF0' }}>{t.name}</div>
              <div style={{ fontSize: 12, color: MUTED }}>{t.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '88px 24px', textAlign: 'center' }}>
        <div style={{ background: `linear-gradient(135deg, ${WA_DARK_GREEN}44 0%, ${WA_NAVY}44 100%)`, border: `1px solid ${WA_GREEN}33`, borderRadius: 24, padding: '60px 40px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>💬</div>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 800, marginBottom: 16 }}>
            Ready to give your whole team<br />one WhatsApp number?
          </h2>
          <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.7, marginBottom: 36, maxWidth: 480, margin: '0 auto 36px' }}>
            Join businesses across Malawi that already sell smarter —
            not louder — with Nyasadesk.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '15px 32px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              Start free <ArrowRight size={18} />
            </Link>
            <a href={CONTACT_WHATSAPP} target="_blank" rel="noreferrer" style={{ background: SURFACE2, color: '#E9EDF0', textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '15px 28px', borderRadius: 12 }}>
              Chat with us first
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
