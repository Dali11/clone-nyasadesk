// api/_lib/providers/index.js
// Provider registry — maps channel types to their provider implementations.

import { WhatsAppCloudProvider } from './whatsapp.js';
import { MessengerProvider } from './messenger.js';
import { TelegramProvider } from './telegram.js';
import { InstagramProvider } from './instagram.js';

const providers = new Map();

// ── WhatsApp: Meta Cloud API (direct) ───────────────────────────────────
providers.set('whatsapp',       new WhatsAppCloudProvider());
providers.set('whatsapp:cloud', new WhatsAppCloudProvider());

// ── Other channels ──────────────────────────────────────────────────────
providers.set('messenger', new MessengerProvider());
providers.set('telegram',  new TelegramProvider());
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
