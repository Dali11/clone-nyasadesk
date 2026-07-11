/**
 * Nyasadesk Commission Engine
 * Handles policy resolution, calculation, and record creation.
 * Future-proof: all calc logic is in calculateCommission() — new methods
 * just add a branch there without touching the DB schema.
 */

/**
 * Find the most specific active policy for an agent.
 * Priority: individual > workspace-level
 */
export async function getActivePolicy(workspaceId, agentId, sb) {
  const today = new Date().toISOString().split('T')[0];

  const { data: policies } = await sb
    .from('commission_policies')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .lte('effective_date', today)
    .or('expiry_date.is.null,expiry_date.gte.' + today)
    .order('applies_to', { ascending: true }); // 'individual' < 'workspace' alphabetically — we'll sort manually

  if (!policies || policies.length === 0) return null;

  // Priority: individual > team > department > workspace
  const priority = { individual: 0, team: 1, department: 2, workspace: 3 };
  const sorted = [...policies].sort((a, b) => priority[a.applies_to] - priority[b.applies_to]);

  for (const p of sorted) {
    if (p.applies_to === 'individual') {
      if (p.applies_to_id === agentId) return p;
    } else if (p.applies_to === 'workspace') {
      return p; // workspace-level matches everyone
    }
    // team/department: applies_to_id holds group id — for now treat as workspace fallback
  }

  return null;
}

/**
 * Pure calculation function — no DB calls.
 * Returns { amount: number, breakdown: object }
 */
export function calculateCommission(policy, saleAmount) {
  const amount = Number(saleAmount) || 0;

  if (policy.calc_method === 'fixed') {
    const value = Number(policy.calc_value) || 0;
    return {
      amount: value,
      breakdown: {
        method: 'fixed',
        fixedValue: value,
        saleAmount: amount,
        result: value,
      },
    };
  }

  if (policy.calc_method === 'percentage') {
    const rate = Number(policy.calc_value) || 0;
    const commission = parseFloat(((amount * rate) / 100).toFixed(2));
    return {
      amount: commission,
      breakdown: {
        method: 'percentage',
        rate,
        saleAmount: amount,
        formula: `${amount} × ${rate}% = ${commission}`,
        result: commission,
      },
    };
  }

  if (policy.calc_method === 'tiered') {
    const tiers = policy.tiers || [];
    let matched = null;

    for (const tier of tiers) {
      const min = Number(tier.min) || 0;
      const max = tier.max != null ? Number(tier.max) : Infinity;
      if (amount >= min && amount <= max) {
        matched = tier;
        break;
      }
    }

    if (!matched) {
      return {
        amount: 0,
        breakdown: {
          method: 'tiered',
          saleAmount: amount,
          tiersEvaluated: tiers,
          matchedTier: null,
          result: 0,
          note: 'No matching tier found for this sale amount',
        },
      };
    }

    let commission = 0;
    if (matched.type === 'fixed') {
      commission = Number(matched.value) || 0;
    } else if (matched.type === 'percentage') {
      commission = parseFloat(((amount * Number(matched.value)) / 100).toFixed(2));
    }

    return {
      amount: commission,
      breakdown: {
        method: 'tiered',
        saleAmount: amount,
        tiersEvaluated: tiers.map(t => ({
          min: t.min,
          max: t.max ?? '∞',
          type: t.type,
          value: t.value,
          matched: t === matched,
        })),
        matchedTier: {
          min: matched.min,
          max: matched.max ?? '∞',
          type: matched.type,
          value: matched.value,
        },
        formula: matched.type === 'fixed'
          ? `Flat ${commission} (sale ${amount} falls in tier ${matched.min}–${matched.max ?? '∞'})`
          : `${amount} × ${matched.value}% = ${commission}`,
        result: commission,
      },
    };
  }

  // fallback
  return { amount: 0, breakdown: { method: policy.calc_method, note: 'Unsupported method', result: 0 } };
}

/**
 * Create a commission record in the DB.
 */
export async function createCommissionRecord({
  workspaceId, policyId, agentId, agentName,
  contactId, contactName, conversationId, invoiceId, paymentId,
  saleAmount, triggerEvent, breakdown, commissionAmount, sb,
}) {
  const { data, error } = await sb.from('commissions').insert({
    workspace_id: workspaceId,
    policy_id: policyId,
    agent_id: agentId,
    agent_name: agentName,
    contact_id: contactId || null,
    contact_name: contactName || null,
    conversation_id: conversationId || null,
    invoice_id: invoiceId || null,
    payment_id: paymentId || null,
    sale_amount: saleAmount,
    commission_amount: commissionAmount,
    calc_breakdown: breakdown,
    trigger_event: triggerEvent,
    status: 'pending',
  }).select().single();

  if (error) throw error;
  return data;
}

/**
 * Reverse a commission (refund / cancellation).
 */
export async function reverseCommission(commissionId, reason, sb) {
  const { error } = await sb.from('commissions').update({
    status: 'reversed',
    reversal_reason: reason || 'Manual reversal',
    reversed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', commissionId);

  if (error) throw error;
}

/**
 * Main orchestrator — call this from webhook handlers.
 * Safe to call: checks if commissions are enabled, bails silently if not.
 */
export async function triggerCommission(triggerEvent, {
  workspaceId, agentId, agentName,
  saleAmount, contactId, contactName,
  conversationId, invoiceId, paymentId,
}, sb) {
  try {
    // 1. Check if commissions are enabled for this workspace
    const { data: settings } = await sb
      .from('commission_settings')
      .select('enabled')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!settings?.enabled) return null;

    // 2. Find active policy
    const policy = await getActivePolicy(workspaceId, agentId, sb);
    if (!policy) return null;

    // 3. Check trigger matches policy
    if (policy.trigger_event !== triggerEvent && policy.trigger_event !== 'manual') return null;

    // 4. Calculate
    const { amount, breakdown } = calculateCommission(policy, saleAmount);
    if (amount <= 0) return null;

    // 5. Create record
    const record = await createCommissionRecord({
      workspaceId, policyId: policy.id, agentId, agentName,
      contactId, contactName, conversationId, invoiceId, paymentId,
      saleAmount, triggerEvent, breakdown, commissionAmount: amount, sb,
    });

    return record;
  } catch (err) {
    console.error('[commissions] triggerCommission error:', err.message);
    return null;
  }
}
