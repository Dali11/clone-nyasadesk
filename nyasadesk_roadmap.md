# Nyasadesk → WhatsApp-Clone-But-Better Roadmap
# Lead Programmer: Nyasadesk AI | Updated: 2026-07-14

## Philosophy
Build every WhatsApp feature that exists, then layer on top what businesses need.
Two features per night, shipped to main, no waiting for input.

---

## PHASE 1 — Core Messaging Parity (Weeks 1–2)
Features WhatsApp has that we must nail first.

### Night 1 (Jul 12) ✅ DONE (channel fix + audit + manual features)
- [x] Full backend audit & HTTP 500 elimination
- [x] UUID validation guards on all DB-touching endpoints
- [x] WhatsApp image album grid (mosaic send/receive, groupMessages, ImageAlbum component)
- [x] Client message quoting/tagging (msg.context parsed, reply_to stored on inbound)
- [x] Subscription plan cards fully clickable (tap anywhere on K50,000 card)
- [x] Seat-counting: owner excluded, admins/agents/sales_managers are billable
- [x] Webhook verification: read-only Meta health check (no re-subscription)
- [x] error_reason column on messages table for granular Meta API failure display

### Night 2 (Jul 13) ✅ COMPLETE
- [x] **Voice Notes** — Record, upload, and play back audio messages (in-thread voice recorder UI + playback bubble with waveform)
- [x] **Message Search** — Full-text search across all conversations (search bar in inbox, highlights matching messages)

### Night 3 (Jul 14) ✅ COMPLETE
- [x] **Message Reactions** — Emoji reaction picker on hover/long-press, reaction count badges on bubbles
- [x] **Pinned Messages** — Pin up to 3 messages per conversation, pinned banner at top of thread

### Night 4 (Jul 15)
- [ ] **Message Info / Read Receipts** — Sent ✓, Delivered ✓✓, Read ✓✓ (blue) per message + info panel
- [ ] **Starred Messages** — Star any message, global starred messages view in sidebar

### Night 5 (Jul 16)
- [ ] **Typing Indicators** — "Contact is typing…" real-time indicator at bottom of thread
- [ ] **Online / Last Seen** — Show contact's last seen timestamp + green dot if online

### Night 6 (Jul 17)
- [ ] **Link Previews** — Auto-fetch OG metadata for URLs in messages, render card preview in bubble
- [ ] **Message Forwarding UI polish** — Forward to multiple conversations, forwarded label badge

### Night 7 (Jul 18)
- [ ] **Video Message Thumbnails** — Render video attachments with thumbnail + duration badge, in-chat player
- [ ] **Document Previews** — PDF/docx preview thumbnails, file size + type badge in bubble

---

## PHASE 2 — Business Power Features (Weeks 3–4)
Things WhatsApp Business has + things it doesn't.

### Night 8 (Jul 19)
- [ ] **Quick Replies / Canned Responses 2.0** — Type / to trigger canned response picker, category folders
- [ ] **Broadcast Lists** — Send one message to multiple contacts, per-contact delivery tracking

### Night 9 (Jul 20)
- [ ] **Auto-Reply Rules** — Outside-hours auto-reply, keyword triggers, welcome messages
- [ ] **SLA Timers** — Visual countdown per conversation, auto-escalate on breach

### Night 10 (Jul 21)
- [ ] **Contact Labels / Tags** — Color-coded labels on conversations (VIP, Follow-up, Closed, etc.)
- [ ] **Conversation Folders** — Filter inbox by: All, Unread, Mine, Unassigned, Starred, Bots

### Night 11 (Jul 22)
- [ ] **Internal Notes** — Private agent-only notes in thread (yellow bubble, invisible to contact)
- [ ] **Agent Mentions** — @mention a teammate inside a note, they get a notification

### Night 12 (Jul 23)
- [ ] **WhatsApp Template Messages** — Send pre-approved templates from a picker with variable fill-in
- [ ] **Template Analytics** — Open rate, reply rate per template

### Night 13 (Jul 24)
- [ ] **Contact Profile Sidebar** — Rich contact card: name, phone, email, tags, conversation history, deal stage
- [ ] **Conversation History Timeline** — Full history across all channels for a contact

### Night 14 (Jul 25)
- [ ] **Team Performance Dashboard** — Response time, resolution time, messages handled per agent
- [ ] **CSAT / Satisfaction Ratings** — Auto-send rating request on conversation close

---

## PHASE 3 — WhatsApp-Better Differentiators (Weeks 5–6)

### Night 15 (Jul 26)
- [ ] **AI Smart Reply Suggestions** — 3 suggested replies below input box, click to insert
- [ ] **AI Conversation Summary** — One-click summary of entire conversation thread

### Night 16 (Jul 27)
- [ ] **WhatsApp Flows** — Visual chatbot builder: conditions, buttons, lists, carousels
- [ ] **Bot Handoff** — Bot handles first, agent takes over with one click (with context)

### Night 17 (Jul 28)
- [ ] **Payment Links in Chat** — Send payment request, contact pays inline, status updates in thread
- [ ] **Quote / Invoice from Chat** — Generate and send quote directly from conversation

### Night 18 (Jul 29)
- [ ] **Multi-Product Catalog** — WhatsApp catalog integration, send products in chat
- [ ] **Order Tracking in Chat** — Send order status, tracking link as interactive message

### Night 19 (Jul 30)
- [ ] **Email Channel** — Gmail/Outlook inbox unified with WhatsApp threads
- [ ] **SMS Channel** — Twilio SMS as a channel alongside WhatsApp

### Night 20 (Jul 31)
- [ ] **Mobile App (PWA)** — Installable PWA with push notifications, offline support, biometric lock
- [ ] **Dark Mode** — Full dark theme with system preference detection

---

## PHASE 4 — Enterprise Features (Month 2)
- [ ] Multi-language UI (English, French, Portuguese, Swahili)
- [ ] Role-based permissions (granular)
- [ ] API webhooks for integrations
- [ ] Zapier / Make.com integration
- [ ] White-label (custom domain, logo, colors per workspace)
- [ ] Data export (conversations, contacts, analytics)
- [ ] GDPR compliance tools (data deletion, consent tracking)
- [ ] Audit log (all agent actions logged)
- [ ] 2FA / SSO (Google Workspace, Microsoft)
- [ ] Custom chatbot training on workspace knowledge base

---

## Nightly Routine (11pm CAT)
1. Pull latest main
2. Audit: run endpoint health check on all API routes
3. Implement 2 scheduled features from roadmap
4. Fix any audit-discovered issues
5. Push to main → Vercel auto-deploys
6. Log what was done

---

## PHASE 5 — WhatChimp Parity (competitive gap closure, started 2026-09-22)
Direct competitor: WhatChimp.com. Features they ship that we don't, in priority order.

- [x] P0 ~~CRITICAL BLOCKER~~ FIXED (2026-09-22): Supabase anon key was corrupted (one-char ref mismatch). Replaced hardcoded key in src/lib/supabase.js, api/_lib/adminAuth.js, api/billing.js, api/team.js with the valid production key from the old Vercel project env. Verified working against live Supabase (HTTP 200).
- [x] WhatsApp Number Coexistence — Embedded Signup coexistence mode (Meta, May 2025): same number on Business App + Cloud API, with an opt-in Business App coexistence setting, outbound echo persistence, direction tagging, and duplicate-AI-reply protection. Meta-managed 6-month history sync is accepted through the webhook path. NOTE: read receipts, edit/undo, disappearing messages, live location are DISABLED in coexistence 1:1 chats.
- [ ] WhatsApp Flows / Native Forms — in-chat step-by-step data collection (WhatsApp Flows API)
- [ ] WhatsApp Catalog — product catalog send/browse in chat
- [ ] Payments in chat — payment links, status updates in thread (PayChangu/Stripe)
- [ ] Contact Segments — segment subscribers for targeted broadcasts
- [ ] Custom Fields on contacts
- [ ] Drip Messaging — automated multi-step sequences with delays
- [ ] Phone Number Masking — hide customer number from agents (privacy toggle)
- [ ] Public API + API keys — send messages, manage contacts/segments
- [ ] Outgoing webhooks — push incoming messages to customer URLs
- [ ] Webhook Listener — receive JSON from external systems, trigger WhatsApp
- [ ] Integrations: Google Sheets, Zapier, Make, n8n, Shopify, WooCommerce
- [ ] Click-to-WhatsApp Ads — campaign manager + CTWA landing pages
- [ ] Appointment Booking on WhatsApp
- [ ] Broadcast analytics — per-campaign sent/delivered/read/replied
- [ ] Template approval workflow (submission + status tracking in-app)

### Night Log
- 2026-09-22 (day): Fixed chat-refresh root cause (corrupted Supabase anon key, 401s) — commit 10b830d, verified live. Copied all 23 env vars to new geniuspulse22 Vercel project. Domain move pending TXT records.
- 2026-09-22 (night): Shipped WhatsApp Business App coexistence support — commit 68afc02. Added a per-number coexistence toggle in Settings, detected Business App outbound echoes in the WhatsApp webhook, persisted them as outbound messages without unread increments or AI auto-replies, and preserved conversation assignment/status. Build passed and production deployment `dpl_EJXWWfXbzMsTdHzTcLgVMKWVunbR` is READY. Next: WhatsApp Flows / Native Forms.
