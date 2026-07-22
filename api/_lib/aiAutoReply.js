// api/_lib/aiAutoReply.js
// AI Agents Phase 3b: "Fully automated" mode -- an agent with
// automation_mode === 'auto' replies to inbound messages itself, no human
// approval, instead of only drafting into the composer (Phase 1/2 behaviour,
// still used for agents left in 'draft' mode).
//
// Called from providers/base.js's persistInboundMessage, only when the
// conversation has no human assigned yet (assigned_to IS NULL) -- see the
// comment there for why that's a safe, already-existing "human took over"
// signal. Every failure here is caught and logged, never thrown -- this
// must never break the webhook response that triggered it.

import { generateDraftReply, workspaceHasAiAgentAccess } from './aiAgents.js';
import { getProvider } from './providers/index.js';
import { getDocumentTools, executeDocumentTool, getWebhookTools, executeWebhookTool } from './aiDocumentTools.js';

export async function autoReplyIfEnabled(sb, { workspaceId, conversationId, channel, externalId, contact }) {
  try {
    // NOTE: supabase-js's .contains() serializes an array value using
    // Postgres array literal syntax ({whatsapp}), which Postgres then
    // rejects for a jsonb column ("invalid input syntax for type json").
    // .filter(col, 'cs', jsonString) sends the correct JSON-array syntax
    // instead. This silently broke every auto-reply until caught: the
    // destructured { data } was never checked for { error }, so the query
    // failing just looked identical to "no agent configured" and returned
    // with zero logging.
    const { data: agents, error: agentsErr } = await sb.from('ai_agents').select('*')
      .eq('workspace_id', workspaceId).eq('status', 'active').eq('automation_mode', 'auto')
      .filter('enabled_channels', 'cs', JSON.stringify([channel]))
      .order('created_at', { ascending: true }).limit(1);
    if (agentsErr) { console.error('[aiAutoReply] ai_agents query failed:', agentsErr); return; }
    const agent = agents?.[0];
    if (!agent) return; // no fully-automated agent configured for this channel

    // Scale-plan-only feature -- bail before any further DB/OpenAI work if the
    // workspace has been downgraded (DB trigger also auto-pauses the agent row
    // on downgrade, but this covers the moment right in between).
    const hasAccess = await workspaceHasAiAgentAccess(sb, workspaceId);
    if (!hasAccess) { console.warn('[aiAutoReply] workspace', workspaceId, 'no longer has AI Agent access (plan downgrade) -- skipping'); return; }

    // ── Race condition guard: skip if an AI reply was sent in the last 8 seconds ──
    // Two inbound messages arriving close together (e.g. user sends two in a row)
    // can both hit this function before either reply is saved, causing double-replies.
    // Checking for a recent AI outbound message is a lightweight mutex that costs
    // one extra DB read but prevents the duplicate UX issue entirely.
    const eightSecondsAgo = new Date(Date.now() - 8000).toISOString();
    const { count: recentAiCount } = await sb.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('direction', 'outbound')
      .like('sender_id', 'ai:%')
      .gte('created_at', eightSecondsAgo);
    if (recentAiCount > 0) {
      console.log('[aiAutoReply] skipping — AI already replied in the last 8s for conv', conversationId);
      return;
    }

    // ── message_cap enforcement ────────────────────────────────────────────
    // Some agent types (notably the Receptionist) are deliberately short-lived
    // in a conversation: after a fixed number of outbound AI replies they must
    // STOP and hand the conversation to a human, instead of endlessly looping
    // greetings. Count how many outbound AI messages this agent has already
    // sent in this conversation; if it has reached its cap, apply the agent's
    // configured handoff assignment rule (if any) and bail without replying.
    if (agent.message_cap) {
      const { count } = await sb.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('direction', 'outbound')
        .like('sender_id', 'ai:%');

      if (count >= agent.message_cap) {
        if (agent.handoff_assignment_rule_id) {
          const { data: rule } = await sb.from('rules')
            .select('assigned_to_ids, assigned_to_names')
            .eq('id', agent.handoff_assignment_rule_id).single();
          if (rule?.assigned_to_ids?.[0]) {
            await sb.from('conversations').update({
              assigned_to: rule.assigned_to_ids[0],
              assigned_to_name: rule.assigned_to_names?.[0] || null,
              status: 'open',
            }).eq('id', conversationId);
          }
        }
        console.log('[aiAutoReply] message_cap reached for agent', agent.id, 'on conversation', conversationId);
        return; // Cap reached — don't send another AI message, let a human take over.
      }
    }

    const { data: cfg, error: cfgErr } = await sb.from('channel_configs').select('*')
      .eq('workspace_id', workspaceId).eq('channel', channel).single();
    if (cfgErr) { console.error('[aiAutoReply] channel_configs query failed:', cfgErr); return; }
    if (!cfg?.enabled) return; // channel not actually connected -- nothing to send through

    // BUG FIX: ordering ascending with a limit fetches the OLDEST 12 messages,
    // not the most recent 12 -- for any conversation past ~12 messages, the AI
    // was permanently frozen looking at ancient history and never saw anything
    // the customer said afterwards (why it kept repeating the same question --
    // e.g. asking "What business are you in?" again right after the customer
    // answered it, because that answer was never in the fetched window at all).
    // Fetch the most recent 12 by ordering DESC, then reverse back to
    // chronological order before handing to generateDraftReply.
    const { data: recentDesc } = await sb.from('messages').select('direction,body,attachments')
      .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(12);
    const messages = (recentDesc || []).slice().reverse();

    const { data: knowledge } = await sb.from('ai_knowledge').select('title,content')
      .eq('workspace_id', workspaceId).or('agent_id.eq.' + agent.id + ',agent_id.is.null')
      .order('created_at', { ascending: true });

    // Merge document tools + webhook tools (e.g. register_student).
    // Webhook tools are only present when the agent has webhook_tool_url set,
    // so this is a no-op for agents that don't use external tools.
    const allTools = [...getDocumentTools(), ...getWebhookTools(agent)];

    const replyText = await generateDraftReply(agent, messages || [], contact, knowledge || [], {
      sb, workspaceId, conversationId,
      tools: allTools,
      executeTool: (name, args) => {
        // Route to webhook executor for external tools, document executor for built-ins.
        if (name === 'register_student') {
          return executeWebhookTool(agent, name, args);
        }
        return executeDocumentTool(sb, {
          workspaceId, conversationId, contactId: contact?.id || null, agentId: agent.id, agentName: agent.name,
        }, name, args);
      },
    });

    // Website live-chat has no outbound provider -- same special-case as
    // handleSend() in channels/index.js: the widget just reads straight from
    // the messages table, there's nothing external to push the reply to.
    let externalMsgId = null;
    if (channel !== 'website') {
      const providerKey = channel === 'whatsapp'
        ? (cfg.config?.provider === 'wasapflow' ? 'whatsapp:wasapflow'
           : cfg.config?.bird_workspace_id ? 'whatsapp:bird'
           : cfg.config?.d360_api_key ? 'whatsapp:360dialog' : 'whatsapp:cloud')
        : channel;
      const provider = getProvider(providerKey);
      const result = await provider.sendMessage(cfg.config, {
        to: externalId, text: replyText, conversation_id: conversationId, workspace_id: workspaceId,
      }, { sb });
      externalMsgId = result?.external_id || null;
    }

    // sender_id intentionally NOT a uuid (agent.id is one, but tagged with a
    // prefix) -- auto_assign_on_reply()'s trigger only claims the
    // conversation for messages whose sender_id matches the uuid regex, so
    // the AI's own replies never accidentally mark it "assigned" and lock
    // out future auto-replies or a human's "unclaimed" view.
    await sb.from('messages').insert({
      workspace_id: workspaceId, conversation_id: conversationId,
      direction: 'outbound', body: replyText, channel,
      external_id: externalMsgId,
      sender_name: agent.name, sender_id: 'ai:' + agent.id,
      status: 'sent',
      metadata: { is_ai: true, agent_id: agent.id, agent_name: agent.name },
    });

    await sb.from('conversations').update({
      last_message: replyText, last_message_at: new Date().toISOString(),
    }).eq('id', conversationId);
  } catch (e) {
    console.error('[aiAutoReply] error:', e);
  }
}
