// api/_lib/providers/index.js
// Provider registry — maps channel types to their provider implementations.
// The rest of the app calls getProvider(channelType) and never needs to know
// which specific BSP or API is behind it.
//
// To add a new provider (e.g. 360dialog for WhatsApp):
//   1. Create api/_lib/providers/whatsapp-360dialog.js implementing MessagingProvider
//   2. Register it here: providers.set('whatsapp:360dialog', new WhatsApp360DialogProvider())
//   3. Add a UI option in Settings to pick the provider — that's it.
//   The inbox, CRM, automations, AI, reporting, and team inbox don't change at all.

import { WhatsAppCloudProvider } from './whatsapp.js';
import { MessengerProvider } from './messenger.js';
import { TelegramProvider } from './telegram.js';
import { InstagramProvider } from './instagram.js';

// Registry: channelType → provider instance
const providers = new Map();

// Default providers (one per channel type for now)
providers.set('whatsapp', new WhatsAppCloudProvider());
providers.set('messenger', new MessengerProvider());
providers.set('telegram', new TelegramProvider());
providers.set('instagram', new InstagramProvider());

// Future: providers.set('whatsapp:360dialog', new WhatsApp360DialogProvider());
// Future: providers.set('whatsapp:twilio', new TwilioWhatsAppProvider());

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
