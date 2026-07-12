import { MoreVertical, ArrowLeft, Trash2, Bot, TrendingUp, Pin, PinOff, UserPlus, Check, Phone } from 'lucide-react';
import { useState } from 'react';
import { RecordSaleModal } from '@/pages/Sales';
import Avatar from '@/components/Avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { createContact, getContactByPhone } from '@/lib/channels';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['open', 'snoozed', 'closed'];
const STATUS_COLOR = { open: 'bg-green-500', snoozed: 'bg-yellow-500', closed: 'bg-gray-500', unassigned: 'bg-orange-400' };

export default function ChatHeader({ conversation, users = [], currentUserId, currentUserRole, onUpdate, onBack, onOpenContact, onDelete, canDelete, onPin, onUnpin, isPinnedForMe, canPin, canAssign = false }) {
  if (!conversation) return null;

  const assign = (userId, userName) => onUpdate({
    id: conversation.id,
    assigned_to: userId,
    assigned_to_name: userName,
    status: 'open',
  });
  const updateStatus = (status) => onUpdate({ id: conversation.id, status });
  const updatePriority = (priority) => onUpdate({ id: conversation.id, priority });
  const resumeAutomation = () => onUpdate({ id: conversation.id, assigned_to: null, assigned_to_name: null });
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);

  // "Save as Contact" — only show when there's a phone number and no contact_id yet
  const canSaveContact = conversation.contact_phone && !conversation.contact_id;

  const handleSaveAsContact = async () => {
    if (!canSaveContact || savingContact) return;
    setSavingContact(true);
    try {
      const workspaceId = conversation.workspace_id || conversation.created_by;
      // Check if contact already exists with this phone
      const existing = await getContactByPhone(workspaceId, conversation.contact_phone).catch(() => null);
      if (existing) {
        setContactSaved(true);
        return;
      }
      await createContact(workspaceId, {
        full_name: conversation.contact_name || conversation.contact_phone,
        phone: conversation.contact_phone,
        channel: conversation.channel || 'whatsapp',
        lead_source: conversation.channel || 'whatsapp',
      });
      setContactSaved(true);
      setTimeout(() => setContactSaved(false), 3000);
    } catch (e) {
      console.error('[ChatHeader] save contact:', e);
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <>
    <div className="flex items-center gap-1.5 shrink-0 px-2 py-1.5" style={{background:"#1F2C34",minHeight:56,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
      {/* Back arrow */}
      {onBack && (
        <button onClick={onBack} className="md:hidden p-1.5 text-[#AEBAC1] hover:text-white transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}

      {/* Avatar + contact info — tappable to open contact panel */}
      <button onClick={onOpenContact} className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
        <div className="relative shrink-0">
          <Avatar name={conversation.contact_name || '?'} src={conversation.contact_avatar_url} size="md" />
          {/* Status dot on avatar */}
          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#1F2C34] ${STATUS_COLOR[conversation.status] || 'bg-gray-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-white truncate leading-tight" style={{fontSize:15}}>
              {conversation.contact_name || conversation.contact_phone || '—'}
            </p>
            {canSaveContact && !contactSaved && (
              <button
                onClick={e => { e.stopPropagation(); handleSaveAsContact(); }}
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
          {/* Subtitle: phone · status · agent */}
          <div className="flex items-center gap-1 mt-0.5" style={{color:"#8696A0",fontSize:11}}>
            <span className="truncate">{conversation.contact_phone || conversation.channel || '—'}</span>
            <span>·</span>
            <span className={
              conversation.status === 'open' ? 'text-[#25D366]' :
              conversation.status === 'snoozed' ? 'text-yellow-400' : 'text-gray-500'
            }>{conversation.status || 'open'}</span>
            {conversation.assigned_to_name && (
              <>
                <span>·</span>
                <span className="text-[#25D366]/80 truncate">
                  {conversation.assigned_to === currentUserId ? 'You' : conversation.assigned_to_name.split(' ')[0]}
                </span>
              </>
            )}
            {!conversation.assigned_to_name && (
              <><span>·</span><span className="text-orange-400">Unassigned</span></>
            )}
          </div>
        </div>
      </button>

      {/* Right actions — Phone + ⋮ only */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Phone call */}
        {conversation.contact_phone && ['whatsapp','sms','phone'].includes(conversation.channel) && (
          <a
            href={`tel:${conversation.contact_phone.replace(/\s/g, '')}`}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-[#AEBAC1] hover:text-white"
            title={`Call ${conversation.contact_phone}`}
          >
            <Phone className="w-5 h-5" />
          </a>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 rounded-full text-[#AEBAC1] hover:text-white hover:bg-white/10 transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-[var(--nyasa-surface-3)] border-[var(--nyasa-border)] text-gray-200">
            {/* Status change */}
            <div className="px-2 py-1.5 text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Status</div>
            {STATUSES.map(s => (
              <DropdownMenuItem key={s} onClick={() => updateStatus(s)}
                className={`text-xs capitalize hover:bg-white/10 focus:bg-white/10 cursor-pointer gap-2 ${conversation.status === s ? 'text-[#25D366] font-semibold' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLOR[s]}`} />{s}
                {conversation.status === s && <Check className="w-3 h-3 ml-auto" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="bg-white/10" />
            {/* Save as Contact option in dropdown too */}
            {canSaveContact && (
              <>
                <DropdownMenuItem onClick={handleSaveAsContact} className="text-xs hover:bg-white/10 focus:bg-white/10 cursor-pointer gap-2 text-[#25D366]">
                  <UserPlus className="w-3.5 h-3.5" />{contactSaved ? 'Contact saved ✓' : 'Save as contact'}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
              </>
            )}
            {canAssign && (<>
              <div className="px-2 py-1.5 text-[10px] text-gray-500 font-semibold uppercase">Assign to</div>
              {(users || []).map(u => (
                <DropdownMenuItem key={u.id} onClick={() => assign(u.id, u.full_name)} className="text-xs hover:bg-white/10 focus:bg-white/10 cursor-pointer gap-2">
                  <Avatar name={u.full_name} size="xs" />{u.full_name}
                </DropdownMenuItem>
              ))}
              {conversation.assigned_to && (
                <DropdownMenuItem onClick={resumeAutomation} className="text-xs hover:bg-white/10 focus:bg-white/10 cursor-pointer gap-2 text-[#25D366]">
                  <Bot className="w-3.5 h-3.5" />Resume AI automation
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-white/10" />
            </>)}
            <DropdownMenuItem onClick={() => setShowSaleModal(true)} className="text-xs hover:bg-white/10 focus:bg-white/10 cursor-pointer gap-2 text-[#25D366]">
              <TrendingUp className="w-3.5 h-3.5" />Mark as sale
            </DropdownMenuItem>
            {(canPin || isPinnedForMe) && (
              <>
                <DropdownMenuSeparator className="bg-white/10" />
                {canPin && (
                  <div className="relative">
                    <div className="px-2 py-1.5 text-[10px] text-gray-500 font-semibold uppercase flex items-center gap-1.5">
                      <Pin className="w-3 h-3" />Pin for agent
                    </div>
                    {(users || []).map(u => (
                      <DropdownMenuItem key={u.id} onClick={() => onPin?.(u.id)} className="text-xs hover:bg-white/10 focus:bg-white/10 cursor-pointer gap-2 pl-4">
                        <Avatar name={u.full_name} size="xs" />{u.full_name}
                      </DropdownMenuItem>
                    ))}
                  </div>
                )}
                {isPinnedForMe && (
                  <DropdownMenuItem onClick={() => onUnpin?.()} className="text-xs hover:bg-white/10 focus:bg-white/10 cursor-pointer gap-2 text-orange-400">
                    <PinOff className="w-3.5 h-3.5" />Unpin for me
                  </DropdownMenuItem>
                )}
              </>
            )}
            <DropdownMenuSeparator className="bg-white/10" />
            <div className="px-2 py-1.5 text-[10px] text-gray-500 font-semibold uppercase">Priority</div>
            {PRIORITIES.map(p => (
              <DropdownMenuItem key={p} onClick={() => updatePriority(p)} className="text-xs capitalize hover:bg-white/10 focus:bg-white/10 cursor-pointer">{p}</DropdownMenuItem>
            ))}
            {canDelete && onDelete && (
              <>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  onClick={() => {
                    if (window.confirm('Delete this conversation? This removes it and all its messages permanently — this cannot be undone.')) {
                      onDelete(conversation.id);
                    }
                  }}
                  className="text-xs hover:bg-red-500/10 focus:bg-red-500/10 cursor-pointer gap-2 text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />Delete conversation
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    {showSaleModal && (
      <RecordSaleModal
        workspaceId={conversation.workspace_id || conversation.created_by}
        currency="MWK"
        prefillConversation={{ id: conversation.id, contact_name: conversation.contact_name, contact_phone: conversation.contact_phone }}
        onClose={() => setShowSaleModal(false)}
        onSaved={() => setShowSaleModal(false)}
      />
    )}
    </>
  );
}
