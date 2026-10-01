import { createClient } from '../dbFactory.js';
import { applyAssignmentRules } from '../assignRules.js';
import { notifyNewMessage } from '../pushNotify.js';

import crypto from 'crypto';

// ── Shared-secret gate (2026-09-26 security audit) ──────────────────────────
// Inbound-email webhooks previously had NO verification: anyone could POST a
// forged email into any workspace (poisoned contact records, fake
// conversations, push spam, AI auto-reply triggers). Configure the secret in
// your Mailgun/SendGrid inbound-URL: https://nyasadesk.com/api/webhooks/email?secret=<EMAIL_WEBHOOK_SECRET>
function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Inbound email via Mailgun/SendGrid Inbound Parse
// Point your provider's inbound webhook to: https://nyasadesk.com/api/webhooks/email
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const EMAIL_SECRET = process.env.EMAIL_WEBHOOK_SECRET;
    if (!EMAIL_SECRET) {
      console.error('[email-webhook] EMAIL_WEBHOOK_SECRET not set — rejecting (fail closed)');
      return res.status(500).send('Webhook not configured');
    }
    const provided = req.query.secret || req.headers['x-webhook-secret'];
    if (!timingSafeEq(provided, EMAIL_SECRET)) return res.status(401).send('Unauthorized');
    const sb   = createClient(SUPABASE_URL, SUPABASE_KEY);
    const body = req.body || {};

    const from    = body.sender || body.from || body['envelope-from'] || '';
    const subject = body.subject || body.Subject || '(no subject)';
    const text    = body['body-plain'] || body.text || body.plain || (typeof body.html === 'string' ? body.html.replace(/<[^>]+>/g,'') : '') || '';
    const msgId   = body['Message-Id'] || body.message_id || `email-${Date.now()}`;
    const to      = body.recipient || body.to || '';

    if (!from) return res.status(400).json({ error: 'No sender' });

    const fromEmail = from.match(/<(.+)>/)?.[1] || from.trim();
    const fromName  = from.replace(/<.+>/, '').replace(/"/g,'').trim() || fromEmail;

    const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'email');
    const cfg = cfgs?.find(c => to.includes(c.config?.email)) || cfgs?.[0];
    if (!cfg) return res.status(200).send('No matching workspace');

    const workspaceId = cfg.workspace_id;

    const { data: contact } = await sb.from('contacts')
      .upsert({ workspace_id: workspaceId, channel: 'email', external_id: fromEmail,
        full_name: fromName, email: fromEmail, lead_source: 'email' },
        { onConflict: 'workspace_id,channel,external_id' }).select('*').single();

    const { data: conv } = await sb.from('conversations')
      .upsert({ workspace_id: workspaceId, channel: 'email', external_id: fromEmail,
        contact_id: contact?.id, status: 'open', subject,
        last_message: text.slice(0, 200), last_message_at: new Date().toISOString() },
        { onConflict: 'workspace_id,channel,external_id' }).select('id,unread_count,assigned_to').single();

    if (conv?.id) {
      await sb.from('conversations').update({
        unread_count: (conv.unread_count || 0) + 1, subject,
        last_message: text.slice(0, 200), last_message_at: new Date().toISOString(),
      }).eq('id', conv.id);
      await sb.from('messages').upsert({
        conversation_id: conv.id, workspace_id: workspaceId,
        direction: 'inbound', body: text, channel: 'email',
        external_id: msgId, sender_name: fromName, sender_id: fromEmail, status: 'delivered',
      }, { onConflict: 'conversation_id,external_id' });

      if (!conv.assigned_to) {
        await applyAssignmentRules(sb, { workspaceId, conversationId: conv.id, channel: 'email', contact });
      }
      await notifyNewMessage(sb, { ownerId: workspaceId, contactName: fromName, body: text, conversationId: conv.id, channel: 'email' });
    }
    return res.status(200).send('OK');
  } catch (err) {
    console.error('Email webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
