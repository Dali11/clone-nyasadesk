import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ShieldCheck, LayoutGrid, Building2, Users2, DollarSign, ArrowLeftCircle, AlertTriangle, Bot, Receipt, ScrollText, MoreHorizontal } from 'lucide-react';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

// Full nav -- shown as a flat list on the desktop rail (plenty of vertical
// room there). Mobile bottom nav only surfaces the 3 most-used items plus a
// "More" sheet for the rest -- same pattern as the client Sidebar's More tab.
const ADMIN_NAV = [
  { path: '/admin',             icon: LayoutGrid,   label: 'Overview',   end: true },
  { path: '/admin/workspaces',  icon: Building2,    label: 'Workspaces' },
  { path: '/admin/churn',       icon: AlertTriangle, label: 'Churn'      },
  { path: '/admin/ai-usage',    icon: Bot,          label: 'AI Usage'   },
  { path: '/admin/transactions', icon: Receipt,     label: 'Transactions' },
  { path: '/admin/pricing',     icon: DollarSign,   label: 'Pricing'    },
  { path: '/admin/admins',      icon: Users2,       label: 'Admins'     },
  { path: '/admin/audit-log',   icon: ScrollText,   label: 'Audit Log'  },
];
const MOBILE_PRIMARY = ['/admin', '/admin/workspaces', '/admin/churn'];
const mobilePrimaryNav = ADMIN_NAV.filter(i => MOBILE_PRIMARY.includes(i.path));
const mobileMoreNav = ADMIN_NAV.filter(i => !MOBILE_PRIMARY.includes(i.path));

// Dedicated shell for the whole /admin/* section — its own rail, its own
// accent color (indigo, vs. the client app's WhatsApp green), and its own
// nav — so it reads as a clearly separate "mode", not just another page in
// the regular Sidebar. Client-side isPlatformAdmin gate here is UX only;
// every /api/admin/* call re-verifies server-side (see adminAuth.js).
export default function AdminLayout() {
  useDocumentTitle('Admin');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isPlatformAdmin, user } = useNyasaAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = mobileMoreNav.some(i => pathname.startsWith(i.path));

  useEffect(() => {
    if (!isPlatformAdmin) navigate('/', { replace: true });
  }, [isPlatformAdmin, navigate]);

  if (!isPlatformAdmin) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      {/* ── Desktop rail ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex w-64 flex-col shrink-0 bg-[#111B21] border-r border-white/5">
        <div
          className="px-5 pt-5 pb-4 border-b border-white/5"
          style={{ background: 'linear-gradient(135deg, #3730A3 0%, #4F46E5 100%)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-base leading-tight tracking-wide">Admin</p>
              <p className="text-white/60 text-[11px] font-medium truncate leading-tight mt-0.5">Platform control</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {ADMIN_NAV.map(({ path, icon: Icon, label, end }) => {
            const active = end ? pathname === path : pathname.startsWith(path);
            return (
              <Link key={path} to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${active
                    ? 'bg-indigo-500/15 text-indigo-400'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="p-3 border-t border-white/5">
          <Link
            to="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-all"
          >
            <ArrowLeftCircle className="w-4 h-4 shrink-0" />
            Back to client view
          </Link>
          <div className="flex items-center gap-3 px-2 py-2 mt-1">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate leading-tight">{user?.full_name || user?.email || 'Admin'}</p>
              <p className="text-[11px] text-gray-500 truncate leading-tight">Platform admin</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile top bar ───────────────────────────────────────────── */}
      <div
        className="lg:hidden fixed top-0 inset-x-0 h-14 z-20 flex items-center justify-between px-4 border-b border-white/5"
        style={{ background: 'linear-gradient(135deg, #3730A3 0%, #4F46E5 100%)' }}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-white" />
          <span className="text-white font-bold text-sm">Admin</span>
        </div>
        <Link to="/" className="text-white/80 text-xs font-medium flex items-center gap-1">
          <ArrowLeftCircle className="w-4 h-4" /> Exit
        </Link>
      </div>

      {/* ── Mobile bottom nav ────────────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 h-[56px] z-20 flex items-center justify-around bg-[#111B21] border-t border-white/5">
        {mobilePrimaryNav.map(({ path, icon: Icon, label, end }) => {
          const active = end ? pathname === path : pathname.startsWith(path);
          return (
            <Link key={path} to={path} className={`flex flex-col items-center gap-0.5 ${active ? 'text-indigo-400' : 'text-gray-500'}`}>
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button className={`flex flex-col items-center gap-0.5 ${moreActive ? 'text-indigo-400' : 'text-gray-500'}`}>
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="bg-[#111B21] border-white/10 text-gray-200 rounded-t-2xl pb-8">
            <div className="grid grid-cols-4 gap-3 pt-2">
              {mobileMoreNav.map(({ path, icon: Icon, label }) => {
                const active = pathname.startsWith(path);
                return (
                  <Link key={path} to={path} onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors
                      ${active ? 'bg-indigo-500/15 text-indigo-400' : 'text-gray-400 hover:bg-white/5'}`}>
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-medium text-center">{label}</span>
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[#0D1418]">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
