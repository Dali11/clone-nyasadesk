import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Bot, Trash2, Loader2, Sparkles, X, BookOpen, Pencil, Link2, Upload, Lock, Pause, Play, BrainCircuit, ToggleLeft, ToggleRight, ListRestart } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { useFeatureAccess } from '@/lib/useFeatureAccess';
import UpgradeWall from '@/components/UpgradeWall';
import { getAiAgents, saveAiAgent, deleteAiAgent, getAiAgentTemplates, getAiKnowledge, saveAiKnowledge, deleteAiKnowledge, addKnowledgeFromUrl, addKnowledgeFromFile, getAiUsageSummary, getRules } from '@/lib/channels';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useToast } from '@/components/ui/use-toast';

const CHANNEL_OPTIONS = ['whatsapp', 'website', 'instagram', 'telegram', 'messenger'];
const LANGUAGE_OPTIONS = ['English', 'Chichewa', 'French', 'Portuguese', 'Swahili'];

const BLANK_FORM = {
  name: '', description: '', role: '', template_key: null,
  system_instructions: '', personality: '', tone: '',
  languages: ['English'], enabled_channels: [], automation_mode: 'draft', status: 'active',
  agent_type: 'general', message_cap: null, handoff_assignment_rule_id: null,
};

const AGENT_TYPE_BADGES = {
  receptionist: { label: 'Receptionist', cls: 'bg-purple-500/20 text-purple-400' },
  finance_manager: { label: 'Finance Mgr', cls: 'bg-blue-500/20 text-blue-400' },
  followup: { label: 'Follow-up', cls: 'bg-orange-500/20 text-orange-400' },
};

export default function AiAgents() {
  const { toast } = useToast();
  useDocumentTitle('AI Agents');
  const { workspaceOwnerId, isWorkspaceAdmin, profile } = useNyasaAuth();
  const { can } = useFeatureAccess();
  const hasAiAccess = can('ai_agents');

  const [activeTab, setActiveTab] = useState('agents'); // 'agents' | 'learning'

  const [agents, setAgents] = useState([]);
  const [usage, setUsage] = useState({}); // agent_id -> { cost, count } (last 30 days)
  const [rules, setRules] = useState([]); // assignment rules for handoff selector
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // 'new' | agent.id | null
  const [showTemplates, setShowTemplates] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [knowledgeItems, setKnowledgeItems] = useState([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [knowledgeForm, setKnowledgeForm] = useState(null); // null | 'new' | item
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [ingestingUrl, setIngestingUrl] = useState(false);
  const [ingestingFile, setIngestingFile] = useState(false);
  const fileInputRef = useRef(null);

  // Learning states
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);

  const load = async () => {
    if (!workspaceOwnerId) { setLoading(false); return; }
    try {
      const [a, t] = await Promise.all([getAiAgents(workspaceOwnerId), getAiAgentTemplates()]);
      setAgents(a);
      setTemplates(t);
      // Best-effort: load assignment rules for the handoff-rule selector.
      getRules(workspaceOwnerId).then(setRules).catch(() => {});
      // Best-effort -- non-admins get an RLS-blocked empty result, not an error,
      // so this never needs to block the page if it fails for any other reason.
      getAiUsageSummary(workspaceOwnerId).then(setUsage).catch(() => {});
    } catch (e) {
      console.error('[AiAgents] load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceOwnerId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const startFromTemplate = (tpl) => {
    setForm({
      ...BLANK_FORM,
      name: tpl.name,
      description: tpl.description,
      role: tpl.role,
      template_key: tpl.key,
      system_instructions: tpl.system_instructions,
      personality: tpl.personality,
      tone: tpl.tone,
      agent_type: tpl.agent_type || 'general',
      message_cap: tpl.message_cap ?? null,
    });
    setShowTemplates(false);
    setEditing('new');
  };

  const startBlank = () => { setForm(BLANK_FORM); setShowTemplates(false); setEditing('new'); setKnowledgeItems([]); setKnowledgeForm(null); };
  const startEdit = (agent) => { setForm({ ...BLANK_FORM, ...agent }); setEditing(agent.id); setKnowledgeForm(null); loadKnowledge(agent.id); };

  const loadKnowledge = async (agentId) => {
    setLoadingKnowledge(true);
    try {
      setKnowledgeItems(await getAiKnowledge(workspaceOwnerId, agentId));
    } catch (e) {
      console.error('[AiAgents] knowledge load error:', e);
    } finally {
      setLoadingKnowledge(false);
    }
  };

  const saveKnowledge = async () => {
    if (!knowledgeForm?.title?.trim() || !knowledgeForm?.content?.trim() || savingKnowledge) return;
    setSavingKnowledge(true);
    try {
      const payload = { title: knowledgeForm.title, content: knowledgeForm.content, agent_id: editing, ...(knowledgeForm.id ? { id: knowledgeForm.id } : {}) };
      await saveAiKnowledge(workspaceOwnerId, payload);
      setKnowledgeForm(null);
      await loadKnowledge(editing);
    } catch (e) {
      console.error('[AiAgents] knowledge save error:', e);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save knowledge: ' + e.message });
    } finally {
      setSavingKnowledge(false);
    }
  };

  const delKnowledge = async (id) => {
    if (!window.confirm('Delete this knowledge snippet?')) return;
    try {
      await deleteAiKnowledge(id);
      setKnowledgeItems(prev => prev.filter(k => k.id !== id));
    } catch (e) {
      console.error('[AiAgents] knowledge delete error:', e);
    }
  };

  const addFromUrl = async () => {
    const url = window.prompt('Paste a URL (e.g. your FAQ or pricing page):');
    if (!url) return;
    setIngestingUrl(true);
    try {
      await addKnowledgeFromUrl(workspaceOwnerId, editing, url.trim());
      await loadKnowledge(editing);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not add that page: ' + e.message });
    } finally {
      setIngestingUrl(false);
    }
  };

  const addFromFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) { toast({ variant: 'destructive', title: 'Error', description: 'File is too large (max 2.5MB) — try a shorter document.' }); return; }
    setIngestingFile(true);
    try {
      await addKnowledgeFromFile(workspaceOwnerId, editing, file);
      await loadKnowledge(editing);
    } catch (e2) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not read that file: ' + e2.message });
    } finally {
      setIngestingFile(false);
    }
  };

  const toggleChannel = (ch) => set('enabled_channels', form.enabled_channels.includes(ch)
    ? form.enabled_channels.filter(c => c !== ch) : [...form.enabled_channels, ch]);
  const toggleLanguage = (lang) => set('languages', form.languages.includes(lang)
    ? form.languages.filter(l => l !== lang) : [...form.languages, lang]);

  const save = async () => {
    if (!form.name.trim() || saving) return;
    if (form.system_instructions.length > INSTRUCTIONS_MAX_CHARS) {
      toast({ variant: 'destructive', title: 'Error', description: `System instructions are too long (${form.system_instructions.length.toLocaleString()} / ${INSTRUCTIONS_MAX_CHARS.toLocaleString()} chars) — trim it down a bit before saving.` });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, ...(editing !== 'new' ? { id: editing } : {}) };
      const savedAgent = await saveAiAgent(workspaceOwnerId, payload);
      if (editing === 'new') {
        // Switch straight into edit mode on the new agent so knowledge can
        // be added right away, instead of closing and forcing a re-open.
        setEditing(savedAgent.id);
        setKnowledgeItems([]);
      } else {
        setEditing(null);
      }
      await load();
    } catch (e) {
      console.error('[AiAgents] save error:', e);
      const isNetworkErr = e instanceof TypeError || /failed to fetch|network/i.test(e?.message || '');
      toast({ variant: 'destructive', title: 'Error', description: isNetworkErr
        ? "Couldn't save — your connection dropped. Check your signal and try again."
        : 'Failed to save: ' + e.message });
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this AI agent permanently? This cannot be undone -- its config and knowledge base will be lost.\n\nJust want to stop it from replying for now? Cancel this and use the Pause button instead.')) return;
    try {
      await deleteAiAgent(id);
      setAgents(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      console.error('[AiAgents] delete error:', e);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete: ' + e.message });
    }
  };

  const toggleStatus = async (agent) => {
    const status = agent.status === 'active' ? 'disabled' : 'active';
    if (status === 'active' && !hasAiAccess) return; // Scale-plan-only -- DB also blocks this, avoid a doomed round-trip
    try {
      await saveAiAgent(workspaceOwnerId, { id: agent.id, status });
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status } : a));
    } catch (e) {
      console.error('[AiAgents] toggle status error:', e);
    }
  };

  const triggerLearningAnalysis = () => {
    toast({
      title: "Analysis scheduled",
      description: "Analysis scheduled — this may take a few minutes"
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--nyasa-surface-1)] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex flex-col gap-3 shrink-0 border-b border-[var(--nyasa-border)]">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-black text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-[#25D366]" /> AI Agents
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">AI-powered team members for your shared inbox</p>
            </div>
            {isWorkspaceAdmin && activeTab === 'agents' && (
              <div className="flex items-center gap-2">
                {hasAiAccess && agents.length > 0 && (
                  <p className="text-[11px] text-gray-500 hidden sm:block">
                    {agents.length} agent{agents.length === 1 ? '' : 's'} -- one per department works great
                  </p>
                )}
                {hasAiAccess ? (
                  <>
                    <button onClick={() => setShowTemplates(true)}
                      className="flex items-center gap-1.5 bg-[var(--nyasa-surface-2)] hover:bg-[var(--nyasa-surface-4)] text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors">
                      <Sparkles className="w-4 h-4" /> From template
                    </button>
                    <button onClick={startBlank}
                      className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-black text-sm font-semibold px-3 py-2 rounded-lg transition-colors">
                      <Plus className="w-4 h-4" /> New agent
                    </button>
                  </>
                ) : (
                  <Link to="/pricing"
                    className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-black text-sm font-semibold px-3 py-2 rounded-lg transition-colors">
                    <Lock className="w-3.5 h-3.5" /> Upgrade to Scale
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Tab switches */}
          <div className="flex gap-2 border-b border-white/5 pb-2">
            <button
              onClick={() => setActiveTab('agents')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'agents'
                  ? 'bg-[#25D366]/15 text-[#25D366] font-bold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Agents List
            </button>
            <button
              onClick={() => setActiveTab('learning')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'learning'
                  ? 'bg-[#25D366]/15 text-[#25D366] font-bold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" /> Learning
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'agents' ? (
            loading ? (
              <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-16">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : !hasAiAccess && agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-[#25D366]/15 flex items-center justify-center mb-1">
                  <Lock className="w-6 h-6 text-[#25D366]" />
                </div>
                <p className="text-sm font-semibold text-white">AI Agents are a Scale-plan feature</p>
                <p className="text-xs text-gray-500 max-w-xs">
                  Set up an AI teammate that drafts replies, or works fully autonomously — including generating quotes and invoices mid-conversation. Upgrade to Scale to unlock it.
                </p>
                <Link to="/pricing" className="mt-2 flex items-center gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-black text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                  <Lock className="w-3.5 h-3.5" /> Upgrade to Scale
                </Link>
              </div>
            ) : agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
                <Bot className="w-10 h-10 text-gray-700" />
                <p className="text-sm text-gray-500">No AI agents yet</p>
                <p className="text-xs text-gray-600">Start from a template or build one from scratch.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {!hasAiAccess && (
                  <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3 bg-[var(--nyasa-surface-2)] border border-[#25D366]/20 rounded-xl p-4">
                    <Lock className="w-4 h-4 text-[#25D366] shrink-0" />
                    <p className="text-xs text-gray-400 flex-1">
                      Your plan no longer includes AI Agents, so this one is paused. <Link to="/pricing" className="text-[#25D366] font-semibold">Upgrade to Scale</Link> to reactivate it — your setup is saved.
                    </p>
                  </div>
                )}
                {agents.map(agent => (
                  <div key={agent.id} className="bg-[var(--nyasa-surface-2)] rounded-xl p-4 flex flex-col gap-2 border border-[var(--nyasa-border)]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-[#25D366]/15 flex items-center justify-center shrink-0">
                          <Bot className="w-4.5 h-4.5 text-[#25D366]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{agent.name}</p>
                          <p className="text-gray-500 text-[11px] truncate">{agent.role || 'AI Agent'}</p>
                          {agent.agent_type && agent.agent_type !== 'general' && AGENT_TYPE_BADGES[agent.agent_type] && (
                            <span className={`mt-0.5 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full ${AGENT_TYPE_BADGES[agent.agent_type].cls}`}>{AGENT_TYPE_BADGES[agent.agent_type].label}</span>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${agent.status === 'active' ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {agent.status === 'active' ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    {agent.description && <p className="text-gray-400 text-xs line-clamp-2">{agent.description}</p>}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {(agent.enabled_channels || []).map(ch => (
                        <span key={ch} className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full capitalize">{ch}</span>
                      ))}
                      {(!agent.enabled_channels || agent.enabled_channels.length === 0) && (
                        <span className="text-[10px] text-gray-600">No channels enabled yet</span>
                      )}
                    </div>
                    {usage[agent.id] && (
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        ${usage[agent.id].cost.toFixed(2)} · {usage[agent.id].count} repl{usage[agent.id].count === 1 ? 'y' : 'ies'} (30d)
                      </p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => toggleStatus(agent)}
                        disabled={agent.status !== 'active' && !hasAiAccess}
                        title={agent.status === 'active' ? 'Pause this agent -- it will stop replying, nothing is deleted' : 'Resume this agent'}
                        className={`flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg py-1.5 px-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          agent.status === 'active'
                            ? 'text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20'
                            : 'text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20'
                        }`}>
                        {agent.status === 'active' ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Resume</>}
                      </button>
                      <button onClick={() => startEdit(agent)}
                        className="flex-1 text-xs font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg py-1.5 transition-colors">
                        Configure
                      </button>
                      <button onClick={() => del(agent.id)}
                        title="Delete permanently -- use Pause instead if you just want to stop it temporarily"
                        className="text-gray-500 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded-lg px-2.5 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Learning Tab - Styled WhatsApp Dark bg-[#1F2C34], green accents, text-white */
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-[#1F2C34] border border-white/5 rounded-2xl p-6 flex flex-col gap-4 text-white">
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2 text-white">
                    <BrainCircuit className="w-5 h-5 text-[#25D366]" /> AI is learning from your conversations
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">
                     Nyasadesk AI automatically analyzes historical conversation flows to extract common FAQ patterns, build custom auto-reply instructions, and reply to frequent inquiries instantly.
                  </p>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-3 bg-[#121B22] p-4 rounded-xl border border-white/5">
                  <div className="text-center">
                    <p className="text-lg font-bold text-[#25D366]">0</p>
                    <p className="text-[10px] text-gray-400 font-medium">Patterns Learned</p>
                  </div>
                  <div className="text-center border-x border-white/10">
                    <p className="text-lg font-bold text-[#25D366]">0</p>
                    <p className="text-[10px] text-gray-400 font-medium">Conversations Analyzed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-[#25D366]">0</p>
                    <p className="text-[10px] text-gray-400 font-medium">Auto-replies Sent</p>
                  </div>
                </div>

                {/* Toggle Section */}
                <div className="flex items-start justify-between gap-4 p-4 bg-[#121B22] rounded-xl border border-white/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white">Enable auto-reply for FAQs</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Automatically respond to customer questions matching learned high-confidence patterns.
                    </p>
                    <p className="text-[10px] text-amber-500/80 mt-1.5 font-medium">
                      ⚠️ Note: The AI will review 2 weeks of conversations before enabling
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      toast({
                        title: "Setup required",
                        description: "The AI needs to analyze at least 2 weeks of historical interactions before auto-replies can be activated."
                      });
                    }}
                    className="text-[#8696A0] hover:text-[#25D366] transition-colors p-1"
                  >
                    {autoReplyEnabled ? (
                      <ToggleRight className="w-10 h-10 text-[#25D366]" />
                    ) : (
                      <ToggleLeft className="w-10 h-10 text-gray-600" />
                    )}
                  </button>
                </div>

                {/* Action button */}
                <div className="flex justify-end">
                  <button
                    onClick={triggerLearningAnalysis}
                    className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-black text-xs font-bold px-4 py-2.5 rounded-lg transition-colors"
                  >
                    <ListRestart className="w-4 h-4" /> Start Learning Analysis
                  </button>
                </div>
              </div>

              {/* Top patterns list placeholder */}
              <div className="bg-[#1F2C34] border border-white/5 rounded-2xl p-6 text-center text-white">
                <BrainCircuit className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Top patterns will appear here after analysis</p>
                <p className="text-[10px] text-gray-500 max-w-xs mx-auto mt-1">
                  Once your analysis completes, learned QA pairs and high-frequency topics will list here for approval.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Template picker modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowTemplates(false)}>
          <div className="bg-[var(--nyasa-surface-1)] rounded-2xl border border-[var(--nyasa-border)] w-full max-w-lg max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">Choose a template</h2>
              <button onClick={() => setShowTemplates(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="grid gap-2">
              {templates.map(tpl => (
                <button key={tpl.key} onClick={() => startFromTemplate(tpl)}
                  className="text-left bg-[var(--nyasa-surface-2)] hover:bg-[var(--nyasa-surface-4)] rounded-xl p-3 transition-colors">
                  <p className="text-white text-sm font-semibold">{tpl.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{tpl.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Configure agent modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-[var(--nyasa-surface-1)] rounded-2xl border border-[var(--nyasa-border)] w-full max-w-xl max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">{editing === 'new' ? 'New AI agent' : 'Configure agent'}</h2>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="space-y-3">
              <Field label="Agent name">
                <input value={form.name} onChange={e => set('name', e.target.value)}
                  className="w-full bg-[var(--nyasa-surface-2)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
              </Field>
              <Field label="Description">
                <input value={form.description} onChange={e => set('description', e.target.value)}
                  className="w-full bg-[var(--nyasa-surface-2)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
              </Field>
              <Field label="Role">
                <input value={form.role} onChange={e => set('role', e.target.value)} placeholder="e.g. Sales, Support, Receptionist"
                  className="w-full bg-[var(--nyasa-surface-2)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Personality">
                  <input value={form.personality} onChange={e => set('personality', e.target.value)}
                    className="w-full bg-[var(--nyasa-surface-2)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
                </Field>
                <Field label="Tone">
                  <input value={form.tone} onChange={e => set('tone', e.target.value)}
                    className="w-full bg-[var(--nyasa-surface-2)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
                </Field>
              </div>
              <Field label={
                <span className="flex items-center justify-between">
                  <span>System instructions</span>
                  <span className={form.system_instructions.length > INSTRUCTIONS_MAX_CHARS ? 'text-red-400' : 'text-gray-600'}>
                    {form.system_instructions.length.toLocaleString()} / {INSTRUCTIONS_MAX_CHARS.toLocaleString()}
                  </span>
                </span>
              }>
                <textarea value={form.system_instructions} onChange={e => set('system_instructions', e.target.value)} rows={10}
                  placeholder="Tell the agent how to behave, what it knows, and what it should never do. Write as much as you need -- full policies, scripts, edge cases are all fine."
                  className={`w-full bg-[var(--nyasa-surface-2)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 resize-y ${form.system_instructions.length > INSTRUCTIONS_MAX_CHARS ? 'ring-1 ring-red-500' : 'focus:ring-[#25D366]'}`} />
                {form.system_instructions.length > INSTRUCTIONS_MAX_CHARS && (
                  <p className="text-[10px] text-red-400 mt-1">
                    That's long -- trim it a bit. {INSTRUCTIONS_MAX_CHARS.toLocaleString()} characters is plenty of room for detailed instructions while keeping replies fast and cheap.
                  </p>
                )}
              </Field>
              <Field label="Languages">
                <div className="flex gap-1.5 flex-wrap">
                  {LANGUAGE_OPTIONS.map(lang => (
                    <button key={lang} onClick={() => toggleLanguage(lang)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${form.languages.includes(lang) ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-white/5 text-gray-500'}`}>
                      {lang}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Enabled channels">
                <div className="flex gap-1.5 flex-wrap">
                  {CHANNEL_OPTIONS.map(ch => (
                    <button key={ch} onClick={() => toggleChannel(ch)}
                      className={`text-xs px-2.5 py-1 rounded-full capitalize transition-colors ${form.enabled_channels.includes(ch) ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-white/5 text-gray-500'}`}>
                      {ch}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Agent type">
                <div className="flex gap-1.5 flex-wrap">
                  {[['general','General'],['receptionist','Receptionist'],['finance_manager','Finance Manager'],['followup','Follow-up']].map(([val,label]) => (
                    <button key={val} onClick={() => {
                      set('agent_type', val);
                      // Auto-set message_cap default when switching to receptionist
                      if (val === 'receptionist' && (form.message_cap === null || form.message_cap === undefined)) set('message_cap', 4);
                      if (val !== 'receptionist') set('message_cap', null);
                    }}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${(form.agent_type || 'general') === val ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-white/5 text-gray-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Message cap (max AI replies before handoff)">
                <input type="number" min="1" value={form.message_cap ?? ''} onChange={e => set('message_cap', e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10) || null))}
                  placeholder={form.agent_type === 'receptionist' ? '4 (receptionist default)' : 'Leave blank for unlimited'}
                  className="w-full bg-[var(--nyasa-surface-2)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
                <p className="text-[11px] text-gray-600 mt-1">Max messages this agent sends in a conversation before handing off to a human. Leave blank for unlimited.</p>
              </Field>
              <Field label="Handoff rule (route to rule after cap)">
                <select value={form.handoff_assignment_rule_id || ''} onChange={e => set('handoff_assignment_rule_id', e.target.value || null)}
                  className="w-full bg-[var(--nyasa-surface-2)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]">
                  <option value="">None — leave unassigned for humans</option>
                  {rules.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-600 mt-1">When the message cap is reached, apply this assignment rule to route the conversation to a human. Optional.</p>
              </Field>
              <Field label="Automation mode">
                <div className="flex gap-1.5">
                  <button onClick={() => set('automation_mode', 'draft')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${form.automation_mode === 'draft' ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-white/5 text-gray-500'}`}>
                    Draft for approval
                  </button>
                  <button onClick={() => set('automation_mode', 'auto')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${form.automation_mode === 'auto' ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-white/5 text-gray-500'}`}>
                    Fully automated
                  </button>
                </div>
                {form.automation_mode === 'auto' && (
                  <p className="text-[11px] text-amber-400/80 mt-1.5">
                    This agent will reply on its own — no human review — to any new conversation on its
                    enabled channels, until a teammate sends a manual reply (which hands the conversation to them).
                  </p>
                )}
              </Field>

              {/* Knowledge base — only available once the agent has an id (save creates one) */}
              <Field label="Knowledge base">
                {editing === 'new' ? (
                  <p className="text-xs text-gray-600">Save the agent first, then add FAQs, policies, or price lists here.</p>
                ) : (
                  <div className="bg-[var(--nyasa-surface-2)] rounded-xl p-2.5 space-y-1.5">
                    {loadingKnowledge ? (
                      <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                      </div>
                    ) : knowledgeItems.length === 0 && !knowledgeForm ? (
                      <p className="text-xs text-gray-600 py-1">No knowledge added yet — teach this agent your FAQs, policies, or prices.</p>
                    ) : (
                      knowledgeItems.map(k => (
                        <div key={k.id} className="flex items-start gap-2 bg-[var(--nyasa-surface-2)] rounded-lg px-2.5 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {k.source_type === 'url' && <Link2 className="w-3 h-3 text-gray-500 shrink-0" />}
                              {k.source_type === 'file' && <Upload className="w-3 h-3 text-gray-500 shrink-0" />}
                              <p className="text-xs font-semibold text-white truncate">{k.title}</p>
                            </div>
                            <p className="text-[11px] text-gray-500 line-clamp-2">{k.content}</p>
                          </div>
                          <button onClick={() => setKnowledgeForm({ ...k })} className="text-gray-500 hover:text-[#25D366] shrink-0 p-1">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => delKnowledge(k.id)} className="text-gray-500 hover:text-red-400 shrink-0 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}

                    {knowledgeForm ? (
                      <div className="bg-[var(--nyasa-surface-2)] rounded-lg p-2.5 space-y-1.5">
                        <input value={knowledgeForm.title || ''} onChange={e => setKnowledgeForm(f => ({ ...f, title: e.target.value }))}
                          placeholder="Title, e.g. Refund policy"
                          className="w-full bg-[var(--nyasa-surface-2)] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
                        <textarea value={knowledgeForm.content || ''} onChange={e => setKnowledgeForm(f => ({ ...f, content: e.target.value }))} rows={3}
                          placeholder="The actual info the agent should know…"
                          className="w-full bg-[var(--nyasa-surface-2)] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] resize-none" />
                        <div className="flex gap-1.5">
                          <button onClick={() => setKnowledgeForm(null)}
                            className="flex-1 text-[11px] font-semibold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg py-1.5 transition-colors">
                            Cancel
                          </button>
                          <button onClick={saveKnowledge} disabled={savingKnowledge || !knowledgeForm.title?.trim() || !knowledgeForm.content?.trim()}
                            className="flex-1 text-[11px] font-semibold text-black bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-50 rounded-lg py-1.5 transition-colors">
                            {savingKnowledge ? 'Saving…' : 'Save snippet'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <button onClick={() => setKnowledgeForm({ title: '', content: '' })}
                          className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20 rounded-lg py-1.5 transition-colors">
                          <BookOpen className="w-3.5 h-3.5" /> Text
                        </button>
                        <button onClick={addFromUrl} disabled={ingestingUrl}
                          className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20 disabled:opacity-50 rounded-lg py-1.5 transition-colors">
                          {ingestingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} URL
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} disabled={ingestingFile}
                          className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20 disabled:opacity-50 rounded-lg py-1.5 transition-colors">
                          {ingestingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} File
                        </button>
                        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={addFromFile} className="hidden" />
                      </div>
                    )}
                  </div>
                )}
              </Field>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => { setEditing(null); setKnowledgeForm(null); }}
                className="flex-1 text-sm font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg py-2 transition-colors">
                Cancel
              </button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 text-sm font-semibold text-black bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-50 rounded-lg py-2 transition-colors flex items-center justify-center gap-1.5">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Generous but not unbounded -- gpt-4o-mini has a huge context window, so this is
// about giving the agent real room for detailed policies/scripts (roughly 4-5x what
// a long, thorough persona doc needs), not a technical ceiling. Paired with the
// 14,000-char knowledge base cap, total system prompt stays comfortably small/cheap.
const INSTRUCTIONS_MAX_CHARS = 20000;

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
