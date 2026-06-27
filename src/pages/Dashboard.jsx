import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, PieChart, Pie } from 'recharts';
import { MessageSquare, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import { store } from '@/lib/store';

function StatCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="bg-[#202C33] rounded-2xl p-5 border border-white/10">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">{label}</p>
          <p className="text-3xl font-bold" style={{ color }}>{value}</p>
          {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + '20' }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
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
    name: s,
    count: conversations.filter(c => c.deal_stage === s).length,
  }));

  const COLORS = ['#25D366','#3B82F6','#6366F1','#06B6D4'];

  const slaData = conversations.filter(c => c.sla_breach_at && c.status !== 'closed').map(c => {
    const mins = Math.floor((new Date(c.sla_breach_at) - new Date()) / 60000);
    return { ...c, slaMinutes: mins };
  }).sort((a, b) => a.slaMinutes - b.slaMinutes).slice(0, 5);

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21]">
      <Sidebar />
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[#0D1418]">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Team performance & pipeline overview</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Open" value={totalOpen} sub="Active conversations" icon={MessageSquare} color="#25D366" />
            <StatCard label="Unassigned" value={unassigned} sub="Need assignment" icon={Clock} color="#F59E0B" />
            <StatCard label="Urgent" value={urgent} sub="High priority" icon={AlertCircle} color="#EF4444" />
            <StatCard label="Closed Today" value={closedToday} sub="Resolved" icon={CheckCircle} color="#3B82F6" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            <div className="bg-[#202C33] rounded-2xl p-5 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-4">By Channel</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                    label={({ name, value }) => value > 0 ? `${name} ${value}` : ''}>
                    {channelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#202C33', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-[#202C33] rounded-2xl p-5 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-4">Pipeline</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stageData} barSize={18}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#202C33', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: '#fff' }} />
                  <Bar dataKey="count" fill="#25D366" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {slaData.length > 0 && (
            <div className="bg-[#202C33] rounded-2xl p-5 border border-white/10 mb-8">
              <h3 className="text-sm font-semibold text-white mb-4">⏱ SLA Watch</h3>
              <div className="space-y-2">
                {slaData.map(c => (
                  <div key={c.id} className="flex items-center gap-3 text-sm">
                    <Avatar name={c.contact_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate">{c.contact_name} — {c.subject}</p>
                      <p className="text-gray-500 text-[10px]">{c.assigned_to_name || 'Unassigned'}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.slaMinutes < 0 ? 'bg-red-900/40 text-red-400' : c.slaMinutes < 60 ? 'bg-orange-900/40 text-orange-400' : 'bg-white/5 text-gray-400'}`}>
                      {c.slaMinutes < 0 ? 'BREACHED' : c.slaMinutes < 60 ? `${c.slaMinutes}m left` : `${Math.floor(c.slaMinutes / 60)}h left`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-base font-semibold text-white mb-4">Team Workload</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {users.map(rep => {
              const repConvs = conversations.filter(c => c.assigned_to === rep.id && c.status !== 'closed');
              const urgentCount = repConvs.filter(c => c.priority === 'urgent' || c.priority === 'high').length;
              const color = repConvs.length === 0 ? '#25D366' : repConvs.length < 5 ? '#3B82F6' : repConvs.length < 10 ? '#F59E0B' : '#EF4444';
              return (
                <div key={rep.id} className="bg-[#202C33] rounded-2xl p-5 border border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar name={rep.full_name} size="md" status={rep.status} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{rep.full_name}</p>
                      <p className="text-xs text-gray-500 capitalize">{rep.role}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold" style={{ color }}>{repConvs.length}</p>
                      <p className="text-[10px] text-gray-500">open</p>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-3">
                    <div className="h-full rounded-full transition-all" style={{ width: Math.min((repConvs.length / 15) * 100, 100) + '%', background: color }} />
                  </div>
                  <p className="text-xs">
                    {urgentCount > 0 ? <span className="text-orange-400">{urgentCount} urgent/high</span> : <span className="text-[#25D366]">All clear</span>}
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