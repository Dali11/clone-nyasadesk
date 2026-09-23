import { useState } from 'react';
import {
  ArrowLeft, Check, Bot, Pin, PinOff, Trash2,
  ChevronRight, Phone, MessageCircle, Clock, CheckCircle2,
  UserPlus, Mail, Building2, Tag, Calendar,
} from 'lucide-react';
import Avatar from '@/components/Avatar';

const STATUSES = [
  { key: 'open',    label: 'Open',    color: '#25D366' },
  { key: 'snoozed', label: 'Snoozed', color: '#F59E0B' },
  { key: 'closed',  label: 'Closed',  color: '#6B7280' },
];
const PRIORITIES = [
  { key: 'low',    label: 'Low',    color: '#6B7280' },
  { key: 'normal', label: 'Normal', color: '#25D366' },
  { key: 'high',   label: 'High',   color: '#F59E0B' },
  { key: 'urgent', label: 'Urgent', color: '#EF4444' },
];

/**
 * ConversationDetail — full-page contact card.
 * Opened by:
 *   • Tapping the contact avatar/name in ChatHeader
 *   • Tapping ⋮ in ChatHeader
 */
export default function ConversationDetail({
  conversation,
  users = [],
  currentUserId,
  canAssign = false,
  canPin    = false,
  isPinnedForMe = false,
  onClose,
  onUpdate,
  onPin,
  onUnpin,
  onDelete,
  onBackToChat,   // called when "Message" button is tapped — closes detail and shows chat
}) {

  if (!conversation) return null;

  const curStatus   = conversation.status   || 'open';
  const curPriority = conversation.priority || 'normal';

  const assign         = (uid, name) => onUpdate({ id: conversation.id, assigned_to: uid, assigned_to_name: name, status: 'open' });
  const resumeAI       = ()          => onUpdate({ id: conversation.id, assigned_to: null, assigned_to_name: null });
  const updateStatus   = (s)         => onUpdate({ id: conversation.id, status: s });
  const updatePriority = (p)         => onUpdate({ id: conversation.id, priority: p });

  const phone   = conversation.contact_phone || '';
  const isWA    = ['whatsapp', 'sms', 'phone'].includes(conversation.channel);
  const name    = conversation.contact_name  || phone || '—';
  const company = conversation.contact_company || '';
  const email   = conversation.contact_email  || '';

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
        style={{ background: '#0B141A', animation: 'slideInFromRight 0.22s cubic-bezier(0.32,0.72,0,1) both' }}
      >
        <style>{`
          @keyframes slideInFromRight {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* ── Top bar ───────────────────────────────────────────── */}
        <div
          className="flex items-center gap-2 px-3 py-3 shrink-0"
          style={{ background: '#1F2C34', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#AEBAC1] hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <p className="flex-1 font-semibold text-white text-base">Contact info</p>
        </div>

        {/* ── Hero: big avatar + name ────────────────────────────── */}
        <div
          className="flex flex-col items-center gap-3 py-8 px-4 shrink-0"
          style={{ background: '#1F2C34', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Avatar name={name} src={conversation.contact_avatar_url} size="xl" />
          <div className="text-center">
            <p className="text-white font-bold text-xl leading-tight">{name}</p>
            {phone && <p className="text-[#8696A0] text-sm mt-0.5">{phone}</p>}
            {company && <p className="text-[#25D366]/80 text-xs mt-0.5">{company}</p>}
          </div>

          {/* Quick-action buttons: Message · Call */}
          <div className="flex gap-6 mt-2">
            {/* Message — goes back to chat */}
            <button
              onClick={() => { onClose?.(); onBackToChat?.(); }}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'rgba(37,211,102,0.15)' }}
              >
                <MessageCircle className="w-5 h-5" style={{ color: '#25D366' }} />
              </div>
              <span className="text-[11px] font-medium" style={{ color: '#8696A0' }}>Message</span>
            </button>

            {/* Call — only for WhatsApp / SMS / phone channels */}
            {phone && isWA && (
              <a
                href={`tel:${phone.replace(/\s/g, '')}`}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: 'rgba(37,211,102,0.15)' }}
                >
                  <Phone className="w-5 h-5" style={{ color: '#25D366' }} />
                </div>
                <span className="text-[11px] font-medium" style={{ color: '#8696A0' }}>Call</span>
              </a>
            )}

            {/* Email — if contact has an email */}
            {email && (
              <a
                href={`mailto:${email}`}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: 'rgba(37,211,102,0.15)' }}
                >
                  <Mail className="w-5 h-5" style={{ color: '#25D366' }} />
                </div>
                <span className="text-[11px] font-medium" style={{ color: '#8696A0' }}>Email</span>
              </a>
            )}
          </div>
        </div>

        {/* ── Body sections ─────────────────────────────────────── */}
        <div className="flex flex-col gap-5 px-4 py-5 pb-12">

          {/* CONTACT DETAILS */}
          {(phone || email || company || conversation.contact_ad_attribution?.headline) && (
            <Section title="Contact details">
              <div className="flex flex-col gap-1">
                {phone && (
                  <DetailRow icon={<Phone className="w-4 h-4" />} label={phone} sublabel="Mobile" />
                )}
                {email && (
                  <DetailRow icon={<Mail className="w-4 h-4" />} label={email} sublabel="Email" />
                )}
                {company && (
                  <DetailRow icon={<Building2 className="w-4 h-4" />} label={company} sublabel="Company" />
                )}
                {conversation.contact_ad_attribution?.headline && (
                  <DetailRow
                    icon={<Tag className="w-4 h-4" />}
                    label={conversation.contact_ad_attribution.headline}
                    sublabel="Ad source"
                  />
                )}
              </div>
            </Section>
          )}

          {/* CONVERSATION: status + priority */}
          <Section title="Conversation">
            {/* Status */}
            <p className="text-[10px] text-[#8696A0] uppercase tracking-wider font-semibold mb-1.5">Status</p>
            <div className="flex flex-col gap-1 mb-3">
              {STATUSES.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => updateStatus(key)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                  style={{
                    background: curStatus === key ? 'rgba(37,211,102,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${curStatus === key ? 'rgba(37,211,102,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="flex-1 text-left text-sm text-white font-medium">{label}</span>
                  {curStatus === key && <Check className="w-4 h-4 shrink-0" style={{ color: '#25D366' }} />}
                </button>
              ))}
            </div>

            {/* Priority */}
            <p className="text-[10px] text-[#8696A0] uppercase tracking-wider font-semibold mb-1.5">Priority</p>
            <div className="grid grid-cols-2 gap-2">
              {PRIORITIES.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => updatePriority(key)}
                  className="flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors"
                  style={{
                    background: curPriority === key ? `${color}18` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${curPriority === key ? color + '55' : 'rgba(255,255,255,0.06)'}`,
                    color: curPriority === key ? color : '#8696A0',
                  }}
                >
                  {label}
                  {curPriority === key && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          </Section>

          {/* ASSIGN — admin / sales_manager only */}
          {canAssign && (
            <Section title="Assign to">
              <div className="flex flex-col gap-1">
                {users.map(u => {
                  const active = conversation.assigned_to === u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => assign(u.id, u.full_name)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                      style={{
                        background: active ? 'rgba(37,211,102,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${active ? 'rgba(37,211,102,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <Avatar name={u.full_name} size="sm" />
                      <span className="flex-1 text-left text-sm text-white">{u.full_name}</span>
                      {active && <Check className="w-4 h-4 shrink-0" style={{ color: '#25D366' }} />}
                    </button>
                  );
                })}
                {conversation.assigned_to && (
                  <button
                    onClick={resumeAI}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl mt-1 transition-colors"
                    style={{ background: 'rgba(37,211,102,0.05)', border: '1px solid rgba(37,211,102,0.2)' }}
                  >
                    <Bot className="w-4 h-4 shrink-0" style={{ color: '#25D366' }} />
                    <span className="text-sm font-medium" style={{ color: '#25D366' }}>Resume AI automation</span>
                  </button>
                )}
              </div>
            </Section>
          )}

          {/* PIN FOR AGENT — admin only */}
          {canPin && (
            <Section title="Pin for agent">
              <div className="flex flex-col gap-1">
                {users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { onPin?.(u.id); onClose?.(); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <Avatar name={u.full_name} size="sm" />
                    <span className="flex-1 text-left text-sm text-white">{u.full_name}</span>
                    <Pin className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* TAGS */}
          {conversation.tags?.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-2">
                {conversation.tags.map(t => (
                  <span key={t} className="text-xs px-3 py-1 rounded-full font-medium"
                    style={{ background: 'rgba(37,211,102,0.12)', color: '#25D366' }}>{t}</span>
                ))}
              </div>
            </Section>
          )}

          {/* ACTIONS */}
          <Section title="Actions">
            <div className="flex flex-col gap-2">
              {isPinnedForMe && (
                <ActionRow
                  icon={<PinOff className="w-4 h-4" />}
                  label="Unpin from my inbox"
                  color="#F59E0B"
                  onClick={() => { onUnpin?.(); onClose?.(); }}
                />
              )}
              {onDelete && (
                <ActionRow
                  icon={<Trash2 className="w-4 h-4" />}
                  label="Delete conversation"
                  color="#EF4444"
                  onClick={() => { onDelete?.(); onClose?.(); }}
                />
              )}
            </div>
          </Section>

          {/* META INFO */}
          <Section title="Info">
            <div className="flex flex-col gap-2">
              <InfoRow label="Channel"  value={conversation.channel || '—'} />
              <InfoRow label="Created"  value={conversation.created_at ? new Date(conversation.created_at).toLocaleString() : '—'} />
              {conversation.contact_ad_attribution?.headline && (
                <InfoRow label="Ad source" value={conversation.contact_ad_attribution.headline} />
              )}
            </div>
          </Section>

        </div>
      </div>

    </>
  );
}

/* ── helpers ──────────────────────────────────────────────── */
function Section({ title, children }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#8696A0' }}>{title}</p>
      {children}
    </div>
  );
}

function ActionRow({ icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full transition-colors text-left"
      style={{ background: `${color}10`, border: `1px solid ${color}30`, color }}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
      <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
    </button>
  );
}

function DetailRow({ icon, label, sublabel }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ color: '#25D366' }} className="shrink-0">{icon}</span>
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-white truncate">{label}</span>
        {sublabel && <span className="text-[10px]" style={{ color: '#8696A0' }}>{sublabel}</span>}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#8696A0] text-xs w-20 shrink-0">{label}</span>
      <span className="text-white text-xs flex-1">{value}</span>
    </div>
  );
}
