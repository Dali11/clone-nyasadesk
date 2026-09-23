import {Link, useLocation}from 'react-router-dom';
import {
  MessageSquare,
  BarChart2,
  Users,
  Megaphone,
  Settings,
  Zap,
  BookOpen,
  ShieldCheck,
  Bot,
  RefreshCw,
  Phone,
}from 'lucide-react';
import Avatar from './Avatar';
import {useNyasaAuth}from '@/lib/NyasaAuth';
import {ProfileMenuMobile, ProfileMenuDesktop}from '@/components/ProfileMenu';

// ── Nav definitions ────────────────────────────────────────────────────────
const NAV = [
  { path: '/',           icon: MessageSquare, label: 'Inbox'             },
  { path: '/dashboard',  icon: BarChart2,     label: 'Dashboard'         },
  { path: '/contacts',   icon: Users,         label: 'CRM'               },
  { path: '/broadcasts', icon: Megaphone,     label: 'Broadcasts'        },
  { path: '/ai-agents',  icon: Bot,           label: 'AI Agents'         },
  { path: '/rules',      icon: Zap,           label: 'Rules'             },
  { path: '/canned',     icon: BookOpen,      label: 'Responses'         },
  { path: '/settings',   icon: Settings,      label: 'Settings'          },
];

// Mobile bottom bar: WhatsApp bottom nav exactly
const MOBILE_NAV = [
  { path: '/',          icon: MessageSquare, label: 'Chats'    },
  { path: '/dashboard', icon: BarChart2,     label: 'Reports'  },
  { path: '/contacts',  icon: Users,         label: 'CRM' },
  { path: '/settings',  icon: Settings,      label: 'Settings' },
];

export default function Sidebar({ hideMobileChrome = false } = {}) {
  const { pathname } = useLocation();
  const { user, profile, isPlatformAdmin } = useNyasaAuth();
  const workspaceName = profile?.workspace_name || user?.workspace_name || '';

  const filteredNAV = NAV;

  const navItems = isPlatformAdmin
    ? [...filteredNAV, { path: '/admin', icon: ShieldCheck, label: 'Admin Panel' }]
    : filteredNAV;

  return (
    <>
      {/* ── Desktop (≥1024px): full labeled rail ──────────────────────── */}
      <div className="hidden lg:flex w-64 flex-col shrink-0 bg-[#0B141A] border-r border-white/5">

        {/* Logo header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/5"
             style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)' }}>
          <div className="flex items-center gap-3">
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
                    ? 'bg-[#00A884]/15 text-[#00A884]'
                    : 'text-[#8696A0] hover:bg-[#1F2C34] hover:text-white'}`}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </div>

        {/* User footer — rich dropdown */}
        <div className="p-3 border-t border-white/5">
          <ProfileMenuDesktop
            side="top"
            align="start"
            trigger={
              <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[#1F2C34] transition-colors cursor-pointer">
                <Avatar name={user?.full_name || ''} size="sm" status={user?.status || 'online'} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate leading-tight">
                    {user?.full_name || user?.email || 'You'}
                  </p>
                  <p className="text-[11px] text-[#8696A0] truncate leading-tight capitalize">
                    {profile?.role || user?.role || 'agent'}
                  </p>
                </div>
              </div>
            }
          />
        </div>
      </div>

      {/* ── Tablet (768–1023px): compact icon-only rail ───────────────── */}
      <div className="hidden md:flex lg:hidden w-16 flex-col shrink-0 bg-[#0B141A] border-r border-white/5">
        <div className="h-14 flex items-center justify-center border-b border-white/5 shrink-0"
             style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)' }}>
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
                    ? 'bg-[#00A884]/15 text-[#00A884]'
                    : 'text-[#8696A0] hover:bg-[#1F2C34] hover:text-white'}`}>
                <Icon className="w-4.5 h-4.5" />
              </Link>
            );
          })}
        </div>

        <div className="p-2 border-t border-white/5 flex items-center justify-center">
          <ProfileMenuDesktop
            side="right"
            align="end"
            trigger={
              <button className="cursor-pointer">
                <Avatar name={user?.full_name || ''} size="sm" status={user?.status || 'online'} />
              </button>
            }
          />
        </div>
      </div>

      {/* ── Mobile (<768px) ────────────────────────────────────────────── */}
      {/* Top header */}
      <div className={`md:hidden fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 h-14
                       border-b border-white/5 ${hideMobileChrome ? 'hidden' : ''}`}
           style={{ background: '#0B141A' }}>
        <img src="/icon-192.png" alt="Nyasadesk" className="w-8 h-8 rounded-lg shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold text-sm leading-tight">Nyasadesk</p>
          {workspaceName && (
            <p className="text-white/60 text-[10px] font-medium truncate leading-tight">
              {workspaceName}
            </p>
          )}
        </div>

        {/* Avatar → bottom sheet profile menu on mobile */}
        <ProfileMenuMobile
          trigger={
            <button className="cursor-pointer ml-auto shrink-0">
              <Avatar name={user?.full_name || ''} size="xs" status={user?.status || 'online'} />
            </button>
          }
        />
      </div>

      {/* Bottom tab bar — WhatsApp bottom nav style */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 h-[56px] z-50 bg-[#1F2C34]
                       border-t border-white/[0.06] flex items-stretch px-2 pb-safe
                       ${hideMobileChrome ? 'hidden' : ''}`}>
        {MOBILE_NAV.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <Link key={path} to={path}
              className="flex-1 flex flex-col items-center justify-center gap-1 transition-all"
            >
              <Icon className={`w-5 h-5 ${active ? 'text-[#00A884]' : 'text-[#8696A0]'}`} />
              <span className={`text-[11px] font-medium ${active ? 'text-[#00A884]' : 'text-[#8696A0]'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
