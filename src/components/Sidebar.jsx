import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, BarChart2, Users, Megaphone, Settings, Zap, BookOpen } from 'lucide-react';
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

export default function Sidebar() {
  const { pathname } = useLocation();
  const { user } = useNyasaAuth();

  return (
    <div className="w-16 flex flex-col items-center py-3 gap-1 shrink-0 bg-[#111B21] border-r border-white/5">
      <div className="w-10 h-10 rounded-2xl bg-[#25D366] flex items-center justify-center mb-4 shrink-0">
        <span className="text-white font-black text-lg">N</span>
      </div>

      {NAV.map(({ path, icon: Icon, label }) => {
        const active = pathname === path;
        return (
          <Link key={path} to={path} title={label}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative
              ${active ? 'bg-[#25D366]/20 text-[#25D366]' : 'text-gray-500 hover:bg-white/10 hover:text-gray-200'}`}>
            <Icon className="w-5 h-5" />
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
              {label}
            </div>
          </Link>
        );
      })}

      <div className="flex-1" />
      <Avatar name={user?.full_name || ''} size="sm" status={user?.status || 'online'} />
    </div>
  );
}