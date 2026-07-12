import {useState, useEffect, useCallback}from 'react';
import {BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, PieChart, Pie}from 'recharts';
import {
  MessageSquare,
  Clock,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Users,
}from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import {useNyasaAuth}from '@/lib/NyasaAuth';
import {getConversations, getTeamMembers}from '@/lib/channels';
import {useDocumentTitle}from '@/hooks/useDocumentTitle';
import {supabase}from '@/lib/supabase';

/* ─── Stat Card ─────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, color, icon: Icon, trend, trendLabel }) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? '#25D366' : trend === 'down' ? '#EF4444' : '#9CA3AF';
  return (
    <div className="relative overflow-hidden rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'linear-gradient(135deg,#1a2530 0%,#111B21 100%)', border:`1px solid ${color}22`, boxShadow:`0 0 0 1px ${color}11,0 4px 24px ${color}0d` }}>
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background:`linear-gradient(135deg,${color}33,${color}11)`, border:`1px solid ${color}33` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {trendLabel && (
          <div className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background:trendColor+'18', color:trendColor }}>
            <TrendIcon className="w-3 h-3" />{trendLabel}
          </div>
        )}
      </div>
      <div>
        <p className="text-4xl font-black leading-none tracking-tight" style={{ color, textShadow:`0 0 32px ${color}55` }}>{value}</p>
        <p className="text-[11px] font-bold text-white/70 uppercase tracking-widest mt-1">{label}</p>
        {sub && <p className="text-[10px] text-white/35 mt-0.5">{sub}</p>}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-2xl"
        style={{ background:`linear-gradient(90deg,transparent,${color}88,transparent)` }} />
    </div>
  );
}

function dayOverDay(today, yesterday) {
  const diff = today - yesterday;
  if (diff === 0) return { trend:'neutral', label: today === 0 && yesterday === 0 ? 'No activity yet' : 'Same as yesterday' };
  return { trend: diff > 0 ? 'up' : 'down', label:`${diff>0?'+':''}${diff} vs yesterday` };
}

/* ─── KPI badge ─────────────────────────────────────────────────────────── */
function KPIBadge({ label, value, color = '#9CA3AF' }) {
  return (
    <div className="flex flex-col items-center justify-center bg-[var(--nyasa-surface-3)] rounded-lg px-2 py-1.5 min-w-[52px]">
      <span className="text-base font-black leading-none" style={{ color }}>{value}</span>
      <span className="text-[9px] text-gray-500 text-center leading-tight mt-0.5">{label}</span>
    </div>
  );
}

/* ─── Agent Performance Table ────────────────────────────────────────────── */
function AgentPerformanceTable({ conversations, teamMembers, range }) {
  const now = new Date();
  const startOf = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const today = startOf(now);
  const rangeStart = new Date(today);
  if (range === '7d') rangeStart.setDate(rangeStart.getDate() - 7);
  else if (range === '30d') rangeStart.setDate(rangeStart.getDate() - 30);
  // 'today' = rangeStart stays at today

  const inRange = (d) => d && new Date(d) >= rangeStart;

  // Build agent stats
  const stats = teamMembers.map(agent => {
    const mine = conversations.filter(c => c.assigned_to === agent.id);
    const closedInRange = mine.filter(c => c.status === 'closed' && inRange(c.updated_at));
    const openNow = mine.filter(c => c.status === 'open').length;
    const snoozed = mine.filter(c => c.status === 'snoozed').length;
    const urgent = mine.filter(c => c.priority === 'urgent' && c.status !== 'closed').length;
    const total = mine.length;

    // Avg response time proxy: use sla_breach_at as signal for now
    // (real avg would need message timestamps — we compute what we have)
    const resolutionRate = total > 0 ? Math.round((closedInRange.length / Math.max(total, closedInRange.length)) * 100) : 0;

    return {
      id: agent.id,
      name: agent.full_name || agent.email || 'Agent',
      role: agent.role || 'agent',
      assigned: total,
      open: openNow,
      closed: closedInRange.length,
      snoozed,
      urgent,
      resolutionRate,
    };
  }).sort((a, b) => b.closed - a.closed);

  if (!stats.length) return (
    <p className="text-xs text-gray-500 py-8 text-center">No team members found</p>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--nyasa-border)]">
            <th className="text-left pb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Agent</th>
            <th className="text-center pb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Assigned</th>
            <th className="text-center pb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Open</th>
            <th className="text-center pb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Closed</th>
            <th className="text-center pb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Snoozed</th>
            <th className="text-center pb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Urgent</th>
            <th className="text-right pb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Resolution</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((a, i) => (
            <tr key={a.id} className="border-b border-[var(--nyasa-border)] last:border-0 hover:bg-white/3 transition-colors">
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-2.5">
                  {/* Rank badge for top 3 */}
                  {i < 3 ? (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0
                      ${i===0?'bg-yellow-500/20 text-yellow-400':i===1?'bg-gray-400/20 text-gray-300':'bg-orange-500/20 text-orange-400'}`}>
                      {i+1}
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-[var(--nyasa-surface-3)] flex items-center justify-center text-[10px] text-gray-600 shrink-0">
                      {i+1}
                    </div>
                  )}
                  <Avatar name={a.name} size="xs" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-200 truncate leading-tight">{a.name}</p>
                    <p className="text-[10px] text-gray-600 capitalize">{a.role.replace('_',' ')}</p>
                  </div>
                </div>
              </td>
              <td className="py-2.5 text-center font-bold text-gray-300">{a.assigned}</td>
              <td className="py-2.5 text-center">
                <span className="font-bold text-[#25D366]">{a.open}</span>
              </td>
              <td className="py-2.5 text-center">
                <span className="font-bold text-indigo-400">{a.closed}</span>
              </td>
              <td className="py-2.5 text-center text-yellow-500">{a.snoozed || '–'}</td>
              <td className="py-2.5 text-center">
                {a.urgent > 0
                  ? <span className="text-red-400 font-bold">{a.urgent}</span>
                  : <span className="text-gray-600">–</span>}
              </td>
              <td className="py-2.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <div className="w-16 h-1.5 rounded-full bg-[var(--nyasa-surface-3)] overflow-hidden">
                    <div className="h-full rounded-full bg-[#25D366] transition-all"
                      style={{ width:`${a.resolutionRate}%` }} />
                  </div>
                  <span className="text-[10px] font-semibold text-gray-400 w-7 text-right">{a.resolutionRate}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Dashboard ─────────────────────────────────────────────────────── */
export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const { user, profile, workspaceOwnerId, canViewAllChats } = useNyasaAuth();
  const [conversations, setConversations] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [perfRange, setPerfRange] = useState('7d');

  const load = useCallback(async () => {
    if (!workspaceOwnerId) return;
    try {
      const [convData] = await Promise.all([getConversations(workspaceOwnerId)]);
      setConversations(convData);

      if (canViewAllChats) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const members = await getTeamMembers(workspaceOwnerId, session?.access_token);
          setTeamMembers(members || []);
        } catch (e) {
          console.warn('[Dashboard] could not load team members:', e.message);
        }
      }
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  }, [workspaceOwnerId, canViewAllChats]);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const startOf = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const today = startOf(now);
  const yesterdayStart = new Date(today); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const isToday = (d) => d && new Date(d) >= today;
  const isYesterday = (d) => d && new Date(d) >= yesterdayStart && new Date(d) < today;

  const isAgentView = !canViewAllChats;

  const totalOpen     = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && c.status !== 'closed').length
    : conversations.filter(c => c.status !== 'closed').length;
  const unassigned    = conversations.filter(c => !c.assigned_to && c.status !== 'closed').length;
  const urgent        = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && c.priority === 'urgent' && c.status !== 'closed').length
    : conversations.filter(c => c.priority === 'urgent' && c.status !== 'closed').length;
  const closedToday   = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && c.status === 'closed' && isToday(c.updated_at)).length
    : conversations.filter(c => c.status === 'closed' && isToday(c.updated_at)).length;
  const closedYesterday = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && c.status === 'closed' && isYesterday(c.updated_at)).length
    : conversations.filter(c => c.status === 'closed' && isYesterday(c.updated_at)).length;
  const newToday      = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && isToday(c.created_at)).length
    : conversations.filter(c => isToday(c.created_at)).length;
  const newYesterday  = isAgentView
    ? conversations.filter(c => c.assigned_to === user?.id && isYesterday(c.created_at)).length
    : conversations.filter(c => isYesterday(c.created_at)).length;
  const newUnassignedToday     = conversations.filter(c => !c.assigned_to && isToday(c.created_at)).length;
  const newUnassignedYesterday = conversations.filter(c => !c.assigned_to && isYesterday(c.created_at)).length;

  const openTrend        = dayOverDay(newToday, newYesterday);
  const unassignedTrend  = dayOverDay(newUnassignedToday, newUnassignedYesterday);
  const closedTrend      = dayOverDay(closedToday, closedYesterday);

  const channelData = ['whatsapp','messenger','email','website'].map(ch => ({
    name: ch.charAt(0).toUpperCase() + ch.slice(1),
    value: conversations.filter(c => c.channel === ch).length,
  }));

  const stageData = ['New Lead','Contacted','Qualified','Proposal Sent','Negotiation','Closed Won','Closed Lost'].map(s => ({
    name: s.length > 8 ? s.slice(0,8)+'…' : s,
    count: conversations.filter(c => c.deal_stage === s).length,
  }));

  const COLORS = ['#25D366','#3B82F6','#6366F1','#06B6D4'];
  const hasChannelData = channelData.some(d => d.value > 0);

  const slaData = conversations
    .filter(c => c.sla_breach_at && c.status !== 'closed')
    .map(c => ({ ...c, slaMinutes: Math.floor((new Date(c.sla_breach_at) - new Date()) / 60000) }))
    .sort((a,b) => a.slaMinutes - b.slaMinutes).slice(0,5);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--nyasa-surface-1)] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--nyasa-surface-5)]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl md:text-2xl font-black text-white">{isAgentView ? 'My Dashboard' : 'Reports'}</h1>
            <p className="text-xs md:text-sm text-gray-400 mt-0.5">{isAgentView ? 'Your chats & activity' : 'Team performance & pipeline'}</p>
          </div>

          {/* Account-mismatch warning: owner with no data */}
          {!loading && !profile?.workspace_id && conversations.length === 0 && (
            <div className="mb-5 flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-3.5">
              <span className="text-yellow-400 text-lg mt-0.5">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-yellow-300">No data found for this account</p>
                <p className="text-xs text-yellow-400/80 mt-0.5 leading-relaxed">
                  This account has no linked workspace or conversations. If you expected to see data here,
                  please log out and sign in with the correct workspace-owner email (e.g. geniuspulse22@gmail.com).
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (<>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard label={isAgentView?'My Open':'Open'} value={totalOpen}
              sub={isAgentView?'Assigned to you':'Active conversations'}
              icon={MessageSquare} color="#25D366" trend={openTrend.trend} trendLabel={openTrend.label} />
            <StatCard label="Unassigned" value={unassigned}
              sub={isAgentView?'Ready to pick up':'Need assignment'}
              icon={Clock} color="#F59E0B" trend={unassignedTrend.trend} trendLabel={unassignedTrend.label} />
            <StatCard label={isAgentView?'My Urgent':'Urgent'} value={urgent}
              sub="High priority" icon={AlertCircle} color="#EF4444"
              trend={urgent>0?'up':'neutral'} trendLabel={urgent>0?'Action needed':'All clear'} />
            <StatCard label={isAgentView?'Closed by Me':'Closed Today'} value={closedToday}
              sub="Resolved today" icon={CheckCircle} color="#6366F1"
              trend={closedTrend.trend} trendLabel={closedTrend.label} />
          </div>

          {/* ── Agent Performance (admin/manager only) ─────────────────────── */}
          {canViewAllChats && (
            <div className="bg-[var(--nyasa-surface-2)] rounded-2xl p-4 md:p-5 border border-[var(--nyasa-border)] mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#25D366]" />
                  <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide">Agent Performance</h3>
                </div>
                {/* Range picker */}
                <div className="flex items-center gap-1 bg-[var(--nyasa-surface-3)] rounded-lg p-0.5">
                  {['today','7d','30d'].map(r => (
                    <button key={r} onClick={() => setPerfRange(r)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all
                        ${perfRange===r?'bg-[#25D366]/20 text-[#25D366]':'text-gray-500 hover:text-gray-300'}`}>
                      {r==='today'?'Today':r==='7d'?'7 days':'30 days'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary KPIs across team */}
              <div className="flex flex-wrap gap-2 mb-4">
                <KPIBadge label="Total agents" value={teamMembers.length} color="#9CA3AF" />
                <KPIBadge label="Total assigned" value={conversations.filter(c=>c.assigned_to).length} color="#25D366" />
                <KPIBadge label="Unassigned" value={conversations.filter(c=>!c.assigned_to&&c.status!=='closed').length} color="#F59E0B" />
                <KPIBadge label="Closed today" value={conversations.filter(c=>c.status==='closed'&&isToday(c.updated_at)).length} color="#6366F1" />
                <KPIBadge label="Urgent open" value={conversations.filter(c=>c.priority==='urgent'&&c.status!=='closed').length} color="#EF4444" />
              </div>

              <AgentPerformanceTable
                conversations={conversations}
                teamMembers={teamMembers}
                range={perfRange}
              />

              {teamMembers.length === 0 && (
                <p className="text-xs text-gray-600 mt-3 text-center">
                  Add team members in Settings → Team to see per-agent stats.
                </p>
              )}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-[var(--nyasa-surface-2)] rounded-2xl p-4 md:p-5 border border-[var(--nyasa-border)]">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">{isAgentView?'My Chats by Channel':'By Channel'}</h3>
              {hasChannelData ? (<>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                      {channelData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background:'var(--nyasa-surface-2)', border:'1px solid #374151', borderRadius:8, fontSize:12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-2">
                  {channelData.map((d,i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                      <span className="w-2 h-2 rounded-full" style={{ background:COLORS[i%COLORS.length] }} />
                      {d.name} ({d.value})
                    </div>
                  ))}
                </div>
              </>) : (
                <p className="text-xs text-gray-500 py-10 text-center">No conversations yet</p>
              )}
            </div>

            <div className="bg-[var(--nyasa-surface-2)] rounded-2xl p-4 md:p-5 border border-[var(--nyasa-border)]">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">{isAgentView?'My Pipeline':'Pipeline'}</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stageData} barSize={14}>
                  <XAxis dataKey="name" tick={{ fontSize:9, fill:'#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:9, fill:'#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background:'var(--nyasa-surface-2)', border:'1px solid #374151', borderRadius:8, fontSize:12 }} />
                  <Bar dataKey="count" radius={[4,4,0,0]}>
                    {stageData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SLA At Risk */}
          {slaData.length > 0 && (
            <div className="bg-[var(--nyasa-surface-2)] rounded-2xl p-4 md:p-5 border border-[var(--nyasa-border)] mb-6">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide mb-4">{isAgentView?'My SLA Watch':'SLA At Risk'}</h3>
              <div className="space-y-2">
                {slaData.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-[var(--nyasa-border)] last:border-0">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.contact?.full_name||'Unknown'} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-white">{c.contact?.full_name||'Unknown'}</p>
                        <p className="text-[11px] text-gray-500">{c.channel}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.slaMinutes<0?'bg-red-500/20 text-red-400':'bg-yellow-500/20 text-yellow-400'}`}>
                      {c.slaMinutes<0?`${Math.abs(c.slaMinutes)}m overdue`:`${c.slaMinutes}m left`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          </>)}
        </div>
      </div>
    </div>
  );
}
