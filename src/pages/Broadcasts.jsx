import { useState, useEffect } from 'react';
import { Plus, Send, Trash2, X, Megaphone, Loader2, AlertTriangle } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import ChannelBadge, { CHANNELS } from '@/components/ChannelBadge';
import Avatar from '@/components/Avatar';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { getContacts, getBroadcasts, createBroadcast, sendBroadcast, deleteBroadcast, getWhatsAppTemplates } from '@/lib/channels';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STATUS_COLORS = { sent: 'text-green-400 bg-green-900/20', draft: 'text-yellow-400 bg-yellow-900/20', sending: 'text-blue-400 bg-blue-900/20' };

function BroadcastCard({ bc, contacts, sending, onDelete, onSend }) {
  const audience = contacts.filter(c => (bc.audience || []).includes(c.id));
  const isSending = sending === bc.id;
  return (
    <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-white text-sm">{bc.name}</h3>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[bc.status] || 'text-gray-400 bg-white/5'}`}>{bc.status}</span>
          </div>
          <div className="flex items-center gap-2">
            <ChannelBadge channel={bc.channel} showLabel />
            <span className="text-xs text-gray-500">{(bc.audience || []).length} recipients</span>
          </div>
        </div>
        <button onClick={() => onDelete(bc.id)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-600 hover:text-red-400 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-400 bg-[#2A3942] rounded-xl px-4 py-3 mb-3 leading-relaxed">{bc.message}</p>
      <div className="flex items-center gap-2 mb-3">
        {audience.slice(0, 5).map(c => <Avatar key={c.id} name={c.full_name} size="xs" />)}
        {audience.length > 5 && <span className="text-xs text-gray-500">+{audience.length - 5}</span>}
      </div>
      {bc.status === 'sent' ? (
        <div className="flex gap-2">
          <div className="flex-1 text-center bg-[#2A3942] rounded-xl py-2.5">
            <p className="text-lg font-bold text-[#25D366]">{bc.sent_count}</p>
            <p className="text-[10px] text-gray-500">Accepted by API</p>
          </div>
          {bc.failed_count > 0 && (
            <div className="flex-1 text-center bg-red-900/20 rounded-xl py-2.5">
              <p className="text-lg font-bold text-red-400">{bc.failed_count}</p>
              <p className="text-[10px] text-gray-500">Failed</p>
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => onSend(bc.id)} disabled={isSending}
          className="w-full py-2 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
          {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send Broadcast</>}
        </button>
      )}
    </div>
  );
}

export default function Broadcasts() {
  useDocumentTitle('Broadcasts');
  const { user, profile } = useNyasaAuth();
  const workspaceId = profile?.workspace_id || user?.id;

  const [broadcasts, setBroadcasts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [form, setForm] = useState({ name: '', channel: 'whatsapp', message: '', audience: [], template_name: '', template_language: 'en_US' });
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const load = async () => {
    if (!workspaceId) { setLoading(false); return; }
    try {
      const [bcs, cts] = await Promise.all([getBroadcasts(workspaceId), getContacts(workspaceId)]);
      setBroadcasts(bcs);
      setContacts(cts);
    } catch (e) {
      console.error('[Broadcasts] load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceId]);

  // WhatsApp broadcasts must use a Meta-approved template for contacts
  // outside the 24h customer-service window -- fetch the workspace's
  // approved templates whenever the composer's channel is WhatsApp.
  useEffect(() => {
    if (!workspaceId || form.channel !== 'whatsapp' || !showNew) { return; }
    setTemplatesLoading(true);
    getWhatsAppTemplates(workspaceId)
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [workspaceId, form.channel, showNew]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleAudience = (id) => setForm(f => ({ ...f, audience: f.audience.includes(id) ? f.audience.filter(a => a !== id) : [...f.audience, id] }));

  const create = async () => {
    if (!form.name.trim() || !form.message.trim() || !form.audience.length || creating) return;
    setCreating(true);
    try {
      await createBroadcast(workspaceId, form);
      setShowNew(false);
      setForm({ name: '', channel: 'whatsapp', message: '', audience: [], template_name: '', template_language: 'en_US' });
      await load();
    } catch (e) {
      console.error('[Broadcasts] create error:', e);
    } finally {
      setCreating(false);
    }
  };

  // Grab the BODY component's text off an approved template (what the
  // customer actually receives) so we can preview it and detect {{1}}.
  const templateBodyText = (t) => t?.components?.find(c => c.type === 'BODY')?.text || '';

  const selectTemplate = (key) => {
    if (!key) { set('template_name', ''); set('message', ''); return; }
    const [name, language] = key.split('|');
    const t = templates.find(x => x.name === name && x.language === language);
    set('template_name', name);
    set('template_language', language);
    set('message', templateBodyText(t));
  };

  const send = async (id) => {
    setSendingId(id);
    try {
      await sendBroadcast(workspaceId, id);
      await load();
    } catch (e) {
      console.error('[Broadcasts] send error:', e);
    } finally {
      setSendingId(null);
    }
  };

  const del = async (id) => {
    try {
      await deleteBroadcast(id);
      setBroadcasts(prev => prev.filter(b => b.id !== id));
    } catch (e) {
      console.error('[Broadcasts] delete error:', e);
    }
  };

  const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[#0D1418]">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white">Broadcasts</h1>
              <p className="text-sm text-gray-500 mt-1">Send messages to multiple contacts at once</p>
            </div>
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors">
              <Plus className="w-4 h-4" /> New Broadcast
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-[#25D366] animate-spin" />
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Megaphone className="w-12 h-12 text-gray-700 mb-4" />
              <p className="text-gray-500">No broadcasts yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {broadcasts.map(bc => (
                <BroadcastCard key={bc.id} bc={bc} contacts={contacts} sending={sendingId} onDelete={del} onSend={send} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowNew(false)} />
          <div className="relative bg-[#202C33] rounded-2xl border border-white/10 p-6 w-[480px] max-h-[90vh] overflow-y-auto scrollbar-thin space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">New Broadcast</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-200"><X className="w-4 h-4" /></button>
            </div>
            <input className={inputCls} placeholder="Broadcast name *" value={form.name} onChange={e => set('name', e.target.value)} />
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Channel</label>
              <select value={form.channel} onChange={e => { set('channel', e.target.value); set('template_name', ''); }} className="w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border-0">
                {CHANNELS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>

            {form.channel === 'whatsapp' && (
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">
                  WhatsApp Template <span className="text-gray-600">(required unless every recipient messaged you in the last 24h)</span>
                </label>
                <select
                  value={form.template_name ? `${form.template_name}|${form.template_language}` : ''}
                  onChange={e => selectTemplate(e.target.value)}
                  className="w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border-0"
                >
                  <option value="">Free text (24h window only)</option>
                  {templatesLoading && <option disabled>Loading templates…</option>}
                  {templates.map(t => (
                    <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
                {!templatesLoading && templates.length === 0 && (
                  <p className="text-[11px] text-gray-600 mt-1.5">
                    No approved templates found. Create and submit one in Meta Business Manager first, or use Free text only for contacts who messaged you recently.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">
                Message <span className="text-gray-600">(use {'{{name}}'} for contact name)</span>
              </label>
              <textarea
                rows={4}
                className={`${inputCls} resize-none ${form.template_name ? 'opacity-70' : ''}`}
                placeholder="Hi {{name}}, …"
                value={form.message}
                readOnly={!!form.template_name}
                onChange={e => set('message', e.target.value)}
              />
              {form.channel === 'whatsapp' && !form.template_name && (
                <p className="text-[11px] text-amber-400 flex items-start gap-1.5 mt-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Free text only reaches contacts who messaged you within the last 24 hours — everyone else's message will be rejected by WhatsApp. Pick a template above to reach anyone.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Recipients ({form.audience.length} selected)</label>
              <div className="bg-[#2A3942] rounded-xl p-3 max-h-48 overflow-y-auto scrollbar-thin space-y-1">
                {contacts.length === 0 && <p className="text-xs text-gray-500 px-2 py-3 text-center">No contacts yet — add some in Contacts first.</p>}
                {contacts.map(c => (
                  <button key={c.id} onClick={() => toggleAudience(c.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${form.audience.includes(c.id) ? 'bg-[#25D366]/20' : 'hover:bg-white/10'}`}>
                    <Avatar name={c.full_name} size="xs" />
                    <span className="text-sm text-white text-left flex-1">{c.full_name}</span>
                    {form.audience.includes(c.id) && <span className="text-[#25D366] text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowNew(false)} className="flex-1 py-2.5 border border-white/10 text-gray-300 rounded-xl text-sm">Cancel</button>
              <button onClick={create} disabled={!form.name.trim() || !form.message.trim() || !form.audience.length || creating}
                className="flex-1 py-2.5 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
