/**
 * PhoneContactSync.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * WhatsApp-style phone contact sync for Nyasadesk.
 *
 * Three sync paths:
 *   1. Contact Picker API  — native phone book on Android Chrome (best UX)
 *   2. CSV import          — for any device / desktop
 *   3. Manual entry        — already on Contacts page
 *
 * After syncing, contacts are matched against incoming WhatsApp numbers so
 * unknown senders get a real name in the inbox automatically.
 */

import { useState, useEffect } from 'react';
import {
  Smartphone, Upload, RefreshCw, Check, X, Loader2,
  Users, AlertCircle, ChevronRight, Info,
} from 'lucide-react';
import { syncPhoneContacts, importContactsCSV } from '@/lib/channels';
import { useNyasaAuth } from '@/lib/NyasaAuth';

/* ── Detect Contact Picker API availability ─────────────────────────── */
function hasContactPickerAPI() {
  return typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    'ContactsManager' in window;
}

/* ── Small toast helper ─────────────────────────────────────────────── */
function SyncToast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 4000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl text-sm font-medium
      ${type === 'success' ? 'bg-[#25D366] text-white' : type === 'warn' ? 'bg-yellow-500 text-white' : 'bg-red-500 text-white'}`}>
      {type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      {msg}
    </div>
  );
}

/* ── CSV parser ─────────────────────────────────────────────────────── */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  return lines.slice(1).map(l => {
    const vals = l.split(',').map(v => v.trim().replace(/"/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return {
      full_name: obj.full_name || obj.name || obj['contact name'] || '',
      phone:     obj.phone || obj['phone number'] || obj.mobile || obj.tel || '',
      email:     obj.email || '',
      company:   obj.company || obj.organization || '',
    };
  }).filter(r => r.full_name || r.phone);
}

/* ── Main PhoneContactSync component ───────────────────────────────── */
export default function PhoneContactSync({ onSynced, compact = false }) {
  const { user, profile } = useNyasaAuth();
  const workspaceId = profile?.workspace_id || user?.id;

  const [state, setState]       = useState('idle'); // idle | picking | syncing | done | error
  const [result, setResult]     = useState(null);   // { added, skipped }
  const [toast, setToast]       = useState(null);
  const [csvPreview, setCsvPrev]= useState(null);
  const [csvFile, setCsvFile]   = useState(null);
  const [showGuide, setGuide]   = useState(false);
  const canUsePicker = hasContactPickerAPI();

  /* ── Contact Picker (Android Chrome) ── */
  const handlePickerSync = async () => {
    setState('picking');
    try {
      // Dynamic import to avoid crash on unsupported browsers
      const { pickPhoneContacts, syncPhoneContacts: sync } = await import('@/lib/channels');
      const picked = await pickPhoneContacts();
      if (!picked.length) { setState('idle'); return; }
      setState('syncing');
      const res = await sync(workspaceId, picked);
      setResult(res);
      setState('done');
      setToast({ msg: `${res.added} new contact${res.added !== 1 ? 's' : ''} synced, ${res.skipped} already saved`, type: 'success' });
      onSynced?.();
    } catch (e) {
      setState('error');
      setToast({ msg: e.message || 'Sync failed', type: 'error' });
      setTimeout(() => setState('idle'), 2000);
    }
  };

  /* ── CSV sync ── */
  const handleCSVFile = (file) => {
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result);
      setCsvPrev(parsed);
    };
    reader.readAsText(file);
  };

  const handleCSVSync = async () => {
    if (!csvPreview?.length) return;
    setState('syncing');
    try {
      const { syncPhoneContacts: sync } = await import('@/lib/channels');
      const res = await sync(workspaceId, csvPreview);
      setResult(res);
      setState('done');
      setCsvPrev(null);
      setCsvFile(null);
      setToast({ msg: `${res.added} new contact${res.added !== 1 ? 's' : ''} synced from CSV`, type: 'success' });
      onSynced?.();
    } catch (e) {
      setState('error');
      setToast({ msg: e.message || 'CSV sync failed', type: 'error' });
      setTimeout(() => setState('idle'), 2000);
    }
  };

  /* ── Compact mode (e.g. inside a banner / small card) ── */
  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {canUsePicker && (
          <button
            onClick={handlePickerSync}
            disabled={state === 'picking' || state === 'syncing'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 rounded-xl transition-colors disabled:opacity-50"
          >
            {state === 'syncing' || state === 'picking'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Smartphone className="w-3.5 h-3.5" />}
            Sync phone contacts
          </button>
        )}
        <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl cursor-pointer transition-colors">
          <Upload className="w-3.5 h-3.5" />
          Import CSV
          <input type="file" accept=".csv,.vcf" className="hidden" onChange={e => handleCSVFile(e.target.files[0])} />
        </label>
        {toast && <SyncToast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      </div>
    );
  }

  /* ── Full card mode ── */
  return (
    <div className="bg-[var(--nyasa-surface-2)] border border-[var(--nyasa-border)] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--nyasa-border)] flex items-center gap-3">
        <div className="w-8 h-8 bg-[#25D366]/15 rounded-full flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-[#25D366]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Sync phone contacts</p>
          <p className="text-xs text-gray-500 mt-0.5">Import contacts so WhatsApp senders are identified by name</p>
        </div>
        <button onClick={() => setGuide(g => !g)} className="p-1.5 text-gray-600 hover:text-gray-400">
          <Info className="w-4 h-4" />
        </button>
      </div>

      {/* How it works guide */}
      {showGuide && (
        <div className="px-5 py-3 bg-[#25D366]/5 border-b border-[var(--nyasa-border)] space-y-1.5">
          {[
            'When a WhatsApp message arrives, Nyasadesk checks the sender\'s phone number against your contacts.',
            'If a match is found, the conversation shows their real name and avatar — just like WhatsApp.',
            'New contacts synced here are also available to all agents on your workspace.',
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="w-4 h-4 mt-0.5 rounded-full bg-[#25D366]/20 text-[#25D366] text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <p className="text-xs text-gray-400 leading-relaxed">{tip}</p>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-4 space-y-3">
        {/* Option 1: Native Contact Picker */}
        <div className={`rounded-xl border transition-all ${canUsePicker ? 'border-[#25D366]/30 bg-[#25D366]/5' : 'border-[var(--nyasa-border)] opacity-50'}`}>
          <div className="px-4 py-3 flex items-center gap-3">
            <Smartphone className={`w-5 h-5 shrink-0 ${canUsePicker ? 'text-[#25D366]' : 'text-gray-600'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">From your phone</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {canUsePicker
                  ? 'Pick contacts directly from your phone book — no file needed'
                  : 'Requires Chrome on Android — not supported on this browser'}
              </p>
            </div>
            {canUsePicker && (
              <button
                onClick={handlePickerSync}
                disabled={state !== 'idle' && state !== 'done'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#25D366] text-white rounded-lg hover:bg-[#20BA5A] disabled:opacity-50 transition-colors shrink-0"
              >
                {state === 'picking' || state === 'syncing'
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : state === 'done'
                    ? <><Check className="w-3.5 h-3.5" />Done</>
                    : <><Smartphone className="w-3.5 h-3.5" />Sync</>}
              </button>
            )}
          </div>
        </div>

        {/* Option 2: CSV */}
        <div className="rounded-xl border border-[var(--nyasa-border)]">
          <div className="px-4 py-3 flex items-center gap-3">
            <Upload className="w-5 h-5 text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">From a CSV file</p>
              <p className="text-xs text-gray-500 mt-0.5">Export from WhatsApp, Google Contacts, Outlook, or any CRM</p>
            </div>
            <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-300 bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer transition-colors shrink-0">
              <Upload className="w-3.5 h-3.5" />Browse
              <input type="file" accept=".csv" className="hidden" onChange={e => handleCSVFile(e.target.files[0])} />
            </label>
          </div>

          {/* CSV preview */}
          {csvPreview && (
            <div className="px-4 pb-3 border-t border-[var(--nyasa-border)] pt-3">
              <p className="text-xs text-gray-400 mb-2">
                <span className="font-medium text-white">{csvFile?.name}</span> — {csvPreview.length} contacts found
              </p>
              <div className="space-y-1 mb-3 max-h-32 overflow-y-auto scrollbar-thin">
                {csvPreview.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-5 h-5 rounded-full bg-[#25D366]/20 flex items-center justify-center text-[9px] font-bold text-[#25D366] shrink-0">
                      {(c.full_name || c.phone || '?')[0].toUpperCase()}
                    </div>
                    <span className="text-white font-medium truncate w-28">{c.full_name || '—'}</span>
                    <span className="text-gray-500 truncate">{c.phone}</span>
                  </div>
                ))}
                {csvPreview.length > 5 && <p className="text-[10px] text-gray-600 pl-7">+{csvPreview.length - 5} more</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setCsvPrev(null); setCsvFile(null); }}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-white/5 rounded-lg">
                  Cancel
                </button>
                <button
                  onClick={handleCSVSync}
                  disabled={state === 'syncing'}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-[#25D366] text-white rounded-lg hover:bg-[#20BA5A] disabled:opacity-50">
                  {state === 'syncing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Sync {csvPreview.length} contacts
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="px-1 space-y-1">
          <p className="text-[10px] text-gray-600 flex items-start gap-1.5">
            <ChevronRight className="w-3 h-3 shrink-0 mt-0.5" />
            Duplicates are skipped automatically — safe to re-sync anytime
          </p>
          <p className="text-[10px] text-gray-600 flex items-start gap-1.5">
            <ChevronRight className="w-3 h-3 shrink-0 mt-0.5" />
            Contacts are matched by phone number across all channels (WhatsApp, SMS, email)
          </p>
          <p className="text-[10px] text-gray-600 flex items-start gap-1.5">
            <ChevronRight className="w-3 h-3 shrink-0 mt-0.5" />
            Export from Google Contacts: contacts.google.com → Export → Google CSV
          </p>
        </div>
      </div>

      {result && state === 'done' && (
        <div className="px-5 py-3 border-t border-[var(--nyasa-border)] bg-[#25D366]/5 flex items-center gap-3">
          <Check className="w-4 h-4 text-[#25D366] shrink-0" />
          <p className="text-xs text-[#25D366] font-medium">
            {result.added} new contact{result.added !== 1 ? 's' : ''} added · {result.skipped} already existed
          </p>
        </div>
      )}

      {toast && <SyncToast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
