import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, BarChart2, Users, Megaphone, Settings, Zap, BookOpen, ShieldCheck, LogOut, MoreHorizontal, Bell, BellOff } from 'lucide-react';
import Avatar from './Avatar';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { useAuth } from '@/lib/AuthContext';
import { usePushNotifications } from '@/lib/usePushNotifications';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const NAV = [
  { path: '/',           icon: MessageSquare, label: 'Inbox'     },
  { path: '/dashboard',  icon: BarChart2,     label: 'Dashboard' },
  { path: '/contacts',   icon: Users,         label: 'Contacts'  },
  { path: '/broadcasts', icon: Megaphone,     label: 'Broadcasts'},
  { path: '/rules',      icon: Zap,           label: 'Rules'     },
  { path: '/canned',     icon: BookOpen,      label: 'Responses' },
  { path: '/settings',   icon: Settings,      label: 'Settings'  },
];

// Bottom tab bar only has room for a few icons -- everything else (which
// used to be COMPLETELY UNREACHABLE on mobile: no route, no menu, nothing)
// lives behind the "More" sheet below.
const MOBILE_NAV = [
  { path: '/',          icon: MessageSquare, label: 'Inbox'    },
  { path: '/contacts',  icon: Users,         label: 'Contacts' },
  { path: '/dashboard', icon: BarChart2,     label: 'Reports'  },
];
const MOBILE_MORE_NAV = [
  { path: '/broadcasts', icon: Megaphone, label: 'Broadcasts' },
  { path: '/rules',      icon: Zap,       label: 'Rules'      },
  { path: '/canned',     icon: BookOpen,  label: 'Responses'  },
  { path: '/settings',   icon: Settings,  label: 'Settings'   },
];

export default function Sidebar({ hideMobileChrome = false } = {}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { user, profile, isPlatformAdmin, workspaceOwnerId } = useNyasaAuth();
  const workspaceName = profile?.workspace_name || user?.workspace_name || '';
  const [moreOpen, setMoreOpen] = useState(false);
  const { supported: pushSupported, subscribed: pushSubscribed, loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications(workspaceOwnerId);
  const togglePush = () => (pushSubscribed ? pushUnsubscribe() : pushSubscribe());

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };
  // Platform-admin-only nav entry — separate from the per-workspace "admin"
  // role. Only the small allowlist in platform_admin_emails ever sees this.
  const navItems = isPlatformAdmin
    ? [...NAV, { path: '/admin', icon: ShieldCheck, label: 'Admin Panel' }]
    : NAV;
  const mobileMoreItems = isPlatformAdmin
    ? [...MOBILE_MORE_NAV, { path: '/admin', icon: ShieldCheck, label: 'Admin Panel' }]
    : MOBILE_MORE_NAV;
  const moreActive = mobileMoreItems.some(i => i.path === pathname);

  return (
    <>
      {/* ── Desktop (≥1024px): full labeled rail ──────────────────────── */}
      <div className="hidden lg:flex w-64 flex-col shrink-0 bg-[#111B21] border-r border-white/5">

        {/* Header — matches onboarding style */}
        <div
          className="px-5 pt-5 pb-4 border-b border-white/5"
          style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)' }}
        >
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <img src="/icon-192.png" alt="Nyasadesk" className="w-9 h-9 rounded-xl shrink-0 shadow-inner" />
            <div className="min-w-0">
              <p className="text-white font-bold text-base leading-tight tracking-wide">Nyasadesk</p>
              {workspaceName && (
                <p className="text-white/60 text-[11px] font-medium truncate leading-tight mt-0.5">
                  {workspaceName}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = pathname === path;
            return (
              <Link key={path} to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${active
                    ? 'bg-[#25D366]/15 text-[#25D366]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </div>

        {/* User footer */}
        <div className="p-3 border-t border-white/5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
                <Avatar name={user?.full_name || ''} size="sm" status={user?.status || 'online'} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate leading-tight">
                    {user?.full_name || user?.email || 'You'}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate leading-tight capitalize">
                    {user?.role || 'agent'}
                  </p>
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-48">
              {pushSupported && (
                <DropdownMenuItem onClick={togglePush} disabled={pushLoading}>
                  {pushSubscribed ? <BellOff className="w-4 h-4 mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
                  {pushSubscribed ? 'Disable notifications' : 'Enable notifications'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleLogout} className="text-red-500 focus:text-red-500">
                <LogOut className="w-4 h-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Tablet (768–1023px): compact icon-only rail ───────────────── */}
      <div className="hidden md:flex lg:hidden w-16 flex-col shrink-0 bg-[#111B21] border-r border-white/5">
        <div
          className="h-14 flex items-center justify-center border-b border-white/5 shrink-0"
          style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)' }}
        >
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <span className="text-white font-black text-sm leading-none">N</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3 flex flex-col items-center gap-1">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = pathname === path;
            return (
              <Link key={path} to={path} title={label}
                className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all
                  ${active
                    ? 'bg-[#25D366]/15 text-[#25D366]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }`}
              >
                <Icon className="w-4.5 h-4.5" />
              </Link>
            );
          })}
        </div>

        <div className="p-2 border-t border-white/5 flex items-center justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="cursor-pointer">
                <Avatar name={user?.full_name || ''} size="sm" status={user?.status || 'online'} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-48">
              {pushSupported && (
                <DropdownMenuItem onClick={togglePush} disabled={pushLoading}>
                  {pushSubscribed ? <BellOff className="w-4 h-4 mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
                  {pushSubscribed ? 'Disable notifications' : 'Enable notifications'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleLogout} className="text-red-500 focus:text-red-500">
                <LogOut className="w-4 h-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Mobile (<768px): top header + bottom tab bar ──────────────── */}
      {/* Hidden while a chat is open on mobile (Inbox passes hideMobileChrome)
          so ChatHeader can take over the top of the screen instead of stacking
          under Nyasadesk's own branded bar -- matches WhatsApp's own behavior
          of the header becoming the open conversation, not staying app-level. */}
      {/* Top header bar */}
      <div
        className={`md:hidden fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 h-14 border-b border-white/10 ${hideMobileChrome ? 'hidden' : ''}`}
        style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)' }}
      >
        <img src="/icon-192.png" alt="Nyasadesk" className="w-8 h-8 rounded-lg shrink-0" />
        <div className="min-w-0">
          <p className="text-white font-bold text-sm leading-tight">Nyasadesk</p>
          {workspaceName && (
            <p className="text-white/60 text-[10px] font-medium truncate leading-tight">
              {workspaceName}
            </p>
          )}
        </div>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="cursor-pointer">
                <Avatar name={user?.full_name || ''} size="xs" status={user?.status || 'online'} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="w-48">
              {pushSupported && (
                <DropdownMenuItem onClick={togglePush} disabled={pushLoading}>
                  {pushSubscribed ? <BellOff className="w-4 h-4 mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
                  {pushSubscribed ? 'Disable notifications' : 'Enable notifications'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleLogout} className="text-red-500 focus:text-red-500">
                <LogOut className="w-4 h-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#111B21] border-t border-white/10 flex items-center justify-around px-2 pb-safe ${hideMobileChrome ? 'hidden' : ''}`}>
        {MOBILE_NAV.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <Link key={path} to={path}
              className={`flex flex-col items-center gap-0.5 py-2 px-4 transition-colors
                ${active ? 'text-[#25D366]' : 'text-gray-500'}`}>
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}

        {/* "More" -- Broadcasts/Rules/Responses/Settings/Admin previously had
            NO way to be reached at all on mobile (no route in the tab bar,
            no overflow menu). This sheet is the fix. */}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={`flex flex-col items-center gap-0.5 py-2 px-4 transition-colors
                ${moreActive ? 'text-[#25D366]' : 'text-gray-500'}`}>
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="bg-[#111B21] border-white/10 text-gray-200 rounded-t-2xl pb-8">
            <div className="grid grid-cols-4 gap-3 pt-2">
              {mobileMoreItems.map(({ path, icon: Icon, label }) => {
                const active = pathname === path;
                return (
                  <Link key={path} to={path} onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors
                      ${active ? 'bg-[#25D366]/15 text-[#25D366]' : 'text-gray-400 hover:bg-white/5'}`}>
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-medium">{label}</span>
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
}
