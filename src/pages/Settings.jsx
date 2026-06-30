import { useState, useEffect } from 'react';
import { User, Users, Globe, Bell, Building2, Check, ChevronDown, ExternalLink,
         AlertCircle, Loader2, Trash2, Copy, Code2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import TeamSection from '@/components/settings/TeamSection';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { getChannelConfigs, saveChannelConfig, deleteChannelConfig } from '@/lib/channels';
import { supabase } from '@/lib/supabase';

const PROD_URL = 'https://nyasadesk1.vercel.app';

const CHANNEL_INFO = [
  {
    id: 'whatsapp', label: 'WhatsApp Business', icon: '💬',
    color: '#25D366', bgColor: '#25D36618',
    desc: 'Receive & send WhatsApp messages via the Cloud API.',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    webhookUrl: `${PROD_URL}/api/webhooks/whatsapp`,
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID',              placeholder: '123456789012345', type: 'text'     },
      { key: 'waba_id',         label: 'WhatsApp Business Account ID', placeholder: '987654321098765', type: 'text'     },
      { key: 'access_token',    label: 'Permanent Access Token',       placeholder: 'EAAxxxxx…',       type: 'password' },
      { key: 'verify_token',    label: 'Webhook Verify Token',         placeholder: 'my-secret-token', type: 'text'     },
    ],
  },
  {
    id: 'messenger', label: 'Facebook Messenger', icon: '📘',
    color: '#0084FF', bgColor: '#0084FF18',
    desc: 'Connect your Facebook Page to handle Messenger conversations.',
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform/get-started',
    webhookUrl: `${PROD_URL}/api/webhooks/messenger`,
    fields: [
      { key: 'page_id',      label: 'Facebook Page ID',     placeholder: '123456789',       type: 'text'     },
      { key: 'page_token',   label: 'Page Access Token',    placeholder: 'EAAxxxxx…',       type: 'password' },
      { key: 'app_secret',   label: 'App Secret',           placeholder: 'From App Dashboard', type: 'password' },
      { key: 'verify_token', label: 'Webhook Verify Token', placeholder: 'my-secret-token', type: 'text'     },
    ],
  },
  {
    id: 'email', label: 'Email (IMAP/SMTP)', icon: '📧',
    color: '#6366F1', bgColor: '#6366F118',
    desc: 'Pull emails from any mailbox and reply directly from the inbox.',
    docsUrl: 'https://support.google.com/mail/answer/7126229',
    webhookUrl: `${PROD_URL}/api/webhooks/email`,
    fields: [
      { key: 'imap_host', label: 'IMAP Host',              placeholder: 'imap.gmail.com',         type: 'text'     },
      { key: 'imap_port', label: 'IMAP Port',              placeholder: '993',                    type: 'text'     },
      { key: 'smtp_host', label: 'SMTP Host',              placeholder: 'smtp.gmail.com',         type: 'text'     },
      { key: 'smtp_port', label: 'SMTP Port',              placeholder: '587',                    type: 'text'     },
      { key: 'email',     label: 'Email Address',          placeholder: 'support@yourdomain.com', type: 'text'     },
      { key: 'password',  label: 'Password / App Password', placeholder: '••••••••',             type: 'password' },
    ],
  },
  {
    id: 'website', label: 'Website Live Chat', icon: '🌐',
    color: '#06B6D4', bgColor: '#06B6D418',
    desc: 'Embed a live chat bubble on any website — one line of code.',
    docsUrl: null,
    webhookUrl: null,
    fields: [
      { key: 'greeting',        label: 'Greeting Message',   placeholder: 'Hi there 👋 How can we help?', type: 'text' },
      { key: 'label',           label: 'Widget Button Label', placeholder: 'Chat with us',                type: 'text' },
      { key: 'widget_color',    label: 'Accent Color',        placeholder: '#25D366',                     type: 'text' },
      { key: 'allowed_domains', label: 'Allowed Domains',     placeholder: 'yourdomain.com, app.example.com', type: 'text' },
    ],
  },
];

const SECTIONS = [
  { id: 'profile',   label: 'Profile',   icon: User      },
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'team',      label: 'Team',      icon: Users     },
  { id: 'channels',  label: 'Channels',  icon: Globe     },
  { id: 'sla',       label: 'SLA',       icon: Bell      },
];

const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className={`shrink-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors ${className}`}
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-[#25D366]" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
    </button>
  );
}

function ChannelCard({ ch, saved: savedConfig, workspaceId, onSave, onDelete }) {
  const [open, setOpen]       = useState(false);
  const [fields, setFields]   = useState(savedConfig?.config || {});
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const isConfigured = savedConfig?.enabled && ch.fields.every(f =>
    f.key === 'allowed_domains' || f.key === 'label' || f.key === 'greeting' ? true : (fields[f.key]?.trim?.() || ch.id === 'website')
  );

  // Website channel is always "configured" once saved (no required secrets)
  const isWebsiteReady = ch.id === 'website' && !!savedConfig?.enabled;

  const embedSnippet = `<script src="${PROD_URL}/widget.js" data-workspace-id="${workspaceId}"></script>`;

  const handleSave = async () => {
    setSaving(true); setFeedback('');
    try {
      await onSave(ch.id, fields);
      setFeedback('saved');
    } catch (e) {
      setFeedback('error:' + e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(''), 3000);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(ch.id); } catch {}
    setDeleting(false);
  };

  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all"
      style={{ borderColor: (isConfigured || isWebsiteReady) ? ch.color + '44' : 'rgba(255,255,255,0.08)', background: '#1a2530' }}
    >
      {/* Header */}
      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setOpen(o => !o)}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ background: ch.bgColor }}>
          {ch.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{ch.label}</p>
          <p className="text-[11px] text-gray-500 truncate">{ch.desc}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(isConfigured || isWebsiteReady)
            ? <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />Live
              </span>
            : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-gray-500">Not connected</span>
          }
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded */}
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-4">

          {/* Webhook URL (non-website channels) */}
          {ch.webhookUrl && (
            <div className="bg-[#111B21] rounded-xl p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Your Webhook URL</p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-[#25D366] font-mono truncate flex-1">{ch.webhookUrl}</p>
                <CopyButton text={ch.webhookUrl} />
              </div>
              <p className="text-[10px] text-gray-600 mt-1">Paste this into your Meta App → Webhooks.</p>
            </div>
          )}

          {/* Website: embed snippet auto-filled with workspace ID */}
          {ch.id === 'website' && workspaceId && (
            <div className="bg-[#111B21] rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wide">Your Embed Snippet</p>
              </div>
              <p className="text-[10px] text-gray-500">Copy and paste this into the <code className="text-cyan-400">&lt;head&gt;</code> or <code className="text-cyan-400">&lt;body&gt;</code> of every page you want the widget on.</p>
              <div className="flex items-start gap-2 mt-2">
                <code className="text-[11px] text-cyan-300 font-mono flex-1 break-all leading-relaxed bg-[#0D1418] rounded-lg p-2.5">
                  {embedSnippet}
                </code>
                <CopyButton text={embedSnippet} className="mt-1" />
              </div>
              <div className="mt-1 pt-2 border-t border-white/5">
                <p className="text-[10px] text-gray-500">Your Workspace ID:</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-[11px] text-gray-300 font-mono flex-1 truncate">{workspaceId}</code>
                  <CopyButton text={workspaceId} />
                </div>
              </div>
            </div>
          )}

          {/* Fields */}
          {ch.fields.map(f => (
            <div key={f.key}>
              <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">{f.label}</label>
              <input
                className={inputCls}
                type={f.type}
                placeholder={f.placeholder}
                value={fields[f.key] || ''}
                onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}

          {ch.docsUrl && (
            <a href={ch.docsUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
              <ExternalLink className="w-3 h-3" /> Setup guide
            </a>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ background: ch.color, color: '#fff', opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : feedback === 'saved' ? <Check className="w-4 h-4" /> : null}
              {saving ? 'Saving…' : feedback === 'saved' ? 'Saved!' : 'Save & Connect'}
            </button>
            {savedConfig && (
              <button onClick={handleDelete} disabled={deleting}
                className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}
          </div>
          {feedback.startsWith('error:') && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />{feedback.slice(6)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { user, profile } = useNyasaAuth();
  const [section, setSection]       = useState('channels');
  const [profileForm, setProfileForm] = useState({ full_name: user?.full_name || '', email: user?.email || '' });
  const [profileSaved, setProfileSaved] = useState(false);
  const [channelConfigs, setChannelConfigs] = useState({});
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [wsName, setWsName]         = useState(profile?.workspace_name || '');
  const [wsSaved, setWsSaved]       = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    setLoadingChannels(true);
    getChannelConfigs(user.id)
      .then(rows => {
        const map = {};
        rows.forEach(r => { map[r.channel] = r; });
        setChannelConfigs(map);
      })
      .catch(() => {})
      .finally(() => setLoadingChannels(false));
  }, [user?.id]);

  const handleSaveChannel = async (channel, fields) => {
    const row = await saveChannelConfig(user.id, channel, fields, true);
    setChannelConfigs(prev => ({ ...prev, [channel]: row }));
  };

  const handleDeleteChannel = async (channel) => {
    await deleteChannelConfig(user.id, channel);
    setChannelConfigs(prev => { const n = { ...prev }; delete n[channel]; return n; });
  };

  const saveProfile = async () => {
    await supabase.from('profiles').update({ full_name: profileForm.full_name }).eq('id', user?.id);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const saveWorkspace = async () => {
    await supabase.from('profiles').update({ workspace_name: wsName }).eq('id', user?.id);
    setWsSaved(true);
    setTimeout(() => setWsSaved(false), 2000);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />

      {/* Desktop sub-nav */}
      <div className="hidden md:flex w-56 bg-[#111B21] border-r border-white/10 flex-col py-4 px-3 shrink-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 mb-3">Settings</p>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setSection(id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-0.5
              ${section === id ? 'bg-[#25D366]/15 text-[#25D366]' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden bg-[#0D1418]">
        {/* Mobile tab strip */}
        <div className="md:hidden flex overflow-x-auto scrollbar-none bg-[#111B21] border-b border-white/10 px-2 pt-2 shrink-0 gap-1">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setSection(id)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-t-xl text-[10px] font-semibold whitespace-nowrap transition-all shrink-0
                ${section === id ? 'text-[#25D366] border-b-2 border-[#25D366]' : 'text-gray-500'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 space-y-4">

            {/* ── CHANNELS ─────────────────────────────────────────────────── */}
            {section === 'channels' && (
              <>
                <div className="mb-2">
                  <h2 className="text-base font-bold text-white">Channels</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Connect messaging channels. Your Workspace ID is <code className="text-[#25D366] font-mono">{user?.id?.slice(0,8)}…</code>
                  </p>
                </div>
                {loadingChannels
                  ? <div className="flex items-center gap-2 text-gray-500 text-sm py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
                  : CHANNEL_INFO.map(ch => (
                    <ChannelCard
                      key={ch.id}
                      ch={ch}
                      saved={channelConfigs[ch.id]}
                      workspaceId={user?.id}
                      onSave={handleSaveChannel}
                      onDelete={handleDeleteChannel}
                    />
                  ))
                }
              </>
            )}

            {/* ── PROFILE ──────────────────────────────────────────────────── */}
            {section === 'profile' && (
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5 space-y-4">
                <div className="flex items-center gap-4 mb-2">
                  <Avatar name={profileForm.full_name || ''} size="xl" />
                  <div>
                    <p className="font-bold text-white">{profileForm.full_name || 'Your Name'}</p>
                    <p className="text-xs text-gray-500">{user?.role}</p>
                  </div>
                </div>
                {[['full_name','Display Name'],['email','Email']].map(([k, label]) => (
                  <div key={k}>
                    <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">{label}</label>
                    <input className={inputCls} value={profileForm[k] || ''}
                      onChange={e => setProfileForm(f => ({ ...f, [k]: e.target.value }))} />
                  </div>
                ))}
                <button onClick={saveProfile}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] text-white text-sm font-bold rounded-xl hover:bg-[#20BA5A] transition-colors">
                  {profileSaved ? <><Check className="w-4 h-4" />Saved!</> : 'Save Profile'}
                </button>
              </div>
            )}

            {/* ── WORKSPACE ────────────────────────────────────────────────── */}
            {section === 'workspace' && (
              <div className="bg-[#202C33] rounded-2xl border border-white/10 p-5 space-y-4">
                <div>
                  <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">Workspace Name</label>
                  <input className={inputCls} value={wsName} onChange={e => setWsName(e.target.value)} placeholder="My Company" />
                </div>
                <button onClick={saveWorkspace}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] text-white text-sm font-bold rounded-xl hover:bg-[#20BA5A] transition-colors">
                  {wsSaved ? <><Check className="w-4 h-4" />Saved!</> : 'Save Workspace'}
                </button>
              </div>
            )}

            {/* ── TEAM ─────────────────────────────────────────────────────── */}
            {section === 'team' && <TeamSection />}

            {/* ── SLA ──────────────────────────────────────────────────────── */}
            {section === 'sla' && (
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
