import { useState } from 'react';
import { User, Users, Globe, Bell, Building2, Plus, Trash2, Check } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import { store, genId } from '@/lib/store';
import { useNyasaAuth } from '@/lib/NyasaAuth';

const CHANNEL_INFO = [
  { id: 'whatsapp',  label: 'WhatsApp',          icon: '💬', desc: 'Connect WhatsApp Business API',         color: 'bg-green-500' },
  { id: 'messenger', label: 'Facebook Messenger', icon: '📘', desc: 'Connect your Facebook Page',            color: 'bg-blue-600' },
  { id: 'email',     label: 'Email',              icon: '📧', desc: 'Connect a mailbox (IMAP/SMTP or Gmail)', color: 'bg-indigo-500' },
  { id: 'website',   label: 'Website Chat',       icon: '🌐', desc: 'Embed a live chat widget on your site', color: 'bg-cyan-500' },
];

const ROLE_COLORS = { owner: 'text-yellow-400 bg-yellow-900/20', admin: 'text-blue-400 bg-blue-900/20', agent: 'text-gray-400 bg-white/5' };
const SECTIONS = [
  { id: 'profile',   label: 'Profile',   icon: User      },
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'team',      label: 'Team',      icon: Users     },
  { id: 'channels',  label: 'Channels',  icon: Globe     },
  { id: 'sla',       label: 'SLA',       icon: Bell      },
];

export default function Settings() {
  const { user, setUser } = useNyasaAuth();
  const [section, setSection] = useState('profile');
  const [users, setUsers] = useState(store.getUsers());
  const [workspace, setWorkspaceState] = useState(store.getWorkspace());
  const [profileForm, setProfileForm] = useState({ full_name: user?.full_name || '', email: user?.email || '' });
  const [saved, setSaved] = useState(false);
  const [newMember, setNewMember] = useState({ full_name: '', email: '', role: 'agent' });
  const [addingMember, setAddingMember] = useState(false);

  const saveProfile = () => {
    store.updateUser(user.id, profileForm);
    setUser({ ...user, ...profileForm });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateWorkspace = (data) => { store.updateWorkspace(data); setWorkspaceState(store.getWorkspace()); };

  const addMember = () => {
    if (!newMember.full_name.trim()) return;
    const u = { id: genId('user'), ...newMember, avatar: null, workspace_id: workspace.id, status: 'offline' };
    store.addUser(u);
    setUsers(store.getUsers());
    setAddingMember(false);
    setNewMember({ full_name: '', email: '', role: 'agent' });
  };

  const removeMember = (id) => { if (id === user.id) return; store.removeUser(id); setUsers(store.getUsers()); };

  const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21]">
      <Sidebar />
      <div className="w-56 bg-[#111B21] border-r border-white/10 flex flex-col py-4 px-3 shrink-0">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide px-3 mb-3">Settings</p>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setSection(id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-0.5
              ${section === id ? 'bg-[#25D366]/15 text-[#25D366]' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[#0D1418]">
        <div className="max-w-2xl mx-auto px-8 py-8">

          {section === 'profile' && (
            <div>
              <h1 className="text-xl font-bold text-white mb-6">Profile</h1>
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-6 space-y-4">
                <div className="flex items-center gap-4 mb-2">
                  <Avatar name={profileForm.full_name || user?.full_name || ''} size="xl" />
                  <div>
                    <p className="font-semibold text-white">{profileForm.full_name}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[user?.role] || 'text-gray-400 bg-white/5'}`}>{user?.role}</span>
                  </div>
                </div>
                {[['full_name','Display Name'],['email','Email']].map(([k, ph]) => (
                  <div key={k}>
                    <label className="text-xs text-gray-500 mb-1 block">{ph}</label>
                    <input className={inputCls} value={profileForm[k] || ''} onChange={e => setProfileForm(f => ({ ...f, [k]: e.target.value }))} />
                  </div>
                ))}
                <button onClick={saveProfile} className="flex items-center gap-2 px-5 py-2.5 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors">
                  {saved ? <><Check className="w-4 h-4" /> Saved!</> : 'Save Profile'}
                </button>
              </div>
            </div>
          )}

          {section === 'workspace' && (
            <div>
              <h1 className="text-xl font-bold text-white mb-6">Workspace</h1>
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-6 space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Workspace Name</label>
                  <input className={inputCls} value={workspace.name} onChange={e => updateWorkspace({ name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Plan</label>
                  <div className="flex items-center gap-2 bg-[#2A3942] rounded-xl px-4 py-2.5">
                    <span className="text-sm text-white capitalize">{workspace.plan}</span>
                    <span className="ml-auto text-xs text-[#25D366] font-semibold">Active</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[['start','Start'],['end','End']].map(([k, label]) => (
                    <div key={k}>
                      <label className="text-xs text-gray-500 mb-1 block">Business Hours {label}</label>
                      <input type="time" value={workspace.business_hours?.[k] || '09:00'}
                        onChange={e => updateWorkspace({ business_hours: { ...workspace.business_hours, [k]: e.target.value } })}
                        className={inputCls} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'team' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-white">Team ({users.length})</h1>
                <button onClick={() => setAddingMember(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors">
                  <Plus className="w-4 h-4" /> Invite Member
                </button>
              </div>
              {addingMember && (
                <div className="bg-[#202C33] rounded-2xl border border-[#25D366]/40 p-5 mb-4 space-y-3">
                  <h3 className="font-semibold text-white text-sm">Invite Team Member</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <input className={inputCls} placeholder="Name *" value={newMember.full_name} onChange={e => setNewMember(f => ({ ...f, full_name: e.target.value }))} />
                    <input className={inputCls} placeholder="Email" value={newMember.email} onChange={e => setNewMember(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <select value={newMember.role} onChange={e => setNewMember(f => ({ ...f, role: e.target.value }))}
                    className="w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border-0">
                    <option value="agent">Agent</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div className="flex gap-3">
                    <button onClick={() => setAddingMember(false)} className="px-4 py-2 border border-white/10 text-gray-300 rounded-xl text-sm">Cancel</button>
                    <button onClick={addMember} disabled={!newMember.full_name.trim()}
                      className="px-6 py-2 bg-[#25D366] text-white font-semibold rounded-xl text-sm disabled:opacity-40">Add</button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className="bg-[#202C33] rounded-2xl border border-white/10 px-5 py-4 flex items-center gap-4">
                    <Avatar name={u.full_name} size="md" status={u.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white text-sm">{u.full_name}</p>
                        {u.id === user.id && <span className="text-[9px] text-[#25D366] bg-[#25D366]/10 px-1.5 py-0.5 rounded-full">You</span>}
                      </div>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[u.role]}`}>{u.role}</span>
                    {u.id !== user.id && (
                      <button onClick={() => removeMember(u.id)} className="p-1.5 hover:bg-red-900/30 hover:text-red-400 text-gray-600 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === 'channels' && (
            <div>
              <h1 className="text-xl font-bold text-white mb-6">Channels</h1>
              <div className="space-y-3">
                {CHANNEL_INFO.map(ch => {
                  const connected = workspace.channels.includes(ch.id);
                  return (
                    <div key={ch.id} className="bg-[#202C33] rounded-2xl border border-white/10 px-5 py-4 flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl ${ch.color} flex items-center justify-center text-xl shrink-0`}>{ch.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm">{ch.label}</p>
                        <p className="text-xs text-gray-500">{ch.desc}</p>
                      </div>
                      <button onClick={() => updateWorkspace({ channels: connected ? workspace.channels.filter(c => c !== ch.id) : [...workspace.channels, ch.id] })}
                        className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors ${connected ? 'bg-[#25D366]/20 text-[#25D366] hover:bg-red-900/20 hover:text-red-400' : 'bg-white/10 text-gray-300 hover:bg-[#25D366]/20 hover:text-[#25D366]'}`}>
                        {connected ? 'Connected' : 'Connect'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {section === 'sla' && (
            <div>
              <h1 className="text-xl font-bold text-white mb-6">SLA Settings</h1>
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-6 space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">First Response SLA (hours)</label>
                  <input type="number" min={1} max={48} value={workspace.sla_hours}
                    onChange={e => updateWorkspace({ sla_hours: parseInt(e.target.value) || 4 })}
                    className={inputCls} />
                  <p className="text-xs text-gray-600 mt-1">Conversations breaching this will be flagged in the dashboard.</p>
                </div>
                <div className="bg-[#2A3942] rounded-xl p-4">
                  <p className="text-sm text-white font-medium mb-1">Current SLA: <span className="text-[#25D366]">{workspace.sla_hours} hours</span></p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}