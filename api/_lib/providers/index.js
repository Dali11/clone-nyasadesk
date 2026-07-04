// api/_lib/providers/index.js
// Provider registry — maps channel types to their provider implementations.
//
// WhatsApp routes through Bird (BSP) by default. Customers click "Connect
// WhatsApp" and go through Meta's Embedded Signup — Bird handles the backend.
// No Meta App Review, no Business Verification needed for customers.
// The direct WhatsApp Cloud API provider is kept as a fallback.

import { WhatsAppCloudProvider } from './whatsapp.js';
import { WhatsAppBirdProvider } from './whatsapp-bird.js';
import { WhatsApp360DialogProvider } from './whatsapp-360dialog.js';
import { MessengerProvider } from './messenger.js';
import { TelegramProvider } from './telegram.js';
import { InstagramProvider } from './instagram.js';

const providers = new Map();

// ── WhatsApp: Bird BSP is the DEFAULT (seamless, white-labeled) ──────────
providers.set('whatsapp', new WhatsAppBirdProvider());
providers.set('whatsapp:bird', new WhatsAppBirdProvider());
// 360dialog kept as an alternative BSP option
providers.set('whatsapp:360dialog', new WhatsApp360DialogProvider());
// Direct Cloud API kept for admins who want their own Meta app
providers.set('whatsapp:cloud', new WhatsAppCloudProvider());

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
