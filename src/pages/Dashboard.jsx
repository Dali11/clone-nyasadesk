import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, PieChart, Pie } from 'recharts';
import { MessageSquare, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import { store } from '@/lib/store';

function StatCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="bg-[#202C33] rounded-2xl p-4 md:p-5 border border-white/10 flex items-center gap-4 md:block">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 md:mb-3" style={{ background: color + '22' }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 md:flex-none">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl md:text-3xl font-black mt-0.5" style={{ color }}>{value}</p>
        {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
      </div>
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
    <div className="flex h-screen overflow-hidden bg-[#111B21] pb-[56px] md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[#0D1418]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl md:text-2xl font-black text-white">Dashboard</h1>
            <p className="text-xs md:text-sm text-gray-400 mt-0.5">Team performance & pipeline</p>
          </div>

          {/* Stat Cards — 2-col on mobile, 4-col on desktop */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard label="Open" value={totalOpen} sub="Active conversations" icon={MessageSquare} color="#25D366" />
            <StatCard label="Unassigned" value={unassigned} sub="Need assignment" icon={Clock} color="#F59E0B" />
            <StatCard label="Urgent" value={urgent} sub="High priority" icon={AlertCircle} color="#EF4444" />
            <StatCard label="Closed Today" value={closedToday} sub="Resolved" icon={CheckCircle} color="#6366F1" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#202C33] rounded-2xl p-4 md:p-5 border border-white/10">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">By Channel</h3>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65}
                    label={({ name, value }) => value > 0 ? `${name} ${value}` : ''} labelLine={false}>
                    {channelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1A2530', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12, color: '#E5E7EB' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-[#202C33] rounded-2xl p-4 md:p-5 border border-white/10">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">Pipeline</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stageData} barSize={14}>
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1A2530', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12, color: '#E5E7EB' }} />
                  <Bar dataKey="count" fill="#25D366" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SLA Watch */}
          {slaData.length > 0 && (
            <div className="bg-[#202C33] rounded-2xl p-4 md:p-5 border border-white/10 mb-6">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-3">⏱ SLA Watch</h3>
              <div className="space-y-3">
                {slaData.map(c => (
                  <div key={c.id} className="flex items-center gap-3">
                    <Avatar name={c.contact_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-semibold truncate">{c.contact_name}</p>
                      <p className="text-gray-500 text-[10px] truncate">{c.subject}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full ${c.slaMinutes < 0 ? 'bg-red-900/40 text-red-400' : c.slaMinutes < 60 ? 'bg-orange-900/40 text-orange-400' : 'bg-white/5 text-gray-400'}`}>
                      {c.slaMinutes < 0 ? 'BREACHED' : c.slaMinutes < 60 ? `${c.slaMinutes}m` : `${Math.floor(c.slaMinutes / 60)}h`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Workload */}
          <h2 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-3">Team Workload</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {users.map(rep => {
              const repConvs = conversations.filter(c => c.assigned_to === rep.id && c.status !== 'closed');
              const urgentCount = repConvs.filter(c => c.priority === 'urgent' || c.priority === 'high').length;
              const color = repConvs.length === 0 ? '#25D366' : repConvs.length < 5 ? '#6366F1' : repConvs.length < 10 ? '#F59E0B' : '#EF4444';
              return (
                <div key={rep.id} className="bg-[#202C33] rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar name={rep.full_name} size="md" status={rep.status} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate">{rep.full_name}</p>
                      <p className="text-[11px] text-gray-500 capitalize">{rep.role}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-black" style={{ color }}>{repConvs.length}</p>
                      <p className="text-[9px] text-gray-500 uppercase tracking-wide">open</p>
                    </div>
                  </div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-2.5">
                    <div className="h-full rounded-full transition-all" style={{ width: Math.min((repConvs.length / 15) * 100, 100) + '%', background: color }} />
                  </div>
                  <p className="text-[11px]">
                    {urgentCount > 0
                      ? <span className="text-orange-400 font-semibold">{urgentCount} urgent/high priority</span>
                      : <span className="text-[#25D366] font-semibold">All clear</span>}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}