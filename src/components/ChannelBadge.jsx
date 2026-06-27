import { Mail, MessageCircle, Phone } from 'lucide-react';

const channelConfig = {
  email: { icon: Mail, color: 'bg-blue-100 text-blue-600', label: 'Email' },
  whatsapp: { icon: MessageCircle, color: 'bg-green-100 text-green-600', label: 'WhatsApp' },
  chat: { icon: MessageCircle, color: 'bg-[#00A8BD]/10 text-[#00A8BD]', label: 'Chat' },
  phone: { icon: Phone, color: 'bg-orange-100 text-orange-600', label: 'Phone' },
};

export default function ChannelBadge({ channel, showLabel = false, size = 'sm' }) {
  const cfg = channelConfig[channel] || channelConfig.email;
  const Icon = cfg.icon;
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const padding = showLabel ? 'px-2 py-0.5 gap-1' : 'p-1';

  return (
    <span className={`inline-flex items-center rounded-full font-medium text-xs ${cfg.color} ${padding}`}>
      <Icon className={iconSize} />
      {showLabel && <span>{cfg.label}</span>}
    </span>
  );
}