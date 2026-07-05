import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { createManualConversation } from '@/lib/channels';

const CHANNELS = ['whatsapp', 'website'];

export default function NewConvModal({ open, onClose, onCreated, workspaceId }) {
  const { user } = useNyasaAuth();
  const wId = workspaceId || user?.id;
  const [form, setForm] = useState({ contact_name: '', contact_email: '', subject: '', channel: 'whatsapp', priority: 'normal' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.contact_name.trim() || !form.subject.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const conv = await createManualConversation(wId, {
        ...form,
        assigned_to: user?.id || null,
        assigned_to_name: user?.full_name || user?.email || null,
      });
      onCreated(conv);
      setForm({ contact_name: '', contact_email: '', subject: '', channel: 'whatsapp', priority: 'normal' });
      onClose();
    } catch (e) {
      console.error('[NewConvModal] create error:', e);
      setError('Could not create conversation. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
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
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={create} disabled={!form.contact_name.trim() || !form.subject.trim() || creating}
            className="w-full py-2.5 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Start Conversation'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
