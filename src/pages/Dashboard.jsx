import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, PieChart, Pie } from 'recharts';
import { MessageSquare, Clock, AlertCircle, CheckCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import { store } from '@/lib/store';

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

export default function Dashboard() {
  const conversations = store.getConversations();
  const users = store.getUsers();

  const totalOpen = conversations.filter(c => c.status !== 'closed').length;
  const unassigned = conversations.filter(c => !c.assigned_to).length;
  const urgent = conversations.filter(c => c.priority === 'urgent' && c.status !== 'closed').length;
  const closedToday = conversations.filter(c => {
    if (c.status !== 'closed') return false;
    return new Date(c.updated_date).toDateString() === new Date().toDateString();
  }).length;

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

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[#0D1418]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl md:text-2xl font-black text-white">Dashboard</h1>
            <p className="text-xs md:text-sm text-gray-400 mt-0.5">Team performance & pipeline</p>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Open"
              value={totalOpen}
              sub="Active conversations"
              icon={MessageSquare}
              color="#25D366"
              trend="up"
              trendLabel="+12%"
            />
            <StatCard
              label="Unassigned"
              value={unassigned}
              sub="Need assignment"
              icon={Clock}
              color="#F59E0B"
              trend="down"
              trendLabel="-3"
            />
            <StatCard
              label="Urgent"
              value={urgent}
              sub="High priority"
              icon={AlertCircle}
              color="#EF4444"
              trend={urgent > 0 ? "up" : "neutral"}
              trendLabel={urgent > 0 ? "Action needed" : "All clear"}
            />
            <StatCard
              label="Closed Today"
              value={closedToday}
              sub="Resolved"
              icon={CheckCircle}
              color="#6366F1"
              trend="up"
              trendLabel="+5"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#202C33] rounded-2xl p-4 md:p-5 border border-white/10">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">By Channel</h3>
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
            </div>

            <div className="bg-[#202C33] rounded-2xl p-4 md:p-5 border border-white/10">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">Pipeline</h3>
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
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">SLA At Risk</h3>
              <div className="space-y-2">
                {slaData.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.contact_name || 'Unknown'} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-white">{c.contact_name || 'Unknown'}</p>
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

          {/* Team activity */}
          <div className="bg-[#202C33] rounded-2xl p-4 md:p-5 border border-white/10">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">Team Activity</h3>
            <div className="space-y-3">
              {users.slice(0, 5).map(u => {
                const handled = conversations.filter(c => c.assigned_to === u.id).length;
                const max = Math.max(...users.map(x => conversations.filter(c => c.assigned_to === x.id).length), 1);
                return (
                  <div key={u.id} className="flex items-center gap-3">
                    <Avatar name={u.full_name || u.email} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-white truncate">{u.full_name || u.email}</p>
                        <p className="text-xs text-gray-400 ml-2 shrink-0">{handled}</p>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-[#25D366] rounded-full transition-all" style={{ width: `${(handled / max) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
