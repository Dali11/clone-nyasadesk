// Vercel Edge Function — Facebook Messenger webhook
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe') {
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data } = await sb.from('channel_configs').select('config').eq('channel','messenger').maybeSingle();
      if (!data?.config?.verify_token || token === data.config.verify_token) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }
    return new Response('Bad Request', { status: 400 });
  }

  if (req.method === 'POST') {
    let payload;
    try { payload = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    for (const entry of payload.entry || []) {
      const pageId = entry.id;
      const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel','messenger');
      const cfg = cfgs?.find(c => c.config?.page_id === pageId);
      if (!cfg) continue;
      const workspaceId = cfg.workspace_id;

      for (const event of entry.messaging || []) {
        if (!event.message) continue;
        const senderId = event.sender?.id;
        const msgId    = event.message?.mid;
        const body     = event.message?.text || '[attachment]';

        const { data: contact } = await sb.from('contacts').upsert({
          workspace_id: workspaceId, channel: 'messenger', external_id: senderId,
          full_name: senderId, lead_source: 'messenger',
        }, { onConflict: 'workspace_id,channel,external_id', returning: 'representation' }).select().single();

        const { data: conv } = await sb.from('conversations').upsert({
          workspace_id: workspaceId, channel: 'messenger', external_id: senderId,
          contact_id: contact?.id, status: 'open', last_message: body,
          last_message_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,channel,external_id', returning: 'representation' }).select().single();

        await sb.from('messages').upsert({
          conversation_id: conv?.id, workspace_id: workspaceId,
          direction: 'inbound', body, channel: 'messenger',
          external_id: msgId, sender_id: senderId, status: 'delivered',
        }, { onConflict: 'conversation_id,external_id' });
      }
    }
    return new Response('OK', { status: 200 });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
