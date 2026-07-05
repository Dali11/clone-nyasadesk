// api/_lib/providers/index.js
// Provider registry — maps channel types to their provider implementations.
//
// WhatsApp uses WasapFlow Bridge (BSP) as the DEFAULT — no Meta App Review,
// no Business Verification needed. Customers click "Connect WhatsApp" →
// WasapFlow's Embedded Signup → pick number → done.
// Direct Cloud API and 360dialog kept as optional fallbacks.

import { WhatsAppCloudProvider } from './whatsapp.js';
import { WhatsAppWasapFlowProvider } from './whatsapp-wasapflow.js';
import { WhatsAppBirdProvider } from './whatsapp-bird.js';
import { WhatsApp360DialogProvider } from './whatsapp-360dialog.js';
import { MessengerProvider } from './messenger.js';
import { TelegramProvider } from './telegram.js';
import { InstagramProvider } from './instagram.js';

const providers = new Map();

// ── WhatsApp: WasapFlow Bridge is the DEFAULT (BSP, no Meta vetting) ────
providers.set('whatsapp', new WhatsAppWasapFlowProvider());
providers.set('whatsapp:wasapflow', new WhatsAppWasapFlowProvider());
// Direct Cloud API kept as fallback for power users with their own Meta app
providers.set('whatsapp:cloud', new WhatsAppCloudProvider());
// Bird BSP kept as optional alternative
providers.set('whatsapp:bird', new WhatsAppBirdProvider());
// 360dialog kept as optional alternative
providers.set('whatsapp:360dialog', new WhatsApp360DialogProvider());

// ── Other channels ──────────────────────────────────────────────────────
providers.set('messenger', new MessengerProvider());
providers.set('telegram', new TelegramProvider());
providers.set('instagram', new InstagramProvider());

export function getProvider(channelType) {
  const [type, providerName] = channelType.split(':');
  const key = providerName ? `${type}:${providerName}` : type;
  const provider = providers.get(key) || providers.get(type);
  if (!provider) throw new Error(`No provider registered for channel: ${channelType}`);
  return provider;
}

export function listProviders() {
  return Array.from(providers.entries()).map(([key, p]) => ({
    key,
    channelType: p.channelType,
    providerName: p.providerName,
  }));
}

export { MessagingProvider } from './base.js';
export { WhatsAppWasapFlowProvider } from './whatsapp-wasapflow.js';
