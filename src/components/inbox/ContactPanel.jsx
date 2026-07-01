import { useState, useEffect } from 'react';
import { Mail, Phone, Edit3, Check, X, Plus, Bell, ArrowLeft } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { updateContact as updateContactRemote } from '@/lib/channels';

const DEAL_STAGES = ['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost'];
const STAGE_COLORS = {
  'New Lead': 'text-gray-400', 'Contacted': 'text-blue-400', 'Qualified': 'text-purple-400',
  'Proposal Sent': 'text-yellow-400', 'Negotiation': 'text-orange-400',
  'Closed Won': 'text-green-400', 'Closed Lost': 'text-red-400',
};

export default function ContactPanel({ conversation, onUpdate = () => {}, onClose, className = '' }) {
  const [contact, setContact] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [newTag, setNewTag] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [reminderDate, setReminderDate] = useState('');

  useEffect(() => {
    if (!conversation) { setContact(null); return; }
    // conversation.contact comes from the Supabase join in getConversations() —
    // it's the real, live contact record (not the old in-memory store stub).
    const c = conversation.contact
      ? { id: conversation.contact_id, ...conversation.contact }
      : null;
    setContact(c);
    setEditData(c ? { ...c } : {});
  }, [conversation?.id, conversation?.contact_id, conversation?.contact]);

  if (!conversation) return null;

  const saveContact = async () => {
    if (!contact) return;
    try {
      await updateContactRemote(contact.id, editData);
      setContact({ ...contact, ...editData });
      onUpdate({
        ...conversation,
        contact_name: editData.full_name || conversation.contact_name,
        contact_company: editData.company ?? conversation.contact_company,
        contact_phone: editData.phone ?? conversation.contact_phone,
      });
      setEditing(false);
    } catch (e) {
      console.error('Failed to save contact:', e);
    }
  };

  const addTag = () => {
    if (!newTag.trim()) return;
    onUpdate({ ...conversation, tags: [...(conversation.tags || []), newTag.trim()] });
    setNewTag(''); setAddingTag(false);
  };

  const removeTag = (tag) => onUpdate({ ...conversation, tags: (conversation.tags || []).filter(t => t !== tag) });

  const setReminder = () => {
    if (!reminderDate) return;
    onUpdate({ ...conversation, is_reminder_active: true, reminder_at: new Date(reminderDate).toISOString() });
    setShowReminder(false); setReminderDate('');
  };

  const setStage = (stage) => {
    if (contact) updateContactRemote(contact.id, { deal_stage: stage }).catch(e => console.error('Failed to update deal stage:', e));
    onUpdate({ ...conversation, deal_stage: stage });
  };

  const inputCls = 'w-full bg-[#2A3942] text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0 placeholder:text-gray-600';

  return (
    <div className={`bg-[#111B21] flex-col overflow-y-auto scrollbar-thin ${className}`}>
      {/* Mobile/tablet back bar — the panel is docked permanently at xl+, so this only shows below that */}
      <div className="xl:hidden flex items-center gap-3 px-4 h-14 border-b border-white/10 shrink-0 sticky top-0 bg-[#111B21] z-10">
        <button onClick={onClose} className="p-1.5 -ml-1.5 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <p className="text-sm font-semibold text-white">Contact info</p>
      </div>

      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-white/10 text-center">
        <Avatar name={conversation.contact_name || '?'} size="lg" />
        {editing ? (
          <div className="mt-3 space-y-2">
            {[['full_name','Name'],['company','Company'],['phone','Phone']].map(([k,ph]) => (
              <input key={k} className={inputCls} placeholder={ph} value={editData[k] || ''} onChange={e => setEditData(d => ({ ...d, [k]: e.target.value }))} />
            ))}
            <div className="flex gap-2">
              <button onClick={saveContact} className="flex-1 py-1.5 bg-[#25D366] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1"><Check className="w-3 h-3" /> Save</button>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 bg-white/10 text-gray-300 text-xs rounded-lg"><X className="w-3 h-3" /></button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <div className="flex items-center justify-center gap-2">
              <h3 className="font-semibold text-white text-sm">{contact?.full_name || conversation.contact_name}</h3>
              {contact && <button onClick={() => setEditing(true)} className="p-1 hover:bg-white/10 rounded transition-colors"><Edit3 className="w-3 h-3 text-gray-500" /></button>}
            </div>
            {contact?.company && <p className="text-xs text-gray-500 mt-0.5">{contact.company}</p>}
            {(contact?.email || conversation.contact_email) && (
              <a href={`mailto:${contact?.email || conversation.contact_email}`} className="flex items-center justify-center gap-1 mt-2 text-xs text-gray-500 hover:text-[#25D366] transition-colors">
                <Mail className="w-3 h-3" /><span className="truncate">{contact?.email || conversation.contact_email}</span>
              </a>
            )}
            {contact?.phone && <div className="flex items-center justify-center gap-1 mt-1 text-xs text-gray-500"><Phone className="w-3 h-3" />{contact.phone}</div>}
          </div>
        )}
      </div>

      {/* Deal Stage */}
      <div className="px-4 py-3 border-b border-white/10">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-2">Deal Stage</p>
        <div className="flex flex-wrap gap-1">
          {DEAL_STAGES.map(s => (
            <button key={s} onClick={() => setStage(s)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-all
                ${(conversation.deal_stage || 'New Lead') === s ? `border-current font-semibold ${STAGE_COLORS[s]}` : 'border-white/10 text-gray-700 hover:border-white/20'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Tags</p>
          <button onClick={() => setAddingTag(true)} className="p-1 hover:bg-white/10 rounded transition-colors"><Plus className="w-3 h-3 text-gray-600" /></button>
        </div>
        <div className="flex flex-wrap gap-1">
          {(conversation.tags || []).map(tag => (
            <span key={tag} className="flex items-center gap-1 text-[10px] bg-[#25D366]/10 text-[#25D366] px-2 py-0.5 rounded-full">
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
          {addingTag && (
            <div className="flex items-center gap-1">
              <input autoFocus value={newTag} onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { setAddingTag(false); setNewTag(''); } }}
                placeholder="tag" className="text-xs bg-[#2A3942] text-white rounded-full px-2 py-0.5 w-16 focus:outline-none" />
              <button onClick={addTag}><Check className="w-3 h-3 text-[#25D366]" /></button>
            </div>
          )}
          {!(conversation.tags || []).length && !addingTag && <span className="text-xs text-gray-700">No tags</span>}
        </div>
      </div>

      {/* Reminder */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Follow-up</p>
          <button onClick={() => setShowReminder(!showReminder)} className="p-1 hover:bg-white/10 rounded transition-colors">
            <Bell className={`w-3 h-3 ${conversation.is_reminder_active ? 'text-yellow-400' : 'text-gray-600'}`} />
          </button>
        </div>
        {conversation.is_reminder_active && (
          <p className="text-xs text-yellow-400">🔔 {conversation.reminder_at ? new Date(conversation.reminder_at).toLocaleDateString() : 'Set'}</p>
        )}
        {showReminder && (
          <div className="mt-2 space-y-2">
            <input type="datetime-local" value={reminderDate} onChange={e => setReminderDate(e.target.value)} className={inputCls} />
            <button onClick={setReminder} className="w-full py-1.5 bg-yellow-500 text-white text-xs font-semibold rounded-lg">Set Reminder</button>
          </div>
        )}
      </div>

      {/* Notes */}
      {contact && (
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-2">Notes</p>
          <textarea rows={3} defaultValue={contact.notes || ''}
            onBlur={e => { updateContactRemote(contact.id, { notes: e.target.value }).catch(err => console.error('Failed to save notes:', err)); setContact(prev => ({ ...prev, notes: e.target.value })); }}
            placeholder="Add notes…"
            className="w-full bg-[#2A3942] text-xs text-gray-300 placeholder:text-gray-600 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#25D366] border-0" />
        </div>
      )}
    </div>
  );
}