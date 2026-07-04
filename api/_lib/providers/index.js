// api/_lib/providers/index.js
// Provider registry — maps channel types to their provider implementations.
// The rest of the app calls getProvider(channelType) and never needs to know
// which specific BSP or API is behind it.
//
// WhatsApp is routed through 360dialog (BSP) by default — this means customers
// do NOT need Meta App Review or Business Verification. 360dialog is already
// Meta-approved as a BSP. The direct WhatsApp Cloud API provider is kept as
// a fallback for Nyasadesk admins who want to use their own Meta app.
//
// To add a new provider:
//   1. Create api/_lib/providers/{channel}-{provider}.js implementing MessagingProvider
//   2. Register it here: providers.set('{channel}:{provider}', new Provider())
//   3. That's it — the inbox, CRM, automations, and reporting don't change at all.

import { WhatsAppCloudProvider } from './whatsapp.js';
import { WhatsApp360DialogProvider } from './whatsapp-360dialog.js';
import { MessengerProvider } from './messenger.js';
import { TelegramProvider } from './telegram.js';
import { InstagramProvider } from './instagram.js';

// Registry: channelType → provider instance
const providers = new Map();

// ── WhatsApp: 360dialog BSP is the DEFAULT (no Meta App Review needed) ──
providers.set('whatsapp', new WhatsApp360DialogProvider());
providers.set('whatsapp:360dialog', new WhatsApp360DialogProvider());
// Direct Cloud API kept for admins who want to use their own Meta app
providers.set('whatsapp:cloud', new WhatsAppCloudProvider());

// ── Other channels ──────────────────────────────────────────────────────
providers.set('messenger', new MessengerProvider());
providers.set('telegram', new TelegramProvider());
providers.set('instagram', new InstagramProvider());

export function getProvider(channelType) {
  // Support "channel:provider" format (e.g. "whatsapp:360dialog")
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
