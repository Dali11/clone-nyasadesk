import { useState } from 'react';
import { Check, ArrowRight, Building2, Globe, Users, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { store } from '@/lib/store';

const CHANNELS = ['whatsapp', 'messenger', 'email', 'website'];

const STEPS = [
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'channels',  label: 'Channels',  icon: Globe     },
  { id: 'team',      label: 'Team',      icon: Users     },
  { id: 'done',      label: 'Ready!',    icon: Zap       },
];

const CHANNEL_INFO = {
  whatsapp:  { label: 'WhatsApp',          icon: '💬', color: 'bg-green-500/20 border-green-500/40 text-green-400'   },
  messenger: { label: 'Facebook Messenger',icon: '📘', color: 'bg-blue-500/20 border-blue-500/40 text-blue-400'     },
  email:     { label: 'Email',             icon: '📧', color: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'},
  website:   { label: 'Website Chat',      icon: '🌐', color: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'     },
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, setOnboardingComplete } = useNyasaAuth();
  const [step, setStep] = useState(0);
  const [workspace, setWorkspaceState] = useState({ name: '' });
  const [selectedChannels, setSelectedChannels] = useState(['whatsapp', 'email']);
  const [teamEmails, setTeamEmails] = useState(['']);
  const [loading, setLoading] = useState(false);

  const toggleChannel = (ch) => setSelectedChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  const updateEmail = (i, val) => { const arr = [...teamEmails]; arr[i] = val; setTeamEmails(arr); };

  const finish = async () => {
    setLoading(true);
    store.updateWorkspace({ name: workspace.name, channels: selectedChannels, onboarding_complete: true });
    await new Promise(r => setTimeout(r, 800));
    setOnboardingComplete(true);
    navigate('/');
  };

  const inputCls = 'w-full bg-[#2A3942] text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  return (
    <div className="min-h-screen bg-[#111B21] flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-[#25D366] flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-black text-3xl">N</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to Nyasadesk</h1>
          <p className="text-gray-500 text-sm mt-1">Let's get you set up in a few quick steps</p>
        </div>

        <div className="flex items-center gap-0 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-xs font-bold transition-all shrink-0
                ${i < step ? 'bg-[#25D366] border-[#25D366] text-white' : i === step ? 'border-[#25D366] text-[#25D366]' : 'border-white/20 text-gray-600'}`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 transition-all ${i < step ? 'bg-[#25D366]' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-[#202C33] rounded-3xl border border-white/10 p-8">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Name your workspace</h2>
                <p className="text-sm text-gray-500">This is how your team and contacts will see you</p>
              </div>
              <input className={inputCls} placeholder="e.g. Acme Sales Team" value={workspace.name} onChange={e => setWorkspaceState(w => ({ ...w, name: e.target.value }))} />
              <button onClick={() => setStep(1)} disabled={!workspace.name.trim()}
                className="w-full py-3 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Connect your channels</h2>
                <p className="text-sm text-gray-500">Pick the channels your team communicates through</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {CHANNELS.map(ch => {
                  const cfg = CHANNEL_INFO[ch];
                  const active = selectedChannels.includes(ch);
                  return (
                    <button key={ch} onClick={() => toggleChannel(ch)}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-left
                        ${active ? cfg.color : 'border-white/10 text-gray-500 bg-white/5 hover:border-white/20'}`}>
                      <span className="text-2xl">{cfg.icon}</span>
                      <div>
                        <p className="text-xs font-semibold">{cfg.label}</p>
                        {active && <p className="text-[10px] opacity-70">Selected</p>}
                      </div>
                      {active && <Check className="w-4 h-4 ml-auto shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="flex-1 py-3 border border-white/10 text-gray-300 font-semibold rounded-xl text-sm">Back</button>
                <button onClick={() => setStep(2)} disabled={!selectedChannels.length}
                  className="flex-1 py-3 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Invite your team</h2>
                <p className="text-sm text-gray-500">Add team members — you can always do this later</p>
              </div>
              <div className="space-y-2">
                {teamEmails.map((email, i) => (
                  <input key={i} type="email" className={inputCls} placeholder={`teammate${i + 1}@company.com`}
                    value={email} onChange={e => updateEmail(i, e.target.value)} />
                ))}
                <button onClick={() => setTeamEmails(prev => [...prev, ''])} className="text-sm text-[#25D366] hover:text-[#20BA5A] transition-colors">+ Add another</button>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3 border border-white/10 text-gray-300 font-semibold rounded-xl text-sm">Back</button>
                <button onClick={() => setStep(3)}
                  className="flex-1 py-3 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors flex items-center justify-center gap-2">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-3xl bg-[#25D366]/20 border border-[#25D366]/40 flex items-center justify-center mx-auto">
                <Zap className="w-10 h-10 text-[#25D366]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-2">You're all set, {user?.full_name?.split(' ')[0]}! 🎉</h2>
                <p className="text-gray-500 text-sm">
                  <strong className="text-white">{workspace.name}</strong> is ready.<br />
                  {selectedChannels.length} channel{selectedChannels.length !== 1 ? 's' : ''} connected.
                </p>
              </div>
              <button onClick={finish} disabled={loading}
                className="w-full py-3 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BA5A] transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {loading ? 'Launching…' : <><Zap className="w-4 h-4" /> Open Nyasadesk</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}