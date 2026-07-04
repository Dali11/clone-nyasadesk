// api/_lib/providers/index.js
// Provider registry — maps channel types to their provider implementations.
//
// WhatsApp uses the direct Meta Cloud API by default.
// Once Nyasadesk registers as a Meta Tech Provider and sets up Embedded Signup,
// customers click "Connect WhatsApp" → FB.login → pick number → done.
// No BSP, no per-message markup, no third-party accounts.

import { WhatsAppCloudProvider } from './whatsapp.js';
import { WhatsAppBirdProvider } from './whatsapp-bird.js';
import { WhatsApp360DialogProvider } from './whatsapp-360dialog.js';
import { MessengerProvider } from './messenger.js';
import { TelegramProvider } from './telegram.js';
import { InstagramProvider } from './instagram.js';

const providers = new Map();

// ── WhatsApp: Direct Cloud API is the DEFAULT (no BSP, no markup) ────────
providers.set('whatsapp', new WhatsAppCloudProvider());
providers.set('whatsapp:cloud', new WhatsAppCloudProvider());
// Bird BSP kept as optional fallback
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
