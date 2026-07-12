import { useState, useEffect, useMemo } from 'react';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { getConversations, subscribeToConversations } from '@/lib/channels';
import Sidebar from '@/components/Sidebar';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MessageSquare, CheckCheck, Clock, Users, TrendingUp, Wifi } from 'lucide-react';

function fmtDuration(ms) {
  if (!ms || ms < 0) return '—';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m/60)}h ${m%60}m`;
}

function dayLabel(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
}

export default function Dashboard() {
  const { profile, workspaceOwnerId } = useNyasaAuth();
  const wId = workspaceOwnerId || profile?.workspace_id || profile?.id;
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!wId) return;
    try {
      const all = await getConversations(wId);
      setConvs(all || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [wId]);

  useEffect(() => {
    if (!wId) return;
    const unsub = subscribeToConversations(wId, () => load());
    return () => unsub?.();
  }, [wId]);

  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const stats = useMemo(() => {
    const open = convs.filter(c => c.status === 'open').length;
    const resolvedToday = convs.filter(c => c.resolved_at && new Date(c.resolved_at) >= todayStart).length;
    // Avg response: time between created_at and first_reply_at
    const withReply = convs.filter(c => c.first_reply_at && c.created_at);
    const avgMs = withReply.length
      ? withReply.reduce((s,c) => s + (new Date(c.first_reply_at) - new Date(c.created_at)), 0) / withReply.length
      : null;
    const teamSet = new Set(convs.map(c => c.assigned_to).filter(Boolean));
    return { open, resolvedToday, avgResponse: avgMs, teamCount: teamSet.size };
  }, [convs, todayStart]);

  // 7-day chart data
  const chartData = useMemo(() => {
    return Array.from({length: 7}, (_, i) => {
      const daysAgo = 6 - i;
      const dayStart = new Date(); dayStart.setDate(dayStart.getDate() - daysAgo); dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
      const count = convs.filter(c => {
        const t = new Date(c.created_at);
        return t >= dayStart && t < dayEnd;
      }).length;
      return { day: dayLabel(daysAgo), count };
    });
  }, [convs]);

  // Agent leaderboard (resolved today)
  const leaderboard = useMemo(() => {
    const map = {};
    convs.filter(c => c.resolved_at && new Date(c.resolved_at) >= todayStart && c.assigned_to_name)
      .forEach(c => { map[c.assigned_to_name] = (map[c.assigned_to_name] || 0) + 1; });
    return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 5);
  }, [convs, todayStart]);

  // Channel breakdown
  const channels = useMemo(() => {
    const map = {};
    convs.forEach(c => { const ch = c.channel || 'unknown'; map[ch] = (map[ch] || 0) + 1; });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, [convs]);

  const CHANNEL_COLOR = { whatsapp: '#25D366', email: '#3B82F6', chat: '#8B5CF6', manual: '#F59E0B' };
  const maxCh = Math.max(...channels.map(([,v]) => v), 1);

  const statCards = [
    { label: 'Open Conversations', value: stats.open, icon: MessageSquare, color: '#25D366' },
    { label: 'Resolved Today', value: stats.resolvedToday, icon: CheckCheck, color: '#3B82F6' },
    { label: 'Avg Response', value: fmtDuration(stats.avgResponse), icon: Clock, color: '#F59E0B' },
    { label: 'Active Agents', value: stats.teamCount || '—', icon: Users, color: '#8B5CF6' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--nyasa-surface-1)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 pb-[56px] md:pt-0 md:pb-0 px-4 md:px-6 py-4 md:py-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Page title */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-white font-black text-xl">Dashboard</h1>
              <p className="text-gray-500 text-xs mt-0.5">Live workspace overview</p>
            </div>
            <div className="flex items-center gap-1.5 text-[#25D366] text-xs font-semibold">
              <Wifi className="w-3.5 h-3.5" />
              Live
            </div>
          </div>

          {/* Stat Cards */}
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_,i) => (
                <div key={i} className="h-24 rounded-2xl bg-[var(--nyasa-surface-2)] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {statCards.map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-[var(--nyasa-surface-2)] rounded-2xl p-4 border border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-500 text-[11px] font-semibold uppercase tracking-wide leading-tight">{label}</span>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background: color+'22'}}>
                      <Icon className="w-3.5 h-3.5" style={{color}} />
                    </div>
                  </div>
                  <p className="text-white font-black text-2xl">{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* 7-Day Volume Chart */}
          <div className="bg-[var(--nyasa-surface-2)] rounded-2xl p-5 border border-white/5">
            <h2 className="text-white font-bold text-sm mb-4">Conversation Volume — 7 days</h2>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} barSize={28}>
                <XAxis dataKey="day" tick={{fill:'#6B7280', fontSize:11}} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{background:'#1C2B33', border:'none', borderRadius:10, color:'white', fontSize:12}}
                  cursor={{fill:'rgba(255,255,255,0.04)'}}
                />
                <Bar dataKey="count" radius={[6,6,0,0]}>
                  {chartData.map((_,i) => (
                    <Cell key={i} fill={i === chartData.length - 1 ? '#25D366' : '#25D36650'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid md:grid-cols-2 gap-4">

            {/* Agent Leaderboard */}
            <div className="bg-[var(--nyasa-surface-2)] rounded-2xl p-5 border border-white/5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-[#25D366]" />
                <h2 className="text-white font-bold text-sm">Top Agents Today</h2>
              </div>
              {leaderboard.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-6">No resolved conversations today</p>
              ) : (
                <div className="space-y-3">
                  {leaderboard.map(([name, count], i) => (
                    <div key={name} className="flex items-center gap-3">
                      <span className="text-gray-600 text-xs w-4 shrink-0">#{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-white text-xs font-semibold truncate">{name}</span>
                          <span className="text-[#25D366] text-xs font-bold ml-2">{count}</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-[#25D366] rounded-full" style={{width:`${(count/leaderboard[0][1])*100}%`}} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Channel Breakdown */}
            <div className="bg-[var(--nyasa-surface-2)] rounded-2xl p-5 border border-white/5">
              <h2 className="text-white font-bold text-sm mb-4">By Channel</h2>
              {channels.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-6">No data yet</p>
              ) : (
                <div className="space-y-3">
                  {channels.map(([ch, count]) => (
                    <div key={ch} className="flex items-center gap-3">
                      <span className="text-gray-400 text-xs capitalize w-16 shrink-0">{ch}</span>
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{width:`${(count/maxCh)*100}%`, background: CHANNEL_COLOR[ch] || '#6B7280'}} />
                      </div>
                      <span className="text-gray-400 text-xs w-6 text-right shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
