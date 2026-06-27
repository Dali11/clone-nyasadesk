import { useState } from 'react';
import { Plus, Trash2, Edit3, Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import ChannelBadge, { CHANNELS } from '@/components/ChannelBadge';
import Avatar from '@/components/Avatar';
import { store, genId } from '@/lib/store';

const RULE_TYPES = ['round_robin', 'lead_source', 'territory'];
const CHANNELS_ALL = ['all', ...CHANNELS];

export default function Rules() {
  const [rules, setRules] = useState(store.getRules());
  const users = store.getUsers();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'round_robin', channel: 'all', condition_value: '', assigned_to_ids: [], is_active: true });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleUser = (id) => setForm(f => ({ ...f, assigned_to_ids: f.assigned_to_ids.includes(id) ? f.assigned_to_ids.filter(u => u !== id) : [...f.assigned_to_ids, id] }));
  const startNew = () => { setForm({ name: '', type: 'round_robin', channel: 'all', condition_value: '', assigned_to_ids: [], is_active: true }); setEditing('new'); };
  const startEdit = (r) => { setForm({ ...r }); setEditing(r.id); };

  const save = () => {
    if (!form.name.trim()) return;
    const names = users.filter(u => form.assigned_to_ids.includes(u.id)).map(u => u.full_name);
    if (editing === 'new') {
      store.addRule({ id: genId('rule'), ...form, assigned_to_names: names, priority_order: rules.length + 1, round_robin_index: 0 });
    } else {
      store.updateRule(editing, { ...form, assigned_to_names: names });
    }
    setRules(store.getRules());
    setEditing(null);
  };

  const toggle = (id, val) => { store.updateRule(id, { is_active: val }); setRules(store.getRules()); };
  const del = (id) => { store.deleteRule(id); setRules(store.getRules()); };

  const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21]">
      <Sidebar />
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[#0D1418]">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white">Assignment Rules</h1>
              <p className="text-sm text-gray-500 mt-1">Auto-assign incoming conversations to your team</p>
            </div>
            <button onClick={startNew}
              className="flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors">
              <Plus className="w-4 h-4" /> New Rule
            </button>
          </div>

          {editing && (
            <div className="bg-[#202C33] rounded-2xl border border-[#25D366]/40 p-5 mb-6 space-y-4">
              <h3 className="font-semibold text-white text-sm">{editing === 'new' ? 'New Rule' : 'Edit Rule'}</h3>
              <input className={inputCls} placeholder="Rule name *" value={form.name} onChange={e => set('name', e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Type</label>
                  <select value={form.type} onChange={e => set('type', e.target.value)} className="w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border-0">
                    {RULE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace('_',' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Channel</label>
                  <select value={form.channel} onChange={e => set('channel', e.target.value)} className="w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border-0">
                    {CHANNELS_ALL.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>
              </div>
              {form.type !== 'round_robin' && (
                <input className={inputCls} placeholder="Condition value" value={form.condition_value} onChange={e => set('condition_value', e.target.value)} />
              )}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Assign to</label>
                <div className="flex flex-wrap gap-2">
                  {users.map(u => (
                    <button key={u.id} onClick={() => toggleUser(u.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border
                        ${form.assigned_to_ids.includes(u.id) ? 'bg-[#25D366]/20 border-[#25D366]/40 text-[#25D366]' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                      <Avatar name={u.full_name} size="xs" />{u.full_name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditing(null)} className="px-4 py-2 border border-white/10 text-gray-300 rounded-xl text-sm">Cancel</button>
                <button onClick={save} disabled={!form.name.trim()}
                  className="px-6 py-2 bg-[#25D366] text-white font-semibold rounded-xl text-sm hover:bg-[#20BA5A] transition-colors disabled:opacity-40">Save Rule</button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {rules.length === 0 && !editing && (
              <div className="flex flex-col items-center py-20 text-center">
                <Zap className="w-12 h-12 text-gray-700 mb-4" />
                <p className="text-gray-500">No rules yet</p>
              </div>
            )}
            {rules.map((r, idx) => (
              <div key={r.id} className={`bg-[#202C33] rounded-2xl border px-5 py-4 ${r.is_active ? 'border-white/10' : 'border-white/5 opacity-60'} group`}>
                <div className="flex items-start gap-3">
                  <span className="text-xs text-gray-600 font-mono mt-0.5 w-4">#{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-semibold text-white text-sm">{r.name}</span>
                      <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full capitalize">{r.type.replace('_',' ')}</span>
                      {r.channel !== 'all' && <ChannelBadge channel={r.channel} />}
                    </div>
                    {r.condition_value && <p className="text-xs text-gray-500 mb-2">When: "{r.condition_value}"</p>}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(r.assigned_to_names || []).map(n => (
                        <div key={n} className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full">
                          <Avatar name={n} size="xs" />
                          <span className="text-[10px] text-gray-400">{n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => toggle(r.id, !r.is_active)} className="text-gray-500 hover:text-white transition-colors">
                      {r.is_active ? <ToggleRight className="w-5 h-5 text-[#25D366]" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => startEdit(r)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => del(r.id)} className="p-1.5 hover:bg-red-900/30 rounded-lg text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}