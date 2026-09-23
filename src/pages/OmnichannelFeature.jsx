// src/pages/OmnichannelFeature.jsx
// Feature landing page: Omnichannel · Broadcasts · Automated Follow-ups
// Route: /features/omnichannel

import { Link } from 'react-router-dom';
import {
  Check, ArrowRight, Megaphone, RefreshCw,
  MessageSquare, Mail, Globe, Instagram, Send,
  Zap, Clock, BarChart3, Star, Sparkles, Users,
} from 'lucide-react';
import MarketingLayout, { Pill } from '@/components/marketing/MarketingLayout';
import {
  WA_GREEN, WA_DARK_GREEN, WA_NAVY, SURFACE, SURFACE2, MUTED, CONTACT_WHATSAPP,
} from '@/lib/marketingTheme';

// ─── channel data ─────────────────────────────────────────────────────────────
const CHANNELS = [
  { emoji: '💬', name: 'WhatsApp',  color: '#25D366', desc: 'Send template campaigns to your whole contact list. Rich media, buttons, and honest delivery stats.' },
  { emoji: '📧', name: 'Email',     color: '#3B8BF5', desc: 'Branded HTML emails from your own domain. Replies land right back in the shared inbox.' },
  { emoji: '🌐', name: 'Web Chat',  color: '#F5A623', desc: 'Embed a live chat widget on your site in 2 minutes. No developer needed.' },
  { emoji: '📸', name: 'Instagram', color: '#E1306C', desc: 'DMs from your Instagram page land in your inbox alongside every other channel.' },
  { emoji: '💼', name: 'Messenger', color: '#0084FF', desc: 'Facebook Page messages — same inbox, same team, same rules.' },
  { emoji: '✈️', name: 'Telegram',  color: '#2CA5E0', desc: 'A Telegram bot connected to your workspace. Works like every other channel.' },
];

// ─── mock broadcast UI ────────────────────────────────────────────────────────
const BROADCAST_ROWS = [
  { name: 'June Flash Sale',      ch: 'WhatsApp', sent: 843, failed: 12, status: 'sent' },
  { name: 'Invoice Reminder Q2',  ch: 'Email',    sent: 312, failed: 3,  status: 'sent' },
  { name: 'New Product Launch',   ch: 'WhatsApp', sent: 0,   failed: 0,  status: 'draft' },
];

// ─── mock follow-up flow ──────────────────────────────────────────────────────
const FOLLOWUP_FLOW = [
  { step: 'Lead arrives', icon: '📥', note: 'Via WhatsApp, Instagram DM, or web chat' },
  { step: 'Assigned automatically', icon: '⚡', note: 'Round-robin or by channel rule' },
  { step: 'No reply after 24h', icon: '⏱', note: 'Conversation snoozed by rule' },
  { step: 'Follow-up agent fires', icon: '🤖', note: 'AI sends a warm nudge' },
  { step: 'Lead responds', icon: '💬', note: 'Chat re-opens, assigned back to agent' },
  { step: 'Sale closed', icon: '✅', note: 'Deal stage updated, CRM synced' },
];

// ─── assignment rule types ────────────────────────────────────────────────────
const RULE_TYPES = [
  { label: 'Round-robin',   desc: 'Distribute every new chat evenly across your team. Nobody gets overwhelmed, nobody goes idle.', icon: RefreshCw },
  { label: 'By channel',    desc: 'WhatsApp leads go to sales. Email goes to support. Instagram DMs go to social. Automatic, every time.', icon: MessageSquare },
  { label: 'By lead source', desc: 'If they clicked your Facebook Ad, route them to the ad team. If they came from organic, go to inbound.', icon: Zap },
  { label: 'By territory',  desc: 'Route by city, region, or company keyword — so the right account manager always gets the right lead.', icon: Globe },
];

const PLANS = [
  {
    key: 'starter', name: 'Starter', price: 'K25,000', period: '/mo', seats: '2 agents', highlight: false,
    features: ['All channels — WhatsApp, Messenger, email, website chat', 'Shared inbox', 'Contact CRM & deal stages', 'Canned responses', 'Basic assignment rules'],
    cta: 'Start free',
  },
  {
    key: 'growth', name: 'Growth', price: 'K50,000', period: '/mo', seats: '5 agents', highlight: true,
    features: ['Everything in Starter', 'Broadcast campaigns with delivery stats', 'SLA tracking & breach alerts', 'Round-robin & smart assignment rules'],
    cta: 'Start free',
  },
  {
    key: 'scale', name: 'Scale', price: 'K120,000', period: '/mo', seats: 'Unlimited agents', highlight: false,
    features: ['Everything in Growth', 'AI chatbot (draft or fully auto)', 'Automated follow-up agent', 'Unlimited team members & channels', 'Priority support & onboarding'],
    cta: 'Talk to us',
  },
];

const CH_COLOR = { WhatsApp: '#25D366', Email: '#3B8BF5', 'Web Chat': '#F5A623', Instagram: '#E1306C', Messenger: '#0084FF', Telegram: '#2CA5E0' };

export default function OmnichannelFeature() {
  return (
    <MarketingLayout title="Omnichannel & Broadcasts">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 72px', display: 'flex', alignItems: 'center', gap: 60, flexWrap: 'wrap' }}>

        {/* Copy */}
        <div style={{ flex: '1 1 420px' }}>
          {<Pill label="Omnichannel · Broadcasts · Follow-ups" />}
          <h1 style={{ fontSize: 'clamp(34px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.08, margin: '20px 0 24px' }}>
            Every channel.<br />
            Every customer.<br />
            <span style={{ color: WA_GREEN }}>Nothing falls through.</span>
          </h1>
          <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.75, marginBottom: 40, maxWidth: 500 }}>
            Nyasadesk brings WhatsApp, email, Instagram, Messenger, Telegram,
            and live chat into one inbox — then lets you blast broadcasts,
            auto-assign leads, and chase up cold customers without lifting a finger.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '15px 30px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              Get started free <ArrowRight size={18} />
            </Link>
            <a href={CONTACT_WHATSAPP} target="_blank" rel="noreferrer" style={{ background: SURFACE2, color: '#E9EDF0', textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '15px 28px', borderRadius: 12 }}>
              See a demo
            </a>
          </div>
          <p style={{ marginTop: 18, fontSize: 13, color: MUTED }}>All channels included on every plan · No setup fee</p>
        </div>

        {/* Multi-channel inbox mockup */}
        <div style={{ flex: '1 1 300px', maxWidth: 400 }}>
          <div style={{ background: SURFACE, borderRadius: 20, overflow: 'hidden', boxShadow: '0 28px 80px rgba(0,0,0,.55)', border: `1px solid ${SURFACE2}` }}>
            {/* Header */}
            <div style={{ background: WA_NAVY, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#E9EDF0' }}>Inbox · All channels</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {CHANNELS.slice(0, 5).map(ch => (
                  <div key={ch.name} title={ch.name} style={{ width: 22, height: 22, borderRadius: '50%', background: `${ch.color}22`, border: `1.5px solid ${ch.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                    {ch.emoji}
                  </div>
                ))}
              </div>
            </div>

            {/* Filter strip */}
            <div style={{ display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto', background: SURFACE }}>
              {['All', 'WhatsApp', 'Email', 'Instagram', 'Web'].map((t, i) => (
                <div key={t} style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: i === 0 ? WA_GREEN : SURFACE2, color: i === 0 ? '#fff' : MUTED }}>
                  {t}
                </div>
              ))}
            </div>

            {/* Conversations */}
            {[
              { name: 'Sarah C.',  msg: 'Saw your Facebook ad — interested!', ch: 'WhatsApp',  agent: 'Thandi', time: '09:41', unread: 2 },
              { name: 'Priya N.',  msg: 'Quick question about the invoice',   ch: 'Email',     agent: 'James',  time: '09:38', unread: 1 },
              { name: 'Carlos M.', msg: 'Can we schedule a call?',            ch: 'Web Chat',  agent: null,     time: '09:30', unread: 3 },
              { name: 'Amina K.',  msg: 'Loved the new product post! 🔥',     ch: 'Instagram', agent: 'Lucia',  time: '09:15', unread: 0 },
            ].map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${SURFACE2}`, background: i === 0 ? `${SURFACE2}99` : 'transparent' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: SURFACE2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#E9EDF0' }}>
                  {c.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: '#E9EDF0' }}>{c.name}</span>
                    <span style={{ fontSize: 10, color: MUTED }}>{c.time}</span>
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{c.msg}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontSize: 10, background: `${CH_COLOR[c.ch]}22`, color: CH_COLOR[c.ch], borderRadius: 999, padding: '1px 7px', fontWeight: 600 }}>{c.ch}</span>
                    {c.agent && <span style={{ fontSize: 10, color: MUTED }}>→ {c.agent}</span>}
                    {!c.agent && <span style={{ fontSize: 10, color: '#F5A623', fontWeight: 600 }}>⚡ Auto-assigning…</span>}
                  </div>
                </div>
                {c.unread > 0 && <div style={{ minWidth: 18, height: 18, borderRadius: 999, background: WA_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{c.unread}</div>}
              </div>
            ))}
            <div style={{ padding: '10px', textAlign: 'center', fontSize: 11, color: MUTED, background: SURFACE }}>0 missed · 6 agents online</div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ──────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${SURFACE2}`, borderBottom: `1px solid ${SURFACE2}`, background: SURFACE }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px', display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          {[['6 channels', 'One inbox'], ['Broadcasts', 'WhatsApp + email'], ['Auto-assign', '4 rule types'], ['Follow-ups', 'AI-powered']].map(([v, l]) => (
            <div key={v} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: WA_GREEN }}>{v}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── OMNICHANNEL GRID ─────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1060, margin: '0 auto', padding: '88px 24px 64px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          {<Pill label="Omnichannel" />}
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, margin: '16px 0 14px' }}>
            Six channels. One inbox. Zero context-switching.
          </h2>
          <p style={{ color: MUTED, fontSize: 16, maxWidth: 560, margin: '0 auto' }}>
            Your customers are on WhatsApp, Instagram, email, and your website — sometimes all at once.
            Nyasadesk catches all of it and puts it in one screen for your team.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {CHANNELS.map(ch => (
            <div key={ch.name} style={{ background: SURFACE, border: `1px solid ${SURFACE2}`, borderRadius: 16, padding: '24px 22px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: `${ch.color}18`, border: `1px solid ${ch.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                {ch.emoji}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#E9EDF0', marginBottom: 7 }}>{ch.name}</div>
                <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65 }}>{ch.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, background: SURFACE, borderRadius: 16, padding: '28px 28px', border: `1px solid ${WA_GREEN}33`, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#E9EDF0', marginBottom: 8 }}>One conversation thread, no matter where they reach you</div>
            <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.7 }}>
              When the same customer emails you and then sends a WhatsApp, Nyasadesk links it — so your agent never has to ask "wait, did you send an email earlier?"
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['Search across all channels', 'Filter by channel in one click', 'Assign, snooze, or close from any channel'].map(f => (
              <div key={f} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13, color: MUTED }}>
                <Check size={14} color={WA_GREEN} style={{ flexShrink: 0 }} /> {f}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BROADCASTS ───────────────────────────────────────────────────── */}
      <section style={{ background: SURFACE, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto', display: 'flex', gap: 60, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Mock broadcast list */}
          <div style={{ flex: '1 1 300px', maxWidth: 420 }}>
            <div style={{ background: '#111B21', borderRadius: 18, overflow: 'hidden', border: `1px solid ${SURFACE2}`, boxShadow: '0 16px 48px rgba(0,0,0,.4)' }}>
              <div style={{ background: WA_NAVY, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#E9EDF0', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Megaphone size={16} color={WA_GREEN} /> Broadcasts
                </div>
                <div style={{ background: WA_GREEN, color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999, cursor: 'pointer' }}>+ New</div>
              </div>

              {BROADCAST_ROWS.map((bc, i) => (
                <div key={i} style={{ padding: '14px 18px', borderBottom: `1px solid ${SURFACE2}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${CH_COLOR[bc.ch]}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    {bc.ch === 'WhatsApp' ? '💬' : '📧'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#E9EDF0', marginBottom: 4 }}>{bc.name}</div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                      <span style={{ color: MUTED }}>{bc.ch}</span>
                      {bc.status === 'sent' && <>
                        <span style={{ color: WA_GREEN }}>✓ {bc.sent.toLocaleString()} sent</span>
                        {bc.failed > 0 && <span style={{ color: '#FF5252' }}>{bc.failed} failed</span>}
                      </>}
                      {bc.status === 'draft' && <span style={{ color: '#F5A623', fontWeight: 600 }}>Draft</span>}
                    </div>
                  </div>
                </div>
              ))}

              {/* Composer preview */}
              <div style={{ padding: '14px 18px', borderTop: `1px solid ${SURFACE2}` }}>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>New broadcast</div>
                <div style={{ background: SURFACE, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: MUTED, marginBottom: 10 }}>
                  Hi {'{{1}}'}, we have a special offer just for you this week…
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: MUTED }}>843 contacts selected</span>
                  <div style={{ background: WA_GREEN, color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Send size={12} /> Send now
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Copy */}
          <div style={{ flex: '1 1 320px' }}>
            {<Pill label="Broadcasts" />}
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 38px)', fontWeight: 800, margin: '16px 0 16px', lineHeight: 1.15 }}>
              Reach your whole list<br />in one send.
            </h2>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.75, marginBottom: 24 }}>
              Send WhatsApp template campaigns and emails to your entire contact list.
              No third-party bulk SMS tool. No CSV exports. It's built right into
              your inbox — and replies come straight back in as conversations.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'WhatsApp broadcasts use Meta-approved templates — zero spam risk',
                'Honest delivery stats: sent, delivered, and failed counts in real time',
                'Email broadcasts go out from your own nyasadesk.com domain',
                'Every reply becomes a conversation in the shared inbox automatically',
                'Segment by contact tags, deal stage, or channel',
              ].map(f => (
                <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: MUTED }}>
                  <Check size={15} color={WA_GREEN} style={{ flexShrink: 0, marginTop: 2 }} /> {f}
                </li>
              ))}
            </ul>
            <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '13px 26px', borderRadius: 10 }}>
              Send your first broadcast <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── AUTO-ASSIGNMENT ──────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1060, margin: '0 auto', padding: '88px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          {<Pill label="Auto-assignment" />}
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, margin: '16px 0 14px' }}>
            Every lead lands on the right desk.
          </h2>
          <p style={{ color: MUTED, fontSize: 16, maxWidth: 540, margin: '0 auto' }}>
            Stop manually shuffling chats. Set a rule once — Nyasadesk does the routing forever.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {RULE_TYPES.map(r => (
            <div key={r.label} style={{ background: SURFACE, border: `1px solid ${SURFACE2}`, borderRadius: 16, padding: '24px 20px' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: `${WA_GREEN}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <r.icon size={20} color={WA_GREEN} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#E9EDF0', marginBottom: 8 }}>{r.label}</div>
              <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65 }}>{r.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 36, background: SURFACE, borderRadius: 16, border: `1px solid ${SURFACE2}`, padding: '24px 28px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#E9EDF0', marginBottom: 6 }}>SLA tracking built in</div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65 }}>
              Set a response-time target on every conversation. Get a live countdown and a breach alert before the clock hits zero — so no customer ever waits too long.
            </div>
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#E9EDF0', marginBottom: 6 }}>Agent performance reports</div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65 }}>
              Resolution rates, response times, and conversation volumes — ranked by agent, visible to admins and sales managers at a glance.
            </div>
          </div>
        </div>
      </section>

      {/* ── AUTOMATED FOLLOW-UPS ─────────────────────────────────────────── */}
      <section style={{ background: SURFACE, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto', display: 'flex', gap: 60, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Copy */}
          <div style={{ flex: '1 1 340px' }}>
            {<Pill label="Automated follow-ups" />}
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 38px)', fontWeight: 800, margin: '16px 0 16px', lineHeight: 1.15 }}>
              Cold leads don't close themselves.<br />
              <span style={{ color: WA_GREEN }}>Your bot will.</span>
            </h2>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.75, marginBottom: 24 }}>
              When a lead goes quiet, Nyasadesk doesn't just sit there. The AI Follow-up
              Agent detects the silence, sends a warm nudge at the right moment, and wakes
              the conversation back up — so your team only picks up leads that are ready to move.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'Detects unresponsive conversations automatically',
                'Sends varied follow-up messages — not the same copy every time',
                'Re-opens and reassigns to the original agent when the lead responds',
                'Stops following up the moment a human takes over',
                'Works on WhatsApp, Messenger, Instagram, and Telegram',
              ].map(f => (
                <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: MUTED }}>
                  <Check size={15} color={WA_GREEN} style={{ flexShrink: 0, marginTop: 2 }} /> {f}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/features/whatsapp-chatbots" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: SURFACE2, color: '#E9EDF0', textDecoration: 'none', fontWeight: 600, fontSize: 14, padding: '12px 22px', borderRadius: 10 }}>
                About the AI agent →
              </Link>
              <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '12px 22px', borderRadius: 10 }}>
                Try it free <ArrowRight size={15} />
              </Link>
            </div>
          </div>

          {/* Follow-up flow diagram */}
          <div style={{ flex: '1 1 280px', maxWidth: 360 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {FOLLOWUP_FLOW.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {/* Timeline */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: i === 4 ? `${WA_GREEN}22` : SURFACE2, border: `2px solid ${i === 4 ? WA_GREEN : SURFACE2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, zIndex: 1 }}>
                      {step.icon}
                    </div>
                    {i < FOLLOWUP_FLOW.length - 1 && (
                      <div style={{ width: 2, height: 32, background: i === 3 ? WA_GREEN : SURFACE2, marginTop: 0 }} />
                    )}
                  </div>
                  <div style={{ paddingTop: 8, paddingBottom: i < FOLLOWUP_FLOW.length - 1 ? 16 : 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#E9EDF0', marginBottom: 2 }}>{step.step}</div>
                    <div style={{ fontSize: 12, color: MUTED }}>{step.note}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, background: `${WA_GREEN}18`, border: `1px solid ${WA_GREEN}44`, borderRadius: 12, padding: '12px 16px', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              <span style={{ color: WA_GREEN, fontWeight: 700 }}>Scale plan only.</span> The Follow-up Agent is part of the AI chatbot suite, included in Scale at K120,000/mo.
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ maxWidth: 1060, margin: '0 auto', padding: '88px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          {<Pill label="Pricing" />}
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, margin: '16px 0 14px' }}>
            Broadcasts on Growth. AI follow-ups on Scale.
          </h2>
          <p style={{ color: MUTED, fontSize: 16, maxWidth: 520, margin: '0 auto' }}>
            All channels are included on every plan. Upgrade when you need broadcasts or AI.
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
                {plan.seats}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: MUTED, lineHeight: 1.5 }}>
                    <Check size={15} color={WA_GREEN} style={{ flexShrink: 0, marginTop: 2 }} /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to={plan.key === 'scale' ? CONTACT_WHATSAPP : '/register'}
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '13px', borderRadius: 10, background: plan.highlight ? WA_GREEN : SURFACE2, color: plan.highlight ? '#fff' : '#E9EDF0', border: `1px solid ${plan.highlight ? WA_GREEN : SURFACE2}` }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: MUTED }}>
          Prices in Malawi Kwacha via PayChangu &nbsp;·&nbsp;
          <Link to="/pricing" style={{ color: WA_GREEN, textDecoration: 'none', fontWeight: 600 }}>Full feature comparison →</Link>
        </p>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section style={{ background: SURFACE, padding: '64px 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          {[
            { quote: 'Before Nyasadesk we had WhatsApp on one phone and email in a Gmail. Now everything is in one place and we haven\'t missed a single lead.', name: 'Techno Mart', role: 'Electronics Retailer, Lilongwe' },
            { quote: 'The broadcast feature saved us hours. We sent a campaign to 800+ contacts and the replies came straight back in as normal conversations.', name: 'Brandfletch Media', role: 'Digital Agency, Blantyre' },
          ].map(t => (
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
          <div style={{ fontSize: 40, marginBottom: 16 }}>🚀</div>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, marginBottom: 16 }}>
            Stop losing customers<br />to slow replies and missed messages.
          </h2>
          <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.7, marginBottom: 36, maxWidth: 480, margin: '0 auto 36px' }}>
            One inbox, six channels, smart routing, broadcasts, and AI follow-ups.
            Everything you need to turn conversations into closed deals.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" style={{ background: WA_GREEN, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '15px 32px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              Get started free <ArrowRight size={18} />
            </Link>
            <a href={CONTACT_WHATSAPP} target="_blank" rel="noreferrer" style={{ background: SURFACE2, color: '#E9EDF0', textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '15px 28px', borderRadius: 12 }}>
              Chat with us on WhatsApp
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
