import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { supabase } from '@/lib/supabase';
import { Check, ArrowRight, Building2, Zap, Users, Loader2, ChevronRight, Wifi, Mail, Globe, MessageSquare } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const WA_GREEN      = '#25D366';
const WA_DARK_GREEN = '#128C7E';
const WA_NAVY       = '#075E54';
const BG            = '#111B21';
const SURFACE       = '#1F2C34';
const SURFACE2      = '#2A3942';
const TEXT          = '#E9EDF0';
const MUTED         = '#8696A0';

const STEPS = [
  { id: 'workspace', label: 'Workspace',  icon: Building2    },
  { id: 'channels',  label: 'Channels',   icon: Wifi         },
  { id: 'team',      label: 'Team',       icon: Users        },
  { id: 'launch',    label: 'Launch',     icon: Zap          },
];

const CHANNELS = [
  { id: 'whatsapp',  label: 'WhatsApp Business', desc: 'Connect your WhatsApp Business number',   icon: MessageSquare, color: '#25D366', bg: '#25D36620' },
  { id: 'email',     label: 'Email',             desc: 'Forward support emails to your inbox',    icon: Mail,          color: '#5C6CF7', bg: '#5C6CF720' },
  { id: 'messenger', label: 'Facebook Messenger',desc: 'Connect your Facebook Business page',     icon: Globe,         color: '#0084FF', bg: '#0084FF20' },
  { id: 'website',   label: 'Website Chat',      desc: 'Embed a live chat widget on your site',   icon: Globe,         color: '#00A8BD', bg: '#00A8BD20' },
];

export default function Onboarding() {
  useDocumentTitle('Get Started');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setOnboardingComplete } = useNyasaAuth();

  const [step, setStep]               = useState(0);
  const [workspaceName, setWsName]    = useState('');
  const [selectedCh, setSelectedCh]  = useState(['whatsapp', 'email']);
  const [teamEmails, setTeamEmails]   = useState(['']);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const toggleCh = (id) => setSelectedCh(p => p.includes(id) ? p.filter(c => c !== id) : [...p, id]);

  const finish = async () => {
    setLoading(true); setError('');
    try {
      const { error: err } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: user.user_metadata?.full_name ?? '',
        workspace_name: workspaceName,
        channels: selectedCh,
        onboarding_complete: true,
        role: 'admin',
        updated_at: new Date().toISOString(),
      });
      if (err) throw err;

      // Actually invite the teammates entered in the "Invite your team" step —
      // previously this data was collected in the UI and then silently
      // discarded; nobody ever got invited no matter what you typed here.
      const emailsToInvite = teamEmails.map(e => e.trim()).filter(Boolean);
      if (emailsToInvite.length) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          await Promise.all(emailsToInvite.map(email =>
            fetch('/api/team', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
              },
              body: JSON.stringify({ email, role: 'user', workspace_id: user.id }),
            }).catch(e => console.error('[Onboarding] invite failed for', email, e))
          ));
        } catch (e) {
          // Don't block launch on invite failures — team can always invite
          // people later from Settings > Team.
          console.error('[Onboarding] team invite step failed:', e);
        }
      }

      setOnboardingComplete(true);
      navigate('/');
    } catch (e) {
      setError(e.message || 'Failed to save. Please try again.');
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', background: SURFACE2, border: `1px solid transparent`,
    borderRadius: 14, padding: '14px 16px', color: TEXT, fontSize: 15,
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ background: WA_NAVY, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: WA_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>N</span>
          </div>
          <span style={{ color: TEXT, fontWeight: 700 }}>Nyasadesk</span>
        </div>
        <span style={{ color: MUTED, fontSize: 13 }}>Step {step + 1} of {STEPS.length}</span>
      </div>

      {/* Step pills */}
      <div style={{ background: SURFACE, borderBottom: `1px solid ${SURFACE2}`, padding: '16px 24px', display: 'flex', justifyContent: 'center', gap: 8, overflowX: 'auto' }}>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999,
                background: done ? `${WA_GREEN}20` : active ? `${WA_GREEN}15` : 'transparent',
                border: `1px solid ${done || active ? WA_GREEN : SURFACE2}`,
              }}>
                {done
                  ? <Check size={14} color={WA_GREEN} />
                  : <Icon size={14} color={active ? WA_GREEN : MUTED} />}
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: done || active ? WA_GREEN : MUTED }}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight size={14} color={SURFACE2} />}
            </div>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 520 }}>
          {error && <div style={{ background: '#FF525220', border: '1px solid #FF525240', borderRadius: 10, padding: '10px 14px', color: '#FF8A80', fontSize: 13, marginBottom: 20 }}>{error}</div>}

          {/* Step 0: Workspace */}
          {step === 0 && (
            <div>
              <h2 style={{ color: TEXT, fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Name your workspace</h2>
              <p style={{ color: MUTED, fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>This is how your team and customers will see your company in Nyasadesk.</p>
              <input
                style={inputStyle}
                placeholder="e.g. Brandfletch Sales"
                value={workspaceName}
                onChange={e => setWsName(e.target.value)}
                autoFocus
              />
              <button
                onClick={() => workspaceName.trim() && setStep(1)}
                disabled={!workspaceName.trim()}
                style={{ marginTop: 20, width: '100%', background: WA_GREEN, color: '#fff', border: 'none', borderRadius: 14, padding: '15px', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: workspaceName.trim() ? 1 : 0.4 }}>
                Continue <ArrowRight size={18} />
              </button>
            </div>
          )}

          {/* Step 1: Channels */}
          {step === 1 && (
            <div>
              <h2 style={{ color: TEXT, fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Connect your channels</h2>
              <p style={{ color: MUTED, fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>Choose which channels to enable. You can configure and connect each one after setup.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {CHANNELS.map(({ id, label, desc, icon: Icon, color, bg }) => {
                  const active = selectedCh.includes(id);
                  return (
                    <div key={id} onClick={() => toggleCh(id)} style={{
                      background: active ? bg : SURFACE,
                      border: `1.5px solid ${active ? color : SURFACE2}`,
                      borderRadius: 16, padding: '16px 20px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.15s',
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={20} color={color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: TEXT, fontWeight: 600, fontSize: 15 }}>{label}</div>
                        <div style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>{desc}</div>
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${active ? color : SURFACE2}`, background: active ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {active && <Check size={12} color="#fff" />}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setStep(2)} style={{ marginTop: 24, width: '100%', background: WA_GREEN, color: '#fff', border: 'none', borderRadius: 14, padding: '15px', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Continue <ArrowRight size={18} />
              </button>
            </div>
          )}

          {/* Step 2: Team */}
          {step === 2 && (
            <div>
              <h2 style={{ color: TEXT, fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Invite your team</h2>
              <p style={{ color: MUTED, fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>Add teammates by email. They'll receive an invite to join your workspace.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {teamEmails.map((em, i) => (
                  <input key={i} style={inputStyle} type="email"
                    placeholder={`teammate@company.com`}
                    value={em} onChange={e => { const a = [...teamEmails]; a[i] = e.target.value; setTeamEmails(a); }} />
                ))}
              </div>
              {teamEmails.length < 5 && (
                <button onClick={() => setTeamEmails([...teamEmails, ''])} style={{ marginTop: 12, background: 'none', border: 'none', color: WA_GREEN, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>
                  + Add another teammate
                </button>
              )}
              <button onClick={() => setStep(3)} style={{ marginTop: 24, width: '100%', background: WA_GREEN, color: '#fff', border: 'none', borderRadius: 14, padding: '15px', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Continue <ArrowRight size={18} />
              </button>
              <button onClick={() => setStep(3)} style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', color: MUTED, fontSize: 14, cursor: 'pointer', padding: '10px' }}>
                Skip for now
              </button>
            </div>
          )}

          {/* Step 3: Launch */}
          {step === 3 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: 24, background: `${WA_GREEN}20`, border: `2px solid ${WA_GREEN}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px' }}>
                <Zap size={36} color={WA_GREEN} />
              </div>
              <h2 style={{ color: TEXT, fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Ready to launch!</h2>
              <p style={{ color: MUTED, fontSize: 15, marginBottom: 12, lineHeight: 1.7 }}>
                Your workspace <strong style={{ color: TEXT }}>{workspaceName}</strong> is set up with{' '}
                <strong style={{ color: TEXT }}>{selectedCh.length} channel{selectedCh.length !== 1 ? 's' : ''}</strong>.
              </p>
              <p style={{ color: MUTED, fontSize: 14, marginBottom: 36 }}>
                You can connect and configure each channel from Settings after launch.
              </p>

              {/* Summary chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 36 }}>
                {selectedCh.map(ch => {
                  const info = CHANNELS.find(c => c.id === ch);
                  return (
                    <span key={ch} style={{ background: info.bg, color: info.color, border: `1px solid ${info.color}40`, borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 600 }}>
                      {info.label}
                    </span>
                  );
                })}
              </div>

              <button onClick={finish} disabled={loading} style={{ width: '100%', background: WA_GREEN, color: '#fff', border: 'none', borderRadius: 14, padding: '16px', fontWeight: 700, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: loading ? 0.7 : 1 }}>
                {loading ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={20} />}
                {loading ? 'Setting up...' : 'Launch Nyasadesk'}
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
