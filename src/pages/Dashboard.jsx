import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, PieChart, Pie } from 'recharts';
import { MessageSquare, Clock, AlertCircle, CheckCircle, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { getConversations } from '@/lib/channels';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

function StatCard({ label, value, sub, color, icon: Icon, trend, trendLabel }) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? '#25D366' : trend === 'down' ? '#EF4444' : '#9CA3AF';

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 flex flex-col gap-3"
      style={{
        background: `linear-gradient(135deg, #1a2530 0%, #111B21 100%)`,
        border: `1px solid ${color}22`,
        boxShadow: `0 0 0 1px ${color}11, 0 4px 24px ${color}0d`,
      }}
    >
      {/* Top row — icon + trend */}
      <div className="flex items-center justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${color}33, ${color}11)`,
            border: `1px solid ${color}33`,
          }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {trendLabel && (
          <div
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: trendColor + '18', color: trendColor }}
          >
            <TrendIcon className="w-3 h-3" />
            {trendLabel}
          </div>
        )}
      </div>

      {/* Value */}
      <div>
        <p
          className="text-4xl font-black leading-none tracking-tight"
          style={{
            color,
            textShadow: `0 0 32px ${color}55`,
          }}
        >
          {value}
        </p>
        <p className="text-[11px] font-bold text-white/70 uppercase tracking-widest mt-1">{label}</p>
        {sub && <p className="text-[10px] text-white/35 mt-0.5">{sub}</p>}
      </div>

      {/* Bottom accent bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-2xl" style={{ background: `linear-gradient(90deg, transparent, ${color}88, transparent)` }} />
    </div>
  );
}

// Real, honest day-over-day comparison — no guessed percentages.
// Returns a trend direction + a plain-language delta label.
function dayOverDay(todayCount, yesterdayCount) {
  const diff = todayCount - yesterdayCount;
  if (diff === 0) return { trend: 'neutral', label: yesterdayCount === 0 && todayCount === 0 ? 'No activity yet' : 'Same as yesterday' };
  return { trend: diff > 0 ? 'up' : 'down', label: `${diff > 0 ? '+' : ''}${diff} vs yesterday` };
}

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const { user, workspaceOwnerId, canViewAllChats } = useNyasaAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspaceOwnerId) return;
    try {
      const data = await getConversations(workspaceOwnerId);
      setConversations(data);
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  }, [workspaceOwnerId]);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const today = startOfDay(now);
  const yesterdayStart = new Date(today); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const isToday = (d) => d && new Date(d) >= today;
  const isYesterday = (d) => d && new Date(d) >= yesterdayStart && new Date(d) < today;

  // canViewAllChats (admin/sales_manager/owner) get the team-wide view — for
  // plain agents, RLS already only ever hands us their own conversations plus
  // unassigned ones, but the STAT CARDS still need to mean "mine" not "the
  // team's" — a bare "Open: 12" is meaningless to an agent who can't act on
  // most of it. So the two views compute different numbers from the same
  // (already correctly scoped) conversations array.
  const isAgentView = !canViewAllChats;

  const totalOpen = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && c.status !== 'closed').length
    : conversations.filter(c => c.status !== 'closed').length;
  const unassigned = conversations.filter(c => !c.assigned_to && c.status !== 'closed').length;
  const urgent = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && c.priority === 'urgent' && c.status !== 'closed').length
    : conversations.filter(c => c.priority === 'urgent' && c.status !== 'closed').length;
  const closedToday = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && c.status === 'closed' && isToday(c.updated_at)).length
    : conversations.filter(c => c.status === 'closed' && isToday(c.updated_at)).length;
  const closedYesterday = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && c.status === 'closed' && isYesterday(c.updated_at)).length
    : conversations.filter(c => c.status === 'closed' && isYesterday(c.updated_at)).length;

  const newToday = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && isToday(c.created_at)).length
    : conversations.filter(c => isToday(c.created_at)).length;
  const newYesterday = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && isYesterday(c.created_at)).length
    : conversations.filter(c => isYesterday(c.created_at)).length;
  const newUnassignedToday = conversations.filter(c => !c.assigned_to && isToday(c.created_at)).length;
  const newUnassignedYesterday = conversations.filter(c => !c.assigned_to && isYesterday(c.created_at)).length;

  const openTrend = dayOverDay(newToday, newYesterday);
  const unassignedTrend = dayOverDay(newUnassignedToday, newUnassignedYesterday);
  const closedTrend = dayOverDay(closedToday, closedYesterday);

  const channelData = ['whatsapp', 'messenger', 'email', 'website'].map(ch => ({
    name: ch.charAt(0).toUpperCase() + ch.slice(1),
    value: conversations.filter(c => c.channel === ch).length,
  }));

  const stageData = ['New Lead','Contacted','Qualified','Proposal Sent','Negotiation','Closed Won','Closed Lost'].map(s => ({
    name: s.length > 8 ? s.slice(0, 8) + '…' : s,
    count: conversations.filter(c => c.deal_stage === s).length,
  }));

  const COLORS = ['#25D366','#3B82F6','#6366F1','#06B6D4'];

  const slaData = conversations.filter(c => c.sla_breach_at && c.status !== 'closed').map(c => {
    const mins = Math.floor((new Date(c.sla_breach_at) - new Date()) / 60000);
    return { ...c, slaMinutes: mins };
  }).sort((a, b) => a.slaMinutes - b.slaMinutes).slice(0, 5);

  const hasChannelData = channelData.some(d => d.value > 0);

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[#0D1418]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl md:text-2xl font-black text-white">{isAgentView ? 'My Dashboard' : 'Dashboard'}</h1>
            <p className="text-xs md:text-sm text-gray-400 mt-0.5">{isAgentView ? 'Your chats & activity' : 'Team performance & pipeline'}</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
          <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              label={isAgentView ? 'My Open' : 'Open'}
              value={totalOpen}
              sub={isAgentView ? 'Assigned to you' : 'Active conversations'}
              icon={MessageSquare}
              color="#25D366"
              trend={openTrend.trend}
              trendLabel={openTrend.label}
            />
            <StatCard
              label="Unassigned"
              value={unassigned}
              sub={isAgentView ? 'Ready to pick up' : 'Need assignment'}
              icon={Clock}
              color="#F59E0B"
              trend={unassignedTrend.trend}
              trendLabel={unassignedTrend.label}
            />
            <StatCard
              label={isAgentView ? 'My Urgent' : 'Urgent'}
              value={urgent}
              sub="High priority"
              icon={AlertCircle}
              color="#EF4444"
              trend={urgent > 0 ? "up" : "neutral"}
              trendLabel={urgent > 0 ? "Action needed" : "All clear"}
            />
            <StatCard
              label={isAgentView ? 'Closed by Me' : 'Closed Today'}
              value={closedToday}
              sub="Resolved today"
              icon={CheckCircle}
              color="#6366F1"
              trend={closedTrend.trend}
              trendLabel={closedTrend.label}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#202C33] rounded-2xl p-4 md:p-5 border border-white/10">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">{isAgentView ? "My Chats by Channel" : "By Channel"}</h3>
              {hasChannelData ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                        {channelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#202C33', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {channelData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                        <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        {d.name} ({d.value})
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-500 py-10 text-center">No conversations yet</p>
              )}
            </div>

            <div className="bg-[#202C33] rounded-2xl p-4 md:p-5 border border-white/10">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">{isAgentView ? "My Pipeline" : "Pipeline"}</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stageData} barSize={14}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#202C33', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {stageData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SLA Breaches */}
          {slaData.length > 0 && (
            <div className="bg-[#202C33] rounded-2xl p-4 md:p-5 border border-white/10 mb-6">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">{isAgentView ? "My SLA Watch" : "SLA At Risk"}</h3>
              <div className="space-y-2">
                {slaData.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.contact?.full_name || 'Unknown'} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-white">{c.contact?.full_name || 'Unknown'}</p>
                        <p className="text-[11px] text-gray-500">{c.channel}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.slaMinutes < 0 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {c.slaMinutes < 0 ? `${Math.abs(c.slaMinutes)}m overdue` : `${c.slaMinutes}m left`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
