import { ChevronDown, MoreVertical, ArrowLeft, Trash2, Bot, TrendingUp, Pin, PinOff } from 'lucide-react';
import { useState } from 'react';
import { RecordSaleModal } from '@/pages/Sales';
import Avatar from '@/components/Avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['open', 'snoozed', 'closed'];
const STATUS_COLOR = { open: 'bg-green-500', snoozed: 'bg-yellow-500', closed: 'bg-gray-500', unassigned: 'bg-orange-400' };

export default function ChatHeader({ conversation, users = [], currentUserId, currentUserRole, onUpdate, onBack, onOpenContact, onDelete, canDelete, onPin, onUnpin, isPinnedForMe, canPin }) {
  if (!conversation) return null;

  const assign = (userId, userName) => onUpdate({
    id: conversation.id,
    assigned_to: userId,
    assigned_to_name: userName,
    status: 'open',
  });
  const updateStatus = (status) => onUpdate({ id: conversation.id, status });
  const updatePriority = (priority) => onUpdate({ id: conversation.id, priority });
  // Hands the conversation back to the AI: clearing assigned_to is exactly
  // the signal aiAutoReply.js checks (assigned_to IS NULL) before it'll
  // auto-reply again on the next inbound message. No other state to touch.
  const resumeAutomation = () => onUpdate({ id: conversation.id, assigned_to: null, assigned_to_name: null });
  const [showSaleModal, setShowSaleModal] = useState(false);

  return (
    <>
    <div className="bg-[var(--nyasa-surface-2)] border-b border-[var(--nyasa-border)] px-4 py-2.5 flex items-center gap-3 shrink-0">
      {/* Back button: only visible on mobile */}
      {onBack && (
        <button onClick={onBack} className="md:hidden p-1.5 -ml-1 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <button onClick={onOpenContact} className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
        <Avatar name={conversation.contact_name || '?'} src={conversation.contact_avatar_url} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{conversation.contact_name}</p>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[conversation.status] || 'bg-gray-500'}`} />
            <span className="capitalize">{conversation.status}</span>
            {conversation.assigned_to_name
              ? <><span>·</span><span className="text-[#25D366]/80 text-[10px]">
                  {conversation.assigned_to === currentUserId
                    ? 'Assigned to you'
                    : `Agent: ${conversation.assigned_to_name.split(' ')[0]}`}
                </span></>
              : <><span>·</span><span className="text-orange-400">Unassigned</span></>
            }
          </div>
        </div>
      </button>

      <div className="flex items-center gap-2 shrink-0">
        {/* Assignment indicator — shown to admins/managers when chat belongs to another agent */}
        {conversation.assigned_to && conversation.assigned_to_name && (() => {
          const isMyChat = conversation.assigned_to === currentUserId;
          const isElevated = currentUserRole === 'admin' || currentUserRole === 'sales_manager';
          // Agents see nothing (they know it's theirs). Admins/managers see a pill.
          if (isMyChat) return null;
          if (!isElevated) return null;
          const firstName = conversation.assigned_to_name.split(' ')[0];
          const initials = conversation.assigned_to_name
            .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          return (
            <div
              title={`Assigned to ${conversation.assigned_to_name} — you're managing this chat`}
              className="hidden sm:flex items-center gap-1 bg-[var(--nyasa-surface-3)] border border-[var(--nyasa-border)] rounded-full pl-0.5 pr-2 py-0.5 shrink-0"
            >
              {/* Mini avatar */}
              <div className="w-5 h-5 rounded-full bg-[#25D366]/20 flex items-center justify-center text-[9px] font-bold text-[#25D366] shrink-0">
                {initials}
              </div>
              <span className="text-[10px] font-medium text-gray-400 leading-none">
                {firstName}
              </span>
            </div>
          );
        })()}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-semibold hover:bg-[#20BA5A] transition-colors">
              <span className="capitalize">{conversation.status}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32 bg-[var(--nyasa-surface-3)] border-[var(--nyasa-border)] text-gray-200">
            {STATUSES.map(s => (
              <DropdownMenuItem key={s} onClick={() => updateStatus(s)} className="text-xs capitalize hover:bg-white/10 focus:bg-white/10 cursor-pointer">{s}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 rounded-lg text-gray-500 hover:bg-white/10 transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 bg-[var(--nyasa-surface-3)] border-[var(--nyasa-border)] text-gray-200">
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