import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { User, Building2, Mail, Phone, Globe, Edit3, Check, X, Plus, Bell, Clock } from 'lucide-react';
import DealStageStepper from './DealStageStepper';
import TagChip from './TagChip';
import ChannelBadge from './ChannelBadge';

export default function ContactPanel({ conversation, user, onConversationUpdate }) {
  const [contact, setContact] = useState(null);
  const [contactHistory, setContactHistory] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [savingStage, setSavingStage] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');

  useEffect(() => {
    if (!conversation) { setContact(null); return; }
    if (conversation.contact_id) {
      base44.entities.Contact.get(conversation.contact_id)
        .then(c => { setContact(c); setEditData(c); })
        .catch(() => setContact(null));
      base44.entities.Conversation.filter({ contact_id: conversation.contact_id }, '-updated_date', 10)
        .then(setContactHistory)
        .catch(() => {});
    } else {
      setContact(null);
      setContactHistory([]);
    }
  }, [conversation?.id, conversation?.contact_id]);

  const updateStage = async (stage) => {
    if (!conversation) return;
    setSavingStage(true);
    await base44.entities.Conversation.update(conversation.id, { deal_stage: stage });
    if (contact) await base44.entities.Contact.update(contact.id, { deal_stage: stage });

    // Log activity
    await base44.entities.Message.create({
      conversation_id: conversation.id,
      type: 'activity',
      body: `Deal stage changed to "${stage}"`,
      sender_name: user?.full_name || 'You',
      sender_id: user?.id,
      channel: conversation.channel,
    });

    if (onConversationUpdate) onConversationUpdate({ ...conversation, deal_stage: stage });
    setSavingStage(false);
  };

  const saveContact = async () => {
    if (!contact) return;
    await base44.entities.Contact.update(contact.id, editData);
    setContact({ ...contact, ...editData });
    setEditing(false);
  };

  const addTag = async () => {
    if (!newTag.trim() || !conversation) return;
    const existing = conversation.tags || [];
    if (existing.includes(newTag.trim())) { setNewTag(''); setAddingTag(false); return; }
    const tags = [...existing, newTag.trim()];
    await base44.entities.Conversation.update(conversation.id, { tags });
    if (onConversationUpdate) onConversationUpdate({ ...conversation, tags });
    setNewTag('');
    setAddingTag(false);
  };

  const removeTag = async (tag) => {
    if (!conversation) return;
    const tags = (conversation.tags || []).filter(t => t !== tag);
    await base44.entities.Conversation.update(conversation.id, { tags });
    if (onConversationUpdate) onConversationUpdate({ ...conversation, tags });
  };

  const setReminder = async () => {
    if (!reminderDate || !conversation) return;
    await base44.entities.Reminder.create({
      conversation_id: conversation.id,
      user_id: user?.id,
      remind_at: new Date(reminderDate).toISOString(),
      note: reminderNote,
    });
    await base44.entities.Conversation.update(conversation.id, {
      reminder_at: new Date(reminderDate).toISOString(),
      is_reminder_active: true,
    });
    if (onConversationUpdate) onConversationUpdate({ ...conversation, is_reminder_active: true });
    setShowReminder(false);
    setReminderDate('');
    setReminderNote('');
  };

  if (!conversation) return null;

  const dealStage = conversation.deal_stage || 'New Lead';

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-y-auto scrollbar-thin shrink-0">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-start justify-between mb-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#5C6CF7] to-[#00A8BD] flex items-center justify-center text-white font-bold text-lg">
            {(conversation.contact_name || '?')[0].toUpperCase()}
          </div>
          {contact && (
            <button onClick={() => setEditing(!editing)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              {editing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-2">
            <input
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
              value={editData.full_name || ''}
              onChange={e => setEditData(d => ({ ...d, full_name: e.target.value }))}
              placeholder="Full name"
            />
            <input
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
              value={editData.company || ''}
              onChange={e => setEditData(d => ({ ...d, company: e.target.value }))}
              placeholder="Company"
            />
            <input
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
              value={editData.phone || ''}
              onChange={e => setEditData(d => ({ ...d, phone: e.target.value }))}
              placeholder="Phone"
            />
            <button onClick={saveContact} className="w-full py-1.5 bg-[#5C6CF7] text-white text-xs font-semibold rounded-lg hover:bg-[#4A5CE6] transition-colors flex items-center justify-center gap-1">
              <Check className="w-3 h-3" /> Save
            </button>
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-gray-900 text-base leading-tight">{contact?.full_name || conversation.contact_name || 'Unknown Contact'}</h3>
            {contact?.company && <p className="text-xs text-gray-500 mt-0.5">{contact.company}</p>}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <ChannelBadge channel={conversation.channel} showLabel />
              {contact?.lead_source && (
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{contact.lead_source}</span>
              )}
            </div>
            {(contact?.email || conversation.contact_email) && (
              <a href={`mailto:${contact?.email || conversation.contact_email}`} className="flex items-center gap-1.5 mt-2 text-xs text-gray-500 hover:text-[#5C6CF7] transition-colors">
                <Mail className="w-3 h-3" />
                <span className="truncate">{contact?.email || conversation.contact_email}</span>
              </a>
            )}
            {contact?.phone && (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
                <Phone className="w-3 h-3" />
                {contact.phone}
              </div>
            )}
          </>
        )}
      </div>

      {/* Deal Stage */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Deal Stage</span>
          {savingStage && <div className="w-3 h-3 border-2 border-[#5C6CF7] border-t-transparent rounded-full animate-spin" />}
        </div>
        <DealStageStepper currentStage={dealStage} onChange={updateStage} compact />
      </div>

      {/* Tags */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tags</span>
          <button onClick={() => setAddingTag(true)} className="p-1 hover:bg-gray-100 rounded transition-colors">
            <Plus className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(conversation.tags || []).map(tag => (
            <TagChip key={tag} tag={tag} onRemove={removeTag} />
          ))}
          {addingTag && (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { setAddingTag(false); setNewTag(''); } }}
                placeholder="tag name"
                className="text-xs border border-[#5C6CF7] rounded-full px-2 py-0.5 w-20 focus:outline-none"
              />
              <button onClick={addTag} className="p-0.5 text-[#5C6CF7]"><Check className="w-3 h-3" /></button>
            </div>
          )}
          {!(conversation.tags || []).length && !addingTag && (
            <span className="text-xs text-gray-400">No tags yet</span>
          )}
        </div>
      </div>

      {/* Reminder */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Follow-up Reminder</span>
          <button onClick={() => setShowReminder(!showReminder)} className="p-1 hover:bg-gray-100 rounded transition-colors">
            <Bell className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
        {conversation.is_reminder_active ? (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            <Bell className="w-3 h-3" />
            Reminder set{conversation.reminder_at ? `: ${new Date(conversation.reminder_at).toLocaleDateString()}` : ''}
          </div>
        ) : null}
        {showReminder && (
          <div className="mt-2 space-y-2">
            <input
              type="datetime-local"
              value={reminderDate}
              onChange={e => setReminderDate(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
            />
            <input
              value={reminderNote}
              onChange={e => setReminderNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
            />
            <button onClick={setReminder} className="w-full py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors">
              Set Reminder
            </button>
          </div>
        )}
      </div>

      {/* Contact Notes */}
      {contact && (
        <div className="px-5 py-4 border-b border-gray-100">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Contact Notes</span>
          <textarea
            rows={3}
            defaultValue={contact.notes || ''}
            onBlur={async e => {
              await base44.entities.Contact.update(contact.id, { notes: e.target.value });
            }}
            placeholder="Add notes about this contact…"
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#5C6CF7] text-gray-700 placeholder:text-gray-400"
          />
        </div>
      )}

      {/* Contact History */}
      {contactHistory.length > 1 && (
        <div className="px-5 py-4">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">
            Past Conversations ({contactHistory.length})
          </span>
          <div className="space-y-2">
            {contactHistory.filter(c => c.id !== conversation.id).slice(0, 5).map(c => (
              <div key={c.id} className="text-xs bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <ChannelBadge channel={c.channel} />
                  <span className="text-gray-500 truncate flex-1">{c.subject}</span>
                </div>
                <div className="text-gray-400">{c.last_message_preview?.slice(0, 60) || 'No messages'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}