import { ChevronDown, MoreVertical, ArrowLeft } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['open', 'snoozed', 'closed'];
const STATUS_COLOR = { open: 'bg-green-500', snoozed: 'bg-yellow-500', closed: 'bg-gray-500', unassigned: 'bg-orange-400' };

export default function ChatHeader({ conversation, users, onUpdate, onBack }) {
  if (!conversation) return null;

  const assign = (userId, userName) => onUpdate({ ...conversation, assigned_to: userId, assigned_to_name: userName, status: 'open' });
  const updateStatus = (status) => onUpdate({ ...conversation, status });
  const updatePriority = (priority) => onUpdate({ ...conversation, priority });

  return (
    <div className="bg-[#202C33] border-b border-white/10 px-4 py-2.5 flex items-center gap-3 shrink-0">
      {/* Back button: only visible on mobile */}
      {onBack && (
        <button onClick={onBack} className="md:hidden p-1.5 -ml-1 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <Avatar name={conversation.contact_name || '?'} size="md" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{conversation.contact_name}</p>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[conversation.status] || 'bg-gray-500'}`} />
          <span className="capitalize">{conversation.status}</span>
          {conversation.assigned_to_name && <><span>·</span><span className="text-[#25D366]">{conversation.assigned_to_name}</span></>}
          {!conversation.assigned_to && <span className="text-orange-400">Unassigned</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-semibold hover:bg-[#20BA5A] transition-colors">
              <span className="capitalize">{conversation.status}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32 bg-[#233138] border-white/10 text-gray-200">
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
          <DropdownMenuContent align="end" className="w-44 bg-[#233138] border-white/10 text-gray-200">
            <div className="px-2 py-1.5 text-[10px] text-gray-500 font-semibold uppercase">Assign to</div>
            {users.map(u => (
              <DropdownMenuItem key={u.id} onClick={() => assign(u.id, u.full_name)} className="text-xs hover:bg-white/10 focus:bg-white/10 cursor-pointer gap-2">
                <Avatar name={u.full_name} size="xs" />{u.full_name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="bg-white/10" />
            <div className="px-2 py-1.5 text-[10px] text-gray-500 font-semibold uppercase">Priority</div>
            {PRIORITIES.map(p => (
              <DropdownMenuItem key={p} onClick={() => updatePriority(p)} className="text-xs capitalize hover:bg-white/10 focus:bg-white/10 cursor-pointer">{p}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}