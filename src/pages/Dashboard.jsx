import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { Users, Inbox, TrendingUp, Clock, UserCheck } from 'lucide-react';
import NavRail from '@/components/NavRail';
import { motion } from 'framer-motion';
import { MOCK_USER, MOCK_USERS, MOCK_CONVERSATIONS } from '@/lib/mockData';

function StatCard({ label, value, sub, color = '#5C6CF7', icon: Icon }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
          <p className="text-3xl font-bold" style={{ color }}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + '15' }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </motion.div>
  );
}

function RepCard({ rep, conversations, onReassign, allReps }) {
  const repConvs = conversations.filter(c => c.assigned_to === rep.id && c.status !== 'closed');
  const urgent = repConvs.filter(c => c.priority === 'urgent' || c.priority === 'high').length;
  const unread = repConvs.filter(c => c.unread).length;
  const initials = rep.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??';

  const workloadColor =
    repConvs.length === 0 ? '#10B981'
    : repConvs.length < 5 ? '#5C6CF7'
    : repConvs.length < 10 ? '#F59E0B'
    : '#E11D48';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#5C6CF7] to-[#00A8BD] flex items-center justify-center text-white font-bold text-sm">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{rep.full_name}</p>
          <p className="text-xs text-gray-400 capitalize">{rep.role}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold" style={{ color: workloadColor }}>{repConvs.length}</p>
          <p className="text-[10px] text-gray-400">open</p>
        </div>
      </div>

      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: Math.min((repConvs.length / 15) * 100, 100) + '%', background: workloadColor }}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-3">
          {urgent > 0 && <span className="text-red-500 font-medium">{urgent} urgent</span>}
          {unread > 0 && <span className="text-[#5C6CF7] font-medium">{unread} unread</span>}
          {urgent === 0 && unread === 0 && <span className="text-gray-400">All clear</span>}
        </div>
      </div>

      {repConvs.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
          {repConvs.slice(0, 3).map(c => (
            <div key={c.id} className="flex items-center justify-between text-xs group">
              <span className="text-gray-600 truncate flex-1">{c.contact_name} · {c.subject}</span>
              {allReps.length > 1 && (
                <select
                  className="ml-2 text-[10px] text-[#5C6CF7] bg-transparent border-0 focus:outline-none opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  defaultValue=""
                  onChange={e => { if (e.target.value) onReassign(c.id, e.target.value, e.target.selectedOptions[0].text); e.target.value = ''; }}
                >
                  <option value="" disabled>Reassign</option>
                  {allReps.filter(r => r.id !== rep.id).map(r => (
                    <option key={r.id} value={r.id}>{r.full_name}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
          {repConvs.length > 3 && (
            <p className="text-[10px] text-gray-400">+{repConvs.length - 3} more</p>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default function Dashboard() {
  const user = MOCK_USER;
  const [conversations, setConversations] = useState([...MOCK_CONVERSATIONS]);

  const handleReassign = (convId, toUserId, toUserName) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, assigned_to: toUserId, assigned_to_name: toUserName } : c));
  };

  const totalOpen = conversations.filter(c => c.status !== 'closed').length;
  const unassigned = conversations.filter(c => !c.assigned_to).length;
  const urgent = conversations.filter(c => c.priority === 'urgent' && c.status !== 'closed').length;
  const closedToday = conversations.filter(c => {
    if (c.status !== 'closed') return false;
    const d = new Date(c.updated_date);
    return d.toDateString() === new Date().toDateString();
  }).length;

  const channelData = ['email', 'whatsapp', 'chat', 'phone'].map(ch => ({
    name: ch.charAt(0).toUpperCase() + ch.slice(1),
    count: conversations.filter(c => c.channel === ch && c.status !== 'closed').length,
  })).filter(d => d.count > 0);

  const stageData = ['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost'].map(s => ({
    name: s.replace(' ', '\n'),
    count: conversations.filter(c => c.deal_stage === s).length,
  }));

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F5F7]">
      <NavRail user={user} />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Team Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Workload and performance overview</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Open Conversations" value={totalOpen} sub="Across all reps" icon={Inbox} color="#5C6CF7" />
            <StatCard label="Unassigned" value={unassigned} sub="Need attention" icon={Clock} color="#F59E0B" />
            <StatCard label="Urgent" value={urgent} sub="High priority" icon={TrendingUp} color="#E11D48" />
            <StatCard label="Closed Today" value={closedToday} sub="Deals resolved" icon={UserCheck} color="#10B981" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Open by Channel</h3>
              {channelData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={channelData} barSize={32}>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {channelData.map((_, i) => (
                        <Cell key={i} fill={['#5C6CF7', '#10B981', '#00A8BD', '#F59E0B'][i % 4]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-sm text-gray-400">No data yet</div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Pipeline by Stage</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stageData} barSize={22}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }} />
                  <Bar dataKey="count" fill="#5C6CF7" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">Rep Workload</h2>
            <p className="text-xs text-gray-400">Hover a conversation to reassign</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {MOCK_USERS.map(rep => (
              <RepCard
                key={rep.id}
                rep={rep}
                conversations={conversations}
                onReassign={handleReassign}
                allReps={MOCK_USERS}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}