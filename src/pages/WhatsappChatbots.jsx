// src/pages/WhatsappChatbots.jsx
// Feature landing page: WhatsApp AI Chatbots
// Core sell: AI is included in Scale (K120,000/mo) — one price, everything.

import { Link } from 'react-router-dom';
import {
  Bot, Zap, Check, ArrowRight, MessageSquare,
  BookOpen, FileText, Users, ChevronRight,
  Star, Phone, Sparkles, Shield,
} from 'lucide-react';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import {
  WA_GREEN, WA_DARK_GREEN, WA_NAVY,
  BG, SURFACE, SURFACE2, TEXT, MUTED, CONTACT_WHATSAPP,
} from '@/lib/marketingTheme';

// ─── helpers ─────────────────────────────────────────────────────────────────
const pill = (label, color = WA_GREEN) => (
  <span style={{ display:'inline-block', background:`${color}22`, color, border:`1px solid ${color}44`, borderRadius:999, padding:'4px 12px', fontSize:12, fontWeight:700, letterSpacing:'.04em', textTransform:'uppercase' }}>
    {label}
  </span>
);

// ─── agent templates the product actually has ─────────────────────────────────
const BOTS = [
  {
    icon: '🛎',
    name: 'Receptionist',
    tagline: 'Never miss a lead at 2am',
    desc: 'Greets every customer, qualifies their need in 1–2 questions, then routes to the right agent. Works 24/7 — even when your team is offline.',
    color: WA_GREEN,
  },
  {
    icon: '💼',
    name: 'Sales Agent',
    tagline: 'Qualify leads before your team even wakes up',
    desc: 'Answers product questions, handles objections, and moves conversations toward a sale. Hands off the hot ones to a human.',
    color: '#3B8BF5',
  },
  {
    icon: '🧾',
    name: 'Finance Manager',
    tagline: 'Sends real quotes & invoices in the chat',
    desc: 'Handles billing questions and can actually generate and send branded PDF quotations and invoices — right inside the WhatsApp thread.',
    color: '#F5A623',
  },
  {
    icon: '🔁',
    name: 'Follow-up Agent',
    tagline: 'Re-engage cold leads automatically',
    desc: 'Nudges unresponsive customers at the right time with the right message. Warms them back up so your team closes.',
    color: '#B06EF7',
  },
  {
    icon: '🎯',
    name: 'Customer Support',
    tagline: 'Handle FAQs without lifting a finger',
    desc: 'Answers common support questions from your own knowledge base. Escalates edge cases to a human instantly.',
    color: '#E1306C',
  },
  {
    icon: '📅',
    name: 'Booking Agent',
    tagline: 'Fill your calendar on autopilot',
    desc: 'Collects customer details, finds a suitable time, and hands off to confirm — so no slot goes to waste.',
    color: '#00BFA5',
  },
];

// ─── mock chat thread ─────────────────────────────────────────────────────────
const CHAT = [
  { from: 'customer', text: 'Hi, are you open?' },
  { from: 'bot',      text: 'Hi there! 👋 Yes, we\'re here. Are you looking to buy, or do you have a question about an existing order?' },
  { from: 'customer', text: 'I want to buy — need a quote for 500 branded t-shirts' },
  { from: 'bot',      text: 'Great! Let me pull that together for you. Can I get your name and company so I can send a formal quotation?' },
  { from: 'customer', text: 'James Banda, Banda Events' },
  { from: 'bot',      text: '📄 Perfect — I\'ve generated a quotation for 500 branded t-shirts and sent it to this chat. Your sales manager has also been notified.' },
];

const STEPS = [
  { n: '01', title: 'Pick a template', body: 'Choose from Receptionist, Sales, Support, Finance Manager, Follow-up, or Booking Agent. Or build your own from scratch.' },
  { n: '02', title: 'Train it on your business', body: 'Paste in your FAQs, upload PDFs, link your website. The bot learns your products, prices, and policies — not generic nonsense.' },
  { n: '03', title: 'Set the rules', body: 'Choose draft mode (agent approves before sending) or full auto. Set which channels it covers and when to hand off to a human.' },
  { n: '04', title: 'Go live', body: 'Your bot is live on WhatsApp in minutes. It replies, qualifies, books, and sends quotes — while your team handles only the conversations that need a human touch.' },
];

const WHY = [
  { icon: Shield,       title: 'No ban risk', body: 'Runs on Meta\'s official WhatsApp Cloud API. No grey-market workarounds, no wakeup calls that your number got blocked.' },
  { icon: BookOpen,     title: 'Trained on your knowledge', body: 'Feed it your own PDFs, docs, and web pages. It answers from your information, not the internet.' },
  { icon: FileText,     title: 'Generates real documents', body: 'The Finance Manager bot can create and send branded PDF quotes and invoices straight into the chat thread.' },
  { icon: Users,        title: 'Seamless human handoff', body: 'The moment a human agent types a reply, the bot steps aside. No awkward overlap, no duplicate messages.' },
  { icon: MessageSquare,title: 'Works across all your channels', body: 'Same bot, same knowledge — WhatsApp, Messenger, Instagram DMs, website chat, and Telegram.' },
  { icon: Zap,          title: 'One platform, one price', body: 'Your AI chatbot, your full team inbox, CRM, broadcasts, and quote builder — all in a single K120,000/mo plan.' },
];

export default function WhatsappChatbots() {
  return (
    <div style={{ background: BG, color: TEXT, fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>
      <MarketingHeader />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 72px', display: 'flex', alignItems: 'center', gap: 60, flexWrap: 'wrap' }}>

        {/* Copy */}
        <div style={{ flex: '1 1 420px' }}>
          {pill('WhatsApp AI Chatbots')}
          <h1 style={{ fontSize: 'clamp(34px, 5vw, 58px)', fontWeight: 800, lineHeight: 1.08, margin: '20px 0 24px', color: TEXT }}>
            A WhatsApp chatbot<br />
            that actually works.<br />
            <span style={{ color: WA_GREEN }}>Included in Scale.</span>
          </h1>
          <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.75, marginBottom: 12, maxWidth: 500 }}>
            Most chatbot tools charge a separate fee on top of your team inbox.
            With Nyasadesk Scale, your AI chatbot is already included —
            trained on your knowledge base, running on official WhatsApp,
            and handing off to your team seamlessly.
          </p>
          <p style={{ fontSize: 15, color: WA_GREEN, fontWeight: 700, marginBottom: 36 }}>
            K120,000/mo · Unlimited agents · AI included · All channels
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '15px 30px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              Start free trial <ArrowRight size={18} />
            </Link>
            <a href={CONTACT_WHATSAPP} target="_blank" rel="noreferrer" style={{ background: SURFACE2, color: TEXT, textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '15px 28px', borderRadius: 12 }}>
              See a demo
            </a>
          </div>
          <p style={{ marginTop: 18, fontSize: 13, color: MUTED }}>No credit card · Setup in under 5 minutes</p>
        </div>

        {/* Mock chat */}
        <div style={{ flex: '1 1 300px', maxWidth: 360 }}>
          <div style={{ background: SURFACE, borderRadius: 20, overflow: 'hidden', boxShadow: '0 28px 80px rgba(0,0,0,.55)', border: `1px solid ${SURFACE2}` }}>

            {/* Chat header */}
            <div style={{ background: WA_NAVY, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: `${WA_GREEN}33`, border: `2px solid ${WA_GREEN}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={18} color={WA_GREEN} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>Nyasadesk Bot</div>
                <div style={{ fontSize: 11, color: WA_GREEN }}>● Online — Sales Agent</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: MUTED, background: `${WA_GREEN}22`, border: `1px solid ${WA_GREEN}44`, borderRadius: 999, padding: '3px 10px', fontWeight: 600 }}>
                Auto mode
              </div>
            </div>

            {/* Messages */}
            <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: `${WA_NAVY}22` }}>
              {CHAT.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.from === 'customer' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '82%', padding: '9px 13px', borderRadius: m.from === 'customer' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: m.from === 'customer' ? WA_DARK_GREEN : SURFACE2,
                    fontSize: 12.5, color: TEXT, lineHeight: 1.55,
                    boxShadow: '0 1px 4px rgba(0,0,0,.3)',
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.6 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${WA_GREEN}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={13} color={WA_GREEN} />
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[...Array(3)].map((_,i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, animation: `bounce ${0.6 + i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '10px 14px', background: SURFACE, borderTop: `1px solid ${SURFACE2}`, fontSize: 11, color: MUTED, textAlign: 'center' }}>
              Human agent can take over anytime
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF STRIP ───────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${SURFACE2}`, borderBottom: `1px solid ${SURFACE2}`, background: SURFACE }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px', display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          {[['24/7', 'Always-on replies'], ['6 bot types', 'Ready-made templates'], ['0 extra cost', 'Included in Scale'], ['Official API', 'Zero ban risk']].map(([v, l]) => (
            <div key={v} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: WA_GREEN }}>{v}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── THE PITCH: ONE PRICE ─────────────────────────────────────────── */}
      <section style={{ maxWidth: 860, margin: '0 auto', padding: '88px 24px 64px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          {pill('The Scale plan')}
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, margin: '16px 0 16px', lineHeight: 1.15 }}>
            Other tools charge extra for AI.<br />
            <span style={{ color: WA_GREEN }}>We don't.</span>
          </h2>
          <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.75, maxWidth: 580, margin: '0 auto' }}>
            Most chatbot platforms are one product, your team inbox is another,
            and your CRM is a third. You end up paying three subscriptions and stitching them together yourself.
            Nyasadesk Scale gives you all three — plus quotes, invoices, broadcasts, and SLA tracking — in one.
          </p>
        </div>

        {/* Comparison cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 48 }}>
          {/* The old way */}
          <div style={{ background: SURFACE, border: `2px solid #FF525233`, borderRadius: 20, padding: '28px 24px' }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: TEXT, marginBottom: 4 }}>The old way</div>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>Cobbling it together</div>
            {[
              ['Chatbot platform', '~K45,000/mo'],
              ['Team inbox tool', '~K30,000/mo'],
              ['CRM', '~K20,000/mo'],
              ['Invoice software', '~K15,000/mo'],
            ].map(([name, price]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${SURFACE2}`, fontSize: 13 }}>
                <span style={{ color: MUTED }}>{name}</span>
                <span style={{ color: '#FF5252', fontWeight: 600 }}>{price}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: `1px solid ${SURFACE2}`, fontWeight: 800, fontSize: 15 }}>
              <span style={{ color: TEXT }}>Total</span>
              <span style={{ color: '#FF5252' }}>~K110,000/mo</span>
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Plus 4 logins, 4 support teams, and a spreadsheet to keep it all in sync.</div>
          </div>

          {/* Nyasadesk Scale */}
          <div style={{ background: `linear-gradient(160deg, ${WA_DARK_GREEN}22 0%, ${WA_NAVY}33 100%)`, border: `2px solid ${WA_GREEN}`, borderRadius: 20, padding: '28px 24px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, background: WA_GREEN, color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 16px', borderBottomLeftRadius: 12, letterSpacing: '.04em' }}>RECOMMENDED</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: TEXT, marginBottom: 4 }}>Nyasadesk Scale</div>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>Everything in one place</div>
            {[
              'AI chatbot (6 templates + custom)',
              'Shared team inbox — unlimited agents',
              'Omnichannel: WhatsApp, email, Instagram, more',
              'Contact CRM & deal stages',
              'Quotes & invoices with payment tracking',
              'Broadcast campaigns',
              'SLA tracking, assignment rules & reports',
              'Priority support & onboarding',
            ].map(f => (
              <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: `1px solid ${SURFACE2}33`, fontSize: 13 }}>
                <Check size={15} color={WA_GREEN} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ color: MUTED }}>{f}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, fontWeight: 800, fontSize: 17 }}>
              <span style={{ color: TEXT }}>Total</span>
              <span style={{ color: WA_GREEN }}>K120,000/mo</span>
            </div>
            <Link to="/register" style={{ display: 'block', textAlign: 'center', marginTop: 20, background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '13px', borderRadius: 10 }}>
              Get started → 
            </Link>
          </div>
        </div>
      </section>

      {/* ── BOT TEMPLATES ────────────────────────────────────────────────── */}
      <section style={{ background: SURFACE, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            {pill('Bot templates')}
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, margin: '16px 0 14px' }}>
              Six ready-to-deploy chatbots
            </h2>
            <p style={{ color: MUTED, fontSize: 16, maxWidth: 500, margin: '0 auto' }}>
              Start from a template in seconds, or build your own from scratch.
              Every bot is trained on your knowledge base.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {BOTS.map(bot => (
              <div key={bot.name} style={{ background: BG, border: `1px solid ${SURFACE2}`, borderRadius: 16, padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${bot.color}18`, border: `1px solid ${bot.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    {bot.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{bot.name}</div>
                    <div style={{ fontSize: 12, color: bot.color, fontWeight: 600 }}>{bot.tagline}</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, margin: 0 }}>{bot.desc}</p>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', marginTop: 32, fontSize: 14, color: MUTED }}>
            All templates included in Scale · Build your own with custom instructions · Train on any knowledge base
          </p>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 860, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          {pill('Setup')}
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, margin: '16px 0 14px' }}>
            Live in under 15 minutes
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {STEPS.map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: `${WA_GREEN}18`, border: `2px solid ${WA_GREEN}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: 16, color: WA_GREEN }}>
                {s.n}
              </div>
              <div style={{ paddingTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: TEXT }}>{s.title}</div>
                <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.7 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── WHY NYASADESK ───────────────────────────────────────────────── */}
      <section style={{ background: SURFACE, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            {pill('Why it works')}
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, margin: '16px 0 14px' }}>
              Not just a chatbot. A complete AI teammate.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>
            {WHY.map(it => (
              <div key={it.title} style={{ background: BG, border: `1px solid ${SURFACE2}`, borderRadius: 16, padding: '24px 22px', display: 'flex', gap: 16 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `${WA_GREEN}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <it.icon size={20} color={WA_GREEN} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 7, color: TEXT }}>{it.title}</div>
                  <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65 }}>{it.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING CALLOUT ──────────────────────────────────────────────── */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '88px 24px' }}>
        <div style={{ background: `linear-gradient(145deg, ${WA_DARK_GREEN}33 0%, ${WA_NAVY}44 100%)`, border: `2px solid ${WA_GREEN}55`, borderRadius: 24, padding: '56px 40px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 18, background: `${WA_GREEN}22`, border: `1px solid ${WA_GREEN}44`, marginBottom: 24 }}>
            <Bot size={30} color={WA_GREEN} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 'clamp(22px, 3.5vw, 34px)', marginBottom: 12, lineHeight: 1.2 }}>
            Scale plan · K120,000/mo
          </div>
          <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.7, marginBottom: 32, maxWidth: 480, margin: '0 auto 32px' }}>
            AI chatbot + unlimited agents + all channels + CRM + quotes & invoices.
            One price. No add-ons. No surprises.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 36, textAlign: 'left' }}>
            {[
              'AI chatbot (6 templates)',
              'Unlimited team members',
              'WhatsApp + 4 more channels',
              'Knowledge base training',
              'Draft or fully auto mode',
              'Quotes & invoices in-chat',
              'Broadcast campaigns',
              'Priority support',
            ].map(f => (
              <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: MUTED }}>
                <Check size={14} color={WA_GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
                {f}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '15px 32px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              Start free trial <ArrowRight size={18} />
            </Link>
            <a href={CONTACT_WHATSAPP} target="_blank" rel="noreferrer" style={{ background: SURFACE2, color: TEXT, textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '15px 28px', borderRadius: 12 }}>
              Chat with us first
            </a>
          </div>

          <p style={{ marginTop: 20, fontSize: 13, color: MUTED }}>
            Not ready for Scale? <Link to="/pricing" style={{ color: WA_GREEN, textDecoration: 'none', fontWeight: 600 }}>Compare all plans →</Link>
          </p>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section style={{ background: SURFACE, padding: '64px 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          {[
            { quote: 'The bot handles all our first responses now. By the time a human picks it up, the customer is already qualified. Our close rate went up significantly.', name: 'Techno Mart', role: 'Electronics Retailer, Lilongwe' },
            { quote: 'The Finance Manager bot actually sends quotes by itself. Customers get a professional PDF in seconds — we used to take hours to do that manually.', name: 'Brandfletch Media', role: 'Digital Agency, Blantyre' },
          ].map(t => (
            <div key={t.name} style={{ background: BG, border: `1px solid ${SURFACE2}`, borderRadius: 16, padding: '28px 26px' }}>
              <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
                {[...Array(5)].map((_,i) => <Star key={i} size={14} fill={WA_GREEN} color={WA_GREEN} />)}
              </div>
              <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, marginBottom: 20, fontStyle: 'italic' }}>"{t.quote}"</p>
              <div style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{t.name}</div>
              <div style={{ fontSize: 12, color: MUTED }}>{t.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 700, margin: '0 auto', padding: '88px 24px', textAlign: 'center' }}>
        <Sparkles size={36} color={WA_GREEN} style={{ marginBottom: 20 }} />
        <h2 style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 800, marginBottom: 16 }}>
          Your chatbot is waiting.<br />
          <span style={{ color: WA_GREEN }}>Set it up today.</span>
        </h2>
        <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.7, marginBottom: 36, maxWidth: 460, margin: '0 auto 36px' }}>
          Stop losing leads after hours. Let your AI agent qualify, reply, and
          book — while your team sleeps.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '15px 32px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            Start free — Scale plan <ArrowRight size={18} />
          </Link>
          <a href={CONTACT_WHATSAPP} target="_blank" rel="noreferrer" style={{ background: SURFACE2, color: TEXT, textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '15px 28px', borderRadius: 12 }}>
            Talk to us on WhatsApp
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
