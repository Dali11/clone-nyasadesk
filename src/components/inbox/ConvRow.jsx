import { formatDistanceToNow } from 'date-fns';
import Avatar from '@/components/Avatar';
import SLABadge from '@/components/SLABadge';
import { Bell, Mail, Globe, Send, Megaphone, Pin, Check } from 'lucide-react';

function WhatsAppIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
}
function MessengerIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.664V24l4.088-2.242c1.092.301 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111C24 4.974 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.131 3.26L19.752 8l-6.561 6.963z"/></svg>;
}
function InstagramIcon({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.163 6.163 0 100 12.326 6.163 6.163 0 000-12.326zm0 10.162a4 4 0 110-8 4 4 0 010 8zm6.406-10.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>;
}

const CHANNEL_CONFIG = {
  whatsapp:  { Icon: WhatsAppIcon,  bg: 'bg-green-500',  label: 'WhatsApp'  },
  messenger: { Icon: MessengerIcon, bg: 'bg-blue-500',   label: 'Messenger' },
  instagram: { Icon: InstagramIcon, bg: 'bg-pink-500',   label: 'Instagram' },
  telegram:  { Icon: Send,          bg: 'bg-sky-500',    label: 'Telegram'  },
  email:     { Icon: Mail,          bg: 'bg-indigo-500', label: 'Email'     },
  website:   { Icon: Globe,         bg: 'bg-cyan-500',   label: 'Website'   },
};

function timeAgo(d) {
  if (!d) return '';
  try { return formatDistanceToNow(new Date(d), { addSuffix: false }); } catch { return ''; }
}

export default function ConvRow({ conv, active, onClick, pinned = false, selectable = false, selected = false, onSelect }) {
  const cfg = CHANNEL_CONFIG[conv.channel] || CHANNEL_CONFIG.email;
  const { Icon } = cfg;

  const handleClick = (e) => {
    if (selectable) {
      e.stopPropagation();
      onSelect?.(conv.id);
    } else {
      onClick(conv);
    }
  };

  const handleLongPress = (() => {
    let timer = null;
    return {
      onPointerDown: () => { timer = setTimeout(() => { onSelect?.(conv.id); }, 500); },
      onPointerUp:   () => { clearTimeout(timer); },
      onPointerLeave:() => { clearTimeout(timer); },
    };
  })();

  return (
    <div
      onClick={handleClick}
      {...(!selectable ? handleLongPress : {})}
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-[var(--nyasa-border)] transition-colors select-none
        ${active && !selectable ? 'bg-white/10' : ''}
        ${selected ? 'bg-[#25D366]/10' : !active ? 'hover:bg-white/5' : ''}`}
    >
      {/* Checkbox / Avatar */}
      <div className="relative shrink-0 mt-0.5">
        {selectable ? (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all
            ${selected ? 'bg-[#25D366] border-[#25D366]' : 'border-[var(--nyasa-border)] bg-[var(--nyasa-surface-3)]'}`}>
            {selected
              ? <Check className="w-5 h-5 text-white" />
              : <span className="text-sm font-bold text-gray-500">{(conv.contact_name || '?')[0]}</span>
            }
          </div>
        ) : (
          <>
            <Avatar name={conv.contact_name || '?'} src={conv.contact_avatar_url} size="md" />
            <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${cfg.bg} flex items-center justify-center`}>
              <Icon className="w-2.5 h-2.5 text-white" />
            </span>
          </>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-sm truncate ${conv.unread ? 'font-bold text-white' : 'font-normal text-gray-300'}`}>
            {conv.contact_name}
          </span>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {conv.is_reminder_active && <Bell className="w-3 h-3 text-yellow-400" />}
            <span className={`text-[10px] ${conv.unread ? 'text-[#25D366] font-semibold' : 'text-gray-600'}`}>
              {timeAgo(conv.last_message_at)}
            </span>
          </div>
        </div>
        {conv.subject && conv.subject !== conv.contact_name && (
          <div className={`text-xs truncate mb-1 ${conv.unread ? 'text-gray-200 font-medium' : 'text-gray-600'}`}>
            {conv.subject}
          </div>
        )}
        <div className={`text-xs truncate mb-1 ${conv.unread ? 'text-gray-300 font-medium' : 'text-gray-700'}`}>
          {conv.last_message_preview || 'No messages yet'}
        </div>
        <div className="flex items-center justify-between">
          <SLABadge slaBreachAt={conv.sla_breach_at} />
          <div className="flex items-center gap-1.5 ml-auto">
            {pinned && <Pin className="w-3 h-3 text-[#25D366] fill-[#25D366]/20 shrink-0" />}
            {!conv.assigned_to && <span className="text-[9px] text-yellow-500 font-semibold">Unassigned</span>}
            {conv.unread_count > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#25D366] text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {conv.unread_count > 99 ? '99+' : conv.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
