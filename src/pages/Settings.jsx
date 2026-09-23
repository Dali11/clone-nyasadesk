import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { User, Users, Globe, Bell, Building2, Check, Loader2,
  Trash2, Copy, ExternalLink, ChevronDown, AlertCircle, Code2, ShieldCheck, CreditCard, Crown, Clock, CheckCircle2,
  Megaphone,  BadgeDollarSign, RefreshCw } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Avatar from '@/components/Avatar';
import TeamSection from '@/components/settings/TeamSection';
import NoticeboardSection from '@/components/settings/NoticeboardSection';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { getChannelConfigs, saveChannelConfig, deleteChannelConfig } from '@/lib/channels';
import { supabase } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useFacebookSDK } from '@/hooks/useFacebookSDK';
import { useToast } from '@/components/ui/use-toast';

const PROD_URL  = 'https://nyasadesk.com';
const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID || '';

const SECTIONS = [
  { id: 'profile',   label: 'Profile',   icon: User,      adminOnly: false },
  { id: 'workspace', label: 'Workspace', icon: Building2, adminOnly: true  },
  { id: 'team',      label: 'Team',      icon: Users,     adminOnly: false },
  { id: 'channels',  label: 'Channels',  icon: Globe,     adminOnly: true  },
  { id: 'sla',       label: 'SLA',       icon: Bell,      adminOnly: true  },
  { id: 'subscription', label: 'Subscription', icon: CreditCard, adminOnly: true  },
  { id: 'noticeboard', label: 'Noticeboard', icon: Megaphone, adminOnly: false },
];

const inputCls = 'w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

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
      style={{ borderColor: isLive ? accentColor + '44' : 'rgba(255,255,255,0.08)', background:'var(--nyasa-surface-2)' }}
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
        <div className="px-4 pb-5 border-t border-[var(--nyasa-border)] pt-4">
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
  const [tab, setTab] = useState('recommended'); // recommended | advanced
  const [advMode, setAdvMode] = useState('discover'); // discover | manual

  // Embedded Signup state
  const [embeddedLoading, setEmbeddedLoading] = useState(false);
  const [embeddedError, setEmbeddedError] = useState('');
  const [embeddedSetupPin, setEmbeddedSetupPin] = useState(null); // set if auto-registered

  // Advanced / discover state
  const [token, setToken] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [wabas, setWabas] = useState(null); // null = not yet discovered
  const [selectedWabaId, setSelectedWabaId] = useState('');
  const [selectedPhoneId, setSelectedPhoneId] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Manual entry state
  const [manualToken, setManualToken] = useState('');
  const [manualWabaId, setManualWabaId] = useState('');
  const [manualPhoneId, setManualPhoneId] = useState('');
  const [manualConnecting, setManualConnecting] = useState(false);
  const [manualError, setManualError] = useState('');

  // Registration wizard (triggered after manual connect when phone not registered)
  const [regWizard, setRegWizard] = useState(null); // null | { waba_id, phone_number_id, phone_number, verified_name }
  const [regStep, setRegStep] = useState('code'); // code | pin
  const [regCode, setRegCode] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState('');
  const [regIsAppNumber, setRegIsAppNumber] = useState(false);
  const [activeToken, setActiveToken] = useState(''); // token used for the current manual connect

  // Register new number state
  const [freshMode, setFreshMode] = useState(false);
  const [freshStep, setFreshStep] = useState('input');
  const [freshBusy, setFreshBusy] = useState(false);
  const [freshError, setFreshError] = useState('');
  const [freshBusinessId, setFreshBusinessId] = useState('');
  const [freshCc, setFreshCc] = useState('');
  const [freshPhone, setFreshPhone] = useState('');
  const [freshIsAppNumber, setFreshIsAppNumber] = useState(false);
  const [freshCode, setFreshCode] = useState('');
  const [freshPin, setFreshPin] = useState('');
  const [freshWabaId, setFreshWabaId] = useState('');
  const [freshPhoneId, setFreshPhoneId] = useState('');

  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [coexistenceMode, setCoexistenceMode] = useState(!!saved?.config?.coexistence_mode);

  const handleCoexistenceToggle = async (enabled) => {
    setCoexistenceMode(enabled);
    if (onSave) await onSave('whatsapp', { ...saved.config, coexistence_mode: enabled });
  };

  const embeddedSignupDataRef = useState({ current: null })[0];
  const { loadFacebookSDK, sdkReady } = useFacebookSDK();

  const isLive = !!(saved && saved.enabled && saved.config &&
    (saved.config.waba_id || saved.config.access_token || saved.config.phone_number_id));

  const apiCall = async (action, body) => {
    const res = await fetch(`/api/channels?action=${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return res.json();
  };

  // ── Verify ────────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    setVerifying(true); setVerifyResult(null);
    try {
      const res = await fetch('/api/channels?action=verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, channel: 'whatsapp' }),
      });
      const data = await res.json();
      setVerifyResult(data);
    } catch (e) { setVerifyResult({ ok: false, error: e.message }); } finally { setVerifying(false); }
  };

  // ── Disconnect ────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    try { if (onDelete) await onDelete('whatsapp'); } catch (e) { setError('Disconnect failed: ' + e.message); }
  };

  // ── Refresh phone details from Meta ───────────────────────────────────────
  const handleRefreshStatus = async () => {
    if (!saved?.config?.access_token || !saved?.config?.phone_number_id) return;
    setRefreshing(true);
    try {
      const data = await apiCall('whatsapp-refresh-status', {
        workspace_id: workspaceId,
        access_token: saved.config.access_token,
        phone_number_id: saved.config.phone_number_id,
        waba_id: saved.config.waba_id,
      });
      if (data.ok && onSave) {
        onSave('whatsapp', { ...saved.config, ...data.phone });
      }
    } catch (e) { /* silently ignore */ }
    finally { setRefreshing(false); }
  };

  // ── Embedded Signup ───────────────────────────────────────────────────────
  // MOBILE POPUP RULE: mobile browsers only allow the FB.login popup when it
  // fires synchronously inside the tap handler. Doing config fetch + SDK load
  // + FB.init on tap breaks the user-gesture chain and the popup gets
  // blocked. So we PRELOAD all of it on mount into a ref, and the tap handler
  // calls FB.login directly. If the preload is still in flight on first tap,
  // we finish it and ask the user to tap once more (next tap is instant).
  const embeddedReadyRef = useRef(null);
  const embeddedPreloadRef = useRef(null);

  const preloadEmbedded = () => {
    if (!embeddedPreloadRef.current) {
      embeddedPreloadRef.current = (async () => {
        try {
          const configRes = await fetch('/api/auth/whatsapp-embedded', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ _action: 'get_config' }),
          });
          const configData = await configRes.json();
          if (!configData.config_id || !configData.app_id) return { ok: false, reason: 'not-configured' };
          await loadFacebookSDK();
          await new Promise((resolve) => {
            if (window.FB) return resolve();
            const prevInit = window.fbAsyncInit;
            window.fbAsyncInit = () => { if (prevInit) prevInit(); resolve(); };
            setTimeout(resolve, 4000);
          });
          if (!window.FB) return { ok: false, reason: 'sdk' };
          window.FB.init({ appId: configData.app_id, version: 'v26.0', cookie: true });
          return { ok: true, configData };
        } catch { return { ok: false, reason: 'network' }; }
      })();
    }
    return embeddedPreloadRef.current;
  };

  useEffect(() => { preloadEmbedded(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEmbeddedSignup = () => {
    setEmbeddedError(''); setEmbeddedSetupPin(null);
    const ready = embeddedReadyRef.current;
    if (ready) { startFBLogin(ready.configData); return; }
    setEmbeddedLoading(true);
    preloadEmbedded().then((r) => {
      setEmbeddedLoading(false);
      if (r.ok) {
        embeddedReadyRef.current = r;
        setEmbeddedError('Ready — tap Connect with Facebook again to continue.');
      } else {
        setEmbeddedError(
          r.reason === 'not-configured' ? "Facebook signup isn't configured yet. Use the Advanced option below." :
          r.reason === 'sdk' ? 'Facebook SDK failed to load. Check your connection and refresh the page.' :
          'Could not reach Facebook. Check your connection and try again.');
      }
    });
  };

  const startFBLogin = (configData) => {
    window.removeEventListener('message', window._nyasaWAListener);
    window._nyasaWAListener = (e) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.data?.waba_id || data.data?.phone_number_id) {
            embeddedSignupDataRef.current = data.data;
          } else if (data.waba_id || data.phone_number_id) {
            embeddedSignupDataRef.current = data;
          } else if (data.event === 'FINISH' && data.data) {
            embeddedSignupDataRef.current = data.data;
          }
        }
      } catch {}
    };
    window.addEventListener('message', window._nyasaWAListener);

    setEmbeddedLoading(true);
    // The FB SDK type-checks the login callback and REJECTS async functions
    // ("Expression is of type asyncfunction, not function") — pass a plain
    // sync callback and delegate the async work to a helper.
    const finishEmbedded = async (response) => {
      window.removeEventListener('message', window._nyasaWAListener);
      if (!response?.authResponse?.code) {
        setEmbeddedLoading(false);
        setEmbeddedError('Login was cancelled or did not complete. Please try again.');
        return;
      }
      try {
        const captured = embeddedSignupDataRef.current || {};
        const res = await fetch('/api/auth/whatsapp-embedded', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: response.authResponse.code, workspace_id: workspaceId,
            waba_id: captured.waba_id || null, phone_number_id: captured.phone_number_id || null,
          }),
        });
        const d = await res.json();
        if (d.ok) {
          if (d.setup_pin) setEmbeddedSetupPin(d.setup_pin);
          if (onSave) onSave('whatsapp', d.config || { connected_via: 'embedded_signup' });
        } else {
          setEmbeddedError(d.error || 'Connection failed. Please try again.');
        }
      } catch (e) {
        setEmbeddedError(e.message);
      } finally { setEmbeddedLoading(false); }
    };
    try {
      window.FB.login((response) => { finishEmbedded(response); }, {
      config_id: configData.config_id,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, sessionInfoVersion: '3' },
      });
    } catch (e) {
      setEmbeddedLoading(false);
      setEmbeddedError('Facebook login failed to start: ' + (e.message || e));
    }
  };

  // ── Advanced: discover ────────────────────────────────────────────────────
  const handleDiscover = async () => {
    if (!token.trim()) { setDiscoverError('Paste your access token first'); return; }
    setDiscovering(true); setDiscoverError(''); setWabas(null);
    try {
      const data = await apiCall('whatsapp-guided-discover', { access_token: token.trim() });
      if (!data.ok) { setDiscoverError(data.error || 'Discovery failed'); return; }
      setWabas(data.wabas || []);
      const first = data.wabas?.[0];
      setSelectedWabaId(first?.waba_id || '');
      setSelectedPhoneId(first?.phone_numbers?.[0]?.phone_number_id || '');
    } catch (e) { setDiscoverError(e.message); } finally { setDiscovering(false); }
  };

  const handleDiscoverConnect = async () => {
    if (!selectedWabaId || !selectedPhoneId) { setDiscoverError('Select a WABA and phone number first'); return; }
    setConnecting(true); setDiscoverError('');
    try {
      const data = await apiCall('whatsapp-guided-connect', {
        workspace_id: workspaceId, access_token: token.trim(),
        waba_id: selectedWabaId, phone_number_id: selectedPhoneId,
      });
      if (!data.ok) { setDiscoverError(data.error || 'Connect failed'); return; }
      if (onSave) onSave('whatsapp', data.config);
      setToken(''); setWabas(null);
    } catch (e) { setDiscoverError(e.message); } finally { setConnecting(false); }
  };

  // ── Advanced: manual ──────────────────────────────────────────────────────
  const handleManualConnect = async () => {
    if (!manualToken.trim() || !manualWabaId.trim() || !manualPhoneId.trim()) { setManualError('All three fields are required'); return; }
    setManualConnecting(true); setManualError('');
    try {
      const data = await apiCall('whatsapp-manual-connect', {
        workspace_id: workspaceId, access_token: manualToken.trim(),
        waba_id: manualWabaId.trim(), phone_number_id: manualPhoneId.trim(),
      });
      if (!data.ok) { setManualError(data.error || 'Connection failed'); return; }
      if (data.needs_registration) {
        setActiveToken(manualToken.trim());
        setRegWizard({ waba_id: data.waba_id, phone_number_id: data.phone_number_id, phone_number: data.phone_number, verified_name: data.verified_name });
        setRegStep('code'); setRegCode(''); setRegPin(''); setRegError(''); setRegIsAppNumber(false);
        // Immediately fire the SMS code — detect if it's a WhatsApp App number
        const codeRes = await apiCall('whatsapp-guided-request-code', { access_token: manualToken.trim(), phone_number_id: data.phone_number_id, code_method: 'SMS' });
        if (codeRes.error_code === 'WHATSAPP_APP_NUMBER' || (codeRes.error && codeRes.error.includes('WhatsApp Business App'))) {
          setRegIsAppNumber(true);
        }
      } else {
        if (onSave) onSave('whatsapp', data.config);
        setManualToken(''); setManualWabaId(''); setManualPhoneId('');
      }
    } catch (e) { setManualError(e.message); } finally { setManualConnecting(false); }
  };

  // ── Registration wizard ───────────────────────────────────────────────────
  const handleRegVerify = async () => {
    if (!regCode.trim()) { setRegError('Enter the code you received'); return; }
    setRegBusy(true); setRegError('');
    try {
      const data = await apiCall('whatsapp-guided-verify-code', { access_token: activeToken, phone_number_id: regWizard.phone_number_id, code: regCode.trim() });
      if (!data.ok) { setRegError(data.error || 'Verification failed'); return; }
      setRegStep('pin');
    } catch (e) { setRegError(e.message); } finally { setRegBusy(false); }
  };

  const handleRegComplete = async () => {
    if (!/^\d{6}$/.test(regPin.trim())) { setRegError('PIN must be exactly 6 digits'); return; }
    setRegBusy(true); setRegError('');
    try {
      // Single action: register phone + update existing config (webhooks already subscribed by manual-connect)
      const data = await apiCall('whatsapp-complete-registration', {
        workspace_id: workspaceId,
        access_token: activeToken,
        phone_number_id: regWizard.phone_number_id,
        waba_id: regWizard.waba_id,
        pin: regPin.trim(),
      });
      if (!data.ok) { setRegError(data.error || 'Registration failed'); return; }
      if (onSave) onSave('whatsapp', data.config);
      setRegWizard(null); setManualToken(''); setManualWabaId(''); setManualPhoneId('');
    } catch (e) { setRegError(e.message); } finally { setRegBusy(false); }
  };

  // ── Fresh number wizard ───────────────────────────────────────────────────
  const freshApiCall = async (action, body) => {
    const data = await apiCall(action, body);
    if (!data.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  };
  const handleFreshStart = async () => {
    if (!token.trim() || !freshBusinessId.trim() || !freshCc.trim() || !freshPhone.trim()) { setFreshError('All fields are required'); return; }
    // Strip leading zero — Meta's API requires the number without it (e.g. 891107334 not 0891107334)
    const normalizedPhone = freshPhone.trim().replace(/^0+/, '');
    if (!normalizedPhone) { setFreshError('Enter a valid phone number'); return; }
    setFreshBusy(true); setFreshError(''); setFreshIsAppNumber(false);
    try {
      const data = await freshApiCall('whatsapp-guided-fresh-setup', { access_token: token.trim(), business_id: freshBusinessId.trim(), cc: freshCc.trim(), phone_number: normalizedPhone });
      setFreshWabaId(data.waba_id); setFreshPhoneId(data.phone_number_id);
      // freshSetup fires request_code immediately — check if it flagged an app-number
      if (data.error_code === 'WHATSAPP_APP_NUMBER' || data.is_app_number) {
        setFreshIsAppNumber(true);
      }
      setFreshStep('code');
    } catch (e) {
      // If the error is the app-number coexistence case, go to the redirect screen instead
      if (e.message && e.message.includes('WhatsApp Business App')) {
        setFreshIsAppNumber(true);
        setFreshStep('code');
      } else {
        setFreshError(e.message);
      }
    } finally { setFreshBusy(false); }
  };
  const handleFreshResend = async (method) => {
    setFreshBusy(true); setFreshError('');
    try { await freshApiCall('whatsapp-guided-request-code', { access_token: token.trim(), phone_number_id: freshPhoneId, code_method: method }); }
    catch (e) { setFreshError(e.message); } finally { setFreshBusy(false); }
  };
  const handleFreshVerify = async () => {
    if (!freshCode.trim()) { setFreshError('Enter the code'); return; }
    setFreshBusy(true); setFreshError('');
    try {
      await freshApiCall('whatsapp-guided-verify-code', { access_token: token.trim(), phone_number_id: freshPhoneId, code: freshCode.trim() });
      setFreshStep('pin');
    } catch (e) { setFreshError(e.message); } finally { setFreshBusy(false); }
  };
  const handleFreshRegisterAndConnect = async () => {
    if (!/^\d{6}$/.test(freshPin.trim())) { setFreshError('PIN must be exactly 6 digits'); return; }
    setFreshBusy(true); setFreshError('');
    try {
      await freshApiCall('whatsapp-guided-register-phone', { access_token: token.trim(), phone_number_id: freshPhoneId, pin: freshPin.trim() });
      const data = await freshApiCall('whatsapp-guided-connect', { workspace_id: workspaceId, access_token: token.trim(), waba_id: freshWabaId, phone_number_id: freshPhoneId });
      if (onSave) onSave('whatsapp', data.config);
      setFreshMode(false); setFreshStep('input'); setToken('');
    } catch (e) { setFreshError(e.message); } finally { setFreshBusy(false); }
  };

  const connectedViaLabel = {
    embedded_signup: 'Connected via Facebook Login',
    guided_graph_api: 'Connected via Guided Setup',
    manual_cloud_api: 'Connected via Manual Cloud API',
  };

  const qualityColors = { GREEN: 'text-emerald-400', YELLOW: 'text-amber-400', RED: 'text-red-400' };

  const subtitle = isLive
    ? (saved.config?.verified_name || saved.config?.phone_number || 'Connected')
    : 'Connect your WhatsApp Business number';

  return (
    <ChannelCard iconUrl="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" title="WhatsApp" subtitle={subtitle}
      accentColor="#25D366" isLive={isLive}>

      {/* ── Connected state ── */}
      {isLive && (
        <div className="space-y-3">
          <div className="bg-[var(--nyasa-surface-1)] rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-white">WhatsApp is connected</p>
                {saved.config?.phone_number && (
                  <p className="text-xs text-gray-400 mt-0.5">{saved.config.phone_number}{saved.config?.verified_name ? ` · ${saved.config.verified_name}` : ''}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#25D36620] text-[#25D366] font-medium">
                  {connectedViaLabel[saved.config?.connected_via] || 'Cloud API'}
                </span>
              </div>
            </div>

            {/* Quality + registration status */}
            <div className="flex items-center gap-3">
              {saved.config?.quality_rating && (
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${saved.config.quality_rating === 'GREEN' ? 'bg-emerald-400' : saved.config.quality_rating === 'YELLOW' ? 'bg-amber-400' : saved.config.quality_rating === 'RED' ? 'bg-red-400' : 'bg-gray-500'}`} />
                  <span className={`text-[11px] font-medium ${qualityColors[saved.config.quality_rating] || 'text-gray-400'}`}>
                    {saved.config.quality_rating === 'UNKNOWN' ? 'Quality not yet rated' : `Quality: ${saved.config.quality_rating}`}
                  </span>
                </div>
              )}
              <button onClick={handleRefreshStatus} disabled={refreshing}
                className="ml-auto flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-40">
                <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            {/* WABA ID info */}
            {saved.config?.waba_id && (
              <div className="text-[10px] text-gray-600 font-mono">
                WABA: {saved.config.waba_id} · PID: {saved.config.phone_number_id}
              </div>
            )}

            {/* WhatsApp Business App coexistence */}
            <label className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[#25D366]" checked={coexistenceMode}
                onChange={e => handleCoexistenceToggle(e.target.checked)} />
              <span>
                <span className="block text-xs font-semibold text-white">Business App coexistence</span>
                <span className="block text-[11px] text-gray-500 leading-relaxed mt-0.5">
                  Keep using this number in the WhatsApp Business App. Messages sent from the app will appear as outbound activity here without creating duplicate AI replies.
                </span>
              </span>
            </label>

            {/* Webhook info for Meta configuration */}
            <div className="bg-[var(--nyasa-surface-1)] rounded-xl p-3 space-y-1.5 border border-white/5">
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Webhook Config (for Meta Dashboard)</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-20 shrink-0">Callback URL</span>
                <span className="text-[10px] font-mono text-gray-300 flex-1 truncate">https://nyasadesk.com/api/webhooks/whatsapp</span>
                <CopyBtn text="https://nyasadesk.com/api/webhooks/whatsapp" />
              </div>
              {saved.config?.verify_token && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-20 shrink-0">Verify Token</span>
                  <span className="text-[10px] font-mono text-gray-300 flex-1">{saved.config.verify_token}</span>
                  <CopyBtn text={saved.config.verify_token} />
                </div>
              )}
            </div>

            {embeddedSetupPin && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-[11px] font-semibold text-amber-400">Save your 2FA PIN: <span className="font-mono text-white">{embeddedSetupPin}</span></p>
                <p className="text-[11px] text-amber-200/70 mt-0.5">Meta set this as your two-step verification PIN when registering the number. Keep it safe — you may need it later.</p>
              </div>
            )}
            <p className="text-[11px] text-gray-500">Connected via the official WhatsApp Cloud API. Messages route automatically.</p>
          </div>

          {verifyResult && (
            <div className={`rounded-lg p-3 text-xs ${verifyResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {verifyResult.ok ? 'Webhook verified — messages are routing correctly.' : `Verification failed: ${verifyResult.error}`}
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button onClick={handleVerify} disabled={verifying}
              className="flex-1 py-2.5 rounded-xl text-xs font-medium text-white bg-white/8 hover:bg-white/12 disabled:opacity-50">
              {verifying ? 'Verifying…' : 'Verify webhook'}
            </button>
            <button onClick={handleDisconnect}
              className="flex-1 py-2.5 rounded-xl text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20">
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* ── Connect state ── */}
      {!isLive && (
        <div className="space-y-3">

          {/* Manual entry — primary method */}
          {!regWizard && (
            <div className="bg-[var(--nyasa-surface-1)] rounded-xl p-4 space-y-3">
              <div>
                <p className="text-xs font-bold text-white mb-0.5">Cloud API Credentials</p>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Find these in <strong>Meta Business Suite → WhatsApp Manager</strong>. Use a permanent System User access token.
                </p>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-500">Permanent Access Token <span className="text-red-400">*</span></label>
                  <input type="password" value={manualToken} onChange={e => setManualToken(e.target.value)} placeholder="EAAG…"
                    className="w-full bg-[var(--nyasa-bg)] text-white text-xs rounded-lg p-2.5 border border-[var(--nyasa-border)] focus:border-[#25D366] outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-500">WhatsApp Business Account ID (WABA ID) <span className="text-red-400">*</span></label>
                  <input value={manualWabaId} onChange={e => setManualWabaId(e.target.value)} placeholder="916980661415765"
                    className="w-full bg-[var(--nyasa-bg)] text-white text-xs rounded-lg p-2.5 border border-[var(--nyasa-border)] focus:border-[#25D366] outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-500">Phone Number ID <span className="text-red-400">*</span></label>
                  <input value={manualPhoneId} onChange={e => setManualPhoneId(e.target.value)} placeholder="1228643423663631"
                    className="w-full bg-[var(--nyasa-bg)] text-white text-xs rounded-lg p-2.5 border border-[var(--nyasa-border)] focus:border-[#25D366] outline-none" />
                </div>
              </div>
              {manualError && <p className="text-[11px] text-red-400 leading-relaxed">{manualError}</p>}
              <button onClick={handleManualConnect} disabled={manualConnecting || !manualToken.trim() || !manualWabaId.trim() || !manualPhoneId.trim()}
                className="w-full py-3 rounded-xl text-sm font-bold text-white bg-[#25D366] hover:bg-[#20BD5A] disabled:opacity-50 flex items-center justify-center gap-2">
                {manualConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {manualConnecting ? 'Connecting…' : 'Connect to WhatsApp Cloud API'}
              </button>

              {/* Connect with Facebook — Embedded Signup (coexistence-capable) */}
              <div className="pt-1 space-y-2">
                <button onClick={handleEmbeddedSignup} disabled={embeddedLoading}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white bg-[#1877F2] hover:bg-[#0f6add] disabled:opacity-60 flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  {embeddedLoading ? 'Completing signup…' : 'Connect with Facebook'}
                </button>
                <p className="text-[10px] text-center text-gray-500 leading-relaxed">
                  One-click official Meta flow. Best if this number is already registered on the WhatsApp
                  Business App — you can keep it running in both places (coexistence).
                </p>
                {embeddedError && <p className="text-[11px] text-red-400 leading-relaxed">{embeddedError}</p>}
              </div>
            </div>
          )}

          {/* Registration wizard — shown after manual connect when number not yet on Cloud API */}
          {regWizard && (
            <div className="bg-[var(--nyasa-surface-1)] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Register on Cloud API</p>
                  <p className="text-[11px] text-gray-400">{regWizard.phone_number || regWizard.phone_number_id}</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Your credentials are valid but this number isn't registered on WhatsApp Cloud API yet. 
                Complete the steps below to activate it — this only takes a minute.
              </p>

              {/* Step indicator */}
              <div className="flex items-center gap-2 py-1">
                <div className={`flex items-center gap-1.5 ${regStep === 'code' ? 'text-white' : 'text-[#25D366]'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${regStep === 'code' ? 'bg-[#25D366] text-white' : 'bg-[#25D366]/20 text-[#25D366]'}`}>
                    {regStep === 'code' ? '1' : '✓'}
                  </div>
                  <span className="text-[11px]">Verify number</span>
                </div>
                <div className="flex-1 h-px bg-[var(--nyasa-border)]" />
                <div className={`flex items-center gap-1.5 ${regStep === 'pin' ? 'text-white' : 'text-gray-500'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${regStep === 'pin' ? 'bg-[#25D366] text-white' : 'bg-white/10 text-gray-500'}`}>2</div>
                  <span className="text-[11px]">Set PIN & activate</span>
                </div>
              </div>

              {regStep === 'code' && !regIsAppNumber && (
                <div className="space-y-2.5">
                  <div className="bg-[#25D366]/10 rounded-lg p-2.5">
                    <p className="text-[11px] text-[#25D366]">✓ Verification code sent via SMS to your number</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-500">Enter 6-digit verification code</label>
                    <input value={regCode} onChange={e => setRegCode(e.target.value.replace(/\D/g, '').slice(0, 6))} 
                      placeholder="123456" maxLength={6}
                      className="w-full bg-[var(--nyasa-bg)] text-white text-sm text-center tracking-widest font-mono rounded-lg p-2.5 border border-[var(--nyasa-border)] focus:border-[#25D366] outline-none" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={async () => { setRegBusy(true); try { await apiCall('whatsapp-guided-request-code', { access_token: activeToken, phone_number_id: regWizard.phone_number_id, code_method: 'SMS' }); } finally { setRegBusy(false); } }} 
                      disabled={regBusy} className="flex-1 py-2 rounded-lg text-[11px] text-gray-400 bg-white/5 hover:bg-white/10 disabled:opacity-50">
                      Resend SMS
                    </button>
                    <button onClick={async () => { setRegBusy(true); try { await apiCall('whatsapp-guided-request-code', { access_token: activeToken, phone_number_id: regWizard.phone_number_id, code_method: 'VOICE' }); } finally { setRegBusy(false); } }} 
                      disabled={regBusy} className="flex-1 py-2 rounded-lg text-[11px] text-gray-400 bg-white/5 hover:bg-white/10 disabled:opacity-50">
                      Call me instead
                    </button>
                  </div>
                  <button onClick={handleRegVerify} disabled={regBusy || regCode.length < 6}
                    className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-[#25D366] hover:bg-[#20BD5A] disabled:opacity-50 flex items-center justify-center gap-2">
                    {regBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {regBusy ? 'Verifying…' : 'Verify code'}
                  </button>
                </div>
              )}

              {regStep === 'code' && regIsAppNumber && (
                <div className="space-y-3">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-bold text-amber-300">Number is on WhatsApp Business App</p>
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                      Meta blocks SMS verification for numbers active on the WhatsApp Business App. 
                      You'll need to use the "Connect with Facebook" flow (coming soon) to keep both running simultaneously.
                    </p>
                    <p className="text-[11px] text-amber-200/60 leading-relaxed">
                      Alternatively, remove the number from your WhatsApp Business App (Settings → Account → Delete my account), 
                      then come back here and try again.
                    </p>
                  </div>
                  <button onClick={() => { setRegWizard(null); setRegIsAppNumber(false); }} 
                    className="w-full text-center text-[11px] text-gray-500 hover:text-gray-300">← Back to credentials</button>
                </div>
              )}

              {regStep === 'pin' && (
                <div className="space-y-2.5">
                  <div className="bg-[#25D366]/10 rounded-lg p-2.5">
                    <p className="text-[11px] text-[#25D366]">✓ Number verified — now set your 2-step verification PIN</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-500">6-digit PIN <span className="text-gray-600">(save this — you'll need it if you ever re-register)</span></label>
                    <input value={regPin} onChange={e => setRegPin(e.target.value.replace(/\D/g, '').slice(0, 6))} 
                      placeholder="123456" maxLength={6}
                      className="w-full bg-[var(--nyasa-bg)] text-white text-sm text-center tracking-widest font-mono rounded-lg p-2.5 border border-[var(--nyasa-border)] focus:border-[#25D366] outline-none" />
                  </div>
                  <button onClick={handleRegComplete} disabled={regBusy || regPin.length < 6}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white bg-[#25D366] hover:bg-[#20BD5A] disabled:opacity-50 flex items-center justify-center gap-2">
                    {regBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    {regBusy ? 'Registering & activating…' : 'Activate on Cloud API'}
                  </button>
                </div>
              )}

              {regError && <p className="text-[11px] text-red-400 mt-1">{regError}</p>}
              <button onClick={() => { setRegWizard(null); setRegError(''); }} 
                className="w-full text-center text-[11px] text-gray-500 hover:text-gray-300">← Back to credentials</button>
            </div>
          )}
        </div>
      )}    </ChannelCard>
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
                <div className="bg-[var(--nyasa-surface-1)] rounded-xl p-4 space-y-2">
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
                <div className="bg-[var(--nyasa-surface-1)] rounded-xl p-3">
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
  const [tab, setTab]       = useState('gmail');           // 'gmail' | 'manual'
  const [fields, setFields] = useState(saved?.config || {});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState('');
  const [gmailLoading, setGmailLoading] = useState(false);

  const isLive       = !!(saved?.enabled && saved?.config?.email);
  const isGmailLive  = isLive && saved?.config?.provider === 'gmail';
  const isManualLive = isLive && saved?.config?.provider !== 'gmail';
  const connectedEmail = saved?.config?.email || '';

  // Handle redirect back from Google OAuth (?email_connected=1 or ?email_error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('email_connected')) {
      setStatus('Gmail connected! ✅');
      // Clean the URL
      const url = new URL(window.location.href);
      url.searchParams.delete('email_connected');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url);
    } else if (params.get('email_error')) {
      setStatus('error: ' + decodeURIComponent(params.get('email_error')));
      const url = new URL(window.location.href);
      url.searchParams.delete('email_error');
      window.history.replaceState({}, '', url);
    }
  }, []);

  const handleGmailConnect = async () => {
    setGmailLoading(true);
    setStatus('');
    try {
      const res = await fetch(`/api/channels?action=gmail-oauth-url&workspace_id=${workspaceId}`);
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      // Redirect to Google consent screen — callback will redirect back to /settings
      window.location.href = d.url;
    } catch (e) {
      setStatus('error: ' + e.message);
      setGmailLoading(false);
    }
  };

  const handleManualSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      await onSave('email', { ...fields, provider: 'manual' });
      setStatus('saved');
    } catch (e) {
      setStatus('error: ' + e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 4000);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus('');
    try {
      const res = await fetch('/api/channels?action=email-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      const d = await res.json();
      setStatus(d.ok ? ('✅ ' + d.message) : ('error: ' + d.error));
    } catch (e) {
      setStatus('error: ' + e.message);
    } finally {
      setTesting(false);
      setTimeout(() => setStatus(''), 5000);
    }
  };

  const subtitle = isLive ? `Connected · ${connectedEmail}` : 'Turn emails into inbox conversations';

  return (
    <ChannelCard emoji="📧" title="Email" subtitle={subtitle} accentColor="#6366F1" isLive={isLive}>
      {/* Status banner */}
      {status && (
        <div className={`mb-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${status.startsWith('error:') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {status.startsWith('error:') ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
          <span>{status.startsWith('error:') ? status.slice(7) : status}</span>
        </div>
      )}

      {/* Connected state quick-actions */}
      {isLive && (
        <div className="mb-4 flex items-center justify-between bg-[var(--nyasa-surface-2)] rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm text-[var(--nyasa-text)]">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="font-medium truncate max-w-[180px]">{connectedEmail}</span>
            {isGmailLive && <span className="text-[10px] text-[var(--nyasa-text-muted)] bg-[var(--nyasa-surface-3)] px-1.5 py-0.5 rounded-full">Gmail OAuth</span>}
            {isManualLive && <span className="text-[10px] text-[var(--nyasa-text-muted)] bg-[var(--nyasa-surface-3)] px-1.5 py-0.5 rounded-full">Manual</span>}
          </div>
          <div className="flex gap-1.5">
            <button onClick={handleTest} disabled={testing}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-[var(--nyasa-surface-3)] text-[var(--nyasa-text-muted)] hover:text-[var(--nyasa-text)] transition-colors">
              {testing ? 'Testing…' : 'Test'}
            </button>
            <button onClick={() => onDelete('email')}
              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--nyasa-surface-2)] rounded-xl mb-4">
        {[{ id: 'gmail', label: 'Gmail (Recommended)' }, { id: 'manual', label: 'Manual / Other' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${tab === t.id ? 'bg-[#6366F1] text-white shadow' : 'text-[var(--nyasa-text-muted)] hover:text-[var(--nyasa-text)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Gmail tab */}
      {tab === 'gmail' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] p-4 space-y-2.5">
            <p className="text-sm font-semibold text-[var(--nyasa-text)]">Connect your Gmail account</p>
            <p className="text-xs text-[var(--nyasa-text-muted)] leading-relaxed">
              One click — Google will ask you to sign in and grant Nyasadesk permission to send and read emails on your behalf. No passwords stored.
            </p>
            <ul className="space-y-1">
              {['Inbound emails → auto-create conversations', 'Reply directly from the inbox', 'Access token refreshed automatically'].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-[var(--nyasa-text-muted)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <button onClick={handleGmailConnect} disabled={gmailLoading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-bold text-sm border border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] hover:bg-[var(--nyasa-surface-3)] transition-colors text-[var(--nyasa-text)]"
            style={{ opacity: gmailLoading ? 0.7 : 1 }}>
            {gmailLoading ? (
              <span className="text-[var(--nyasa-text-muted)]">Redirecting to Google…</span>
            ) : (
              <>
                {/* Google G logo */}
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#4285F4" d="M47.5 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.4 5.6-5 7.3v6h8.1c4.7-4.4 7.2-10.8 7.2-17.5z"/>
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-8.1-6c-2.1 1.4-4.8 2.2-7.8 2.2-6 0-11.1-4-12.9-9.5H2.8v6.2C6.8 42.7 14.8 48 24 48z"/>
                  <path fill="#FBBC05" d="M11.1 28.9c-.5-1.4-.7-2.8-.7-4.3s.2-3 .7-4.3v-6.2H2.8C1 17.5 0 20.6 0 24s1 6.5 2.8 9.1l8.3-4.2z"/>
                  <path fill="#EA4335" d="M24 9.5c3.3 0 6.2 1.1 8.5 3.3l6.4-6.4C34.9 2.1 29.5 0 24 0 14.8 0 6.8 5.3 2.8 13.1l8.3 4.2C12.9 13.5 18 9.5 24 9.5z"/>
                </svg>
                Connect with Google
              </>
            )}
          </button>

          <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 px-3 py-2.5">
            <p className="text-[11px] text-blue-400 leading-relaxed">
              <strong>Inbound setup:</strong> After connecting, forward (or set a filter in Gmail) to route incoming emails to Nyasadesk via the webhook at{' '}
              <code className="bg-blue-500/10 px-1 py-0.5 rounded text-[10px]">nyasadesk.com/api/webhooks/email</code>.
              Or use a Mailgun/SendGrid inbound parse pointed at that URL.
            </p>
          </div>
        </div>
      )}

      {/* Manual tab */}
      {tab === 'manual' && (
        <div className="space-y-3">
          <ManualFields fields={fields} setFields={setFields} fieldDefs={[
            { key: 'imap_host', label: 'IMAP Host', placeholder: 'imap.gmail.com / mail.yourdomain.com' },
            { key: 'imap_port', label: 'IMAP Port', placeholder: '993' },
            { key: 'smtp_host', label: 'SMTP Host', placeholder: 'smtp.gmail.com / mail.yourdomain.com' },
            { key: 'smtp_port', label: 'SMTP Port', placeholder: '587' },
            { key: 'email',     label: 'Email Address', placeholder: 'support@yourdomain.com' },
            { key: 'password',  label: 'App Password',  placeholder: 'xxxx xxxx xxxx xxxx', secret: true },
          ]} />
          <a href="https://support.google.com/mail/answer/185833" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300">
            <ExternalLink className="w-3 h-3" />How to get a Gmail App Password
          </a>
          <div className="flex gap-2 pt-1">
            <button onClick={handleManualSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity"
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
        </div>
      )}
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

  const subtitle = isLive ? 'WhatsApp widget active · embed on your site' : 'Add a WhatsApp button to any website';

  return (
    <ChannelCard emoji="🌐" title="WhatsApp Widget" subtitle={subtitle} accentColor="#06B6D4" isLive={isLive}>
      <div className="space-y-3">
        <div className="bg-[var(--nyasa-surface-1)] rounded-xl p-3 space-y-2">
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
              <p className="text-[10px] text-gray-500">A WhatsApp button that floats over your existing site. Paste anywhere in the body.</p>
              <div className="flex items-start gap-2 mt-1">
                <code className="text-[11px] text-cyan-300 font-mono flex-1 break-all leading-relaxed bg-[var(--nyasa-surface-5)] rounded-lg p-2.5">
                  {popupSnippet}
                </code>
                <CopyBtn text={popupSnippet} />
              </div>
            </>
          )}
          {embedTab === 'inline' && (
            <>
              <p className="text-[10px] text-gray-500">Always-open WhatsApp panel that fills a container on your own page — e.g. drop it into a "Contact us" page. Auto-adapts to your site's font, colors and light/dark mode.</p>
              <div className="flex items-start gap-2 mt-1">
                <code className="text-[11px] text-cyan-300 font-mono flex-1 break-all leading-relaxed bg-[var(--nyasa-surface-5)] rounded-lg p-2.5 whitespace-pre-wrap">
                  {inlineSnippet}
                </code>
                <CopyBtn text={inlineSnippet} />
              </div>
            </>
          )}
          {embedTab === 'page' && (
            <>
              <p className="text-[10px] text-gray-500">A ready-made, hosted WhatsApp support page — iframe it in, or just link customers straight to it. Follows visitors' light/dark preference; add ?theme=light or ?theme=dark to the URL to force it.</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[11px] text-cyan-300 font-mono truncate flex-1">{supportPageUrl}</p>
                <CopyBtn text={supportPageUrl} />
              </div>
              <div className="flex items-start gap-2 mt-2">
                <code className="text-[11px] text-cyan-300 font-mono flex-1 break-all leading-relaxed bg-[var(--nyasa-surface-5)] rounded-lg p-2.5 whitespace-pre-wrap">
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
          { key: 'prefill_message', label: 'WhatsApp Prefill Message', placeholder: 'Hi! I found you on your website and would like to chat.' },
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
        <div className="bg-[var(--nyasa-surface-1)] rounded-xl p-3">
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
        <div className="bg-[var(--nyasa-surface-1)] rounded-xl p-3 space-y-1.5">
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
  const { toast } = useToast();
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

  // ── Password change state ────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  // Detect whether user was invited (no password yet) vs. has a password.
  // Supabase stores last_sign_in_at only after an actual password login or
  // after accepting an invite — a user who was invited but never set a password
  // has identities[0].identity_data with no password provider.
  const [hasPassword, setHasPassword] = useState(null); // null = loading
  useEffect(() => {
    // Better Auth: ask the server whether this user has a credential (email+
    // password) account. The old Supabase identities[] check no longer exists
    // under Better Auth and always reported "no password".
    fetch('/api/password', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(({ hasPassword }) => setHasPassword(!!hasPassword))
      .catch(() => setHasPassword(true)); // fail safe: show current pw field
  }, []);

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
      const msg = e.message || 'Could not start checkout';
      const isConfig = msg.toLowerCase().includes('not configured') || msg.toLowerCase().includes('contact support');
      toast({
        variant: 'destructive',
        title: isConfig ? 'Payments not set up yet' : 'Payment Error',
        description: isConfig
          ? 'The payment gateway is not configured. Please contact Nyasadesk support.'
          : msg,
        duration: 6000,
      });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const visibleSections = SECTIONS.filter(s => !s.adminOnly || isWorkspaceAdmin);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setSection(tab);
    // ?pw=1 → jump to profile section and scroll password form into view
    if (searchParams.get('pw') === '1') {
      setSection('profile');
      setTimeout(() => {
        const el = document.getElementById('pw-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
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
      // Re-fetch channel configs to reflect newly connected WhatsApp account
      if (workspaceOwnerId) {
        getChannelConfigs(workspaceOwnerId)
          .then(rows => {
            const map = {};
            rows.forEach(r => { map[r.channel] = r; });
            setChannelConfigs(map);
            try { localStorage.setItem('wa_channel_configs', JSON.stringify(map)); } catch {}
          })
          .catch(e => console.error('[Settings] wa=check refresh failed:', e));
      }
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

  const changePassword = async () => {
    setPwError('');
    if (!pwForm.newPw) { setPwError('Enter a new password'); return; }
    if (pwForm.newPw.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    // If the user HAS a password, require the current one to verify identity
    if (hasPassword && !pwForm.current) { setPwError('Enter your current password to continue'); return; }
    setPwSaving(true);
    try {
      // Verify current password via re-auth (only if they actually have one)
      if (hasPassword && pwForm.current) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: user.email, password: pwForm.current
        });
        if (signInErr) { setPwError('Current password is incorrect'); setPwSaving(false); return; }
      }
      const { error } = await supabase.auth.updateUser({ password: pwForm.newPw });
      if (error) throw new Error(error.message);
      setPwForm({ current: '', newPw: '', confirm: '' });
      setPwSaved(true);
      setHasPassword(true); // they now have a password set
      setTimeout(() => setPwSaved(false), 3000);
    } catch (e) { setPwError(e.message); }
    finally { setPwSaving(false); }
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
    <div className="flex h-screen overflow-hidden bg-[var(--nyasa-surface-1)] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-56 bg-[var(--nyasa-surface-1)] border-r border-[var(--nyasa-border)] flex-col py-4 px-3 shrink-0">
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

      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--nyasa-surface-5)]">
        {/* Mobile tab bar */}
        <div className="md:hidden flex overflow-x-auto bg-[var(--nyasa-surface-1)] border-b border-[var(--nyasa-border)] px-2 pt-2 shrink-0 gap-1">
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
              <div className="bg-[var(--nyasa-surface-2)] rounded-2xl border border-[var(--nyasa-border)] p-5 space-y-4">
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
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border border-[var(--nyasa-border)] text-white hover:bg-white/5 transition-colors">
                    <ShieldCheck className="w-4 h-4" style={{ color: '#25D366' }} />
                    Open Admin Panel
                  </button>
                )}

                {/* Password ── smart: "Create" for invited users, "Change" for existing */}
                <div id="pw-section" className="mt-2 pt-4 border-t border-[var(--nyasa-border)]">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm font-bold text-[var(--nyasa-text)] flex-1">
                      {hasPassword === false ? 'Create a Password' : 'Change Password'}
                    </p>
                    {hasPassword === false && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                        No password set
                      </span>
                    )}
                  </div>

                  {hasPassword === false && (
                    <div className="flex items-start gap-2 bg-[#25D366]/8 border border-[#25D366]/20 rounded-xl px-3 py-2.5 mb-3">
                      <span className="text-[#25D366] text-sm mt-0.5">🔑</span>
                      <p className="text-[12px] text-[var(--nyasa-text-muted)] leading-relaxed">
                        You signed up via an invite link. Set a password so you can log in with email next time — no current password needed.
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* Only show "current password" if they already have one */}
                    {hasPassword !== false && (
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--nyasa-text-muted)] mb-1.5 block">
                          Current password
                        </label>
                        <input type="password" className={inputCls} placeholder="Your current password"
                          value={pwForm.current} onChange={e => setPwForm(f => ({...f, current: e.target.value}))} />
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--nyasa-text-muted)] mb-1.5 block">
                        {hasPassword === false ? 'New password' : 'New password'}
                      </label>
                      <input type="password" className={inputCls} placeholder="At least 8 characters"
                        value={pwForm.newPw} onChange={e => setPwForm(f => ({...f, newPw: e.target.value}))} />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--nyasa-text-muted)] mb-1.5 block">
                        Confirm new password
                      </label>
                      <input type="password" className={inputCls} placeholder="Repeat new password"
                        value={pwForm.confirm} onChange={e => setPwForm(f => ({...f, confirm: e.target.value}))} />
                    </div>

                    {pwError && (
                      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-red-400 text-xs">
                        <span>⚠️</span> {pwError}
                      </div>
                    )}
                    {pwSaved && (
                      <div className="flex items-center gap-2 bg-[#25D366]/10 border border-[#25D366]/20 rounded-xl px-3 py-2 text-[#25D366] text-xs font-semibold">
                        <span>✓</span> Password {hasPassword === false ? 'created' : 'updated'} successfully!
                      </div>
                    )}

                    <button onClick={changePassword} disabled={pwSaving || hasPassword === null}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-colors"
                      style={{ background: '#25D366' }}>
                      {pwSaving
                        ? 'Saving…'
                        : pwSaved
                          ? '✓ Done!'
                          : hasPassword === false ? 'Create Password' : 'Update Password'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {section === 'workspace' && (
              <div className="bg-[var(--nyasa-surface-2)] rounded-2xl border border-[var(--nyasa-border)] p-5 space-y-4">
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
              <div className="bg-[var(--nyasa-surface-2)] rounded-2xl border border-[var(--nyasa-border)] p-5 space-y-4">
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
                    <div className="rounded-2xl border border-[var(--nyasa-border)] p-5 bg-[var(--nyasa-surface-2)]">
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
                        const isLoading = checkoutLoading === key;
                        return (
                          <div
                            key={key}
                            onClick={() => !isCurrent && !checkoutLoading && handleCheckout(key)}
                            className={`rounded-2xl border p-5 transition-all select-none
                              ${isCurrent
                                ? 'border-[#25D366] bg-[#25D366]/5 cursor-default'
                                : checkoutLoading
                                  ? 'border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] cursor-wait opacity-70'
                                  : 'border-[var(--nyasa-border)] bg-[var(--nyasa-surface-2)] cursor-pointer hover:border-[#25D366]/50 active:scale-[0.98] active:bg-[#25D366]/5'
                              }`}
                          >
                            {/* Plan name */}
                            <p className="text-sm font-bold text-white">{labels[key] || key}</p>

                            {/* Price — big and tappable */}
                            <div className="mt-2 mb-4">
                              <p className="text-2xl font-black text-white">
                                K{price.toLocaleString()}
                                <span className="text-xs font-normal text-gray-400">/mo</span>
                              </p>
                              {!isCurrent && (
                                <p className="text-[10px] text-gray-500 mt-0.5">Tap anywhere to switch</p>
                              )}
                            </div>

                            {/* CTA */}
                            {isCurrent ? (
                              <span className="block text-center py-2.5 rounded-xl text-xs font-bold text-[#25D366] bg-[#25D366]/10">
                                ✓ Current Plan
                              </span>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); handleCheckout(key); }}
                                disabled={!!checkoutLoading}
                                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-[#25D366] hover:bg-[#20BA5A] active:bg-[#1da851] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {isLoading
                                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Opening payment…</>
                                  : `Switch to ${labels[key] || key}`
                                }
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {subStatus.transactions && subStatus.transactions.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-3">Payment History</h3>
                        <div className="space-y-2">
                          {subStatus.transactions.map(t => (
                            <div key={t.tx_ref} className="flex items-center justify-between bg-[var(--nyasa-surface-2)] rounded-xl px-4 py-3 border border-[var(--nyasa-border)]">
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

            {section === 'noticeboard' && (
              <NoticeboardSection
                workspaceOwnerId={workspaceOwnerId}
                canPost={isWorkspaceAdmin || profile?.role === 'sales_manager'}
                currentUser={user}
              />
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
