import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, RefreshCw, Users, Phone } from 'lucide-react';

export default function NavRail({ user }) {
  const location = useLocation();

  // Mapping Nyasadesk current application tabs to closest WhatsApp equivalents:
  // Inbox -> Chats (MessageSquare)
  // Dashboard -> Updates (RefreshCw as circle-dot)
  // Contacts -> Communities (Users)
  // Settings / Rules / other -> Calls / other
  // We provide the exact 4-tab bar layout from mobile WhatsApp
  const tabs = [
    { label: 'Chats', path: '/', icon: MessageSquare },
    { label: 'Updates', path: '/dashboard', icon: RefreshCw },
    { label: 'Communities', path: '/contacts', icon: Users },
    { label: 'Calls', path: '/settings', icon: Phone },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-[56px] bg-[#1F2C34] flex items-stretch justify-around border-t border-white/[0.06] z-50">
      {tabs.map(({ label, path, icon: Icon }) => {
        const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
        return (
          <Link
            key={path}
            to={path}
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
  );
}
