import { Link, useLocation } from 'react-router-dom';
import { Inbox, BarChart2, Users, Settings, Zap, LogOut } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const navItems = [
  { icon: Inbox, label: 'Inbox', path: '/' },
  { icon: BarChart2, label: 'Dashboard', path: '/dashboard' },
  { icon: Users, label: 'Contacts', path: '/contacts' },
  { icon: Zap, label: 'Rules', path: '/rules' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export default function NavRail({ user }) {
  const location = useLocation();

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <TooltipProvider delayDuration={0}>
      <nav className="nav-rail flex flex-col items-center py-4 w-16 min-h-screen shrink-0 z-30">
        {/* Logo */}
        <img src="/icon-192.png" alt="Nyasadesk" className="mb-8 w-9 h-9 rounded-xl shadow-lg" />

        {/* Nav items */}
        <div className="flex flex-col items-center gap-1 flex-1">
          {navItems.map(({ icon: Icon, label, path }) => {
            const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
            return (
              <Tooltip key={path}>
                <TooltipTrigger asChild>
                  <Link
                    to={path}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150 group
                      ${active
                        ? 'bg-[#5C6CF7] text-white shadow-md'
                        : 'text-[#6B7280] hover:bg-[#1C2030] hover:text-white'
                      }`}
                  >
                    <Icon className="w-5 h-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs font-medium">
                  {label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Bottom section */}
        <div className="flex flex-col items-center gap-2 mt-auto">
          {/* Avatar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5C6CF7] to-[#00A8BD] flex items-center justify-center text-white text-xs font-semibold cursor-pointer select-none">
                {initials}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {user?.full_name || 'You'}<br />
              <span className="text-[#9CA3AF] capitalize">{user?.role}</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </nav>
    </TooltipProvider>
  );
}