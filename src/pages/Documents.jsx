import { useState, useEffect } from 'react';
import { FileText, Plus, X, Loader2, Trash2, Send, Download, ArrowRightLeft, Wallet, Search, Pencil, Upload } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useToast } from '@/components/ui/use-toast';
import {
  getDocSettings, saveDocSettings, listQuotations, listInvoices, createQuotation, updateQuotation,
  convertQuotationToInvoice, createInvoice, recordInvoicePayment, sendDocument, getQuotation, getInvoice,
  uploadChatMedia,
} from '@/lib/channels';

const inputCls = 'w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';
const labelCls = 'text-xs text-gray-500 mb-1 block';

const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
const INVOICE_STATUSES = ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'];
const STATUS_COLORS = {
  draft: 'bg-white/10 text-gray-400', sent: 'bg-blue-500/15 text-blue-400',
  accepted: 'bg-[#25D366]/15 text-[#25D366]', paid: 'bg-[#25D366]/15 text-[#25D366]',
  rejected: 'bg-red-500/15 text-red-400', expired: 'bg-red-500/15 text-red-400',
  cancelled: 'bg-red-500/15 text-red-400', partial: 'bg-amber-500/15 text-amber-400',
  overdue: 'bg-red-500/15 text-red-400',
};

function money(n, currency) {
  return (currency || '') + ' ' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const BLANK_ITEM = { description: '', quantity: 1, unit_price: 0 };
const BLANK_DOC_FORM = {
  customer_name: '', customer_business_name: '', customer_email: '', customer_phone: '', customer_address: '',
  duration: '', notes: '', discount_amount: 0, items: [{ ...BLANK_ITEM }],
};

export default function Documents() {
  const { toast } = useToast();
  useDocumentTitle('Quotes & Invoices');
  const { workspaceOwnerId, isWorkspaceAdmin } = useNyasaAuth();

  const [tab, setTab] = useState('quotations'); // quotations | invoices | settings
  const [quotations, setQuotations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null); // the doc object being edited, or null when creating
  const [form, setForm] = useState(BLANK_DOC_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sendTarget, setSendTarget] = useState(null); // { doc_type, id }
  const [paymentTarget, setPaymentTarget] = useState(null); // invoice id

  const load = async () => {
    if (!workspaceOwnerId) { setLoading(false); return; }
    try {
      const [q, i, s] = await Promise.all([
        listQuotations(workspaceOwnerId), listInvoices(workspaceOwnerId), getDocSettings(workspaceOwnerId),
      ]);
      setQuotations(q); setInvoices(i); setSettings(s);
    } catch (e) {
      console.error('[Documents] load error:', e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [workspaceOwnerId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setItem = (idx, k, v) => setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [k]: v } : it) }));
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...BLANK_ITEM }] }));
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const itemsTotal = form.items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);

  const create = async () => {
    if (!form.customer_name.trim() || saving) return;
    setSaving(true); setError('');
    try {
      const input = { ...form, items: form.items.filter(it => it.description.trim()) };
      if (!input.items.length) throw new Error('Add at least one item');
      if (editingDoc) {
        if (tab === 'invoices') await updateInvoice(workspaceOwnerId, editingDoc.id, input);
        else await updateQuotation(workspaceOwnerId, editingDoc.id, input);
      } else if (tab === 'quotations') {
        await createQuotation(workspaceOwnerId, input);
      } else {
        await createInvoice(workspaceOwnerId, input);
      }
      setShowCreate(false); setEditingDoc(null); setForm(BLANK_DOC_FORM);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (doc) => {
    setEditingDoc(doc);
    setForm({
      customer_name: doc.customer_name || '', customer_business_name: doc.customer_business_name || '',
      customer_email: doc.customer_email || '', customer_phone: doc.customer_phone || '',
      customer_address: doc.customer_address || '', duration: doc.duration || '', notes: doc.notes || '',
      discount_amount: doc.discount_amount || 0,
      items: (doc.items && doc.items.length ? doc.items : [{ ...BLANK_ITEM }]),
    });
    setError(''); setShowCreate(true);
  };

  const closeModal = () => { setShowCreate(false); setEditingDoc(null); setForm(BLANK_DOC_FORM); };

  // Editing after money has actually moved (paid invoice) or after a
  // quotation has already become a real invoice would be confusing --
  // everything else (draft/sent/accepted/rejected/expired/overdue/etc) is
  // still safe to correct (e.g. a typo in an item description or price).
  const isLocked = (doc) => (tab === 'invoices' && ['paid', 'cancelled'].includes(doc.status))
    || (tab === 'quotations' && !!doc.converted_to_invoice_id);

  const convert = async (id) => {
    try { await convertQuotationToInvoice(workspaceOwnerId, id); await load(); setTab('invoices'); }
    catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
  };

  const download = async (doc_type, id) => {
    try {
      const res = doc_type === 'invoice' ? await getInvoice(workspaceOwnerId, id) : await getQuotation(workspaceOwnerId, id);
      window.open(res.pdf_url, '_blank');
    } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
  };

  const list = tab === 'invoices' ? invoices : quotations;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--nyasa-surface-1)] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-[var(--nyasa-border)] flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-[#25D366]" /> Quotes & Invoices</h1>
            <p className="text-gray-500 text-xs mt-0.5">Create, send, and track quotations and invoices.</p>
          </div>
          {tab !== 'settings' && (
            <button onClick={() => { setEditingDoc(null); setForm(BLANK_DOC_FORM); setError(''); setShowCreate(true); }}
              className="flex items-center gap-1.5 bg-[#25D366] text-black text-sm font-semibold px-3.5 py-2 rounded-xl hover:bg-[#20b859] transition-colors">
              <Plus className="w-4 h-4" /> New {tab === 'invoices' ? 'Invoice' : 'Quotation'}
            </button>
          )}
        </div>

        <div className="flex gap-1 px-4 sm:px-6 pt-3">
          {[['quotations', 'Quotations'], ['invoices', 'Invoices'], ['settings', 'Settings']].map(([id, label]) => (
            (id !== 'settings' || isWorkspaceAdmin) && (
              <button key={id} onClick={() => setTab(id)}
                className={`text-sm font-medium px-3.5 py-2 rounded-lg transition-colors ${tab === id ? 'bg-[var(--nyasa-surface-2)] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {label}
              </button>
            )
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-16"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : tab === 'settings' ? (
            <DocSettingsForm workspaceId={workspaceOwnerId} settings={settings} onSaved={setSettings} />
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
              <FileText className="w-10 h-10 text-gray-700" />
              <p className="text-sm text-gray-500">No {tab} yet</p>
              <p className="text-xs text-gray-600">Create your first one to get started.</p>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {list.map(doc => (
                <div key={doc.id} className="bg-[var(--nyasa-surface-2)] rounded-xl p-4 flex flex-wrap items-center gap-3 border border-[var(--nyasa-border)]">
                  <div className="min-w-[160px] flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-semibold">{doc.number}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[doc.status] || 'bg-white/10 text-gray-400'}`}>{doc.status}</span>
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5">{doc.customer_name}{doc.customer_business_name ? ` · ${doc.customer_business_name}` : ''}</p>
                  </div>
                  <div className="text-right min-w-[100px]">
                    <p className="text-white text-sm font-semibold">{money(doc.total, doc.currency)}</p>
                    {tab === 'invoices' && Number(doc.amount_paid) > 0 && doc.status !== 'paid' && (
                      <p className="text-amber-400 text-[11px]">Paid {money(doc.amount_paid, doc.currency)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!isLocked(doc) && (
                      <button title="Edit" onClick={() => startEdit(doc)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300"><Pencil className="w-3.5 h-3.5" /></button>
                    )}
                    <button title="Download PDF" onClick={() => download(tab === 'invoices' ? 'invoice' : 'quotation', doc.id)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300"><Download className="w-3.5 h-3.5" /></button>
                    <button title="Send" onClick={() => setSendTarget({ doc_type: tab === 'invoices' ? 'invoice' : 'quotation', id: doc.id })}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300"><Send className="w-3.5 h-3.5" /></button>
                    {tab === 'quotations' && !doc.converted_to_invoice_id && (
                      <button title="Convert to invoice" onClick={() => convert(doc.id)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300"><ArrowRightLeft className="w-3.5 h-3.5" /></button>
                    )}
                    {tab === 'invoices' && doc.status !== 'paid' && doc.status !== 'cancelled' && (
                      <button title="Record payment" onClick={() => setPaymentTarget(doc)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300"><Wallet className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-[var(--nyasa-surface-1)] rounded-2xl border border-[var(--nyasa-border)] w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">{editingDoc ? 'Edit' : 'New'} {tab === 'invoices' ? 'Invoice' : 'Quotation'} {editingDoc ? `· ${editingDoc.number}` : ''}</h2>
              <button onClick={closeModal}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Customer name *</label><input className={inputCls} value={form.customer_name} onChange={e => set('customer_name', e.target.value)} /></div>
                <div><label className={labelCls}>Customer business</label><input className={inputCls} value={form.customer_business_name} onChange={e => set('customer_business_name', e.target.value)} /></div>
                <div><label className={labelCls}>Email</label><input className={inputCls} value={form.customer_email} onChange={e => set('customer_email', e.target.value)} /></div>
                <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.customer_phone} onChange={e => set('customer_phone', e.target.value)} /></div>
              </div>
              <div><label className={labelCls}>Address</label><input className={inputCls} value={form.customer_address} onChange={e => set('customer_address', e.target.value)} /></div>
              <div><label className={labelCls}>Duration / period (optional)</label><input className={inputCls} placeholder="e.g. 3-month campaign" value={form.duration} onChange={e => set('duration', e.target.value)} /></div>

              <div>
                <label className={labelCls}>Items</label>
                <div className="space-y-2">
                  {form.items.map((it, idx) => (
                    <div key={idx} className="rounded-xl bg-white/[0.03] border border-[var(--nyasa-border)] p-2 sm:bg-transparent sm:border-0 sm:p-0">
                      {/* Description gets its own full-width row -- on narrow phones,
                          cramming it into one row with Qty/Price/delete left it a
                          near-unusable sliver a few px wide. From sm: up (tablet+)
                          there's enough width to go back to a single row. */}
                      <input className={inputCls + ' w-full mb-2'} placeholder="Description" value={it.description} onChange={e => setItem(idx, 'description', e.target.value)} />
                      <div className="grid grid-cols-[56px_1fr_auto] gap-2 items-center">
                        <div>
                          <label className="text-[10px] text-gray-500 mb-0.5 block">Qty</label>
                          <input className={inputCls + ' w-full'} type="number" min="0" placeholder="1" value={it.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 mb-0.5 block">Unit price</label>
                          <input className={inputCls + ' w-full'} type="number" min="0" placeholder="0.00" value={it.unit_price} onChange={e => setItem(idx, 'unit_price', e.target.value)} />
                        </div>
                        <button onClick={() => removeItem(idx)} className="p-2 text-gray-500 hover:text-red-400 shrink-0 mt-4"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={addItem} className="text-[#25D366] text-xs font-semibold mt-2">+ Add item</button>
                <p className="text-right text-white text-sm font-semibold mt-2">Subtotal: {money(itemsTotal, settings?.currency)}</p>
              </div>

              <div><label className={labelCls}>Notes</label><textarea className={inputCls} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>

              <button onClick={create} disabled={saving}
                className="w-full bg-[#25D366] text-black text-sm font-semibold py-2.5 rounded-xl hover:bg-[#20b859] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editingDoc ? 'Save changes' : `Create ${tab === 'invoices' ? 'Invoice' : 'Quotation'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {sendTarget && (
        <SendModal workspaceId={workspaceOwnerId} target={sendTarget} onClose={() => setSendTarget(null)} onSent={load} />
      )}
      {paymentTarget && (
        <PaymentModal workspaceId={workspaceOwnerId} invoice={paymentTarget} onClose={() => setPaymentTarget(null)} onRecorded={load} />
      )}
    </div>
  );
}

function SendModal({ workspaceId, target, onClose, onSent }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(null); // conversation id being sent
  const [error, setError] = useState('');

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('conversations')
        .select('id, channel, contacts(name, phone)')
        .eq('workspace_id', workspaceId)
        .limit(15);
      const filtered = (data || []).filter(c =>
        (c.contacts?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.contacts?.phone || '').includes(search)
      );
      setResults(filtered);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search, workspaceId]);

  const send = async (conv, via) => {
    setSending(conv.id); setError('');
    try {
      await sendDocument(workspaceId, { doc_type: target.doc_type, id: target.id, conversation_id: conv.id, via });
      onSent(); onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--nyasa-surface-1)] rounded-2xl border border-[var(--nyasa-border)] w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-bold text-sm">Send document</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-3" />
          <input className={inputCls + ' pl-8'} placeholder="Search conversation by name or phone…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {searching && <p className="text-gray-500 text-xs">Searching…</p>}
          {!searching && search && results.length === 0 && <p className="text-gray-500 text-xs">No matching conversations.</p>}
          {results.map(c => (
            <div key={c.id} className="flex items-center justify-between bg-[var(--nyasa-surface-2)] rounded-lg px-3 py-2">
              <div>
                <p className="text-white text-sm">{c.contacts?.name || 'Unknown'}</p>
                <p className="text-gray-500 text-[11px] capitalize">{c.channel}{c.contacts?.phone ? ` · ${c.contacts.phone}` : ''}</p>
              </div>
              <button disabled={sending === c.id} onClick={() => send(c, c.channel === 'website' ? 'chat' : c.channel)}
                className="text-[#25D366] text-xs font-semibold flex items-center gap-1 disabled:opacity-50">
                {sending === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PaymentModal({ workspaceId, invoice, onClose, onRecorded }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const balance = Number(invoice.total) - Number(invoice.amount_paid);

  const submit = async () => {
    if (!amount || saving) return;
    setSaving(true); setError('');
    try {
      await recordInvoicePayment(workspaceId, invoice.id, { amount: Number(amount), method, reference });
      onRecorded(); onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--nyasa-surface-1)] rounded-2xl border border-[var(--nyasa-border)] w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-bold text-sm">Record payment · {invoice.number}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <p className="text-gray-400 text-xs mb-3">Balance due: {money(balance, invoice.currency)}</p>
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
        <div className="space-y-3">
          <div><label className={labelCls}>Amount *</label><input type="number" className={inputCls} value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div>
            <label className={labelCls}>Method</label>
            <select className={inputCls} value={method} onChange={e => setMethod(e.target.value)}>
              {['cash', 'bank_transfer', 'mobile_money', 'card', 'other'].map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Reference (optional)</label><input className={inputCls} value={reference} onChange={e => setReference(e.target.value)} /></div>
          <button onClick={submit} disabled={saving}
            className="w-full bg-[#25D366] text-black text-sm font-semibold py-2.5 rounded-xl hover:bg-[#20b859] disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Record payment
          </button>
        </div>
      </div>
    </div>
  );
}

function DocSettingsForm({ workspaceId, settings, onSaved }) {
  const [form, setForm] = useState(settings || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  useEffect(() => { setForm(settings || {}); }, [settings]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoUploading(true);
    try {
      const url = await uploadChatMedia(workspaceId, file, 'logo');
      set('logo_url', url);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'Logo upload failed: ' + err.message });
    } finally {
      setLogoUploading(false);
    }
  };

  const addBank = () => set('bank_accounts', [...(form.bank_accounts || []), { bank_name: '', account_name: '', account_number: '', branch: '' }]);
  const setBank = (idx, k, v) => set('bank_accounts', (form.bank_accounts || []).map((b, i) => i === idx ? { ...b, [k]: v } : b));
  const removeBank = (idx) => set('bank_accounts', (form.bank_accounts || []).filter((_, i) => i !== idx));

  const addMomo = () => set('mobile_money_accounts', [...(form.mobile_money_accounts || []), { provider: '', account_name: '', number: '' }]);
  const setMomo = (idx, k, v) => set('mobile_money_accounts', (form.mobile_money_accounts || []).map((m, i) => i === idx ? { ...m, [k]: v } : m));
  const removeMomo = (idx) => set('mobile_money_accounts', (form.mobile_money_accounts || []).filter((_, i) => i !== idx));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await saveDocSettings(workspaceId, form);
      onSaved(updated); setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-[var(--nyasa-surface-2)] rounded-xl p-4 space-y-3">
        <h3 className="text-white text-sm font-semibold">Company details</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Company name</label><input className={inputCls} value={form.company_name || ''} onChange={e => set('company_name', e.target.value)} /></div>
          <div><label className={labelCls}>Currency</label><input className={inputCls} value={form.currency || ''} onChange={e => set('currency', e.target.value)} /></div>
          <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
          <div><label className={labelCls}>Email</label><input className={inputCls} value={form.email || ''} onChange={e => set('email', e.target.value)} /></div>
          <div><label className={labelCls}>Website</label><input className={inputCls} value={form.website || ''} onChange={e => set('website', e.target.value)} /></div>
          <div><label className={labelCls}>Brand color</label><input type="color" className="w-full h-10 rounded-xl bg-[var(--nyasa-surface-4)] border-0" value={form.brand_color || '#25D366'} onChange={e => set('brand_color', e.target.value)} /></div>
        </div>
        <div><label className={labelCls}>Address</label><input className={inputCls} value={form.address || ''} onChange={e => set('address', e.target.value)} /></div>
        <div>
          <label className={labelCls}>Logo</label>
          <div className="flex items-center gap-2">
            <input className={inputCls} placeholder="Logo URL, or upload one" value={form.logo_url || ''} onChange={e => set('logo_url', e.target.value)} />
            <label className="shrink-0 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 cursor-pointer" title="Upload logo image">
              {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={logoUploading} />
            </label>
          </div>
          {form.logo_url && <img src={form.logo_url} alt="Logo preview" className="h-10 mt-2 rounded bg-white/5 object-contain" />}
        </div>
        <div><label className={labelCls}>Signature image URL</label><input className={inputCls} value={form.signature_url || ''} onChange={e => set('signature_url', e.target.value)} /></div>
      </div>

      <div className="bg-[var(--nyasa-surface-2)] rounded-xl p-4 space-y-3">
        <h3 className="text-white text-sm font-semibold">Numbering & defaults</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Quotation prefix</label><input className={inputCls} value={form.quotation_prefix || ''} onChange={e => set('quotation_prefix', e.target.value)} /></div>
          <div><label className={labelCls}>Invoice prefix</label><input className={inputCls} value={form.invoice_prefix || ''} onChange={e => set('invoice_prefix', e.target.value)} /></div>
          <div><label className={labelCls}>Next quotation number</label><input type="number" min="1" className={inputCls} value={form.next_quotation_number ?? ''} onChange={e => set('next_quotation_number', e.target.value)} /></div>
          <div><label className={labelCls}>Next invoice number</label><input type="number" min="1" className={inputCls} value={form.next_invoice_number ?? ''} onChange={e => set('next_invoice_number', e.target.value)} /></div>
          <div><label className={labelCls}>Quotation validity (days)</label><input type="number" className={inputCls} value={form.default_validity_days ?? ''} onChange={e => set('default_validity_days', e.target.value)} /></div>
          <div><label className={labelCls}>Invoice due (days)</label><input type="number" className={inputCls} value={form.default_due_days ?? ''} onChange={e => set('default_due_days', e.target.value)} /></div>
        </div>
        <p className="text-gray-600 text-[11px]">Changes the number the NEXT document will get (e.g. set to 100 to start at #0100) -- doesn't renumber ones already issued.</p>
      </div>

      <div className="bg-[var(--nyasa-surface-2)] rounded-xl p-4 space-y-3">
        <h3 className="text-white text-sm font-semibold">Tax</h3>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={!!form.tax_enabled} onChange={e => set('tax_enabled', e.target.checked)} /> Enable tax on documents
        </label>
        {form.tax_enabled && (
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelCls}>Label</label><input className={inputCls} value={form.tax_label || ''} onChange={e => set('tax_label', e.target.value)} /></div>
            <div><label className={labelCls}>Rate %</label><input type="number" className={inputCls} value={form.tax_rate_percent ?? ''} onChange={e => set('tax_rate_percent', e.target.value)} /></div>
            <div><label className={labelCls}>Tax number</label><input className={inputCls} value={form.tax_number || ''} onChange={e => set('tax_number', e.target.value)} /></div>
          </div>
        )}
      </div>

      <div className="bg-[var(--nyasa-surface-2)] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white text-sm font-semibold">Bank accounts</h3>
          <button onClick={addBank} className="text-[#25D366] text-xs font-semibold">+ Add</button>
        </div>
        {(form.bank_accounts || []).map((b, idx) => (
          <div key={idx} className="grid grid-cols-4 gap-2 items-center">
            <input className={inputCls} placeholder="Bank" value={b.bank_name} onChange={e => setBank(idx, 'bank_name', e.target.value)} />
            <input className={inputCls} placeholder="Account name" value={b.account_name} onChange={e => setBank(idx, 'account_name', e.target.value)} />
            <input className={inputCls} placeholder="Account #" value={b.account_number} onChange={e => setBank(idx, 'account_number', e.target.value)} />
            <div className="flex gap-1">
              <input className={inputCls} placeholder="Branch" value={b.branch} onChange={e => setBank(idx, 'branch', e.target.value)} />
              <button onClick={() => removeBank(idx)} className="text-gray-500 hover:text-red-400 px-1"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[var(--nyasa-surface-2)] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white text-sm font-semibold">Mobile money accounts</h3>
          <button onClick={addMomo} className="text-[#25D366] text-xs font-semibold">+ Add</button>
        </div>
        {(form.mobile_money_accounts || []).map((m, idx) => (
          <div key={idx} className="grid grid-cols-3 gap-2 items-center">
            <input className={inputCls} placeholder="Provider (e.g. Airtel Money)" value={m.provider} onChange={e => setMomo(idx, 'provider', e.target.value)} />
            <input className={inputCls} placeholder="Account name" value={m.account_name} onChange={e => setMomo(idx, 'account_name', e.target.value)} />
            <div className="flex gap-1">
              <input className={inputCls} placeholder="Number" value={m.number} onChange={e => setMomo(idx, 'number', e.target.value)} />
              <button onClick={() => removeMomo(idx)} className="text-gray-500 hover:text-red-400 px-1"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[var(--nyasa-surface-2)] rounded-xl p-4 space-y-3">
        <h3 className="text-white text-sm font-semibold">Payment instructions & terms</h3>
        <div><label className={labelCls}>Default payment instructions</label><textarea className={inputCls} rows={2} value={form.default_payment_instructions || ''} onChange={e => set('default_payment_instructions', e.target.value)} /></div>
        <div><label className={labelCls}>Terms & conditions</label><textarea className={inputCls} rows={3} value={form.default_terms || ''} onChange={e => set('default_terms', e.target.value)} /></div>
        <div><label className={labelCls}>Footer text</label><input className={inputCls} value={form.footer_text || ''} onChange={e => set('footer_text', e.target.value)} /></div>
      </div>

      <button onClick={save} disabled={saving}
        className="bg-[#25D366] text-black text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#20b859] disabled:opacity-50 flex items-center gap-2">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />} {saved ? 'Saved!' : 'Save settings'}
      </button>
    </div>
  );
}
