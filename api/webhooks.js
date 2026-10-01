import whatsapp from './_lib/webhooks/whatsapp.js';
import instagram from './_lib/webhooks/instagram.js';
import messenger from './_lib/webhooks/messenger.js';
import telegram from './_lib/webhooks/telegram.js';
import email from './_lib/webhooks/email.js';

const handlers = {
  whatsapp,
  instagram,
  messenger,
  telegram,
  email,
};

export default async function handler(req, res) {
  const channel = String(req.query?.channel || '').toLowerCase();

  const target = handlers[channel];

  if (!target) {
    return res.status(404).json({
      error: 'Unknown webhook channel',
    });
  }

  return target(req, res);
}
