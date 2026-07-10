import { Link } from 'react-router-dom';
import { MessageSquare, Users, Zap, Shield, Megaphone, Tags, Smartphone, MessageCircleReply, ArrowRight, Bot, FileText, Check, Sparkles } from 'lucide-react';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import { WA_GREEN, WA_DARK_GREEN, WA_NAVY, BG, SURFACE, SURFACE2, TEXT, MUTED } from '@/lib/marketingTheme';

const FEATURES = [
  { icon: MessageSquare,       title: 'Omnichannel Inbox',      desc: 'WhatsApp, Messenger, Instagram, Telegram, email, and your website chat — all in one shared inbox.' },
  { icon: Users,               title: 'Team Collaboration',     desc: 'Invite your team, assign conversations, and see who\u2019s handling what in real time.' },
  { icon: Zap,                 title: 'Smart Auto-Assignment',  desc: 'Round-robin, by channel, or by lead source — incoming chats route straight to the right agent.' },
  { icon: Shield,               title: 'SLA Tracking',          desc: 'Set a response-time target and get a live countdown + breach alerts on every open conversation.' },
  { icon: Megaphone,           title: 'Broadcast Campaigns',    desc: 'Send WhatsApp template messages to your whole list, with honest sent/failed reporting.' },
  { icon: Tags,                title: 'Contact CRM & Ad Attribution', desc: 'Deal stages, canned responses, and automatic click-to-WhatsApp ad tracking on every lead.' },
  { icon: Smartphone,          title: 'Installable & Push',     desc: 'A real installable app (PWA) with WhatsApp-style push notifications on every new message.' },
  { icon: MessageCircleReply,  title: 'Canned Responses',       desc: 'Save your best replies once, reuse them across every conversation and every channel.' },
];

const MOCK_MSGS = [
  { from: 'Sarah Chen',    msg: 'Hi! Interested in the Growth plan pricing',   time: '09:41', unread: true  },
  { from: 'James Okafor',  msg: 'When does the proposal expire?',              time: '09:38', unread: true  },
  { from: 'Priya Nair',    msg: 'Can we schedule a demo this week?',           time: '09:30', unread: false },
  { from: 'Carlos Mendez', msg: 'Contract signed — thanks for the follow up!', time: '09:15', unread: false },
];

const AI_POINTS = [
  'Trained on your own knowledge base — PDFs, docs, and web pages',
  'Draft-and-approve mode, or fully autonomous replies',
  'Can generate and send a real quote or invoice mid-conversation',
  'Hands off to a human the moment someone takes over the chat',
];

const DOC_POINTS = [
  'Branded PDF quotes & invoices, generated in seconds',
  'One click converts an accepted quote into an invoice',
  'Partial payments tracked automatically — draft → partial → paid',
  'Share by WhatsApp, email, or straight into the chat thread',
];

export default function Landing() {
  return (
    <div style={{ background: BG, color: TEXT, fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>
      <MarketingHeader />

      {/* HERO */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px 60px', display: 'flex', alignItems: 'center', gap: 60, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 400px' }}>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, color: TEXT }}>
            Your team's shared<br />
            <span style={{ color: WA_GREEN }}>sales inbox.</span>
          </h1>
          <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.7, marginBottom: 36, maxWidth: 460 }}>
            Nyasadesk brings WhatsApp, Messenger, email, and live chat into one inbox your whole team can work from — with an AI agent, contact CRM, and quote &amp; invoice builder built right in.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '14px 28px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              Get started <ArrowRight size={18} />
            </Link>
            <a href="#product" style={{ background: SURFACE2, color: TEXT, textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '14px 28px', borderRadius: 12 }}>
              See how it works
            </a>
          </div>
          <p style={{ marginTop: 16, fontSize: 13, color: MUTED }}>
            <Link to="/pricing" style={{ color: WA_GREEN, textDecoration: 'none', fontWeight: 600 }}>View pricing →</Link>
          </p>
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
      <section id="product" style={{ borderTop: `1px solid ${SURFACE2}`, padding: '80px 24px', scrollMarginTop: 64 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: TEXT, marginBottom: 12 }}>Everything your team needs</h2>
            <p style={{ color: MUTED, fontSize: 16 }}>Built from the ground up for teams that close deals over messaging.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
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

      {/* AI AGENTS SPOTLIGHT */}
      <section id="ai-agents" style={{ borderTop: `1px solid ${SURFACE2}`, padding: '80px 24px', background: SURFACE, scrollMarginTop: 64 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 56, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 380px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${WA_GREEN}20`, color: WA_GREEN, fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 999, marginBottom: 18 }}>
              <Sparkles size={13} /> AI AGENTS · SCALE PLAN
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: TEXT, marginBottom: 16, lineHeight: 1.2 }}>Your AI teammate that never sleeps</h2>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.7, marginBottom: 24, maxWidth: 460 }}>
              Set up an AI agent once — receptionist, sales, support, whatever your team needs — and let it handle conversations across every channel while you sleep.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {AI_POINTS.map(p => (
                <div key={p} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Check size={17} color={WA_GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 14.5, color: TEXT }}>{p}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: '1 1 320px', maxWidth: 380 }}>
            <div style={{ background: BG, borderRadius: 20, padding: 20, border: `1px solid ${SURFACE2}`, boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: WA_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={18} color="#fff" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: TEXT }}>Sales Agent</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: WA_GREEN }}>● Fully automated</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ alignSelf: 'flex-start', background: SURFACE2, color: TEXT, fontSize: 13, padding: '10px 14px', borderRadius: '14px 14px 14px 4px', maxWidth: '85%' }}>
                  Hi, do you have a package for a 5-person team?
                </div>
                <div style={{ alignSelf: 'flex-end', background: WA_DARK_GREEN, color: '#fff', fontSize: 13, padding: '10px 14px', borderRadius: '14px 14px 4px 14px', maxWidth: '85%' }}>
                  Yes — that's our Growth plan at K50,000/mo. Want me to send over a quotation?
                </div>
                <div style={{ alignSelf: 'flex-start', background: SURFACE2, color: TEXT, fontSize: 13, padding: '10px 14px', borderRadius: '14px 14px 14px 4px', maxWidth: '85%' }}>
                  Yes please
                </div>
                <div style={{ alignSelf: 'flex-end', background: WA_DARK_GREEN, color: '#fff', fontSize: 13, padding: '10px 14px', borderRadius: '14px 14px 4px 14px', maxWidth: '88%', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} /> Quotation QUO-2026-0142 sent ✅
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* QUOTES & INVOICES SPOTLIGHT */}
      <section id="documents" style={{ borderTop: `1px solid ${SURFACE2}`, padding: '80px 24px', scrollMarginTop: 64 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 56, flexWrap: 'wrap-reverse' }}>
          <div style={{ flex: '1 1 320px', maxWidth: 380 }}>
            <div style={{ background: SURFACE, borderRadius: 20, padding: 24, border: `1px solid ${SURFACE2}`, boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>Invoice INV-2026-0087</span>
                <span style={{ background: `${WA_GREEN}20`, color: WA_GREEN, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999 }}>PAID</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                {[ ['Growth plan — 3 months', 'K90,000'], ['Onboarding assistance', 'K15,000'] ].map(([label, amt]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: MUTED }}>
                    <span>{label}</span><span style={{ color: TEXT }}>{amt}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${SURFACE2}`, paddingTop: 14, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: TEXT }}>Total</span>
                <span style={{ fontWeight: 800, color: WA_GREEN, fontSize: 17 }}>K105,000</span>
              </div>
            </div>
          </div>
          <div style={{ flex: '1 1 380px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${WA_GREEN}20`, color: WA_GREEN, fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 999, marginBottom: 18 }}>
              <FileText size={13} /> QUOTES &amp; INVOICES
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: TEXT, marginBottom: 16, lineHeight: 1.2 }}>Quotes and invoices, sent from the same chat</h2>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.7, marginBottom: 24, maxWidth: 460 }}>
              No separate accounting tool needed. Build a branded quote, send it, and once it's accepted convert it to an invoice in one click — right from the conversation.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {DOC_POINTS.map(p => (
                <div key={p} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Check size={17} color={WA_GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 14.5, color: TEXT }}>{p}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PRICING TEASER — full tiers live on /pricing */}
      <section style={{ borderTop: `1px solid ${SURFACE2}`, padding: '64px 24px', background: SURFACE, textAlign: 'center' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: TEXT, marginBottom: 12 }}>Simple, transparent pricing</h2>
          <p style={{ color: MUTED, fontSize: 15, marginBottom: 28 }}>Plans starting at K25,000/month — pick the one that fits your team.</p>
          <Link to="/pricing" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
            background: WA_GREEN, color: '#fff', fontWeight: 700, fontSize: 15,
            padding: '14px 28px', borderRadius: 12,
          }}>
            View pricing <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* CTA */}
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
            Get started <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
