import { useState } from 'react';
import {
  ArrowLeft, Check, Bot, TrendingUp, Pin, PinOff, Trash2,
  UserPlus, ChevronRight, User, Tag, Building2, Phone, Mail,
  AlertCircle, Clock, CheckCircle2, Zap, MoreHorizontal
} from 'lucide-react';
import Avatar from '@/components/Avatar';
import { RecordSaleModal } from '@/pages/Sales';

const STATUSES = [
  { key: 'open',    label: 'Open',    icon: CheckCircle2, color: '#25D366' },
  { key: 'snoozed', label: 'Snoozed', icon: Clock,        color: '#F59E0B' },
  { key: 'closed',  label: 'Closed',  icon: CheckCircle2, color: '#6B7280' },
];
const PRIORITIES = [
  { key: 'low',    label: 'Low',    color: '#6B7280' },
  { key: 'normal', label: 'Normal', color: '#25D366' },
  { key: 'high',   label: 'High',   color: '#F59E0B' },
  { key: 'urgent', label: 'Urgent', color: '#EF4444' },
];

/**
 * ConversationDetail — full-page slide-over panel
 * Props:
 *   conversation  — the active conversation object
 *   users         — team members list [{id, full_name}]
 *   currentUserId
 *   canAssign     — true for admin / sales_manager only
 *   canPin
 *   isPinnedForMe
 *   onClose       — () => void  (navigate back)
 *   onUpdate      — (patch) => void
 *   onPin         — (agentId) => void
 *   onUnpin       — () => void
 *   onDelete      — () => void
 */
export default function ConversationDetail({
  conversation,
  users = [],
  currentUserId,
  canAssign = false,
  canPin = false,
  isPinnedForMe = false,
  onClose,
  onUpdate,
  onPin,
  onUnpin,
  onDelete,
}) {
  const [showSaleModal, setShowSaleModal] = useState(false);

  if (!conversation) return null;

  const assign = (userId, userName) =>
    onUpdate({ id: conversation.id, assigned_to: userId, assigned_to_name: userName, status: 'open' });

  const resumeAutomation = () =>
    onUpdate({ id: conversation.id, assigned_to: null, assigned_to_name: null });

  const updateStatus   = (status)   => onUpdate({ id: conversation.id, status });
  const updatePriority = (priority) => onUpdate({ id: conversation.id, priority });

  const curStatus   = conversation.status   || 'open';
  const curPriority = conversation.priority || 'normal';

  return (
    <>
      {/* Full-screen slide-over — fixed so it covers the chat, sits above everything */}
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

        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-3 py-3 shrink-0"
          style={{ background: '#1F2C34', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} className="p-1.5 rounded-full text-[#AEBAC1] hover:text-white hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Avatar name={conversation.contact_name || '?'} src={conversation.contact_avatar_url} size="md" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white truncate" style={{ fontSize: 15 }}>
              {conversation.contact_name || conversation.contact_phone || '—'}
            </p>
            <p className="text-[11px] truncate" style={{ color: '#8696A0' }}>
              {conversation.contact_phone || conversation.channel || '—'}
            </p>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="flex-1 px-4 py-4 flex flex-col gap-5">

          {/* STATUS */}
          <Section title="Status">
            <div className="flex flex-col gap-1">
              {STATUSES.map(({ key, label, icon: Icon, color }) => (
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
          </Section>

          {/* PRIORITY */}
          <Section title="Priority">
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
                  const isAssigned = conversation.assigned_to === u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => assign(u.id, u.full_name)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                      style={{
                        background: isAssigned ? 'rgba(37,211,102,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isAssigned ? 'rgba(37,211,102,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <Avatar name={u.full_name} size="sm" />
                      <span className="flex-1 text-left text-sm text-white">{u.full_name}</span>
                      {isAssigned && <Check className="w-4 h-4 shrink-0" style={{ color: '#25D366' }} />}
                    </button>
                  );
                })}
                {conversation.assigned_to && (
                  <button
                    onClick={resumeAutomation}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors mt-1"
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
                    onClick={() => onPin?.(u.id)}
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

          {/* ACTIONS */}
          <Section title="Actions">
            <div className="flex flex-col gap-2">
              <ActionRow
                icon={<TrendingUp className="w-4 h-4" />}
                label="Mark as sale"
                color="#25D366"
                onClick={() => setShowSaleModal(true)}
              />
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

          {/* CONVERSATION INFO */}
          <Section title="Conversation info">
            <div className="flex flex-col gap-2 text-sm">
              <InfoRow label="Channel" value={conversation.channel || '—'} />
              <InfoRow label="Created" value={conversation.created_at ? new Date(conversation.created_at).toLocaleString() : '—'} />
              {conversation.contact_company && <InfoRow label="Company" value={conversation.contact_company} />}
              {conversation.tags?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-[#8696A0] w-20 shrink-0">Tags</span>
                  <div className="flex flex-wrap gap-1">
                    {conversation.tags.map(t => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(37,211,102,0.12)', color: '#25D366' }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

        </div>
      </div>

      {showSaleModal && (
        <RecordSaleModal
          workspaceId={conversation.workspace_id || conversation.created_by}
          currency="MWK"
          onClose={() => setShowSaleModal(false)}
          onSaved={() => setShowSaleModal(false)}
          prefillConversation={conversation}
        />
      )}
    </>
  );
}

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

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#8696A0] w-20 shrink-0 text-xs">{label}</span>
      <span className="text-white text-xs flex-1">{value}</span>
    </div>
  );
}
