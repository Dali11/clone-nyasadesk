import { useState } from 'react';
import { ChevronDown, UserCheck, AlertCircle } from 'lucide-react';
import ChannelBadge from './ChannelBadge';
import PriorityBadge from './PriorityBadge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['open', 'snoozed', 'closed'];

export default function ConversationHeader({ conversation, users, onUpdate }) {
  const assign = (userId, userName) => {
    if (!conversation) return;
    if (onUpdate) onUpdate({ ...conversation, assigned_to: userId, assigned_to_name: userName, status: 'open' });
  };

  const updateStatus = (status) => {
    if (!conversation) return;
    if (onUpdate) onUpdate({ ...conversation, status });
  };

  const updatePriority = (priority) => {
    if (!conversation) return;
    if (onUpdate) onUpdate({ ...conversation, priority });
  };

  if (!conversation) return null;

  return (
    <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3 shrink-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 text-sm truncate">{conversation.subject}</span>
          <ChannelBadge channel={conversation.channel} showLabel />
          <PriorityBadge priority={conversation.priority} />
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {conversation.contact_name} · {conversation.assigned_to_name
            ? <span className="text-[#5C6CF7]">Assigned to {conversation.assigned_to_name}</span>
            : <span className="text-amber-500">Unassigned</span>
          }
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Priority */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 transition-colors">
              <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
              Priority
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            {PRIORITIES.map(p => (
              <DropdownMenuItem key={p} onClick={() => updatePriority(p)} className="text-xs capitalize">
                {p}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Assign */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 transition-colors">
              <UserCheck className="w-3.5 h-3.5 text-gray-400" />
              Assign
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {users.map(u => (
              <DropdownMenuItem key={u.id} onClick={() => assign(u.id, u.full_name)} className="text-xs">
                <span className="w-5 h-5 rounded-full bg-[#5C6CF7] text-white text-[10px] flex items-center justify-center mr-2 shrink-0">
                  {u.full_name?.[0] || '?'}
                </span>
                {u.full_name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#5C6CF7] text-white hover:bg-[#4A5CE6] transition-colors">
              <span className="capitalize">{conversation.status || 'open'}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            {STATUSES.map(s => (
              <DropdownMenuItem key={s} onClick={() => updateStatus(s)} className="text-xs capitalize">
                {s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}