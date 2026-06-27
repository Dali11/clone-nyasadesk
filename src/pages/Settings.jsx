import { useState } from 'react';
import { Users, Mail, UserPlus, Trash2, Check, User } from 'lucide-react';
import NavRail from '@/components/NavRail';
import { motion } from 'framer-motion';
import { MOCK_USER, MOCK_USERS, genId } from '@/lib/mockData';

function TeamSection({ users, setUsers, currentUser }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [success, setSuccess] = useState(false);

  const invite = () => {
    if (!email) return;
    const newUser = {
      id: genId('user'),
      full_name: email.split('@')[0],
      email,
      role,
    };
    setUsers(prev => [...prev, newUser]);
    setEmail('');
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const removeUser = (id) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <Users className="w-5 h-5 text-[#5C6CF7]" />
        <h2 className="font-semibold text-gray-900 text-sm">Team Members</h2>
        <span className="ml-auto text-xs text-gray-400">{users.length} members</span>
      </div>

      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Invite New Member</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && invite()}
            placeholder="colleague@company.com"
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7] bg-white"
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7] bg-white"
          >
            <option value="user">Sales Rep</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={invite}
            disabled={!email}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#5C6CF7] text-white text-sm font-semibold rounded-xl hover:bg-[#4A5CE6] transition-colors disabled:opacity-50"
          >
            {success ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {success ? 'Added!' : 'Add'}
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5C6CF7] to-[#00A8BD] flex items-center justify-center text-white font-semibold text-sm shrink-0">
              {u.full_name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">{u.full_name}</p>
                {u.id === currentUser?.id && (
                  <span className="text-[10px] bg-[#5C6CF7]/10 text-[#5C6CF7] px-1.5 py-0.5 rounded-full font-medium">You</span>
                )}
              </div>
              <p className="text-xs text-gray-400 truncate">{u.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full capitalize
                ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                {u.role === 'admin' ? 'Admin' : 'Sales Rep'}
              </span>
              {u.id !== currentUser?.id && (
                <button
                  onClick={() => { if (window.confirm('Remove ' + u.full_name + '?')) removeUser(u.id); }}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileSection({ user, onUpdate }) {
  const [form, setForm] = useState({ full_name: user?.full_name || '' });
  const [saved, setSaved] = useState(false);

  const save = () => {
    onUpdate({ ...user, full_name: form.full_name });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <User className="w-5 h-5 text-[#5C6CF7]" />
        <h2 className="font-semibold text-gray-900 text-sm">My Profile</h2>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5C6CF7] to-[#00A8BD] flex items-center justify-center text-white font-bold text-xl">
            {user?.full_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-xs text-gray-400">{user?.email}</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize mt-1 inline-block
              ${user?.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
              {user?.role === 'admin' ? 'Admin' : 'Sales Rep'}
            </span>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Full Name</label>
          <input
            value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
          />
        </div>
        <button
          onClick={save}
          className="flex items-center gap-2 px-4 py-2 bg-[#5C6CF7] text-white text-sm font-semibold rounded-xl hover:bg-[#4A5CE6] transition-colors"
        >
          {saved ? <Check className="w-3.5 h-3.5" /> : null}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function ChannelSection() {
  const channels = [
    { name: 'Email', icon: '📧', connected: false, desc: 'Connect a mailbox to receive and reply to emails' },
    { name: 'WhatsApp', icon: '💬', connected: false, desc: 'Connect WhatsApp Business API' },
    { name: 'Live Chat', icon: '🌐', connected: false, desc: 'Add a chat widget to your website' },
    { name: 'Phone', icon: '📞', connected: false, desc: 'Connect a VoIP number' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <Mail className="w-5 h-5 text-[#5C6CF7]" />
        <h2 className="font-semibold text-gray-900 text-sm">Channels</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {channels.map(ch => (
          <div key={ch.name} className="flex items-center gap-4 px-6 py-4">
            <span className="text-2xl">{ch.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{ch.name}</p>
              <p className="text-xs text-gray-400">{ch.desc}</p>
            </div>
            <button className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all">
              Connect
            </button>
          </div>
        ))}
      </div>
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-400">Channel integrations require external API configuration. Conversations can be created manually in the meantime.</p>
      </div>
    </div>
  );
}

export default function Settings() {
  const [currentUser, setCurrentUser] = useState({ ...MOCK_USER });
  const [users, setUsers] = useState([...MOCK_USERS]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F5F7]">
      <NavRail user={currentUser} />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your team, profile, and integrations</p>
          </div>

          <div className="space-y-6">
            <ProfileSection user={currentUser} onUpdate={setCurrentUser} />
            <TeamSection users={users} setUsers={setUsers} currentUser={currentUser} />
            <ChannelSection />
          </div>
        </div>
      </div>
    </div>
  );
}