import { createClient } from '@supabase/supabase-js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Inbound email via Mailgun/SendGrid Inbound Parse
// Point your provider's inbound webhook to: https://nyasadesk1.vercel.app/api/webhooks/email
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
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
    }
    return res.status(200).send('OK');
  } catch (err) {
    console.error('Email webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
