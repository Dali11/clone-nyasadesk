/**
 * ProfileMenu — WhatsApp-style rich profile panel
 *
 * On mobile: opens as a bottom Sheet (slides up from bottom)
 * On desktop/tablet: DropdownMenu (pops beside the avatar)
 *
 * Sections (like WhatsApp):
 *  ┌──────────────────────────────┐
 *  │  Avatar  Name  Role·WS       │  ← header
 *  ├──────────────────────────────┤
 *  │  Profile & Account           │
 *  │  Change Password             │
 *  ├──────────────────────────────┤
 *  │  🔔 Notifications  toggle   │
 *  │  🌙 Dark/Light mode toggle  │
 *  ├──────────────────────────────┤
 *  │  PAGES                       │
 *  │  Broadcasts / AI Agents /    │
 *  │  Quotes & Invoices / Sales   │
 *  │  Rules / Canned Responses    │
 *  ├──────────────────────────────┤
 *  │  ⚙️  Settings               │
 *  │  🛡 Admin Panel (if admin)  │
 *  ├──────────────────────────────┤
 *  │  🚪 Log out                  │
 *  └──────────────────────────────┘
 */

import {useState}from 'react';
import {useNavigate}from 'react-router-dom';
import {
  User,
  Lock,
  Bell,
  BellOff,
  Sun,
  Moon,
  Megaphone,
  Bot,
  FileText,
  TrendingUp,
  Zap,
  BookOpen,
  Settings,
  ShieldCheck,
  LogOut,
  ChevronRight,
}from 'lucide-react';
import Avatar from '@/components/Avatar';
import {useNyasaAuth}from '@/lib/NyasaAuth';
import {useAuth}from '@/lib/AuthContext';
import {useTheme}from '@/lib/ThemeContext';
import {usePushNotifications}from '@/lib/usePushNotifications';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
}from '@/components/ui/dropdown-menu';
import {Sheet, SheetContent, SheetTrigger}from '@/components/ui/sheet';

// ── Shared menu row ────────────────────────────────────────────────────────
function Row({ icon: Icon, iconColor, label, sublabel, onClick, danger, toggle, checked }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 px-4 py-3 transition-colors text-left
        ${danger
          ? 'text-red-400 hover:bg-red-500/8'
          : 'text-[var(--nyasa-text)] hover:bg-[var(--nyasa-surface-3)]'
        }`}
    >
      {Icon && (
        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          danger ? 'bg-red-500/10' : 'bg-[var(--nyasa-surface-3)]'
        }`}>
          <Icon className={`w-4 h-4 ${iconColor || (danger ? 'text-red-400' : 'text-[var(--nyasa-text-muted)]')}`} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${danger ? 'text-red-400' : 'text-[var(--nyasa-text)]'}`}>{label}</p>
        {sublabel && <p className="text-[11px] text-[var(--nyasa-text-muted)] mt-0.5">{sublabel}</p>}
      </div>
      {toggle ? (
        <div className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${checked ? 'bg-[#25D366]' : 'bg-[var(--nyasa-surface-4)]'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
      ) : !danger ? (
        <ChevronRight className="w-4 h-4 text-[var(--nyasa-text-muted)] shrink-0" />
      ) : null}
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="px-4 pt-4 pb-1 text-[10px] font-bold tracking-widest uppercase text-[var(--nyasa-text-muted)]">
      {children}
    </p>
  );
}

function Divider() {
  return <div className="h-px bg-[var(--nyasa-border)] mx-0 my-1" />;
}

// ── The actual menu content (shared between Sheet + Dropdown) ──────────────
function MenuContent({ onClose }) {
  const navigate   = useNavigate();
  const { signOut } = useAuth();
  const { user, profile, isPlatformAdmin, workspaceOwnerId } = useNyasaAuth();
  const { theme, toggleTheme } = useTheme();
  const { supported: pushSupported, subscribed: pushSubscribed, loading: pushLoading,
          subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications(workspaceOwnerId);

  const workspaceName = profile?.workspace_name || user?.workspace_name || 'Nyasadesk';
  const isDark = theme === 'dark';

  const go = (path) => { onClose?.(); navigate(path); };
  const handleLogout = async () => { onClose?.(); await signOut(); navigate('/login', { replace: true }); };
  // Don't allow toggling until workspaceOwnerId is resolved — avoids silent no-ops
  const togglePush = () => {
    if (pushLoading || !workspaceOwnerId) return;
    pushSubscribed ? pushUnsubscribe() : pushSubscribe();
  };

  return (
    <div className="flex flex-col overflow-y-auto max-h-[85vh]">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-4"
           style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)' }}>
        <div className="relative shrink-0">
          <Avatar name={user?.full_name || ''} size="lg" />
          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#25D366] border-2 border-[#075E54] rounded-full" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-base leading-tight truncate">
            {user?.full_name || user?.email || 'You'}
          </p>
          <p className="text-white/70 text-xs mt-0.5 capitalize">
            {user?.role || 'agent'} · {workspaceName}
          </p>
        </div>
      </div>

      {/* ── Account ────────────────────────────────────────────────── */}
      <SectionLabel>Account</SectionLabel>
      <Row icon={User} label="Profile & Account" sublabel="Name, avatar, status"
           onClick={() => go('/settings?tab=profile')} />
      <Row icon={Lock} label="Change Password" sublabel="Set or update your password"
           onClick={() => go('/settings?tab=profile&pw=1')} />

      <Divider />

      {/* ── Preferences ────────────────────────────────────────────── */}
      <SectionLabel>Preferences</SectionLabel>
      {pushSupported && (
        <Row
          icon={pushSubscribed ? BellOff : Bell}
          iconColor={pushSubscribed ? 'text-[var(--nyasa-text-muted)]' : 'text-[#25D366]'}
          label={pushSubscribed ? 'Mute notifications' : 'Enable notifications'}
          sublabel={pushSubscribed ? 'Push alerts are on' : 'Get alerts when away'}
          toggle checked={pushSubscribed}
          onClick={togglePush}
        />
      )}
      <Row
        icon={isDark ? Sun : Moon}
        iconColor={isDark ? 'text-yellow-400' : 'text-indigo-400'}
        label={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
        toggle checked={!isDark}
        onClick={toggleTheme}
      />

      <Divider />

      {/* ── Pages ──────────────────────────────────────────────────── */}
      <SectionLabel>Pages</SectionLabel>
      <Row icon={Megaphone}  label="Broadcasts"         onClick={() => go('/broadcasts')} />
      <Row icon={Bot}        label="AI Agents"          onClick={() => go('/ai-agents')} />
      <Row icon={FileText}   label="Quotes & Invoices"  onClick={() => go('/documents')} />
      <Row icon={TrendingUp} label="Sales"              onClick={() => go('/sales')} />
      <Row icon={Zap}        label="Automation Rules"   onClick={() => go('/rules')} />
      <Row icon={BookOpen}   label="Canned Responses"   onClick={() => go('/canned')} />

      <Divider />

      {/* ── Settings / Admin ───────────────────────────────────────── */}
      <SectionLabel>System</SectionLabel>
      <Row icon={Settings} label="Settings" sublabel="Channels, team, billing"
           onClick={() => go('/settings')} />
      {isPlatformAdmin && (
        <Row icon={ShieldCheck} iconColor="text-[#25D366]"
             label="Admin Panel" sublabel="Platform administration"
             onClick={() => go('/admin')} />
      )}

      <Divider />

      {/* ── Logout ─────────────────────────────────────────────────── */}
      <div className="pb-4">
        <Row icon={LogOut} label="Log out" danger onClick={handleLogout} />
      </div>
    </div>
  );
}

// ── Mobile: bottom Sheet ───────────────────────────────────────────────────
export function ProfileMenuMobile({ trigger }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-2xl border-t border-[var(--nyasa-border)] bg-[var(--nyasa-surface-1)] overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--nyasa-border)]" />
        </div>
        <MenuContent onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

// ── Desktop/Tablet: Dropdown ───────────────────────────────────────────────
export function ProfileMenuDesktop({ trigger, side = 'top', align = 'start' }) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        side={side} align={align}
        className="w-72 p-0 bg-[var(--nyasa-surface-2)] border border-[var(--nyasa-border)] rounded-2xl overflow-hidden shadow-2xl"
      >
        <MenuContent onClose={() => setOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
