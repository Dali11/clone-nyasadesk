// src/components/marketing/MarketingLayout.jsx
// Single wrapper for every public marketing / feature page.
// Provides:
//   - Consistent dark background + font
//   - Sticky header + footer
//   - A shared `pill()` label helper exported for page use
//   - Optional <title> via the `title` prop (uses useDocumentTitle)
//
// Usage:
//   import MarketingLayout, { Pill } from '@/components/marketing/MarketingLayout';
//   export default function MyPage() {
//     return (
//       <MarketingLayout title="My Feature">
//         <section>…</section>
//       </MarketingLayout>
//     );
//   }

import MarketingHeader from './MarketingHeader';
import MarketingFooter from './MarketingFooter';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { BG, TEXT } from '@/lib/marketingTheme';

// ─── Pill label — shared across all feature pages ─────────────────────────────
export function Pill({ label, color = '#25D366' }) {
  return (
    <span style={{
      display: 'inline-block',
      background: `${color}22`,
      color,
      border: `1px solid ${color}44`,
      borderRadius: 999,
      padding: '4px 14px',
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function MarketingLayout({ children, title, className = '' }) {
  useDocumentTitle(title ? `${title} · Nyasadesk` : 'Nyasadesk');

  return (
    <div className={className} style={{
      background: BG,
      color: TEXT,
      fontFamily: "'Inter', sans-serif",
      minHeight: '100vh',
      // Smooth global link transitions
    }}>
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
