import { useState, useEffect } from 'react';
import { User, Users, Globe, Bell, Building2, Check, Loader2, Trash2,
         Copy, Code2, AlertCircle, ChevronDown, ExternalLink } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import TeamSection from '@/components/settings/TeamSection';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { getChannelConfigs, saveChannelConfig, deleteChannelConfig } from '@/lib/channels';
import { supabase } from '@/lib/supabase';

const PROD_URL    = 'https://nyasadesk1.vercel.app';
const FB_APP_ID   = import.meta.env.VITE_FACEBOOK_APP_ID || '';
const REDIRECT_URI = encodeURIComponent(`${PROD_URL}/api/auth/facebook-callback`);
const FB_SCOPES   = 'pages_messaging,pages_show_list,pages_read_engagement';

const SECTIONS = [
  { id: 'profile',   label: 'Profile',   icon: User      },
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'team',      label: 'Team',      icon: Users     },
  { id: 'channels',  label: 'Channels',  icon: Globe     },
  { id: 'sla',       label: 'SLA',       icon: Bell      },
];

const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

// ── Copy button helper ────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800); }}
      className="shrink-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
      {ok ? <Check className="w-3.5 h-3.5 text-[#25D366]" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
    </button>
  );
}

// ── WhatsApp card ─────────────────────────────────────────────────────────────
function WhatsAppCard({ saved, workspaceId, onSave, onDelete }) {
  const [open, setOpen]       = useState(false);
  const [mode, setMode]       = useState('easy'); // 'easy' | 'manual'
  const [fields, setFields]   = useState(saved?.config || {});
  const [saving, setSaving]   = useState(false);
  const [fb, setFb]           = useState('');
  const isLive = saved?.enabled && (saved?.config?.connected_via === 'embedded_signup' || saved?.config?.access_token);

  // WhatsApp Embedded Signup — launches Meta's official popup
  const launchEmbeddedSignup = () => {
    if (!FB_APP_ID) {
      alert('Facebook App ID not configured. Use manual setup below.');
      setMode('manual');
      return;
    }
    window.FB?.login(async (response) => {
      if (response.authResponse?.code) {
        setSaving(true);
        try {
          const res = await fetch('/api/auth/whatsapp-embedded', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: response.authResponse.code, workspace_id: workspaceId }),
          });
          const data = await res.json();
          if (data.ok) {
            await onSave('whatsapp', { connected_via: 'embedded_signup', ...data });
          } else throw new Error(data.error || 'Connection failed');
        } catch (e) { alert('Connection failed: ' + e.message); }
        finally { setSaving(false); }
      }
    }, {
      config_id: import.meta.env.VITE_WA_CONFIG_ID || '',
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featurize: { messaging_product: 'whatsapp' } },
    });
  };

  const handleManualSave = async () => {
    setSaving(true);
    try { await onSave('whatsapp', fields); setFb('saved'); }
    catch (e) { setFb('error:' + e.message); }
    finally { setSaving(false); setTimeout(() => setFb(''), 3000); }
  };

  return (
    <div className="rounded-2xl border overflow-hidden transition-all"
      style={{ borderColor: isLive ? '#25D36644' : 'rgba(255,255,255,0.08)', background: '#1a2530' }}>
      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setOpen(o => !o)}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: '#25D36620' }}>💬</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">WhatsApp Business</p>
          <p className="text-[11px] text-gray-500 truncate">
            {isLive ? `Connected${saved?.config?.phone_number ? ' · ' + saved.config.phone_number : ''}`
                    : 'Receive & reply to WhatsApp messages'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLive
            ? <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />Live
              </span>
            : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-gray-500">Not connected</span>
          }
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-5 border-t border-white/5 pt-4 space-y-4">

          {/* Mode toggle */}
          <div className="flex gap-2">
            {[{id:'easy',label:'🚀 Easy setup'},{id:'manual',label:'⚙️ Manual'}].map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all
                  ${mode === m.id ? 'bg-[#25D366] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Easy mode — Embedded Signup */}
          {mode === 'easy' && (
            <div className="space-y-3">
              <div className="bg-[#111B21] rounded-xl p-4 space-y-2">
                <p className="text-sm font-bold text-white">Connect in one click</p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Click below to connect your WhatsApp Business account using Meta's official setup.
                  You'll log in with Facebook and pick your WhatsApp number — no copying of tokens needed.
                </p>
                <ul className="text-[11px] text-gray-500 space-y-1 pt-1">
                  <li>✅ No technical knowledge required</li>
                  <li>✅ Takes less than 2 minutes</li>
                  <li>✅ Official Meta integration</li>
                </ul>
              </div>
              <button onClick={launchEmbeddedSignup} disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all"
                style={{ background: '#25D366', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '💬'}
                {saving ? 'Connecting…' : 'Connect WhatsApp Business'}
              </button>
              <p className="text-center text-[10px] text-gray-600">
                Powered by Meta's official Embedded Signup
              </p>
            </div>
          )}

          {/* Manual mode */}
          {mode === 'manual' && (
            <div className="space-y-3">
              <div className="bg-[#111B21] rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Webhook URL</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[#25D366] font-mono truncate flex-1">{PROD_URL}/api/webhooks/whatsapp</p>
                  <CopyBtn text={`${PROD_URL}/api/webhooks/whatsapp`} />
                </div>
                <p className="text-[10px] text-gray-600 mt-1">Paste into Meta App → WhatsApp → Webhooks</p>
              </div>
              {[
                { key:'phone_number_id', label:'Phone Number ID',    placeholder:'123456789012345' },
                { key:'waba_id',         label:'WABA ID',            placeholder:'987654321098765' },
                { key:'access_token',    label:'Access Token',       placeholder:'EAAxxxxx…'       },
                { key:'verify_token',    label:'Verify Token',       placeholder:'my-secret'       },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">{f.label}</label>
                  <input className={inputCls} placeholder={f.placeholder} value={fields[f.key]||''} type={f.key.includes('token') ? 'password' : 'text'}
                    onChange={e => setFields(p => ({...p,[f.key]:e.target.value}))} />
                </div>
              ))}
              <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300">
                <ExternalLink className="w-3 h-3" />Setup guide (5 min)
              </a>
              <div className="flex gap-2 pt-1">
                <button onClick={handleManualSave} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#25D366] text-white transition-all"
                  style={{ opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving…' : fb === 'saved' ? '✅ Saved!' : 'Save'}
                </button>
                {saved && <button onClick={() => onDelete('whatsapp')}
                  className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20">
                  <Trash2 className="w-4 h-4" />
                </button>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Messenger card ────────────────────────────────────────────────────────────
function MessengerCard({ saved, workspaceId, onSave, onDelete }) {
  const [open, setOpen]     = useState(false);
  const [mode, setMode]     = useState('easy');
  const [fields, setFields] = useState(saved?.config || {});
  const [saving, setSaving] = useState(false);
  const [fb, setFb]         = useState('');
  const isLive = saved?.enabled && saved?.config?.page_id;
  const connectedVia = saved?.config?.connected_via;

  const launchFbOAuth = () => {
    if (!FB_APP_ID) { alert('Facebook App ID not configured.'); setMode('manual'); return; }
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${REDIRECT_URI}&state=${workspaceId}&scope=${FB_SCOPES}&response_type=code`;
    window.location.href = url;
  };

  const handleManualSave = async () => {
    setSaving(true);
    try { await onSave('messenger', fields); setFb('saved'); }
    catch (e) { setFb('error:' + e.message); }
    finally { setSaving(false); setTimeout(() => setFb(''), 3000); }
  };

  return (
    <div className="rounded-2xl border overflow-hidden transition-all"
      style={{ borderColor: isLive ? '#0084FF44' : 'rgba(255,255,255,0.08)', background: '#1a2530' }}>
      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setOpen(o => !o)}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: '#0084FF20' }}>📘</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Facebook Messenger</p>
          <p className="text-[11px] text-gray-500 truncate">
            {isLive
              ? `Connected${saved?.config?.page_name ? ' · ' + saved.config.page_name : ''}`
              : 'Handle Facebook Page messages in your inbox'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLive
            ? <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />Live
              </span>
            : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-gray-500">Not connected</span>
          }
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-5 border-t border-white/5 pt-4 space-y-4">

          {/* If already connected via OAuth, show status */}
          {isLive && connectedVia === 'oauth' && (
            <div className="bg-[#0084FF15] border border-[#0084FF30] rounded-xl p-3 flex items-center gap-3">
              <span className="text-xl">✅</span>
              <div>
                <p className="text-sm font-bold text-white">Connected via Facebook Login</p>
                <p className="text-xs text-gray-400">Page: {saved?.config?.page_name} · by {saved?.config?.fb_user_name}</p>
              </div>
              <button onClick={() => onDelete('messenger')} className="ml-auto p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {(!isLive || connectedVia !== 'oauth') && (
            <>
              <div className="flex gap-2">
                {[{id:'easy',label:'🚀 Easy setup'},{id:'manual',label:'⚙️ Manual'}].map(m => (
                  <button key={m.id} onClick={() => setMode(m.id)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all
                      ${mode === m.id ? 'bg-[#0084FF] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                    {m.label}
                  </button>
                ))}
              </div>

              {mode === 'easy' && (
                <div className="space-y-3">
                  <div className="bg-[#111B21] rounded-xl p-4 space-y-2">
                    <p className="text-sm font-bold text-white">Connect with Facebook</p>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Log in with your Facebook account and pick which Page to connect.
                      We'll automatically configure everything — no tokens, no copying.
                    </p>
                    <ul className="text-[11px] text-gray-500 space-y-1 pt-1">
                      <li>✅ Works with any Facebook Page you manage</li>
                      <li>✅ Auto-configures webhooks</li>
                      <li>✅ Done in under 1 minute</li>
                    </ul>
                  </div>
                  <button onClick={launchFbOAuth}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all"
                    style={{ background: 'linear-gradient(135deg, #1877F2, #0084FF)' }}>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    Continue with Facebook
                  </button>
                  <p className="text-center text-[10px] text-gray-600">
                    You'll be redirected to Facebook and back
                  </p>
                </div>
              )}

              {mode === 'manual' && (
                <div className="space-y-3">
                  <div className="bg-[#111B21] rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Webhook URL</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-[#25D366] font-mono truncate flex-1">{PROD_URL}/api/webhooks/messenger</p>
                      <CopyBtn text={`${PROD_URL}/api/webhooks/messenger`} />
                    </div>
                  </div>
                  {[
                    { key:'page_id',    label:'Page ID',          placeholder:'123456789'   },
                    { key:'page_token', label:'Page Access Token', placeholder:'EAAxxxxx…'  },
                    { key:'app_secret', label:'App Secret',        placeholder:'abc123…'    },
                    { key:'verify_token',label:'Verify Token',     placeholder:'my-secret'  },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">{f.label}</label>
                      <input className={inputCls} placeholder={f.placeholder} value={fields[f.key]||''} type={f.key.includes('token')||f.key==='app_secret' ? 'password' : 'text'}
                        onChange={e => setFields(p => ({...p,[f.key]:e.target.value}))} />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button onClick={handleManualSave} disabled={saving}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                      style={{ background:'#0084FF', opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Saving…' : fb==='saved' ? '✅ Saved!' : 'Save'}
                    </button>
                    {saved && <button onClick={() => onDelete('messenger')} className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20"><Trash2 className="w-4 h-4"/></button>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Email card ────────────────────────────────────────────────────────────────
function EmailCard({ saved, workspaceId, onSave, onDelete }) {
  const [open, setOpen]     = useState(false);
  const [fields, setFields] = useState(saved?.config || {});
  const [saving, setSaving] = useState(false);
  const [fb, setFb]         = useState('');
  const isLive = saved?.enabled && saved?.config?.email;

  const handleSave = async () => {
    setSaving(true);
    try { await onSave('email', fields); setFb('saved'); }
    catch (e) { setFb('error:' + e.message); }
    finally { setSaving(false); setTimeout(() => setFb(''), 3000); }
  };

  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{ borderColor: isLive ? '#6366F144' : 'rgba(255,255,255,0.08)', background: '#1a2530' }}>
      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setOpen(o => !o)}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: '#6366F120' }}>📧</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Email</p>
          <p className="text-[11px] text-gray-500 truncate">{isLive ? `Connected · ${saved.config.email}` : 'Pull emails into your inbox'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLive
            ? <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block"/>Live</span>
            : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-gray-500">Not connected</span>}
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open?'rotate-180':''}`} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-5 border-t border-white/5 pt-4 space-y-3">
          {[
            {key:'imap_host',label:'IMAP Host',placeholder:'imap.gmail.com'},
            {key:'imap_port',label:'IMAP Port',placeholder:'993'},
            {key:'smtp_host',label:'SMTP Host',placeholder:'smtp.gmail.com'},
            {key:'smtp_port',label:'SMTP Port',placeholder:'587'},
            {key:'email',label:'Email Address',placeholder:'support@yourdomain.com'},
            {key:'password',label:'App Password',placeholder:'xxxx xxxx xxxx xxxx'},
          ].map(f => (
            <div key={f.key}>
              <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">{f.label}</label>
              <input className={inputCls} placeholder={f.placeholder} value={fields[f.key]||''} type={f.key==='password'?'password':'text'}
                onChange={e => setFields(p => ({...p,[f.key]:e.target.value}))} />
            </div>
          ))}
          <a href="https://support.google.com/mail/answer/185833" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300">
            <ExternalLink className="w-3 h-3"/>How to create a Gmail App Password
          </a>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{background:'#6366F1', opacity: saving?0.7:1}}>
              {saving?'Saving…':fb==='saved'?'✅ Saved!':'Save & Connect'}
            </button>
            {saved && <button onClick={()=>onDelete('email')} className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20"><Trash2 className="w-4 h-4"/></button>}
          </div>
          {fb.startsWith('error:') && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5"/>{fb.slice(6)}</p>}
        </div>
      )}
    </div>
  );
}

// ── Website card ──────────────────────────────────────────────────────────────
function WebsiteCard({ saved, workspaceId, onSave, onDelete }) {
  const [open, setOpen]     = useState(false);
  const [fields, setFields] = useState(saved?.config || {});
  const [saving, setSaving] = useState(false);
  const [fb, setFb]         = useState('');
  const isLive = !!saved?.enabled;
  const embedSnippet = `<script src="${PROD_URL}/widget.js" data-workspace-id="${workspaceId}"></script>`;

  const handleSave = async () => {
    setSaving(true);
    try { await onSave('website', fields); setFb('saved'); }
    catch(e) { setFb('error:'+e.message); }
    finally { setSaving(false); setTimeout(()=>setFb(''),3000); }
  };

  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{ borderColor: isLive?'#06B6D444':'rgba(255,255,255,0.08)', background: '#1a2530' }}>
      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={()=>setOpen(o=>!o)}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{background:'#06B6D420'}}>🌐</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Website Live Chat</p>
          <p className="text-[11px] text-gray-500">{isLive ? 'Widget active · embed on your site' : 'Add a chat bubble to any website'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLive
            ? <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block"/>Live</span>
            : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-gray-500">Not connected</span>}
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open?'rotate-180':''}`} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-5 border-t border-white/5 pt-4 space-y-3">
          <div className="bg-[#111B21] rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2"><Code2 className="w-3.5 h-3.5 text-cyan-400"/><p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wide">Your Embed Snippet</p></div>
            <p className="text-[10px] text-gray-500">Paste this into your website's &lt;head&gt; or &lt;body&gt;.</p>
            <div className="flex items-start gap-2 mt-1">
              <code className="text-[11px] text-cyan-300 font-mono flex-1 break-all leading-relaxed bg-[#0D1418] rounded-lg p-2.5">{embedSnippet}</code>
              <CopyBtn text={embedSnippet} />
            </div>
          </div>
          {[
            {key:'greeting',label:'Greeting Message',placeholder:'Hi there 👋 How can we help?'},
            {key:'label',label:'Button Label',placeholder:'Chat with us'},
            {key:'widget_color',label:'Accent Color',placeholder:'#25D366'},
          ].map(f => (
            <div key={f.key}>
              <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">{f.label}</label>
              <input className={inputCls} placeholder={f.placeholder} value={fields[f.key]||''} onChange={e=>setFields(p=>({...p,[f.key]:e.target.value}))} />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{background:'#06B6D4',opacity:saving?0.7:1}}>
              {saving?'Saving…':fb==='saved'?'✅ Saved!':'Save & Activate'}
            </button>
            {saved && <button onClick={()=>onDelete('website')} className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20"><Trash2 className="w-4 h-4"/></button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────
export default function Settings() {
  const { user, profile } = useNyasaAuth();
  const [searchParams]    = useSearchParams();
  const [section, setSection] = useState('channels');
  const [channelConfigs, setChannelConfigs] = useState({});
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '' });
  const [profileSaved, setProfileSaved] = useState(false);
  const [wsName, setWsName]   = useState('');
  const [wsSaved, setWsSaved] = useState(false);
  const [fbBanner, setFbBanner] = useState(null);

  // Handle OAuth return params
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setSection(tab);

    if (searchParams.get('fb_connected')) {
      setFbBanner({ type: 'success', msg: 'Facebook Messenger connected successfully!' });
      setTimeout(() => setFbBanner(null), 5000);
    }
    if (searchParams.get('error')) {
      setFbBanner({ type: 'error', msg: 'Connection failed: ' + (searchParams.get('msg') || searchParams.get('error')) });
      setTimeout(() => setFbBanner(null), 6000);
    }
  }, [searchParams]);

  useEffect(() => {
    setProfileForm({ full_name: user?.full_name || '', email: user?.email || '' });
    setWsName(profile?.workspace_name || '');
  }, [user, profile]);

  useEffect(() => {
    if (!user?.id) return;
    setLoadingChannels(true);
    getChannelConfigs(user.id).then(rows => {
      const map = {};
      rows.forEach(r => { map[r.channel] = r; });
      setChannelConfigs(map);
    }).catch(() => {}).finally(() => setLoadingChannels(false));
  }, [user?.id]);

  const handleSaveChannel = async (channel, fields) => {
    const row = await saveChannelConfig(user.id, channel, fields, true);
    setChannelConfigs(prev => ({ ...prev, [channel]: row }));
  };
  const handleDeleteChannel = async (channel) => {
    await deleteChannelConfig(user.id, channel);
    setChannelConfigs(prev => { const n = {...prev}; delete n[channel]; return n; });
  };

  const saveProfile = async () => {
    await supabase.from('profiles').update({ full_name: profileForm.full_name }).eq('id', user?.id);
    setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2000);
  };
  const saveWorkspace = async () => {
    await supabase.from('profiles').update({ workspace_name: wsName }).eq('id', user?.id);
    setWsSaved(true); setTimeout(() => setWsSaved(false), 2000);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />
      <div className="hidden md:flex w-56 bg-[#111B21] border-r border-white/10 flex-col py-4 px-3 shrink-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 mb-3">Settings</p>
        {SECTIONS.map(({id,label,icon:Icon}) => (
          <button key={id} onClick={() => setSection(id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-0.5
              ${section===id ? 'bg-[#25D366]/15 text-[#25D366]' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}>
            <Icon className="w-4 h-4"/>{label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden bg-[#0D1418]">
        <div className="md:hidden flex overflow-x-auto scrollbar-none bg-[#111B21] border-b border-white/10 px-2 pt-2 shrink-0 gap-1">
          {SECTIONS.map(({id,label,icon:Icon}) => (
            <button key={id} onClick={() => setSection(id)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-t-xl text-[10px] font-semibold whitespace-nowrap transition-all shrink-0
                ${section===id ? 'text-[#25D366] border-b-2 border-[#25D366]' : 'text-gray-500'}`}>
              <Icon className="w-4 h-4"/>{label}
            </button>
          ))}
        </div>

        {/* FB OAuth banner */}
        {fbBanner && (
          <div className={`mx-4 mt-3 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2
            ${fbBanner.type==='success' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
            {fbBanner.type==='success' ? '✅' : '❌'} {fbBanner.msg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 space-y-4">

            {section==='channels' && (
              <>
                <div className="mb-2">
                  <h2 className="text-base font-bold text-white">Channels</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Connect your messaging channels to start receiving conversations.</p>
                </div>
                {loadingChannels
                  ? <div className="flex items-center gap-2 text-gray-500 text-sm py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin"/>Loading…</div>
                  : <>
                      <WhatsAppCard  saved={channelConfigs.whatsapp}  workspaceId={user?.id} onSave={handleSaveChannel} onDelete={handleDeleteChannel} />
                      <MessengerCard saved={channelConfigs.messenger} workspaceId={user?.id} onSave={handleSaveChannel} onDelete={handleDeleteChannel} />
                      <EmailCard     saved={channelConfigs.email}     workspaceId={user?.id} onSave={handleSaveChannel} onDelete={handleDeleteChannel} />
                      <WebsiteCard   saved={channelConfigs.website}   workspaceId={user?.id} onSave={handleSaveChannel} onDelete={handleDeleteChannel} />
                    </>
                }
              </>
            )}

            {section==='profile' && (
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5 space-y-4">
                <div className="flex items-center gap-4 mb-2">
                  <Avatar name={profileForm.full_name||''} size="xl"/>
                  <div><p className="font-bold text-white">{profileForm.full_name||'Your Name'}</p><p className="text-xs text-gray-500">{user?.role}</p></div>
                </div>
                {[['full_name','Display Name'],['email','Email']].map(([k,label]) => (
                  <div key={k}>
                    <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">{label}</label>
                    <input className={inputCls} value={profileForm[k]||''} onChange={e=>setProfileForm(f=>({...f,[k]:e.target.value}))}/>
                  </div>
                ))}
                <button onClick={saveProfile}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] text-white text-sm font-bold rounded-xl hover:bg-[#20BA5A] transition-colors">
                  {profileSaved ? <><Check className="w-4 h-4"/>Saved!</> : 'Save Profile'}
                </button>
              </div>
            )}

            {section==='workspace' && (
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5 space-y-4">
                <div>
                  <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">Workspace Name</label>
                  <input className={inputCls} value={wsName} onChange={e=>setWsName(e.target.value)} placeholder="My Company"/>
                </div>
                <button onClick={saveWorkspace}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] text-white text-sm font-bold rounded-xl hover:bg-[#20BA5A] transition-colors">
                  {wsSaved ? <><Check className="w-4 h-4"/>Saved!</> : 'Save Workspace'}
                </button>
              </div>
            )}

            {section==='team' && <TeamSection/>}
            {section==='sla' && (
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5">
                <p className="text-sm font-bold text-white mb-1">SLA Configuration</p>
                <p className="text-xs text-gray-500">SLA breach alerts coming soon.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
