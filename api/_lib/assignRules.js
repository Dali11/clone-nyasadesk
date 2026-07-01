// api/_lib/assignRules.js — shared "auto-assign incoming conversations" engine.
//
// Underscore-prefixed so Vercel never turns this into its own route (it's a
// plain module, imported by the inbound channel webhooks).
//
// Previously the Rules table was pure config: Settings > Rules let you create/
// edit/toggle/delete rules and they persisted correctly, but NOTHING in the
// app ever read them back — every inbound WhatsApp/Messenger/email message
// created a conversation that just sat unassigned forever, no matter what
// rules existed. This module is what actually applies them.
//
// Match semantics per rule type:
//   round_robin  — matches unconditionally (a catch-all "assign to anyone" rule)
//   lead_source  — matches if condition_value equals the contact's lead_source
//                  (falls back to the conversation's channel if lead_source is unset)
//   territory    — matches if condition_value (case-insensitive) is found in the
//                  contact's company, notes, or tags — there's no dedicated
//                  territory/region field on contacts today, so this is a
//                  best-effort keyword match across the closest available fields
//
// A rule additionally only applies if rule.channel is 'all' or matches the
// conversation's channel. Rules are evaluated in priority_order ascending;
// the first active match wins. Whichever agent(s) are assigned to that rule
// get rotated through round-robin (via the rule's own round_robin_index) —
// so a rule with one agent always picks that agent, and a rule with several
// rotates between them fairly, regardless of rule "type".
export async function applyAssignmentRules(sb, { workspaceId, conversationId, channel, contact }) {
  try {
    const { data: rules } = await sb
      .from('rules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('priority_order', { ascending: true });

    if (!rules?.length) return null;

    for (const rule of rules) {
      if (rule.channel && rule.channel !== 'all' && rule.channel !== channel) continue;
      if (!ruleMatches(rule, channel, contact)) continue;

      const ids = rule.assigned_to_ids || [];
      const names = rule.assigned_to_names || [];
      if (!ids.length) continue;

      const idx = (rule.round_robin_index || 0) % ids.length;
      const assignedId = ids[idx];
      const assignedName = names[idx] || null;

      await sb.from('rules').update({ round_robin_index: idx + 1 }).eq('id', rule.id);
      await sb.from('conversations').update({
        assigned_to: assignedId, assigned_to_name: assignedName, status: 'open',
      }).eq('id', conversationId);

      return { assignedId, assignedName, ruleId: rule.id };
    }
    return null;
  } catch (e) {
    console.error('[applyAssignmentRules] error:', e);
    return null;
  }
}

function ruleMatches(rule, channel, contact) {
  if (rule.type === 'round_robin') return true;
  const cond = (rule.condition_value || '').trim().toLowerCase();
  if (!cond) return false;

  if (rule.type === 'lead_source') {
    const source = (contact?.lead_source || channel || '').toLowerCase();
    return source === cond;
  }
  if (rule.type === 'territory') {
    const haystacks = [contact?.company, contact?.notes, ...(Array.isArray(contact?.tags) ? contact.tags : [])]
      .filter(Boolean).map(s => String(s).toLowerCase());
    return haystacks.some(h => h.includes(cond));
  }
  return false;
}
