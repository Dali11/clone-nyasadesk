/**
 * AppShell — Persistent authenticated layout.
 *
 * Architecture:
 *   - Sidebar is mounted ONCE, never unmounts on route changes
 *   - Inbox (conversation list + chat) is mounted ONCE and persists across
 *     all route changes — it just becomes hidden when another page is active
 *   - All other pages render inside the right panel, replacing the chat area
 *     WITHOUT unmounting Inbox (so realtime subscriptions stay alive, the
 *     conversation list stays loaded, and opening a chat is instant)
 *   - URL pattern: /?conv=<id> opens a specific conversation from any page
 *
 * This replaces the old per-page <Sidebar /> import and eliminates the
 * "full reload" feel when switching between Inbox and other sections.
 */
import { useLocation } from 'react-router-dom';

// INBOX_PATHS — routes where the full inbox (list + chat) is the main content.
// All others get the "secondary page" treatment (rendered alongside hidden inbox).
const INBOX_PATHS = ['/'];

export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const isInboxRoute = INBOX_PATHS.includes(pathname);

  return (
    // This wrapper is purely a flex row that clips at 100vh.
    // Sidebar is NOT rendered here — each page still imports Sidebar
    // so we don't need to refactor everything at once.
    // The key trick: Inbox is always mounted (visibility toggled via CSS),
    // and the "other page" content is layered on top.
    <div className="relative flex h-screen overflow-hidden bg-[var(--nyasa-surface-1)]">
      {children}
    </div>
  );
}
