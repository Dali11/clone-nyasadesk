import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, BarChart2, Users, Megaphone, Settings, Zap, BookOpen, ShieldCheck } from 'lucide-react';
import Avatar from './Avatar';
import { useNyasaAuth } from '@/lib/NyasaAuth';

const NAV = [
  { path: '/',           icon: MessageSquare, label: 'Inbox'     },
  { path: '/dashboard',  icon: BarChart2,     label: 'Dashboard' },
  { path: '/contacts',   icon: Users,         label: 'Contacts'  },
  { path: '/broadcasts', icon: Megaphone,     label: 'Broadcasts'},
  { path: '/rules',      icon: Zap,           label: 'Rules'     },
  { path: '/canned',     icon: BookOpen,      label: 'Responses' },
  { path: '/settings',   icon: Settings,      label: 'Settings'  },
];

const MOBILE_NAV = [
  { path: '/',          icon: MessageSquare, label: 'Inbox'    },
  { path: '/contacts',  icon: Users,         label: 'Contacts' },
  { path: '/dashboard', icon: BarChart2,     label: 'Reports'  },
  { path: '/settings',  icon: Settings,      label: 'Settings' },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const { user, profile, isPlatformAdmin } = useNyasaAuth();
  const workspaceName = profile?.workspace_name || user?.workspace_name || '';
  // Platform-admin-only nav entry — separate from the per-workspace "admin"
  // role. Only the small allowlist in platform_admin_emails ever sees this.
  const navItems = isPlatformAdmin
    ? [...NAV, { path: '/admin', icon: ShieldCheck, label: 'Admin Panel' }]
    : NAV;

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
          <Avatar name={user?.full_name || ''} size="sm" status={user?.status || 'online'} />
        </div>
      </div>

      {/* ── Mobile (<768px): top header + bottom tab bar ──────────────── */}
      {/* Top header bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 h-14 border-b border-white/10"
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
          <Avatar name={user?.full_name || ''} size="xs" status={user?.status || 'online'} />
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#111B21] border-t border-white/10 flex items-center justify-around px-2 pb-safe">
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
      </nav>
    </>
  );
}
