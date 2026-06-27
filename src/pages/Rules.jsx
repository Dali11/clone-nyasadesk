import { useState } from 'react';
import { Plus, Zap, Trash2, ToggleLeft, ToggleRight, Edit3, Check, X } from 'lucide-react';
import NavRail from '@/components/NavRail';
import { motion, AnimatePresence } from 'framer-motion';
import { MOCK_USER, MOCK_USERS, MOCK_RULES, genId } from '@/lib/mockData';

const RULE_TYPES = [
  { value: 'round_robin', label: 'Round Robin', desc: 'Distribute evenly across team members' },
  { value: 'lead_source', label: 'By Lead Source', desc: 'Assign based on the incoming channel' },
  { value: 'territory', label: 'By Territory', desc: 'Assign based on contact territory' },
];

const CHANNELS = ['all', 'email', 'whatsapp', 'chat', 'phone'];

function RuleCard({ rule, users, onToggle, onDelete, onEdit }) {
  const typeLabel = RULE_TYPES.find(t => t.value === rule.type)?.label || rule.type;
  const assignedUsers = users.filter(u => (rule.assigned_to_ids || []).includes(u.id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={`bg-white rounded-2xl border p-5 shadow-sm transition-all ${rule.is_active ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-[#5C6CF7]/10 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-[#5C6CF7]" />
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">{rule.name}</h3>
            {!rule.is_active && (
              <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full font-medium">Inactive</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-3 pl-9">{RULE_TYPES.find(t => t.value === rule.type)?.desc}</p>

          <div className="flex items-center gap-4 pl-9 flex-wrap">
            <div>
              <span className="text-[10px] font-semibold text-gray-400 uppercase block mb-1">Type</span>
              <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">{typeLabel}</span>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-gray-400 uppercase block mb-1">Channel</span>
              <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full capitalize">{rule.channel || 'all'}</span>
            </div>
            {rule.condition_value && (
              <div>
                <span className="text-[10px] font-semibold text-gray-400 uppercase block mb-1">Condition</span>
                <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">{rule.condition_value}</span>
              </div>
            )}
            <div>
              <span className="text-[10px] font-semibold text-gray-400 uppercase block mb-1">Assigned To</span>
              <div className="flex items-center gap-1">
                {assignedUsers.length === 0 ? (
                  <span className="text-xs text-gray-400">All reps</span>
                ) : (
                  assignedUsers.map(u => (
                    <span key={u.id} className="text-xs bg-[#5C6CF7]/10 text-[#5C6CF7] px-2 py-0.5 rounded-full font-medium">
                      {u.full_name?.split(' ')[0]}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onToggle(rule)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
            {rule.is_active
              ? <ToggleRight className="w-5 h-5 text-[#5C6CF7]" />
              : <ToggleLeft className="w-5 h-5" />
            }
          </button>
          <button onClick={() => onEdit(rule)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={() => { if (window.confirm('Delete this rule?')) onDelete(rule.id); }} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function RuleForm({ users, onSave, onCancel, initial }) {
  const [form, setForm] = useState(initial || {
    name: '', type: 'round_robin', channel: 'all', condition_value: '', assigned_to_ids: [], is_active: true,
  });

  const toggleUser = (id) => {
    setForm(f => ({
      ...f,
      assigned_to_ids: f.assigned_to_ids.includes(id)
        ? f.assigned_to_ids.filter(u => u !== id)
        : [...f.assigned_to_ids, id]
    }));
  };

  const submit = () => {
    if (!form.name) return;
    const names = users.filter(u => form.assigned_to_ids.includes(u.id)).map(u => u.full_name);
    onSave({ ...form, assigned_to_names: names });
  };

  return (
    <div className="bg-white rounded-2xl border border-[#5C6CF7]/20 p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900 text-sm mb-4">{initial ? 'Edit Rule' : 'New Assignment Rule'}</h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Rule Name *</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Round Robin for Email"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Assignment Type</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7] bg-white"
            >
              {RULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Apply to Channel</label>
            <select
              value={form.channel}
              onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7] bg-white"
            >
              {CHANNELS.map(c => <option key={c} value={c} className="capitalize">{c === 'all' ? 'All Channels' : c}</option>)}
            </select>
          </div>
        </div>

        {(form.type === 'lead_source' || form.type === 'territory') && (
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              {form.type === 'lead_source' ? 'Lead Source Value' : 'Territory Value'}
            </label>
            <input
              value={form.condition_value}
              onChange={e => setForm(f => ({ ...f, condition_value: e.target.value }))}
              placeholder={form.type === 'territory' ? 'e.g. APAC, Europe' : 'e.g. whatsapp, referral'}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-gray-600 mb-2 block">Assign To (empty = all reps)</label>
          <div className="flex flex-wrap gap-2">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => toggleUser(u.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all
                  ${form.assigned_to_ids.includes(u.id)
                    ? 'bg-[#5C6CF7] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {u.full_name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
          <button onClick={submit} disabled={!form.name} className="px-4 py-2 bg-[#5C6CF7] text-white text-sm font-semibold rounded-xl hover:bg-[#4A5CE6] transition-colors disabled:opacity-50 flex items-center gap-2">
            <Check className="w-3.5 h-3.5" />
            {initial ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Rules() {
  const user = MOCK_USER;
  const [rules, setRules] = useState([...MOCK_RULES]);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const handleSave = (formData) => {
    if (editingRule) {
      setRules(prev => prev.map(r => r.id === editingRule.id ? { ...r, ...formData } : r));
      setEditingRule(null);
    } else {
      const created = { ...formData, id: genId('rule'), priority_order: rules.length, round_robin_index: 0, created_date: new Date().toISOString() };
      setRules(prev => [...prev, created]);
    }
    setShowForm(false);
  };

  const handleToggle = (rule) => {
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
  };

  const handleDelete = (id) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setShowForm(true);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F5F7]">
      <NavRail user={user} />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Assignment Rules</h1>
              <p className="text-sm text-gray-500 mt-1">Auto-assign conversations to your sales reps</p>
            </div>
            <button
              onClick={() => { setEditingRule(null); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#5C6CF7] text-white text-sm font-semibold rounded-xl hover:bg-[#4A5CE6] transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Rule
            </button>
          </div>

          <div className="bg-[#5C6CF7]/5 border border-[#5C6CF7]/15 rounded-2xl p-4 mb-6">
            <p className="text-sm text-[#5C6CF7] font-medium mb-1">How rules work</p>
            <p className="text-xs text-gray-500">Rules are evaluated in order. When a new conversation arrives, the first matching active rule determines who gets assigned. Round Robin distributes evenly across selected reps.</p>
          </div>

          <AnimatePresence mode="popLayout">
            {showForm && (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4"
              >
                <RuleForm
                  users={MOCK_USERS}
                  onSave={handleSave}
                  onCancel={() => { setShowForm(false); setEditingRule(null); }}
                  initial={editingRule}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {rules.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center border border-gray-100 shadow-sm">
              <Zap className="w-10 h-10 text-gray-200 mx-auto mb-4" />
              <p className="text-sm font-medium text-gray-500">No rules yet</p>
              <p className="text-xs text-gray-400 mt-1 mb-5">Create your first rule to auto-assign conversations</p>
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-[#5C6CF7] text-white text-sm font-semibold rounded-xl hover:bg-[#4A5CE6] transition-colors"
              >
                Create First Rule
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {rules.map((rule, i) => (
                  <div key={rule.id} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center mt-4 shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <RuleCard
                        rule={rule}
                        users={MOCK_USERS}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                      />
                    </div>
                  </div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}