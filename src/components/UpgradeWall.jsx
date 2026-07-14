/**
 * UpgradeWall — full-page paywall shown when a user accesses a feature
 * above their current plan. Shows what they get on the required plan
 * and links to /pricing.
 */
import { Link } from 'react-router-dom';
import { LockKeyhole, Zap, ArrowRight } from 'lucide-react';

const PLAN_LABELS = { starter: 'Starter', grow: 'Grow', scale: 'Scale' };

const PLAN_PERKS = {
  starter: [
    'Broadcast campaigns to your contacts',
    'Canned response templates',
    'Full contact management',
    'Unlimited conversations',
  ],
  grow: [
    'Automation rules (auto-assign, auto-tag)',
    'Quotes & invoice generation',
    'Sales pipeline tracking',
    'Commission management',
  ],
  scale: [
    'AI agents that draft & send replies',
    'AI-powered autonomous chatbots',
    'Advanced analytics dashboard',
    'Priority support',
  ],
};

export default function UpgradeWall({ feature, requiredPlan }) {
  const planLabel = PLAN_LABELS[requiredPlan] || requiredPlan;
  const perks = PLAN_PERKS[requiredPlan] || [];

  return (
    <div className="flex-1 flex items-center justify-center p-6" style={{ minHeight: '60vh' }}>
      <div className="max-w-sm w-full text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.2)' }}>
          <LockKeyhole className="w-7 h-7" style={{ color: '#25D366' }} />
        </div>

        {/* Heading */}
        <h2 className="text-lg font-bold text-white mb-2">
          {feature} is a {planLabel} feature
        </h2>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
          Upgrade to the <span className="text-white font-semibold">{planLabel}</span> plan to unlock {feature} and everything below.
        </p>

        {/* Perks */}
        {perks.length > 0 && (
          <ul className="text-left space-y-2.5 mb-7">
            {perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 text-sm text-gray-300">
                <Zap className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#25D366' }} />
                {perk}
              </li>
            ))}
          </ul>
        )}

        {/* CTA */}
        <Link
          to="/pricing"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
          style={{ background: '#25D366', color: '#0D1418' }}>
          View plans & upgrade
          <ArrowRight className="w-4 h-4" />
        </Link>

        <p className="text-xs text-gray-600 mt-3">No commitment — cancel anytime</p>
      </div>
    </div>
  );
}
