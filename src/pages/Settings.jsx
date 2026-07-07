import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { User, Users, Globe, Bell, Building2, Check, Loader2,
         Trash2, Copy, ExternalLink, ChevronDown, AlertCircle, Code2, ShieldCheck, CreditCard, Crown, Clock, CheckCircle2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import TeamSection from '@/components/settings/TeamSection';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { getChannelConfigs, saveChannelConfig, deleteChannelConfig } from '@/lib/channels';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useFacebookSDK } from '@/hooks/useFacebookSDK';

const PROD_URL  = 'https://nyasadesk1.vercel.app';
const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID || '';

const SECTIONS = [
  { id: 'profile',   label: 'Profile',   icon: User,      adminOnly: false },
  { id: 'workspace', label: 'Workspace', icon: Building2, adminOnly: true  },
  { id: 'team',      label: 'Team',      icon: Users,     adminOnly: false },
  { id: 'channels',  label: 'Channels',  icon: Globe,     adminOnly: true  },
  { id: 'sla',       label: 'SLA',       icon: Bell,      adminOnly: true  },
  { id: 'subscription', label: 'Subscription', icon: CreditCard, adminOnly: true  },
];

const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800); }}
      className="shrink-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
    >
      {ok ? <Check className="w-3.5 h-3.5 text-[#25D366]" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
    </button>
  );
}

function ChannelCard({ emoji, iconUrl, title, subtitle, accentColor, isLive, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: isLive ? accentColor + '44' : 'rgba(255,255,255,0.08)', background: '#1a2530' }}
    >
      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setOpen(o => !o)}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-white p-1.5 overflow-hidden">
          {iconUrl
            ? <img src={iconUrl} alt={title} className="w-full h-full object-contain" />
            : <span className="text-xl">{emoji}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-[11px] text-gray-500 truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLive
            ? <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: accentColor + '20', color: accentColor }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block"
                  style={{ background: accentColor }} />Live
              </span>
            : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-gray-500">
                Not connected
              </span>
          }
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-5 border-t border-white/5 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

function ManualFields({ fields, setFields, fieldDefs }) {
  return (
    <div className="space-y-3">
      {fieldDefs.map(f => (
        <div key={f.key}>
          <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">{f.label}</label>
          <input
            className={inputCls}
            placeholder={f.placeholder}
            value={fields[f.key] || ''}
            type={f.secret ? 'password' : 'text'}
            onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
          />
        </div>
      ))}
    </div>
  );
}

function WhatsAppCard({ saved, workspaceId, onSave, onDelete }) {
  const fbReady = useFacebookSDK(FB_APP_ID);
  const [metaConfigId, setMetaConfigId] = useState(null);
  const [embeddedLoading, setEmbeddedLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualFields, setManualFields] = useState({});
  const [savingManual, setSavingManual] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const isLive = !!(saved && saved.enabled && saved.config &&
    (saved.config.waba_id || saved.config.access_token || saved.config.phone_number_id));

  // ── Verify connection actually works (token valid + webhook subscribed) ─
  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/channels?action=verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, channel: 'whatsapp' }),
      });
      const data = await res.json();
      setVerifyResult(data);
    } catch (e) {
      setVerifyResult({ ok: false, error: e.message });
    } finally {
      setVerifying(false);
    }
  };

  // ── Disconnect ────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    try {
      if (onDelete) await onDelete('whatsapp');
    } catch (e) {
      setError('Disconnect failed: ' + e.message);
    }
  };

  // ── Manual Cloud API save (fallback when Embedded Signup isn't usable) ─
  const handleManualSave = async () => {
    if (!manualFields.access_token || !manualFields.phone_number_id) {
      setError('Access Token and Phone Number ID are required');
      return;
    }
    setSavingManual(true);
    try {
      const res = await fetch('/api/channels?action=connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'whatsapp', workspace_id: workspaceId, provider_key: 'cloud', mode: 'manual',
          access_token: manualFields.access_token, phone_number_id: manualFields.phone_number_id,
          waba_id: manualFields.waba_id || null, verify_token: manualFields.verify_token || 'nyasadesk_verify',
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (onSave) onSave('whatsapp', data.config?.config || { access_token: manualFields.access_token, phone_number_id: manualFields.phone_number_id });
        setError('');
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch (e) { setError(e.message); } finally { setSavingManual(false); }
  };

  // ── Embedded Signup (official Meta 1-click flow) ──────────────────────
  useEffect(() => {
    fetch('/api/auth/whatsapp-embedded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _action: 'get_config', workspace_id: workspaceId }),
    })
      .then(r => r.json())
      .then(d => { if (d.config_id) setMetaConfigId(d.config_id); })
      .catch(() => {});
  }, [workspaceId]);

  // Meta's Embedded Signup wizard (the WABA/phone-number picker UI) is
  // rendered by the JS SDK itself — a plain OAuth redirect only ever shows
  // the generic login screen and can't render the picker at all. So this
  // has to be FB.login(), not a link. Meta broadcasts the chosen WABA/phone
  // number via postMessage during the flow; we capture it as a hint for the
  // backend (which also double-checks via the granted token's scopes).
  const embeddedSignupDataRef = useState({ current: null })[0];
  useEffect(() => {
    const handler = (event) => {
      if (!event.origin?.endsWith('facebook.com')) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH') {
          embeddedSignupDataRef.current = data.data || null;
        }
      } catch (e) { /* not our message */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleEmbeddedSignup = () => {
    if (!window.FB || !metaConfigId) {
      setError("Facebook signup isn't configured yet. Use the manual connection below.");
      return;
    }
    setError('');
    setEmbeddedLoading(true);
    window.FB.login((response) => {
      if (response.authResponse?.code) {
        const captured = embeddedSignupDataRef.current || {};
        fetch('/api/auth/whatsapp-embedded', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: response.authResponse.code,
            workspace_id: workspaceId,
            phone_number_id: captured.phone_number_id || null,
            waba_id: captured.waba_id || null,
          }),
        })
          .then(r => r.json())
          .then(d => {
            setEmbeddedLoading(false);
            if (d.ok) {
              if (onSave) onSave('whatsapp', d.config || { connected_via: 'embedded_signup' });
            } else {
              setError(d.error || 'Could not finish connecting WhatsApp');
            }
          })
          .catch(e => { setEmbeddedLoading(false); setError(e.message); });
      } else {
        setEmbeddedLoading(false);
        console.warn('[FB.login] no authResponse.code — full response:', response);
        setError('Facebook sign-in did not complete. You can use the manual connection below instead.');
      }
    }, {
      config_id: metaConfigId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
    });
  };

  const subtitle = isLive
    ? ('Connected' + (saved?.config?.phone_number ? ' · ' + saved.config.phone_number : ''))
    : 'Connect your WhatsApp Business number';

  return (
    <ChannelCard iconUrl="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" title="WhatsApp" subtitle={subtitle}
      accentColor="#25D366" isLive={isLive}>
      <div className="space-y-4">
        {/* ── Connected state ────────────────────────────────────────────── */}
        {isLive && (
          <div className="space-y-3">
            <div className="bg-[#111B21] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#25D366]" />
                <p className="text-sm font-bold text-white">WhatsApp is connected</p>
              </div>
              {saved?.config?.phone_number && (
                <p className="text-xs text-gray-400">Number: {saved.config.phone_number}</p>
              )}
              <p className="text-[11px] text-gray-500 pt-1">
                Connected via the official WhatsApp Cloud API. Messages route automatically.
              </p>
            </div>
            {verifyResult && (
              <div className={`rounded-xl p-3 text-[11px] space-y-1 ${verifyResult.healthy ? 'bg-[#25D366]/10' : 'bg-amber-500/10'}`}>
                {verifyResult.ok ? (
                  <>
                    <p className={`font-semibold ${verifyResult.healthy ? 'text-[#25D366]' : 'text-amber-400'}`}>
                      {verifyResult.healthy ? 'Connection is healthy — messages will arrive.' : 'Found an issue.'}
                    </p>
                    <p className="text-gray-400">
                      Access token: {verifyResult.checks?.token_valid ? 'valid' : (verifyResult.checks?.token_error || 'invalid')}
                    </p>
                    <p className="text-gray-400">
                      Webhook subscribed to Meta: {verifyResult.checks?.webhook_subscribed ? 'yes' : 'no'}
                      {verifyResult.checks?.auto_fixed ? ' (just fixed automatically)' : ''}
                    </p>
                    {verifyResult.checks?.webhook_note && (
                      <p className="text-amber-400">{verifyResult.checks.webhook_note}</p>
                    )}
                  </>
                ) : (
                  <p className="text-amber-400">{verifyResult.error || 'Could not verify connection'}</p>
                )}
              </div>
            )}
            <button onClick={handleVerify} disabled={verifying}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20 disabled:opacity-50 flex items-center justify-center gap-2">
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {verifying ? 'Checking…' : 'Verify Connection'}
            </button>
            <button onClick={handleDisconnect}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20">
              Disconnect WhatsApp
            </button>
          </div>
        )}

        {/* ── Not connected ──────────────────────────────────────────────── */}
        {!isLive && (
          <div className="space-y-3">
            <div className="bg-[#111B21] rounded-xl p-4 space-y-4">
              <p className="text-xs text-gray-400 leading-relaxed text-center">
                Connect your WhatsApp Business number via the official WhatsApp Cloud API to send and receive messages in Nyasadesk.
              </p>
              {metaConfigId && (
                <div className="space-y-2.5">
                  <button
                    onClick={handleEmbeddedSignup}
                    disabled={!fbReady || embeddedLoading}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-60 flex items-center justify-center gap-2">
                    {embeddedLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    {embeddedLoading ? 'Connecting...' : 'Connect with Facebook'}
                  </button>
                  <p className="text-[11px] text-gray-500 text-center">
                    Official Meta signup — pick your WhatsApp Business number in a secure popup. Recommended.
                  </p>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <p className="text-[11px] text-red-400 text-center px-2">{error}</p>
            )}

            {/* Manual Cloud API connection — the fallback/default path */}
            <details className="group" open={!metaConfigId}>
              <summary className="text-[11px] text-gray-500 cursor-pointer select-none hover:text-gray-400 list-none flex items-center gap-1">
                <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                {metaConfigId ? 'Or connect manually with WhatsApp Cloud API credentials' : 'Connect with WhatsApp Cloud API credentials'}
              </summary>
              <div className="mt-3 bg-[#111B21] rounded-xl p-4 space-y-3">
                <p className="text-xs text-gray-400 leading-relaxed">
                  Use your Meta Business WhatsApp Cloud API credentials directly.
                  Requires a registered phone number and a permanent access token from your Meta Business account.
                </p>
                <div className="space-y-2">
                  <label className="text-[11px] text-gray-500">Access Token</label>
                  <input type="password" value={manualFields.access_token || ''}
                    onChange={e => setManualFields({...manualFields, access_token: e.target.value})}
                    placeholder="EAAG..."
                    className="w-full bg-[#0B141A] text-white text-xs rounded-lg p-2.5 border border-white/10" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <label className="text-[11px] text-gray-500">Phone Number ID</label>
                    <input value={manualFields.phone_number_id || ''}
                      onChange={e => setManualFields({...manualFields, phone_number_id: e.target.value})}
                      placeholder="123456789"
                      className="w-full bg-[#0B141A] text-white text-xs rounded-lg p-2.5 border border-white/10" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-gray-500">WABA ID</label>
                    <input value={manualFields.waba_id || ''}
                      onChange={e => setManualFields({...manualFields, waba_id: e.target.value})}
                      placeholder="123456789"
                      className="w-full bg-[#0B141A] text-white text-xs rounded-lg p-2.5 border border-white/10" />
                  </div>
                </div>
                <button onClick={handleManualSave} disabled={savingManual}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-[#25D366] hover:bg-[#20BD5A] disabled:opacity-50">
                  {savingManual ? 'Saving…' : 'Save Cloud API Credentials'}
                </button>
              </div>
            </details>
          </div>
        )}
      </div>
    </ChannelCard>
  );
}

function MessengerCard({ saved, workspaceId, onSave, onDelete }) {
  const [mode, setMode]       = useState('easy');
  const [fields, setFields]   = useState(saved ? saved.config || {} : {});
  const [saving, setSaving]   = useState(false);
  const [status, setStatus]   = useState('');
  const isLive = !!(saved && saved.enabled && saved.config && saved.config.page_id);

  const launchFbOAuth = () => {
    if (!FB_APP_ID) { setMode('manual'); return; }
    const redirectUri = encodeURIComponent(PROD_URL + '/api/auth/facebook-callback');
    const scopes = 'pages_messaging,pages_show_list,pages_read_engagement';
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${redirectUri}&state=${workspaceId}&scope=${scopes}&response_type=code`;
    window.location.href = url;
  };

  const handleManualSave = async () => {
    setSaving(true);
    try {
      await onSave('messenger', fields);
      setStatus('saved');
    } catch (e) {
      setStatus('error: ' + e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const subtitle = isLive
    ? ('Connected' + (saved.config && saved.config.page_name ? ' · ' + saved.config.page_name : ''))
    : 'Handle Facebook Page messages in your inbox';

  return (
    <ChannelCard iconUrl="https://upload.wikimedia.org/wikipedia/commons/b/be/Facebook_Messenger_logo_2020.svg" title="Facebook Messenger" subtitle={subtitle}
      accentColor="#0084FF" isLive={isLive}>
      <div className="space-y-4">
        {isLive && saved.config && saved.config.connected_via === 'oauth' ? (
          <div className="bg-[#0084FF15] border border-[#0084FF30] rounded-xl p-3 flex items-center gap-3">
            <span className="text-xl">✅</span>
            <div>
              <p className="text-sm font-bold text-white">Connected via Facebook</p>
              <p className="text-xs text-gray-400">
                Page: {saved.config.page_name}
                {saved.config.fb_user_name ? ' · by ' + saved.config.fb_user_name : ''}
              </p>
            </div>
            <button onClick={() => onDelete('messenger')}
              className="ml-auto p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              {[{ id: 'easy', label: '🚀 Easy setup' }, { id: 'manual', label: '⚙️ Manual' }].map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: mode === m.id ? '#0084FF' : 'rgba(255,255,255,0.05)',
                    color: mode === m.id ? '#fff' : '#9ca3af',
                  }}>
                  {m.label}
                </button>
              ))}
            </div>

            {mode === 'easy' && (
              <div className="space-y-3">
                <div className="bg-[#111B21] rounded-xl p-4 space-y-2">
                  <p className="text-sm font-bold text-white">Connect with Facebook</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Log in and pick which Page to connect. No tokens to copy.
                  </p>
                  <ul className="text-[11px] text-gray-500 space-y-1 pt-1">
                    <li>✅ Works with any Facebook Page you manage</li>
                    <li>✅ Done in under 1 minute</li>
                  </ul>
                </div>
                <button onClick={launchFbOAuth}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg,#1877F2,#0084FF)' }}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Continue with Facebook
                </button>
              </div>
            )}

            {mode === 'manual' && (
              <div className="space-y-3">
                <div className="bg-[#111B21] rounded-xl p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Webhook URL</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-[#25D366] font-mono truncate flex-1">{PROD_URL}/api/webhooks/messenger</p>
                    <CopyBtn text={PROD_URL + '/api/webhooks/messenger'} />
                  </div>
                </div>
                <ManualFields fields={fields} setFields={setFields} fieldDefs={[
                  { key: 'page_id',     label: 'Page ID',           placeholder: '123456789' },
                  { key: 'page_token',  label: 'Page Access Token', placeholder: 'EAAxxxxx…', secret: true },
                  { key: 'app_secret',  label: 'App Secret',        placeholder: 'abc123…', secret: true },
                  { key: 'verify_token',label: 'Verify Token',      placeholder: 'nyasadesk_verify' },
                ]} />
                <div className="flex gap-2 pt-1">
                  <button onClick={handleManualSave} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                    style={{ background: '#0084FF', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Saving…' : status === 'saved' ? '✅ Saved!' : 'Save'}
                  </button>
                  {saved && (
                    <button onClick={() => onDelete('messenger')}
                      className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ChannelCard>
  );
}

function EmailCard({ saved, workspaceId, onSave, onDelete }) {
  const [fields, setFields] = useState(saved ? saved.config || {} : {});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const isLive = !!(saved && saved.enabled && saved.config && saved.config.email);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave('email', fields);
      setStatus('saved');
    } catch (e) {
      setStatus('error: ' + e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const subtitle = isLive ? ('Connected · ' + saved.config.email) : 'Pull emails into your inbox';

  return (
    <ChannelCard emoji="📧" title="Email" subtitle={subtitle} accentColor="#6366F1" isLive={isLive}>
      <div className="space-y-3">
        <ManualFields fields={fields} setFields={setFields} fieldDefs={[
          { key: 'imap_host', label: 'IMAP Host', placeholder: 'imap.gmail.com' },
          { key: 'imap_port', label: 'IMAP Port', placeholder: '993' },
          { key: 'smtp_host', label: 'SMTP Host', placeholder: 'smtp.gmail.com' },
          { key: 'smtp_port', label: 'SMTP Port', placeholder: '587' },
          { key: 'email',     label: 'Email Address', placeholder: 'support@yourdomain.com' },
          { key: 'password',  label: 'App Password',  placeholder: 'xxxx xxxx xxxx xxxx', secret: true },
        ]} />
        <a href="https://support.google.com/mail/answer/185833" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300">
          <ExternalLink className="w-3 h-3" />How to create a Gmail App Password
        </a>
        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: '#6366F1', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : status === 'saved' ? '✅ Saved!' : 'Save & Connect'}
          </button>
          {saved && (
            <button onClick={() => onDelete('email')}
              className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {status.startsWith('error:') && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />{status.slice(6)}
          </p>
        )}
      </div>
    </ChannelCard>
  );
}

function WebsiteCard({ saved, workspaceId, onSave, onDelete }) {
  const [fields, setFields] = useState(saved ? saved.config || {} : {});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [embedTab, setEmbedTab] = useState('popup'); // 'popup' | 'inline' | 'page'
  const isLive = !!(saved && saved.enabled);
  const position = fields.widget_position || 'bottom-right';
  const positionAttr = position !== 'bottom-right' ? ' data-position="' + position + '"' : '';
  const popupSnippet  = '<script src="' + PROD_URL + '/widget.js" data-workspace-id="' + workspaceId + '"' + positionAttr + '></script>';
  const inlineSnippet = '<div id="nyasa-inline-target"></div>\n<script src="' + PROD_URL + '/widget.js" data-workspace-id="' + workspaceId + '" data-mode="inline"' + positionAttr + '></script>';
  const supportPageUrl = PROD_URL + '/support/' + workspaceId;
  const iframeSnippet  = '<iframe src="' + supportPageUrl + '" style="width:100%;height:600px;border:0;border-radius:12px"></iframe>';

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave('website', fields);
      setStatus('saved');
    } catch (e) {
      setStatus('error: ' + e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const subtitle = isLive ? 'Widget active · embed on your site' : 'Add a chat bubble to any website';

  return (
    <ChannelCard emoji="🌐" title="Website Live Chat" subtitle={subtitle} accentColor="#06B6D4" isLive={isLive}>
      <div className="space-y-3">
        <div className="bg-[#111B21] rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Code2 className="w-3.5 h-3.5 text-cyan-400" />
            <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wide">Your Embed Snippet</p>
          </div>
          <div className="flex gap-2 pt-1">
            {[
              { id: 'popup',  label: 'Floating bubble' },
              { id: 'inline', label: 'Inline panel' },
              { id: 'page',   label: 'Support page (iframe)' },
            ].map(t => (
              <button key={t.id} onClick={() => setEmbedTab(t.id)} type="button" 
                className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all" 
                style={{
                  background: embedTab === t.id ? '#06B6D4' : 'rgba(255,255,255,0.05)',
                  color: embedTab === t.id ? '#fff' : '#9ca3af',
                }}>
                {t.label}
              </button>
            ))}
          </div>
          {embedTab === 'popup' && (
            <>
              <p className="text-[10px] text-gray-500">A chat bubble that floats over your existing site. Paste anywhere in the body.</p>
              <div className="flex items-start gap-2 mt-1">
                <code className="text-[11px] text-cyan-300 font-mono flex-1 break-all leading-relaxed bg-[#0D1418] rounded-lg p-2.5">
                  {popupSnippet}
                </code>
                <CopyBtn text={popupSnippet} />
              </div>
            </>
          )}
          {embedTab === 'inline' && (
            <>
              <p className="text-[10px] text-gray-500">Always-open chat panel that fills a container on your own page — e.g. drop it into a "Contact us" page. Auto-adapts to your site's font, colors and light/dark mode.</p>
              <div className="flex items-start gap-2 mt-1">
                <code className="text-[11px] text-cyan-300 font-mono flex-1 break-all leading-relaxed bg-[#0D1418] rounded-lg p-2.5 whitespace-pre-wrap">
                  {inlineSnippet}
                </code>
                <CopyBtn text={inlineSnippet} />
              </div>
            </>
          )}
          {embedTab === 'page' && (
            <>
              <p className="text-[10px] text-gray-500">A ready-made, hosted support page — iframe it in, or just link customers straight to it. Follows visitors' light/dark preference; add ?theme=light or ?theme=dark to the URL to force it.</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[11px] text-cyan-300 font-mono truncate flex-1">{supportPageUrl}</p>
                <CopyBtn text={supportPageUrl} />
              </div>
              <div className="flex items-start gap-2 mt-2">
                <code className="text-[11px] text-cyan-300 font-mono flex-1 break-all leading-relaxed bg-[#0D1418] rounded-lg p-2.5 whitespace-pre-wrap">
                  {iframeSnippet}
                </code>
                <CopyBtn text={iframeSnippet} />
              </div>
            </>
          )}
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">Widget Position on Your Site</label>
          <div className="flex gap-2">
            {[
              { id: 'bottom-right', label: 'Bottom Right' },
              { id: 'bottom-left',  label: 'Bottom Left' },
            ].map(p => (
              <button key={p.id} type="button"
                onClick={() => setFields(f => ({ ...f, widget_position: p.id }))}
                className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: position === p.id ? '#06B6D4' : 'rgba(255,255,255,0.05)',
                  color: position === p.id ? '#fff' : '#9ca3af',
                }}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5">Applies to the floating bubble and inline panel. Save, then re-copy the snippet below if you've already embedded it.</p>
        </div>
        <ManualFields fields={fields} setFields={setFields} fieldDefs={[
          { key: 'agent_name',   label: 'Header Display Name', placeholder: 'Support Team' },
          { key: 'greeting',     label: 'Greeting Message', placeholder: 'Hi there 👋 How can we help?' },
          { key: 'label',        label: 'Button Label',     placeholder: 'Chat with us' },
          { key: 'widget_color', label: 'Accent Color',     placeholder: '#25D366' },
        ]} />
        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: '#06B6D4', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : status === 'saved' ? '✅ Saved!' : 'Save & Activate'}
          </button>
          {saved && (
            <button onClick={() => onDelete('website')}
              className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </ChannelCard>
  );
}


function InstagramCard({ saved, workspaceId, onSave, onDelete }) {
  const [fields, setFields] = useState(saved ? saved.config || {} : {});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const isLive = !!(saved && saved.enabled && saved.config && saved.config.ig_user_id);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave('instagram', fields);
      setStatus('saved');
    } catch (e) {
      setStatus('error: ' + e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const subtitle = isLive ? 'Connected · Instagram Direct' : 'Reply to Instagram DMs in your inbox';

  return (
    <ChannelCard iconUrl="https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg" title="Instagram" subtitle={subtitle} accentColor="#E1306C" isLive={isLive}>
      <div className="space-y-3">
        <div className="bg-[#111B21] rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Webhook URL</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-[#E1306C] font-mono truncate flex-1">{PROD_URL}/api/webhooks/instagram</p>
            <CopyBtn text={PROD_URL + '/api/webhooks/instagram'} />
          </div>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Needs an Instagram professional account connected to a Facebook Page. Generate a Page Access Token with the <span className="text-gray-400 font-mono">instagram_basic</span> and <span className="text-gray-400 font-mono">instagram_manage_messages</span> permissions.
        </p>
        <ManualFields fields={fields} setFields={setFields} fieldDefs={[
          { key: 'ig_user_id',        label: 'Instagram Business Account ID', placeholder: '1784...' },
          { key: 'page_access_token', label: 'Page Access Token',            placeholder: 'EAAxxxxx…', secret: true },
          { key: 'verify_token',      label: 'Verify Token',                 placeholder: 'nyasadesk_verify' },
        ]} />
        <a href="https://developers.facebook.com/docs/messenger-platform/instagram"
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300">
          <ExternalLink className="w-3 h-3" />Setup guide
        </a>
        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: '#E1306C', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : status === 'saved' ? '✅ Saved!' : 'Save'}
          </button>
          {saved && (
            <button onClick={() => onDelete('instagram')}
              className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {status.startsWith('error:') && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />{status.slice(6)}
          </p>
        )}
      </div>
    </ChannelCard>
  );
}

function TelegramCard({ saved, workspaceId, onSave, onDelete }) {
  const [fields, setFields] = useState(saved ? saved.config || {} : {});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const isLive = !!(saved && saved.enabled && saved.config && saved.config.bot_token && saved.config.webhook_active);

  const handleActivate = async () => {
    if (!fields.bot_token) { setStatus('error: Bot token is required'); return; }
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/channels?action=connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'telegram', bot_token: fields.bot_token, workspace_id: workspaceId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to activate webhook');
      await onSave('telegram', { bot_token: fields.bot_token, bot_username: data.bot_username, webhook_active: true });
      setStatus('saved');
    } catch (e) {
      setStatus('error: ' + e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 4000);
    }
  };

  const subtitle = isLive ? `Connected · @${(saved.config && saved.config.bot_username) || 'bot'}` : 'Reply to Telegram messages in your inbox';

  return (
    <ChannelCard iconUrl="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" title="Telegram" subtitle={subtitle} accentColor="#26A5E4" isLive={isLive}>
      <div className="space-y-3">
        <div className="bg-[#111B21] rounded-xl p-3 space-y-1.5">
          <p className="text-sm font-bold text-white">Create a bot in 2 minutes</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            Message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-[#26A5E4] font-semibold">@BotFather</a> on Telegram, send <span className="text-gray-300 font-mono">/newbot</span>, and paste the token it gives you below.
          </p>
        </div>
        <ManualFields fields={fields} setFields={setFields} fieldDefs={[
          { key: 'bot_token', label: 'Bot Token', placeholder: '123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true },
        ]} />
        <button onClick={handleActivate} disabled={saving || !fields.bot_token}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
          style={{ background: '#26A5E4' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '✈️'}
          {saving ? 'Activating…' : isLive ? 'Reconnect' : 'Activate Bot'}
        </button>
        {saved && (
          <button onClick={() => onDelete('telegram')}
            className="w-full py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" />Disconnect
          </button>
        )}
        {status.startsWith('error:') && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />{status.slice(6)}
          </p>
        )}
      </div>
    </ChannelCard>
  );
}

export default function Settings() {
  useDocumentTitle('Settings');
  const { user, profile, workspaceOwnerId, isWorkspaceAdmin, isPlatformAdmin } = useNyasaAuth();
  const navigate = useNavigate();
  const [searchParams]    = useSearchParams();
  const [section, setSection]       = useState('profile');
  const [channelConfigs, setChannelConfigs] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('wa_channel_configs') || 'null');
      if (cached && typeof cached === 'object') return cached;
    } catch {}
    return {};
  });
  const [loadingChannels, setLoadingChannels] = useState(() => {
    try {
      const cached = localStorage.getItem('wa_channel_configs');
      return !cached; // only show the spinner if we have nothing cached yet
    } catch { return true; }
  });
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '' });
  const [profileSaved, setProfileSaved] = useState(false);
  const [wsName, setWsName]   = useState('');
  const [wsSaved, setWsSaved] = useState(false);
  const [banner, setBanner]   = useState(null);
  const [slaHours, setSlaHours] = useState(4);
  const [slaSaved, setSlaSaved] = useState(false);

  // ── Subscription state ────────────────────────────────────────────────
  const [subStatus, setSubStatus] = useState(null);
  const [subLoading, setSubLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(null);

  const loadSubStatus = async () => {
    setSubLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/billing?action=status', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to load subscription status');
      const data = await res.json();
      setSubStatus(data);
    } catch (e) {
      console.error('[Settings] subscription status error:', e);
    } finally {
      setSubLoading(false);
    }
  };

  useEffect(() => {
    if (section === 'subscription' && isWorkspaceAdmin) loadSubStatus();
  }, [section, isWorkspaceAdmin]);

  const handleCheckout = async (plan) => {
    setCheckoutLoading(plan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/billing?action=checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.checkout_url) window.location.href = data.checkout_url;
    } catch (e) {
      console.error('[Settings] checkout error:', e);
      window.alert(e.message || 'Could not start checkout');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const visibleSections = SECTIONS.filter(s => !s.adminOnly || isWorkspaceAdmin);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setSection(tab);
    if (searchParams.get('fb_connected')) {
      setBanner({ type: 'success', msg: 'Facebook Messenger connected!' });
      setTimeout(() => setBanner(null), 5000);
    }
    if (searchParams.get("error")) {
      setBanner({ type: "error", msg: "Connection failed: " + (searchParams.get("msg") || searchParams.get("error")) });
      setTimeout(() => setBanner(null), 6000);
    }
    if (searchParams.get("wa") === "connected") {
      setBanner({ type: "success", msg: "WhatsApp connected successfully!" });
      setTimeout(() => setBanner(null), 5000);
    }
    if (searchParams.get("wa") === "check") {
      // Returning from WasapFlow hosted page — auto-trigger sync
      syncWaba();
    }
    if (searchParams.get("wa_error")) {
      setBanner({ type: "error", msg: "WhatsApp connection failed: " + decodeURIComponent(searchParams.get("wa_error")) });
      setTimeout(() => setBanner(null), 6000);
    }
  }, [searchParams]);

  // Workspace/Channels/SLA are management settings — if a non-admin somehow
  // lands on one (stale ?tab= link, role changed underneath them), bounce to Profile.
  useEffect(() => {
    const current = SECTIONS.find(s => s.id === section);
    if (current?.adminOnly && !isWorkspaceAdmin) setSection('profile');
  }, [section, isWorkspaceAdmin]);

  useEffect(() => {
    if (user) {
      setProfileForm({ full_name: user.full_name || '', email: user.email || '' });
      setWsName((profile && profile.workspace_name) || '');
      setSlaHours((profile && profile.sla_hours) || 4);
    }
  }, [user, profile]);

  useEffect(() => {
    // Must key channel_configs off the WORKSPACE OWNER's id, not the caller's
    // own id — for an invited admin those differ. This was a real bug: a
    // second admin connecting WhatsApp/Messenger/etc would silently create a
    // channel_configs row keyed to THEIR OWN id, completely disconnected from
    // the shared workspace's inbox — messages would never route anywhere.
    if (!workspaceOwnerId) return;
    // Don't block the UI if we already have cached data to show — fetch quietly
    // in the background and just patch it in when it lands.
    getChannelConfigs(workspaceOwnerId)
      .then(rows => {
        const map = {};
        rows.forEach(r => { map[r.channel] = r; });
        setChannelConfigs(map);
        try { localStorage.setItem('wa_channel_configs', JSON.stringify(map)); } catch {}
      })
      .catch(e => console.error('[Settings] failed to load channel configs:', e))
      .finally(() => setLoadingChannels(false));
  }, [workspaceOwnerId]);

  const handleSaveChannel = async (channel, fields) => {
    const row = await saveChannelConfig(workspaceOwnerId, channel, fields, true);
    setChannelConfigs(prev => ({ ...prev, [channel]: row }));
  };

  const handleDeleteChannel = async (channel) => {
    await deleteChannelConfig(workspaceOwnerId, channel);
    setChannelConfigs(prev => {
      const next = Object.assign({}, prev);
      delete next[channel];
      return next;
    });
  };

  const saveProfile = async () => {
    await supabase.from('profiles').update({ full_name: profileForm.full_name }).eq('id', user && user.id);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const saveWorkspace = async () => {
    // Must target the WORKSPACE OWNER's row, not the caller's own id — for an
    // invited admin those are different rows. Using user.id directly here was
    // a real bug: it silently "succeeded" by writing to the admin's own dead
    // orphan profile instead of the actual shared workspace.
    await supabase.from('profiles').update({ workspace_name: wsName }).eq('id', workspaceOwnerId);
    setWsSaved(true);
    setTimeout(() => setWsSaved(false), 2000);
  };

  const saveSla = async () => {
    const hours = Math.max(1, parseInt(slaHours, 10) || 4);
    await supabase.from('profiles').update({ sla_hours: hours }).eq('id', workspaceOwnerId);
    setSlaHours(hours);
    setSlaSaved(true);
    setTimeout(() => setSlaSaved(false), 2000);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-56 bg-[#111B21] border-r border-white/10 flex-col py-4 px-3 shrink-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 mb-3">Settings</p>
        {visibleSections.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setSection(id)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-0.5"
            style={{
              background: section === id ? 'rgba(37,211,102,0.15)' : 'transparent',
              color: section === id ? '#25D366' : '#9ca3af',
            }}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden bg-[#0D1418]">
        {/* Mobile tab bar */}
        <div className="md:hidden flex overflow-x-auto bg-[#111B21] border-b border-white/10 px-2 pt-2 shrink-0 gap-1">
          {visibleSections.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setSection(id)}
              className="flex flex-col items-center gap-1 px-4 py-2 rounded-t-xl text-[10px] font-semibold whitespace-nowrap transition-all shrink-0"
              style={{
                color: section === id ? '#25D366' : '#6b7280',
                borderBottom: section === id ? '2px solid #25D366' : '2px solid transparent',
              }}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* Banner */}
        {banner && (
          <div className={`mx-4 mt-3 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
            banner.type === 'success' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {banner.type === 'success' ? '✅' : '❌'} {banner.msg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 space-y-4">

            {section === 'channels' && (
              <>
                <div className="mb-2">
                  <h2 className="text-base font-bold text-white">Channels</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Connect your messaging channels to start receiving conversations.
                  </p>
                </div>
                {loadingChannels ? (
                  <div className="flex items-center gap-2 text-gray-500 text-sm py-8 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />Loading…
                  </div>
                ) : (
                  <>
                    <WhatsAppCard  saved={channelConfigs.whatsapp}  workspaceId={workspaceOwnerId} onSave={handleSaveChannel} onDelete={handleDeleteChannel} />
                    {/* Other channels hidden — focus on WhatsApp + Website for now.
                        Cloud API integration will re-enable these later. */}
                    <WebsiteCard   saved={channelConfigs.website}   workspaceId={workspaceOwnerId} onSave={handleSaveChannel} onDelete={handleDeleteChannel} />
                  </>
                )}
              </>
            )}

            {section === 'profile' && (
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5 space-y-4">
                <div className="flex items-center gap-4 mb-2">
                  <Avatar name={profileForm.full_name || ''} size="xl" />
                  <div>
                    <p className="font-bold text-white">{profileForm.full_name || 'Your Name'}</p>
                    <p className="text-xs text-gray-500">{user && user.role}</p>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">Display Name</label>
                  <input className={inputCls} value={profileForm.full_name || ''}
                    onChange={e => setProfileForm(f => ({ ...f, full_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">Email</label>
                  {/* Read-only — this used to be a live-looking editable field, but
                      saveProfile() only ever wrote full_name, so typing here silently
                      did nothing. Changing a login email needs Supabase's own
                      verified-email-change flow, which isn't wired up yet. */}
                  <input className={inputCls + ' opacity-50 cursor-not-allowed'} value={profileForm.email || ''} disabled readOnly />
                  <p className="text-[10px] text-gray-600 mt-1">Your login email can't be changed here yet — contact support if you need it updated.</p>
                </div>
                <button onClick={saveProfile}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: '#25D366' }}>
                  {profileSaved ? <><Check className="w-4 h-4" />Saved!</> : 'Save Profile'}
                </button>

                {isPlatformAdmin && (
                  <button onClick={() => navigate('/admin')}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border border-white/10 text-white hover:bg-white/5 transition-colors">
                    <ShieldCheck className="w-4 h-4" style={{ color: '#25D366' }} />
                    Open Admin Panel
                  </button>
                )}
              </div>
            )}

            {section === 'workspace' && (
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5 space-y-4">
                <div>
                  <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">Workspace Name</label>
                  <input className={inputCls} value={wsName}
                    onChange={e => setWsName(e.target.value)} placeholder="My Company" />
                </div>
                <button onClick={saveWorkspace}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: '#25D366' }}>
                  {wsSaved ? <><Check className="w-4 h-4" />Saved!</> : 'Save Workspace'}
                </button>
              </div>
            )}

            {section === 'team' && <TeamSection />}

            {section === 'sla' && (
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5 space-y-4">
                <div>
                  <p className="text-sm font-bold text-white mb-1">SLA — Response Time Target</p>
                  <div className="text-xs text-gray-400 leading-relaxed space-y-2 mt-2">
                    <p>
                      <span className="text-gray-300 font-semibold">SLA</span> (Service Level Agreement) is your team's
                      response-time promise to customers. When a new message comes in, a countdown timer starts. If no
                      one replies within the hours you set here, the conversation gets a red <span className="text-orange-400 font-semibold">"BREACHED"</span> badge
                      so you can instantly see which customers have been waiting too long.
                    </p>
                    <p>
                      <span className="text-gray-300 font-semibold">Example:</span> Set 4 hours, and every new conversation
                      gets a 4-hour countdown. The dashboard highlights conversations that are close to breaching so your
                      team can prioritize the oldest unanswered messages first.
                    </p>
                    <p className="text-gray-500">
                      This applies to new conversations going forward — existing ones keep their original deadline.
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">Response time target (hours)</label>
                  <input type="number" min="1" max="720" className={inputCls} value={slaHours}
                    onChange={e => setSlaHours(e.target.value)} />
                </div>
                <button onClick={saveSla}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: '#25D366' }}>
                  {slaSaved ? <><Check className="w-4 h-4" />Saved!</> : 'Save SLA Setting'}
                </button>
              </div>
            )}

            {/* Subscription */}
            {section === 'subscription' && isWorkspaceAdmin && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white mb-1">Subscription & Billing</h2>
                  <p className="text-sm text-gray-400">Manage your plan — billed in Malawi Kwacha via PayChangu</p>
                </div>

                {subLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-[#25D366] animate-spin" /></div>
                ) : subStatus ? (
                  <>
                    <div className="rounded-2xl border border-white/10 p-5 bg-[#202C33]">
                      <div className="flex items-center gap-3 mb-3">
                        {subStatus.subscription_status === 'trialing' && <Clock className="w-5 h-5 text-yellow-400" />}
                        {subStatus.subscription_status === 'active' && <Crown className="w-5 h-5 text-[#25D366]" />}
                        {subStatus.subscription_status === 'past_due' && <AlertCircle className="w-5 h-5 text-red-400" />}
                        {subStatus.subscription_status === 'canceled' && <AlertCircle className="w-5 h-5 text-gray-500" />}
                        <div>
                          <p className="text-sm font-semibold text-white capitalize">
                            {subStatus.subscription_status === 'trialing' ? 'Free Trial' : subStatus.subscription_status}
                          </p>
                          <p className="text-xs text-gray-400">Current plan: {subStatus.plan || 'starter'}</p>
                        </div>
                      </div>
                      {subStatus.subscription_status === 'trialing' && subStatus.trial_ends_at && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
                          <p className="text-sm text-yellow-400 font-medium">
                            Trial ends in {Math.max(0, Math.ceil((new Date(subStatus.trial_ends_at) - new Date()) / 86400000))} days
                          </p>
                          <p className="text-xs text-yellow-400/70 mt-1">
                            {new Date(subStatus.trial_ends_at).toLocaleDateString('en-MW', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                      )}
                      {subStatus.subscription_status === 'active' && subStatus.current_period_end && (
                        <p className="text-xs text-gray-400">
                          Next renewal: {new Date(subStatus.current_period_end).toLocaleDateString('en-MW', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {Object.entries(subStatus.pricing || {}).map(([key, price]) => {
                        const isCurrent = subStatus.plan === key;
                        const labels = subStatus.plan_labels || {};
                        return (
                          <div key={key} className={`rounded-2xl border p-5 ${isCurrent ? 'border-[#25D366] bg-[#25D366]/5' : 'border-white/10 bg-[#202C33]'}`}>
                            <p className="text-sm font-bold text-white">{labels[key] || key}</p>
                            <p className="text-2xl font-black text-white mt-2">K{price.toLocaleString()}<span className="text-xs font-normal text-gray-400">/mo</span></p>
                            <div className="mt-4">
                              {isCurrent ? (
                                <span className="block text-center py-2.5 rounded-xl text-xs font-bold text-[#25D366] bg-[#25D366]/10">Current Plan</span>
                              ) : (
                                <button
                                  onClick={() => handleCheckout(key)}
                                  disabled={checkoutLoading === key}
                                  className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-[#25D366] hover:bg-[#20BA5A] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                  {checkoutLoading === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Switch to ${labels[key] || key}`}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {subStatus.transactions && subStatus.transactions.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-3">Payment History</h3>
                        <div className="space-y-2">
                          {subStatus.transactions.map(t => (
                            <div key={t.tx_ref} className="flex items-center justify-between bg-[#202C33] rounded-xl px-4 py-3 border border-white/5">
                              <div>
                                <p className="text-xs font-medium text-white">K{(t.amount || 0).toLocaleString()} {t.currency}</p>
                                <p className="text-[10px] text-gray-500">{new Date(t.created_at).toLocaleDateString('en-MW')}</p>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                t.status === 'success' ? 'bg-[#25D366]/15 text-[#25D366]' :
                                t.status === 'pending' ? 'bg-yellow-500/15 text-yellow-400' :
                                'bg-red-500/15 text-red-400'
                              }`}>{t.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Could not load subscription info.</p>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
