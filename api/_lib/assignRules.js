// api/_lib/assignRules.js — shared "auto-assign incoming conversations" engine.
//
// Match semantics per rule type:
//   round_robin  — matches unconditionally (catch-all)
//   lead_source  — matches if condition_value equals contact lead_source
//                  (falls back to conversation channel)
//   territory    — keyword match across contact company/notes/tags
//
// Fallback: if NO rules match (or no rules exist), the conversation is assigned
// to the workspace owner — so NOTHING can remain unassigned when rules are in place.
// Admins/managers see everything anyway, so the fallback is purely a safety net
// to guarantee agents have a visible owner on every chat.
export async function applyAssignmentRules(sb, { workspaceId, conversationId, channel, contact }) {
  try {
    // AI-first workspaces (e.g. Chibondo Academy): when an active ai_agent is
    // running in fully autonomous mode (automation_mode = 'auto'), skip the
    // "assign to owner" safety-net fallback below. That fallback exists for
    // human-staffed shared inboxes so nothing sits unowned -- but for an
    // autonomous AI agent it silently and permanently kills auto-replies for
    // every conversation after the first message (since the AI-reply gate in
    // base.js checks `!conv.assigned_to`). Explicit rules (round_robin,
    // lead_source, territory) still apply normally below -- this only
    // disables the *implicit* owner fallback when there are no matching rules.
    // A real human taking over via a manual reply still works: that's a
    // separate DB trigger (auto_assign_on_reply) unaffected by this flag.
    const { data: aiAgents } = await sb.from('ai_agents')
      .select('automation_mode').eq('workspace_id', workspaceId).eq('status', 'active');
    const isAiAutonomous = !!aiAgents?.some(a => a.automation_mode === 'auto');

    // Fetch full contact from DB if we only have a partial object
    let fullContact = contact || {};
    if (conversationId && (!fullContact.lead_source && !fullContact.company)) {
      const { data: conv } = await sb.from('conversations')
        .select('contact_id').eq('id', conversationId).maybeSingle();
      if (conv?.contact_id) {
        const { data: dbContact } = await sb.from('contacts')
          .select('lead_source, company, notes, tags').eq('id', conv.contact_id).maybeSingle();
        if (dbContact) fullContact = { ...fullContact, ...dbContact };
      }
    }

    const { data: rules } = await sb
      .from('rules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('priority_order', { ascending: true });

    if (rules?.length) {
      for (const rule of rules) {
        if (rule.channel && rule.channel !== 'all' && rule.channel !== channel) continue;
        if (!ruleMatches(rule, channel, fullContact)) continue;

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

        console.log('[assignRules] matched rule', rule.name || rule.type, '→', assignedName);
        return { assignedId, assignedName, ruleId: rule.id, via: 'rule' };
      }
    }

    // ── Fallback: no rule matched — assign to workspace owner ──────────────
    // This guarantees no conversation stays permanently unassigned when
    // there are team members on the workspace. The owner (admin) sees all
    // conversations regardless, so this is just a label ensuring the conv
    // appears in *someone's* queue.
    // Skipped entirely for AI-autonomous workspaces -- see isAiAutonomous above.
    if (isAiAutonomous) {
      console.log('[assignRules] skipping owner fallback -- workspace has an autonomous AI agent');
      return null;
    }

    const { data: owner } = await sb.from('profiles')
      .select('id, full_name')
      .eq('workspace_id', workspaceId)
      .in('role', ['admin', 'sales_manager'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (owner) {
      await sb.from('conversations').update({
        assigned_to: owner.id,
        assigned_to_name: owner.full_name || 'Admin',
        status: 'open',
      }).eq('id', conversationId);
      console.log('[assignRules] fallback → owner', owner.full_name);
      return { assignedId: owner.id, assignedName: owner.full_name, ruleId: null, via: 'fallback' };
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
