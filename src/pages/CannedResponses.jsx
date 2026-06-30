import { useState } from 'react';
import { Plus, Edit3, Trash2, BookOpen } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { store, genId } from '@/lib/store';

export default function CannedResponses() {
  const [canned, setCanned] = useState(store.getCanned());
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', shortcut: '', body: '' });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const startNew = () => { setForm({ title: '', shortcut: '', body: '' }); setEditing('new'); };
  const startEdit = (cr) => { setForm({ ...cr }); setEditing(cr.id); };

  const save = () => {
    if (!form.title.trim() || !form.body.trim()) return;
    if (editing === 'new') {
      store.addCanned({ id: genId('cr'), ...form });
    } else {
      store.updateCanned(editing, form);
    }
    setCanned(store.getCanned());
    setEditing(null);
  };

  const del = (id) => { store.deleteCanned(id); setCanned(store.getCanned()); };

  const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[#0D1418]">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Canned Responses</h1>
              <p className="text-xs md:text-sm text-gray-400 mt-1">Type <span className="font-mono text-[#25D366]">/shortcut</span> in chat or click <span className="text-[#25D366] font-semibold">⚡ Canned</span> to insert</p>
            </div>
            <button onClick={startNew}
              className="flex items-center gap-2 px-3 md:px-4 py-2 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors shrink-0">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Response</span><span className="sm:hidden">New</span>
            </button>
          </div>

          {editing && (
            <div className="bg-[#202C33] rounded-2xl border border-[#25D366]/40 p-5 mb-6 space-y-3">
              <h3 className="font-semibold text-white text-sm">{editing === 'new' ? 'New Canned Response' : 'Edit Response'}</h3>
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Title" value={form.title} onChange={e => set('title', e.target.value)} />
                <input className={inputCls} placeholder="Shortcut (e.g. /hi)" value={form.shortcut} onChange={e => set('shortcut', e.target.value)} />
              </div>
              <textarea rows={4} className={`${inputCls} resize-none`}
                placeholder="Response body… use {{name}} for contact name"
                value={form.body} onChange={e => set('body', e.target.value)} />
              <div className="flex gap-3">
                <button onClick={() => setEditing(null)} className="px-4 py-2 border border-white/10 text-gray-300 rounded-xl text-sm">Cancel</button>
                <button onClick={save} disabled={!form.title.trim() || !form.body.trim()}
                  className="px-6 py-2 bg-[#25D366] text-white font-semibold rounded-xl text-sm hover:bg-[#20BA5A] transition-colors disabled:opacity-40">
                  Save
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {canned.length === 0 && !editing && (
              <div className="flex flex-col items-center py-20 text-center">
                <BookOpen className="w-12 h-12 text-gray-700 mb-4" />
                <p className="text-gray-500">No canned responses yet</p>
              </div>
            )}
            {canned.map(cr => (
              <div key={cr.id} className="bg-[#202C33] rounded-2xl border border-white/10 px-5 py-4 flex items-start gap-4 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-mono text-[#25D366] bg-[#25D366]/10 px-2 py-0.5 rounded">{cr.shortcut}</span>
                    <span className="text-sm font-semibold text-white">{cr.title}</span>
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed">{cr.body}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => startEdit(cr)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => del(cr.id)} className="p-1.5 hover:bg-red-900/30 rounded-lg text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}