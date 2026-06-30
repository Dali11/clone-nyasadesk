import { useState } from 'react';
import { Check, ArrowRight, Building2, Globe, Users, Zap, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { supabase } from '@/lib/supabase';

const CHANNELS = ['whatsapp', 'messenger', 'email', 'website'];

const STEPS = [
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'channels',  label: 'Channels',  icon: Globe     },
  { id: 'team',      label: 'Team',      icon: Users     },
  { id: 'done',      label: 'Ready!',    icon: Zap       },
];

const CHANNEL_INFO = {
  whatsapp:  { label: 'WhatsApp',           color: 'bg-green-500/20 border-green-500/40 text-green-400'   },
  messenger: { label: 'Facebook Messenger', color: 'bg-blue-500/20 border-blue-500/40 text-blue-400'     },
  email:     { label: 'Email',              color: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400' },
  website:   { label: 'Website Chat',       color: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'     },
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setOnboardingComplete } = useNyasaAuth();

  const [step, setStep]                         = useState(0);
  const [workspaceName, setWorkspaceName]       = useState('');
  const [selectedChannels, setSelectedChannels] = useState(['whatsapp', 'email']);
  const [teamEmails, setTeamEmails]             = useState(['']);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState('');

  const toggleChannel = (ch) =>
    setSelectedChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);

  const updateEmail = (i, val) => {
    const arr = [...teamEmails];
    arr[i] = val;
    setTeamEmails(arr);
  };

  const finish = async () => {
    setLoading(true);
    setError('');
    try {
      const { error: upsertErr } = await supabase.from('profiles').upsert({
        id:                  user.id,
        full_name:           user.user_metadata?.full_name ?? '',
        workspace_name:      workspaceName,
        channels:            selectedChannels,
        onboarding_complete: true,
        role:                'admin',
        updated_at:          new Date().toISOString(),
      });
      if (upsertErr) throw upsertErr;
      setOnboardingComplete(true);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  return (
    <div className="min-h-screen bg-[#111B21] flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-[#25D366] flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-black text-2xl">N</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Set up Nyasadesk</h1>
          <p className="text-gray-400 text-sm mt-1">Takes about 2 minutes</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${i < step ? 'bg-[#25D366] text-white' : i === step ? 'bg-[#25D366]/20 border border-[#25D366] text-[#25D366]' : 'bg-[#2A3942] text-gray-500'}`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 transition-all ${i < step ? 'bg-[#25D366]' : 'bg-[#2A3942]'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-[#1F2C34] rounded-2xl p-6 shadow-xl">
          {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">{error}</div>}

          {/* Step 0: Workspace name */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold text-lg">Name your workspace</h2>
              <p className="text-gray-400 text-sm">This is usually your company or team name.</p>
              <input className={inputCls} placeholder="e.g. Brandfletch Sales Team"
                value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} />
              <button
                onClick={() => workspaceName.trim() && setStep(1)}
                disabled={!workspaceName.trim()}
                className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 transition-colors">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 1: Channels */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold text-lg">Which channels will you use?</h2>
              <p className="text-gray-400 text-sm">You can add more later in Settings.</p>
              <div className="grid grid-cols-2 gap-3">
                {CHANNELS.map(ch => {
                  const info = CHANNEL_INFO[ch];
                  const active = selectedChannels.includes(ch);
                  return (
                    <button key={ch} onClick={() => toggleChannel(ch)}
                      className={`p-4 rounded-xl border text-sm font-medium transition-all text-left
                        ${active ? info.color : 'bg-[#2A3942] border-transparent text-gray-400 hover:border-gray-600'}`}>
                      {info.label}
                      {active && <Check className="w-3 h-3 inline ml-1" />}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setStep(2)}
                className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 2: Invite team */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold text-lg">Invite your team</h2>
              <p className="text-gray-400 text-sm">Optional — you can do this later.</p>
              {teamEmails.map((em, i) => (
                <input key={i} className={inputCls} type="email" placeholder={`teammate${i + 1}@company.com`}
                  value={em} onChange={e => updateEmail(i, e.target.value)} />
              ))}
              {teamEmails.length < 5 && (
                <button onClick={() => setTeamEmails([...teamEmails, ''])}
                  className="text-sm text-[#25D366] hover:underline">+ Add another</button>
              )}
              <button onClick={finish} disabled={loading}
                className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4" /> Launch Nyasadesk</>}
              </button>
              <button onClick={finish} disabled={loading}
                className="w-full text-gray-500 text-sm hover:text-gray-300 py-1">
                Skip for now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
