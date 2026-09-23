/**
 * useFeatureAccess — centralised plan-based feature gate.
 *
 * Plans (ascending order):
 *   free  →  starter  →  grow  →  scale
 *
 * Feature matrix:
 *   free    : inbox only (up to 1 channel, 500 contacts, no automation)
 *   starter : + broadcasts, canned responses, contacts
 *   grow    : + rules, documents (quotes/invoices)
 *   scale   : + AI agents, advanced analytics, priority support
 *
 * Usage:
 *   const { can, plan, isTrialing } = useFeatureAccess();
 *   if (!can('ai_agents')) return <UpgradeWall feature="AI Agents" requiredPlan="scale" />;
 */
import { useNyasaAuth } from '@/lib/NyasaAuth';

const PLAN_RANK = { free: 0, starter: 1, grow: 2, scale: 3 };

const FEATURE_REQUIREMENTS = {
  // Core inbox — always available
  inbox:            'free',
  canned_responses: 'starter',
  contacts:         'starter',
  broadcasts:       'starter',
  // Grow tier
  rules:            'grow',
  documents:        'grow',
  // Scale tier
  ai_agents:        'scale',
  ai_drafts:        'scale',
};

export function useFeatureAccess() {
  const { profile } = useNyasaAuth();
  const plan = profile?.plan || 'free';
  const status = profile?.subscription_status;
  const trialEnds = profile?.trial_ends_at;

  // Trial: treat as 'scale' until trial_ends_at passes
  const now = Date.now();
  const isTrialing = status === 'trialing' && trialEnds && new Date(trialEnds).getTime() > now;
  const effectivePlan = isTrialing ? 'scale' : plan;

  const rank = PLAN_RANK[effectivePlan] ?? 0;

  function can(feature) {
    const required = FEATURE_REQUIREMENTS[feature];
    if (!required) return true; // unknown feature — allow
    return rank >= (PLAN_RANK[required] ?? 0);
  }

  function requiredPlanFor(feature) {
    return FEATURE_REQUIREMENTS[feature] || null;
  }

  return { can, plan: effectivePlan, rawPlan: plan, isTrialing, requiredPlanFor };
}
