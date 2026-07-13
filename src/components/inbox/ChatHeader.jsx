import { ArrowLeft, UserPlus, Check, Phone, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import Avatar from '@/components/Avatar';
import { createContact, getContactByPhone } from '@/lib/channels';

const STATUS_COLOR = {
  open:       'bg-green-500',
  snoozed:    'bg-yellow-500',
  closed:     'bg-gray-500',
  unassigned: 'bg-orange-400',
};

/**
 * ChatHeader — lean top bar for the chat view.
 * The ⋮ button now opens ConversationDetail (a full-page panel)
 * instead of a dropdown. All management actions live there.
 */
export default function ChatHeader({
  conversation,
  currentUserId,
  onUpdate,
  onBack,
  onOpenContact,
  onOpenDetail,   // ← new: called when ⋮ is tapped
}) {
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved]   = useState(false);

  if (!conversation) return null;

  const canSaveContact = conversation.contact_phone && !conversation.contact_id;

  const handleSaveAsContact = async (e) => {
    e?.stopPropagation();
    if (!canSaveContact || savingContact) return;
    setSavingContact(true);
    try {
      const workspaceId = conversation.workspace_id || conversation.created_by;
      const existing = await getContactByPhone(workspaceId, conversation.contact_phone).catch(() => null);
      if (!existing) {
        await createContact(workspaceId, {
          full_name:   conversation.contact_name  || conversation.contact_phone,
          phone:       conversation.contact_phone,
          channel:     conversation.channel || 'whatsapp',
          lead_source: conversation.channel || 'whatsapp',
        });
      }
      setContactSaved(true);
      setTimeout(() => setContactSaved(false), 3000);
    } catch (e) {
      console.error('[ChatHeader] save contact:', e);
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 shrink-0 px-2 py-1.5"
      style={{ background: '#1F2C34', minHeight: 56, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* ← Back (mobile only) */}
      {onBack && (
        <button
          onClick={onBack}
          className="md:hidden p-1.5 text-[#AEBAC1] hover:text-white transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}

      {/* Avatar + contact info — tap to open contact panel */}
      <button
        onClick={onOpenContact}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
      >
        <div className="relative shrink-0">
          <Avatar
            name={conversation.contact_name || '?'}
            src={conversation.contact_avatar_url}
            size="md"
          />
          <span
            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#1F2C34] ${STATUS_COLOR[conversation.status] || 'bg-gray-500'}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-white truncate leading-tight" style={{ fontSize: 15 }}>
              {conversation.contact_name || conversation.contact_phone || '—'}
            </p>
            {canSaveContact && !contactSaved && (
              <button
                onClick={handleSaveAsContact}
                disabled={savingContact}
                className="flex items-center gap-0.5 text-[9px] font-bold text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20 px-1.5 py-0.5 rounded-full transition-colors shrink-0"
              >
                <UserPlus className="w-2.5 h-2.5" />Save
              </button>
            )}
            {contactSaved && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold text-[#25D366] bg-[#25D366]/10 px-1.5 py-0.5 rounded-full shrink-0">
                <Check className="w-2.5 h-2.5" />Saved
              </span>
            )}
          </div>
          {/* Subtitle: phone · status · assignee */}
          <div className="flex items-center gap-1 mt-0.5" style={{ color: '#8696A0', fontSize: 11 }}>
            <span className="truncate">{conversation.contact_phone || conversation.channel || '—'}</span>
            <span>·</span>
            <span className={
              conversation.status === 'open'    ? 'text-[#25D366]' :
              conversation.status === 'snoozed' ? 'text-yellow-400' : 'text-gray-500'
            }>
              {conversation.status || 'open'}
            </span>
            {conversation.assigned_to_name ? (
              <>
                <span>·</span>
                <span className="text-[#25D366]/80 truncate">
                  {conversation.assigned_to === currentUserId
                    ? 'You'
                    : conversation.assigned_to_name.split(' ')[0]}
                </span>
              </>
            ) : (
              <><span>·</span><span className="text-orange-400">Unassigned</span></>
            )}
          </div>
        </div>
      </button>

      {/* Right actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Click-to-call (WhatsApp / SMS) */}
        {conversation.contact_phone &&
          ['whatsapp', 'sms', 'phone'].includes(conversation.channel) && (
          <a
            href={`tel:${conversation.contact_phone.replace(/\s/g, '')}`}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-[#AEBAC1] hover:text-white"
            title={`Call ${conversation.contact_phone}`}
          >
            <Phone className="w-5 h-5" />
          </a>
        )}

        {/* ⋮  — opens ConversationDetail page */}
        <button
          onClick={onOpenDetail}
          className="p-2 rounded-full text-[#AEBAC1] hover:text-white hover:bg-white/10 transition-colors"
          title="Conversation options"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
