import { useState, useEffect, useRef } from 'react';
import { Plus, Bot, Trash2, Loader2, Sparkles, X, BookOpen, Pencil, Link2, Upload } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import { getAiAgents, saveAiAgent, deleteAiAgent, getAiAgentTemplates, getAiKnowledge, saveAiKnowledge, deleteAiKnowledge, addKnowledgeFromUrl, addKnowledgeFromFile } from '@/lib/channels';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const CHANNEL_OPTIONS = ['whatsapp', 'website', 'instagram', 'telegram', 'messenger'];
const LANGUAGE_OPTIONS = ['English', 'Chichewa', 'French', 'Portuguese', 'Swahili'];

const BLANK_FORM = {
  name: '', description: '', role: '', template_key: null,
  system_instructions: '', personality: '', tone: '',
  languages: ['English'], enabled_channels: [], automation_mode: 'draft', status: 'active',
};

export default function AiAgents() {
  useDocumentTitle('AI Agents');
  const { workspaceOwnerId, isWorkspaceAdmin } = useNyasaAuth();

  const [agents, setAgents] = useState([]);
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

  const load = async () => {
    if (!workspaceOwnerId) { setLoading(false); return; }
    try {
      const [a, t] = await Promise.all([getAiAgents(workspaceOwnerId), getAiAgentTemplates()]);
      setAgents(a);
      setTemplates(t);
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
      alert('Failed to save knowledge: ' + e.message);
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
      alert('Could not add that page: ' + e.message);
    } finally {
      setIngestingUrl(false);
    }
  };

  const addFromFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) { alert('File is too large (max 2.5MB) — try a shorter document.'); return; }
    setIngestingFile(true);
    try {
      await addKnowledgeFromFile(workspaceOwnerId, editing, file);
      await loadKnowledge(editing);
    } catch (e2) {
      alert('Could not read that file: ' + e2.message);
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
      alert(isNetworkErr
        ? "Couldn't save — your connection dropped. Check your signal and try again."
        : 'Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this AI agent? This cannot be undone.')) return;
    try {
      await deleteAiAgent(id);
      setAgents(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      console.error('[AiAgents] delete error:', e);
      alert('Failed to delete: ' + e.message);
    }
  };

  const toggleStatus = async (agent) => {
    const status = agent.status === 'active' ? 'disabled' : 'active';
    try {
      await saveAiAgent(workspaceOwnerId, { id: agent.id, status });
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status } : a));
    } catch (e) {
      console.error('[AiAgents] toggle status error:', e);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#111B21] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0 border-b border-white/10">
          <div>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#25D366]" /> AI Agents
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">AI-powered team members for your shared inbox</p>
          </div>
          {isWorkspaceAdmin && (
            <div className="flex gap-2">
              <button onClick={() => setShowTemplates(true)}
                className="flex items-center gap-1.5 bg-[#202C33] hover:bg-[#2A3942] text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors">
                <Sparkles className="w-4 h-4" /> From template
              </button>
              <button onClick={startBlank}
                className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-black text-sm font-semibold px-3 py-2 rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> New agent
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-16">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
              <Bot className="w-10 h-10 text-gray-700" />
              <p className="text-sm text-gray-500">No AI agents yet</p>
              <p className="text-xs text-gray-600">Start from a template or build one from scratch.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map(agent => (
                <div key={agent.id} className="bg-[#202C33] rounded-xl p-4 flex flex-col gap-2 border border-white/5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#25D366]/15 flex items-center justify-center shrink-0">
                        <Bot className="w-4.5 h-4.5 text-[#25D366]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{agent.name}</p>
                        <p className="text-gray-500 text-[11px] truncate">{agent.role || 'AI Agent'}</p>
                      </div>
                    </div>
                    <button onClick={() => toggleStatus(agent)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${agent.status === 'active' ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-white/10 text-gray-500'}`}>
                      {agent.status === 'active' ? 'Active' : 'Disabled'}
                    </button>
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
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => startEdit(agent)}
                      className="flex-1 text-xs font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg py-1.5 transition-colors">
                      Configure
                    </button>
                    <button onClick={() => del(agent.id)}
                      className="text-gray-500 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded-lg px-2.5 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Template picker modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowTemplates(false)}>
          <div className="bg-[#111B21] rounded-2xl border border-white/10 w-full max-w-lg max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">Choose a template</h2>
              <button onClick={() => setShowTemplates(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="grid gap-2">
              {templates.map(tpl => (
                <button key={tpl.key} onClick={() => startFromTemplate(tpl)}
                  className="text-left bg-[#202C33] hover:bg-[#2A3942] rounded-xl p-3 transition-colors">
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
          <div className="bg-[#111B21] rounded-2xl border border-white/10 w-full max-w-xl max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold">{editing === 'new' ? 'New AI agent' : 'Configure agent'}</h2>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="space-y-3">
              <Field label="Agent name">
                <input value={form.name} onChange={e => set('name', e.target.value)}
                  className="w-full bg-[#202C33] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
              </Field>
              <Field label="Description">
                <input value={form.description} onChange={e => set('description', e.target.value)}
                  className="w-full bg-[#202C33] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
              </Field>
              <Field label="Role">
                <input value={form.role} onChange={e => set('role', e.target.value)} placeholder="e.g. Sales, Support, Receptionist"
                  className="w-full bg-[#202C33] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Personality">
                  <input value={form.personality} onChange={e => set('personality', e.target.value)}
                    className="w-full bg-[#202C33] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
                </Field>
                <Field label="Tone">
                  <input value={form.tone} onChange={e => set('tone', e.target.value)}
                    className="w-full bg-[#202C33] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
                </Field>
              </div>
              <Field label="System instructions">
                <textarea value={form.system_instructions} onChange={e => set('system_instructions', e.target.value)} rows={5}
                  placeholder="Tell the agent how to behave, what it knows, and what it should never do."
                  className="w-full bg-[#202C33] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#25D366] resize-none" />
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
                  <div className="bg-[#1a2530] rounded-xl p-2.5 space-y-1.5">
                    {loadingKnowledge ? (
                      <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                      </div>
                    ) : knowledgeItems.length === 0 && !knowledgeForm ? (
                      <p className="text-xs text-gray-600 py-1">No knowledge added yet — teach this agent your FAQs, policies, or prices.</p>
                    ) : (
                      knowledgeItems.map(k => (
                        <div key={k.id} className="flex items-start gap-2 bg-[#202C33] rounded-lg px-2.5 py-2">
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
                      <div className="bg-[#202C33] rounded-lg p-2.5 space-y-1.5">
                        <input value={knowledgeForm.title || ''} onChange={e => setKnowledgeForm(f => ({ ...f, title: e.target.value }))}
                          placeholder="Title, e.g. Refund policy"
                          className="w-full bg-[#1a2530] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#25D366]" />
                        <textarea value={knowledgeForm.content || ''} onChange={e => setKnowledgeForm(f => ({ ...f, content: e.target.value }))} rows={3}
                          placeholder="The actual info the agent should know…"
                          className="w-full bg-[#1a2530] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] resize-none" />
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

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
