import { useState, useEffect } from 'react';
import {
  Plus, Send, Trash2, X, Megaphone, Loader2, AlertTriangle,
  Users, Calendar, Clock, Sparkles, MessageSquare, Check, Eye
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import ChannelBadge, { CHANNELS } from '@/components/ChannelBadge';
import Avatar from '@/components/Avatar';
import { useNyasaAuth } from '@/lib/NyasaAuth';
import {
  getContacts, getBroadcasts, createBroadcast, sendBroadcast,
  deleteBroadcast, getWhatsAppTemplates
} from '@/lib/channels';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STAGES = ['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost'];

const STATUS_COLORS = {
  sent: 'text-green-400 bg-green-900/20 border-green-500/30',
  draft: 'text-gray-400 bg-gray-900/20 border-gray-500/20',
  sending: 'text-blue-400 bg-blue-900/20 border-blue-500/30',
  scheduled: 'text-purple-400 bg-purple-900/20 border-purple-500/30',
  failed: 'text-red-400 bg-red-900/20 border-red-500/30'
};

export default function Broadcasts() {
  useDocumentTitle('Broadcasts');
  const { user, profile } = useNyasaAuth();
  const workspaceId = profile?.workspace_id || user?.id;

  const [broadcasts, setBroadcasts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState(null);

  // Form State
  const [form, setForm] = useState({
    name: '',
    channel: 'whatsapp',
    stageFilter: '', // Filter audience by deal stage
    message: '',
    scheduleOption: 'now', // 'now' | 'schedule'
    scheduledAt: '',
    template_name: '',
    template_language: 'en_US'
  });

  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Fetch broadcasts and contacts
  const load = async () => {
    if (!workspaceId) { setLoading(false); return; }
    try {
      const [bcs, cts] = await Promise.all([getBroadcasts(workspaceId), getContacts(workspaceId)]);
      setBroadcasts(bcs);
      setContacts(cts);
    } catch (e) {
      console.error('[Broadcasts] load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceId]);

  // Fetch templates for WhatsApp
  useEffect(() => {
    if (!workspaceId || form.channel !== 'whatsapp' || !showNew) { return; }
    setTemplatesLoading(true);
    getWhatsAppTemplates(workspaceId)
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [workspaceId, form.channel, showNew]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Compute targeted contacts based on Stage Filter
  const getFilteredContacts = () => {
    // Only send to contacts that have a phone number (WhatsApp needs it)
    const withPhone = contacts.filter(c => c.phone);
    if (!form.stageFilter) return [];
    if (form.stageFilter === '_all_') return withPhone;
    return withPhone.filter(c => c.deal_stage === form.stageFilter);
  };

  const targetedContacts = getFilteredContacts();

  // Create Campaign
  const createCampaign = async () => {
    if (!form.name.trim() || !form.message.trim() || !form.stageFilter || !targetedContacts.length || creating) return;
    setCreating(true);
    try {
      const audienceIds = targetedContacts.map(c => c.id);
      
      // Determine final status based on scheduling
      const campaignStatus = form.scheduleOption === 'schedule' && form.scheduledAt ? 'scheduled' : 'draft';

      const payload = {
        name: form.name.trim(),
        channel: form.channel,
        message: form.message.trim(),
        audience: audienceIds,
        template_name: form.template_name || null,
        template_language: form.template_name ? form.template_language : null,
        status: campaignStatus,
        scheduled_at: campaignStatus === 'scheduled' ? new Date(form.scheduledAt).toISOString() : null
      };

      const newBc = await createBroadcast(workspaceId, payload);
      
      // If "Send Now", trigger the broadcast send directly
      if (form.scheduleOption === 'now' && newBc?.id) {
        await sendBroadcast(workspaceId, newBc.id);
      }

      setShowNew(false);
      // Reset form
      setForm({
        name: '',
        channel: 'whatsapp',
        stageFilter: '',
        message: '',
        scheduleOption: 'now',
        scheduledAt: '',
        template_name: '',
        template_language: 'en_US'
      });
      await load();
    } catch (e) {
      console.error('[Broadcasts] create campaign error:', e);
    } finally {
      setCreating(false);
    }
  };

  const templateBodyText = (t) => t?.components?.find(c => c.type === 'BODY')?.text || '';

  const selectTemplate = (key) => {
    if (!key) {
      set('template_name', '');
      set('message', '');
      return;
    }
    const [name, language] = key.split('|');
    const t = templates.find(x => x.name === name && x.language === language);
    set('template_name', name);
    set('template_language', language);
    set('message', templateBodyText(t));
  };

  const deleteCampaign = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this campaign?')) return;
    try {
      await deleteBroadcast(id);
      setBroadcasts(prev => prev.filter(b => b.id !== id));
      if (selectedCampaign?.id === id) {
        setSelectedCampaign(null);
      }
    } catch (e) {
      console.error('[Broadcasts] delete error:', e);
    }
  };

  const handleSendNow = async (id, e) => {
    e.stopPropagation();
    setSendingId(id);
    try {
      await sendBroadcast(workspaceId, id);
      await load();
      // If currently showing details, update it
      if (selectedCampaign?.id === id) {
        const updated = broadcasts.find(b => b.id === id);
        if (updated) setSelectedCampaign(updated);
      }
    } catch (e) {
      console.error('[Broadcasts] send error:', e);
    } finally {
      setSendingId(null);
    }
  };

  // Live preview formatting helper
  const renderPreviewMessage = (text) => {
    if (!text) return 'Your message preview will appear here...';
    return text.replace(/\{\{\s*name\s*\}\}/gi, 'John Doe');
  };

  const inputCls = 'w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border border-[var(--nyasa-border)] placeholder:text-gray-600 transition-all';

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--nyasa-surface-1)] pt-14 md:pt-0 pb-[56px] md:pb-0">
      <Sidebar />
      
      <div className="flex-1 flex overflow-hidden bg-[var(--nyasa-surface-5)]">
        {/* Main campaigns list view */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                  <Megaphone className="w-6 h-6 text-[#25D366]" />
                  Campaigns
                </h1>
                <p className="text-sm text-gray-400 mt-1">Design, target, and monitor high-converting business broadcast flows.</p>
              </div>
              <button
                onClick={() => setShowNew(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#25D366] text-white text-sm font-semibold rounded-xl hover:bg-[#20BA5A] active:scale-[0.98] transition-all shadow-lg shadow-[#25D366]/10"
              >
                <Plus className="w-4.5 h-4.5" /> New Campaign
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 text-[#25D366] animate-spin" />
              </div>
            ) : broadcasts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center bg-[var(--nyasa-surface-2)] rounded-2xl border border-[var(--nyasa-border)] p-8">
                <Megaphone className="w-16 h-16 text-gray-700 mb-4" />
                <h3 className="text-lg font-semibold text-white">No campaigns created yet</h3>
                <p className="text-gray-400 max-w-sm mt-1 text-sm">Create your first highly targeted campaign to engage with your workspace contacts.</p>
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-6 flex items-center gap-2 px-4 py-2 bg-[var(--nyasa-surface-4)] text-white hover:bg-white/10 border border-[var(--nyasa-border)] rounded-xl text-sm font-medium transition-colors"
                >
                  Create Campaign
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {broadcasts.map(bc => {
                  const isActive = selectedCampaign?.id === bc.id;
                  const audienceCount = (bc.audience || []).length;
                  const dateToDisplay = bc.sent_at || bc.scheduled_at || bc.created_at;

                  return (
                    <div
                      key={bc.id}
                      onClick={() => setSelectedCampaign(bc)}
                      className={`flex flex-col md:flex-row md:items-center justify-between p-5 bg-[var(--nyasa-surface-2)] rounded-2xl border transition-all cursor-pointer hover:border-white/10 ${
                        isActive ? 'border-[#25D366]/40 bg-[var(--nyasa-surface-3)] ring-1 ring-[#25D366]/20' : 'border-[var(--nyasa-border)]'
                      }`}
                    >
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-white text-base leading-snug">{bc.name}</h3>
                          <ChannelBadge channel={bc.channel} showLabel />
                          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                            STATUS_COLORS[bc.status] || 'text-gray-400 bg-white/5 border-transparent'
                          }`}>
                            {bc.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {audienceCount} recipients
                          </span>
                          {dateToDisplay && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {bc.status === 'scheduled' ? 'Scheduled: ' : bc.status === 'sent' ? 'Sent: ' : 'Created: '}
                              {new Date(dateToDisplay).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-4 md:mt-0 justify-end">
                        {bc.status === 'draft' && (
                          <button
                            onClick={(e) => handleSendNow(bc.id, e)}
                            disabled={sendingId === bc.id}
                            className="px-3.5 py-2 bg-[#25D366] text-white text-xs font-semibold rounded-lg hover:bg-[#20BA5A] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {sendingId === bc.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                            Send Now
                          </button>
                        )}
                        <button
                          onClick={(e) => deleteCampaign(bc.id, e)}
                          className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Campaign details side-drawer */}
        {selectedCampaign && (
          <div className="w-[380px] bg-[var(--nyasa-surface-2)] border-l border-[var(--nyasa-border)] overflow-y-auto scrollbar-thin flex flex-col h-full animate-in slide-in-from-right duration-200">
            <div className="p-6 border-b border-[var(--nyasa-border)] flex items-center justify-between">
              <div>
                <h2 className="font-bold text-white text-lg">Campaign Details</h2>
                <p className="text-xs text-gray-400">Selected campaign analytics and delivery</p>
              </div>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="p-1 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1">
              {/* Core info card */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Campaign Name</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    STATUS_COLORS[selectedCampaign.status] || ''
                  }`}>
                    {selectedCampaign.status}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white leading-tight">{selectedCampaign.name}</h3>
                
                <div className="flex gap-2.5 pt-1">
                  <ChannelBadge channel={selectedCampaign.channel} showLabel />
                </div>
              </div>

              {/* Message block */}
              <div className="space-y-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Message Template / Body</span>
                <div className="bg-[var(--nyasa-surface-4)] border border-[var(--nyasa-border)] rounded-xl p-4 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {selectedCampaign.message}
                </div>
              </div>

              {/* Delivery Analytics Metrics */}
              {selectedCampaign.status === 'sent' && (
                <div className="space-y-3">
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Campaign Metrics</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[var(--nyasa-surface-4)] border border-[var(--nyasa-border)] rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-400">Total Sent</p>
                      <p className="text-xl font-black text-white mt-1">{(selectedCampaign.audience || []).length}</p>
                    </div>
                    <div className="bg-green-950/20 border border-green-900/30 rounded-xl p-3 text-center">
                      <p className="text-xs text-green-400">Delivered</p>
                      <p className="text-xl font-black text-[#25D366] mt-1">
                        {selectedCampaign.sent_count ?? (selectedCampaign.audience || []).length}
                      </p>
                    </div>
                    <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-3 text-center">
                      <p className="text-xs text-red-400">Failed</p>
                      <p className="text-xl font-black text-red-400 mt-1">{selectedCampaign.failed_count ?? 0}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Scheduled details */}
              {selectedCampaign.status === 'scheduled' && selectedCampaign.scheduled_at && (
                <div className="bg-purple-950/20 border border-purple-900/30 rounded-xl p-4 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Scheduled Delivery</h4>
                    <p className="text-sm text-purple-200 mt-1 font-medium">
                      {new Date(selectedCampaign.scheduled_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </p>
                  </div>
                </div>
              )}

              {/* Targeted Audience */}
              <div className="space-y-3">
                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                  Audience ({(selectedCampaign.audience || []).length})
                </span>
                <div className="bg-[var(--nyasa-surface-4)] rounded-xl border border-[var(--nyasa-border)] max-h-56 overflow-y-auto scrollbar-thin p-1 divide-y divide-[var(--nyasa-border)]">
                  {contacts.filter(c => (selectedCampaign.audience || []).includes(c.id)).map(c => (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <Avatar name={c.full_name} size="xs" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{c.full_name}</p>
                        <p className="text-xs text-gray-500 truncate">{c.phone || c.email || 'No identifier'}</p>
                      </div>
                    </div>
                  ))}
                  {contacts.filter(c => (selectedCampaign.audience || []).includes(c.id)).length === 0 && (
                    <p className="text-xs text-gray-500 p-4 text-center">No contacts in this audience group anymore.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Campaign Composer slide-up modal (mobile-first style) */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xs transition-opacity" onClick={() => setShowNew(false)} />
          
          {/* Modal Container */}
          <div className="relative bg-[var(--nyasa-surface-2)] border border-[var(--nyasa-border)] w-full md:w-[600px] max-h-[92vh] md:max-h-[88vh] rounded-t-3xl md:rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Header */}
            <div className="p-5 border-b border-[var(--nyasa-border)] flex items-center justify-between shrink-0 bg-[var(--nyasa-surface-3)]">
              <div>
                <h2 className="font-bold text-white text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#25D366]" />
                  Campaign Composer
                </h2>
                <p className="text-xs text-gray-400">Launch premium high-velocity outreach campaign</p>
              </div>
              <button
                onClick={() => setShowNew(false)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-6 overflow-y-auto scrollbar-thin space-y-5 flex-1 bg-[var(--nyasa-surface-2)]">
              {/* Campaign Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Campaign Name</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Summer Promo Wave 1 *"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                />
              </div>

              {/* Grid Channel + Deal Stage */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Channel */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Outreach Channel</label>
                  <select
                    value={form.channel}
                    onChange={e => {
                      set('channel', e.target.value);
                      set('template_name', '');
                      set('message', '');
                    }}
                    className="w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border border-[var(--nyasa-border)]"
                  >
                    {CHANNELS.map(c => (
                      <option key={c} value={c} className="capitalize">{c}</option>
                    ))}
                  </select>
                </div>

                {/* Deal Stage Audience selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Target Audience</label>
                  <select
                    value={form.stageFilter}
                    onChange={e => set('stageFilter', e.target.value)}
                    className="w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border border-[var(--nyasa-border)]"
                  >
                    <option value="">Select audience *</option>
                    <option value="_all_">All contacts (with phone)</option>
                    {STAGES.map(s => (
                      <option key={s} value={s}>{s} stage only</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Template picker for WhatsApp */}
              {form.channel === 'whatsapp' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                    WhatsApp Approved Template
                  </label>
                  <select
                    value={form.template_name ? `${form.template_name}|${form.template_language}` : ''}
                    onChange={e => selectTemplate(e.target.value)}
                    className="w-full bg-[var(--nyasa-surface-4)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border border-[var(--nyasa-border)]"
                  >
                    <option value="">Free text (Only reaches active 24h chats)</option>
                    {templatesLoading && <option disabled>Loading approved Meta templates…</option>}
                    {templates.map(t => (
                      <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                        {t.name} ({t.language})
                      </option>
                    ))}
                  </select>
                  {!templatesLoading && templates.length === 0 && (
                    <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      No Meta templates synced. Using Free Text (requires active 24h session).
                    </p>
                  )}
                </div>
              )}

              {/* Message Input with Character Counter & {{name}} */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                    Campaign Message
                  </label>
                  <span className="text-[11px] text-gray-500 font-medium">
                    {form.message.length} / {form.channel === 'whatsapp' ? 4096 : 2000}
                  </span>
                </div>
                
                <textarea
                  rows={4}
                  maxLength={form.channel === 'whatsapp' ? 4096 : 2000}
                  className={`${inputCls} resize-none ${form.template_name ? 'opacity-60 cursor-not-allowed bg-[var(--nyasa-surface-5)]' : ''}`}
                  placeholder="Design your campaign copy..."
                  value={form.message}
                  readOnly={!!form.template_name}
                  onChange={e => set('message', e.target.value)}
                />

                <div className="flex justify-between items-center pt-1">
                  <button
                    type="button"
                    disabled={!!form.template_name}
                    onClick={() => set('message', form.message + '{{name}}')}
                    className="px-3 py-1.5 bg-[var(--nyasa-surface-4)] text-xs text-gray-300 rounded-lg hover:text-white hover:bg-white/5 border border-[var(--nyasa-border)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Insert {'{{name}}'}
                  </button>
                  {form.channel === 'whatsapp' && !form.template_name && (
                    <p className="text-[10px] text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Requires recipient interaction in last 24h
                    </p>
                  )}
                </div>
              </div>

              {/* Live Preview Bubble */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">Live Preview</label>
                <div className="bg-[var(--nyasa-surface-5)] rounded-2xl border border-[var(--nyasa-border)] p-4 flex flex-col justify-end bg-repeat min-h-[100px] relative overflow-hidden">
                  <div className="absolute inset-0 bg-[#0b141a]/95 pointer-events-none" />
                  
                  {/* WhatsApp styled dark green bubble */}
                  <div className="relative z-10 self-start max-w-[85%] bg-[#005c4b] text-white text-xs px-3.5 py-2.5 rounded-2xl rounded-tl-none shadow-md">
                    <p className="whitespace-pre-wrap leading-relaxed">{renderPreviewMessage(form.message)}</p>
                    <div className="text-right text-[9px] text-emerald-300 mt-1 font-mono flex items-center justify-end gap-0.5">
                      12:00 PM <Check className="w-3 h-3 text-[#53bdeb]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Scheduling Selector */}
              <div className="bg-[var(--nyasa-surface-4)] border border-[var(--nyasa-border)] rounded-2xl p-4.5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">Delivery Schedule</span>
                  <div className="flex bg-[var(--nyasa-surface-5)] rounded-xl p-1 border border-[var(--nyasa-border)]">
                    <button
                      type="button"
                      onClick={() => set('scheduleOption', 'now')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        form.scheduleOption === 'now' ? 'bg-[#25D366] text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Send Now
                    </button>
                    <button
                      type="button"
                      onClick={() => set('scheduleOption', 'schedule')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        form.scheduleOption === 'schedule' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Schedule
                    </button>
                  </div>
                </div>

                {form.scheduleOption === 'schedule' && (
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <label className="text-xs text-gray-400">Launch Date & Time</label>
                    <div className="relative">
                      <input
                        type="datetime-local"
                        value={form.scheduledAt}
                        onChange={e => set('scheduledAt', e.target.value)}
                        className="w-full bg-[var(--nyasa-surface-5)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none border border-[var(--nyasa-border)] scheme-dark focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Audience Preview Badge / info */}
              <div className="bg-[var(--nyasa-surface-4)] rounded-xl px-4 py-3 border border-[var(--nyasa-border)] flex items-center justify-between text-xs text-gray-300">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-gray-400" />
                  Audience selection:
                </span>
                <span className="font-bold text-[#25D366]">
                  {targetedContacts.length} recipient{targetedContacts.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-5 border-t border-[var(--nyasa-border)] bg-[var(--nyasa-surface-3)] shrink-0 flex gap-3.5">
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="flex-1 py-3 border border-[var(--nyasa-border)] text-gray-300 hover:text-white rounded-xl text-sm font-semibold active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createCampaign}
                disabled={!form.name.trim() || !form.message.trim() || !targetedContacts.length || creating}
                className={`flex-1 py-3 text-white font-bold rounded-xl text-sm active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  form.scheduleOption === 'schedule' ? 'bg-purple-600 hover:bg-purple-500' : 'bg-[#25D366] hover:bg-[#20BA5A]'
                }`}
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing…
                  </>
                ) : form.scheduleOption === 'schedule' ? (
                  'Schedule Campaign'
                ) : (
                  'Launch Campaign'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
