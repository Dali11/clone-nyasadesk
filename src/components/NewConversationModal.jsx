import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X, Send } from 'lucide-react';

const CHANNELS = ['email', 'whatsapp', 'chat', 'phone'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export default function NewConversationModal({ open, onClose, onCreated, user }) {
  const [form, setForm] = useState({
    contactName: '',
    contactEmail: '',
    subject: '',
    channel: 'email',
    priority: 'normal',
    firstMessage: '',
    tags: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.contactName || !form.subject) return;
    setSaving(true);

    // Create or find contact
    let contactId = null;
    try {
      const contacts = await base44.entities.Contact.filter({ email: form.contactEmail });
      if (contacts.length > 0) {
        contactId = contacts[0].id;
      } else {
        const c = await base44.entities.Contact.create({
          full_name: form.contactName,
          email: form.contactEmail,
          lead_source: form.channel,
          deal_stage: 'New Lead',
        });
        contactId = c.id;
      }
    } catch {}

    const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    const conv = await base44.entities.Conversation.create({
      subject: form.subject,
      contact_id: contactId,
      contact_name: form.contactName,
      contact_email: form.contactEmail,
      channel: form.channel,
      priority: form.priority,
      status: 'open',
      deal_stage: 'New Lead',
      tags,
      last_message_preview: form.firstMessage.slice(0, 120),
      last_message_at: new Date().toISOString(),
      unread: false,
      assigned_to: user?.id,
      assigned_to_name: user?.full_name,
    });

    if (form.firstMessage) {
      await base44.entities.Message.create({
        conversation_id: conv.id,
        type: 'outbound',
        body: form.firstMessage,
        sender_name: user?.full_name || 'You',
        sender_id: user?.id,
        channel: form.channel,
      });
    }

    setSaving(false);
    onCreated(conv);
    onClose();
    setForm({ contactName: '', contactEmail: '', subject: '', channel: 'email', priority: 'normal', firstMessage: '', tags: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">New Conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Contact Name *</label>
              <input
                value={form.contactName}
                onChange={e => set('contactName', e.target.value)}
                placeholder="Jane Smith"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Contact Email</label>
              <input
                type="email"
                value={form.contactEmail}
                onChange={e => set('contactEmail', e.target.value)}
                placeholder="jane@company.com"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Subject *</label>
            <input
              value={form.subject}
              onChange={e => set('subject', e.target.value)}
              placeholder="What's this conversation about?"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Channel</label>
              <select
                value={form.channel}
                onChange={e => set('channel', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7] bg-white"
              >
                {CHANNELS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Priority</label>
              <select
                value={form.priority}
                onChange={e => set('priority', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7] bg-white"
              >
                {PRIORITIES.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Tags (comma-separated)</label>
            <input
              value={form.tags}
              onChange={e => set('tags', e.target.value)}
              placeholder="hot lead, follow-up, enterprise"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">First Message (optional)</label>
            <textarea
              rows={3}
              value={form.firstMessage}
              onChange={e => set('firstMessage', e.target.value)}
              placeholder="Write your opening message…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#5C6CF7]"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving || !form.contactName || !form.subject}
            className="w-full py-2.5 bg-[#5C6CF7] text-white text-sm font-semibold rounded-xl hover:bg-[#4A5CE6] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                Create Conversation
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}