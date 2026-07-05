// api/webhooks/whatsapp.js
// Webhook handler — routes to the correct WhatsApp provider.
// Auto-detects WasapFlow vs Bird vs Meta Cloud API vs 360dialog based on
// payload shape and ?source= query param.

import { createClient } from '@supabase/supabase-js';
import { getProvider } from '../_lib/providers/index.js';
import { applyAssignmentRules } from '../_lib/assignRules.js';

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── GET: webhook verification handshake ──────────────────────────────
    if (req.method === 'GET') {
      const source = req.query.source;
      // WasapFlow verification
      if (source === 'wasapflow') {
        const provider = getProvider('whatsapp:wasapflow');
        const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', 'whatsapp');
        const result = await provider.verifyWebhook(req, cfgs);
        if (result) return res.status(200).send(result.challenge);
        return res.status(403).send('Forbidden');
      }
      // Meta Cloud API / 360dialog verification
      const provider = getProvider('whatsapp:cloud');
      const { data: cfgs } = await sb.from('channel_configs').select('config').eq('channel', 'whatsapp');
      const result = await provider.verifyWebhook(req, cfgs);
      if (result) return res.status(200).send(result.challenge);
      return res.status(403).send('Forbidden');
    }

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const payload = req.body || {};
    const wsId = req.query.workspace_id;
    const source = req.query.source;

    // ── Detect payload format ────────────────────────────────────────────
    // WasapFlow: { event: 'message.received'|'message.status', waba_id, data: {...} }
    //   or source === 'wasapflow'
    // Bird: {service, event, payload: {id, channelId, sender, body, ...}}
    // Meta/360dialog: {object: "whatsapp_business_account", entry: [...]}

    const isWasapFlow = source === 'wasapflow'
      || payload.event === 'message.received'
      || payload.event === 'message.status'
      || payload.event === 'message.delivery';

    if (isWasapFlow) {
      // ── WasapFlow webhook ───────────────────────────────────────────────
      // Find workspace by waba_id in the payload, or by workspace_id query param
      let cfg = null;
      const wabaId = payload.waba_id;

      if (wsId) {
        const { data } = await sb.from('channel_configs').select('*')
          .eq('workspace_id', wsId).eq('channel', 'whatsapp').maybeSingle();
        cfg = data;
      }
      if (!cfg && wabaId) {
        const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');
        cfg = cfgs?.find(c => c.config?.waba_id === wabaId);
      }
      if (!cfg) {
        // Last resort: check all wasapflow configs
        const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');
        cfg = cfgs?.find(c => c.config?.provider === 'wasapflow');
      }
      if (!cfg) return res.status(200).send('OK');

      const provider = getProvider('whatsapp:wasapflow');
      await provider.handleInbound(payload, cfg.config, {
        sb, workspaceId: cfg.workspace_id, applyAssignmentRules,
      });
      return res.status(200).send('OK');
    }

    const isBird = source === 'bird'
      || payload.service === 'channels'
      || (payload.channelId && payload.sender && !payload.object)
      || (payload.payload?.channelId && payload.payload?.sender);

    if (isBird) {
      // ── Bird webhook ───────────────────────────────────────────────────
      let cfg = null;
      if (wsId) {
        const { data } = await sb.from('channel_configs').select('*')
          .eq('workspace_id', wsId).eq('channel', 'whatsapp').maybeSingle();
        cfg = data;
      }
      if (!cfg) {
        const channelId = payload.payload?.channelId || payload.channelId;
        if (channelId) {
          const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');
          cfg = cfgs?.find(c => c.config?.bird_channel_id === channelId);
        }
      }
      if (!cfg) return res.status(200).send('OK');

      const provider = getProvider('whatsapp:bird');
      await provider.handleInbound(payload, cfg.config, {
        sb, workspaceId: cfg.workspace_id, applyAssignmentRules,
      });
      return res.status(200).send('OK');
    }

    // ── Meta / 360dialog webhook (original format) ───────────────────────
    const phoneId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const displayPhone = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number;

    const { data: cfgs } = await sb.from('channel_configs').select('*').eq('channel', 'whatsapp');

    let cfg = null;
    if (wsId) {
      cfg = cfgs?.find(c => c.workspace_id === wsId);
    }
    if (!cfg) {
      cfg = cfgs?.find(c => c.config?.phone_number_id === phoneId);
    }
    if (!cfg) {
      cfg = cfgs?.find(c => c.config?.phone_number && c.config.phone_number === displayPhone);
    }
    if (!cfg) return res.status(200).send('OK');

    // Pick the right provider based on the stored config
    const providerKey = cfg.config?.provider === 'wasapflow' ? 'whatsapp:wasapflow'
      : cfg.config?.d360_api_key ? 'whatsapp:360dialog' : 'whatsapp:cloud';
    const provider = getProvider(providerKey);

    await provider.handleInbound(payload, cfg.config, {
      sb, workspaceId: cfg.workspace_id, applyAssignmentRules,
    });

    return res.status(200).send('OK');
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
