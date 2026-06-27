import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { store, genId } from '@/lib/store';

const CHANNELS = ['whatsapp', 'messenger', 'email', 'website'];

export default function NewConvModal({ open, onClose, onCreated, user }) {
  const [form, setForm] = useState({ contact_name: '', contact_email: '', subject: '', channel: 'whatsapp', priority: 'normal' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const create = () => {
    if (!form.contact_name.trim() || !form.subject.trim()) return;
    const conv = {
      id: genId('conv'), ...form, contact_id: null, status: 'open',
      assigned_to: user?.id || null, assigned_to_name: user?.full_name || null,
      tags: [], last_message_preview: '', last_message_at: new Date().toISOString(),
      unread: false, deal_stage: 'New Lead', is_reminder_active: false,
      sla_breach_at: new Date(Date.now() + 4 * 3600000).toISOString(),
      created_date: new Date().toISOString(), updated_date: new Date().toISOString(),
    };
    store.addConversation(conv);
    onCreated(conv);
    setForm({ contact_name: '', contact_email: '', subject: '', channel: 'whatsapp', priority: 'normal' });
    onClose();
  };

  const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#233138] border border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">New Conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <input className={inputCls} placeholder="Contact name *" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
          <input className={inputCls} placeholder="Contact email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
          <input className={inputCls} placeholder="Subject *" value={form.subject} onChange={e => set('subject', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Channel</label>
              <select value={form.channel} onChange={e => set('channel', e.target.value)} className="w-full bg-[#2A3942] text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none border-0">
                {CHANNELS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className="w-full bg-[#2A3942] text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none border-0">
                {['low','normal','high','urgent'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <button onClick={create} disabled={!form.contact_name.trim() || !form.subject.trim()}
            className="w-full py-2.5 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors disabled:opacity-40">
            Start Conversation
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}