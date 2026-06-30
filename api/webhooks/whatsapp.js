// Vercel Edge Function — WhatsApp Cloud API webhook
// GET  = verification handshake
// POST = incoming messages
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);

  // ── Webhook verification (GET) ────────────────────────────────────────────
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe') {
      // Accept any verify_token — we validate against stored config below
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data } = await sb.from('channel_configs').select('config').eq('channel','whatsapp').maybeSingle();
      const storedToken = data?.config?.verify_token;
      if (!storedToken || token === storedToken) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }
    return new Response('Bad Request', { status: 400 });
  }

  // ── Incoming message (POST) ───────────────────────────────────────────────
  if (req.method === 'POST') {
    let payload;
    try { payload = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const wabaId = value.metadata?.phone_number_id;

        // Find workspace by phone_number_id
        const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel','whatsapp');
        const cfg = cfgs?.find(c => c.config?.phone_number_id === wabaId);
        if (!cfg) continue;

        const workspaceId = cfg.workspace_id;

        for (const msg of value.messages || []) {
          const from       = msg.from;
          const msgId      = msg.id;
          const body       = msg.text?.body || msg.type || '';
          const contactName= value.contacts?.find(c => c.wa_id === from)?.profile?.name || from;

          // Upsert contact
          const { data: contact } = await sb.from('contacts').upsert({
            workspace_id: workspaceId, channel: 'whatsapp', external_id: from,
            full_name: contactName, phone: '+' + from,
          }, { onConflict: 'workspace_id,channel,external_id', returning: 'representation' }).select().single();

          // Upsert conversation
          const { data: conv } = await sb.from('conversations').upsert({
            workspace_id: workspaceId, channel: 'whatsapp', external_id: from,
            contact_id: contact?.id, status: 'open', last_message: body,
            last_message_at: new Date().toISOString(), unread_count: 1,
          }, { onConflict: 'workspace_id,channel,external_id', returning: 'representation' }).select().single();

          // Insert message (ignore duplicates)
          await sb.from('messages').upsert({
            conversation_id: conv?.id, workspace_id: workspaceId,
            direction: 'inbound', body, channel: 'whatsapp',
            external_id: msgId, sender_name: contactName, sender_id: from, status: 'delivered',
          }, { onConflict: 'conversation_id,external_id' });

          // Increment unread
          if (conv?.id) {
            await sb.rpc('increment_unread', { conv_id: conv.id }).catch(() => {});
          }
        }
      }
    }
    return new Response('OK', { status: 200 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
