// Nyasadesk Baileys Service — WhatsApp Linked Devices (Multi-Device Protocol)
// Runs on Railway (always-on) and bridges WhatsApp messages to our Vercel app.
//
// Architecture:
//   WhatsApp servers ←WebSocket→ [this service] →HTTP webhook→ Vercel app → Supabase
//   Vercel app →HTTP→ [this service] →WhatsApp protocol→ recipient
//
// Multi-tenant: each workspace gets its own session (auth state persisted to disk).
// Sessions are identified by workspace_id.

const express = require('express');
const path = require('path');
const fs = require('fs');
const P = require('pino');
const QRCode = require('qrcode');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;
const WEBHOOK_BASE = process.env.WEBHOOK_BASE || 'https://nyasadesk.com';
const AUTH_DIR = process.env.AUTH_DIR || './auth_state';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const logger = P({ level: 'warn' });

// ── Session management ───────────────────────────────────────────────────
// One Baileys socket per workspace, keyed by workspace_id.
const sessions = new Map(); // workspaceId → { sock, store, status, qr, qrTimeout }

function getAuthDir(workspaceId) {
  const dir = path.join(AUTH_DIR, workspaceId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function startSession(workspaceId) {
  if (sessions.has(workspaceId)) {
    const existing = sessions.get(workspaceId);
    if (existing.status === 'connected' || existing.status === 'connecting') {
      return existing;
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(getAuthDir(workspaceId));
  const { version } = await fetchLatestBaileysVersion();
  // Store not available in this Baileys version — not needed for bridge mode

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['Nyasadesk', 'Chrome', '1.0.0'],
    getMessage: async (key) => {
      // Needed for retries — return null if we don't have it
      return null;
    },
  });

  const session = { sock, status: 'connecting', qr: null, qrTimeout: null, pairingCode: null, hasEverConnected: false };
  sessions.set(workspaceId, session);

  // ── Auth state updates ─────────────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Connection updates (QR, open, close) ───────────────────────────────
  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      session.qr = qr;
      session.status = 'qr_pending';
      logger.info(`[${workspaceId}] QR code generated`);

      // Auto-expire QR after 60 seconds
      if (session.qrTimeout) clearTimeout(session.qrTimeout);
      session.qrTimeout = setTimeout(() => {
        if (session.status === 'qr_pending') {
          session.qr = null;
          session.status = 'qr_expired';
        }
      }, 60000);
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.hasEverConnected = true;
      session.qr = null;
      session.pairingCode = null;
      if (session.qrTimeout) clearTimeout(session.qrTimeout);
      if (session.pairingTimeout) clearTimeout(session.pairingTimeout);
      logger.info(`[${workspaceId}] WhatsApp connected`);
      // Notify our backend
      postWebhook(workspaceId, { type: 'connection', status: 'connected' }).catch(() => {});
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const wasEstablished = session.hasEverConnected;
      const wasPairing = session.status === 'pairing_pending' || session.status === 'qr_pending';
      session.status = 'disconnected';
      session.qr = null;
      session.pairingCode = null;
      if (session.pairingTimeout) clearTimeout(session.pairingTimeout);
      logger.warn(`[${workspaceId}] Connection closed, code=${code}, wasEstablished=${wasEstablished}`);

      if (code === DisconnectReason.loggedOut) {
        // Real logout — clear auth state
        logger.info(`[${workspaceId}] Logged out, clearing auth state`);
        const dir = getAuthDir(workspaceId);
        fs.rmSync(dir, { recursive: true, force: true });
        sessions.delete(workspaceId);
      } else if (wasEstablished) {
        // A previously-working connection dropped (network blip, server
        // restart, etc.) — safe to auto-reconnect, nothing time-sensitive
        // is in flight for the user.
        setTimeout(() => startSession(workspaceId), 3000);
      } else if (wasPairing) {
        // Died mid QR-scan or mid pairing-code entry. Auto-reconnecting
        // here would silently swap in a new socket/pairing session while
        // the user is still typing the code they were shown — WhatsApp
        // then rejects it as invalid ("Couldn't link device"). Instead,
        // just mark expired and let the user explicitly request a new
        // code/QR, which starts a clean session.
        logger.warn(`[${workspaceId}] Connection dropped mid-pairing — NOT auto-reconnecting, user must request a fresh code/QR`);
        session.status = 'qr_expired';
        sessions.delete(workspaceId);
      } else {
        // Never even got that far — safe to retry once.
        setTimeout(() => startSession(workspaceId), 3000);
      }
    }
  });

  // ── Incoming messages ──────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      // Skip status broadcasts and protocol messages
      if (msg.key.remoteJid === 'status@s.whatsapp.net') continue;
      if (msg.message?.protocolMessage) continue;

      const fromMe = msg.key.fromMe;
      const jid = msg.key.remoteJid;
      const messageId = msg.key.id;

      // Extract text content
      let text = '';
      let messageType = 'text';
      let mediaBuffer = null;
      let mediaMimeType = null;
      let mediaFilename = null;

      if (msg.message?.conversation) {
        text = msg.message.conversation;
      } else if (msg.message?.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;
      } else if (msg.message?.imageMessage) {
        text = msg.message.imageMessage.caption || '';
        messageType = 'image';
        mediaMimeType = 'image/jpeg';
        try {
          mediaBuffer = await downloadMediaMessage(msg, 'buffer', {});
        } catch (e) { logger.error(`[${workspaceId}] Failed to download image:`, e.message); }
      } else if (msg.message?.videoMessage) {
        text = msg.message.videoMessage.caption || '';
        messageType = 'video';
        mediaMimeType = 'video/mp4';
        try {
          mediaBuffer = await downloadMediaMessage(msg, 'buffer', {});
        } catch (e) { logger.error(`[${workspaceId}] Failed to download video:`, e.message); }
      } else if (msg.message?.audioMessage) {
        messageType = 'audio';
        mediaMimeType = msg.message.audioMessage.mimetype || 'audio/ogg';
        try {
          mediaBuffer = await downloadMediaMessage(msg, 'buffer', {});
        } catch (e) { logger.error(`[${workspaceId}] Failed to download audio:`, e.message); }
      } else if (msg.message?.documentMessage) {
        text = msg.message.documentMessage.caption || '';
        messageType = 'document';
        mediaMimeType = msg.message.documentMessage.mimetype || 'application/octet-stream';
        mediaFilename = msg.message.documentMessage.fileName || 'document';
        try {
          mediaBuffer = await downloadMediaMessage(msg, 'buffer', {});
        } catch (e) { logger.error(`[${workspaceId}] Failed to download document:`, e.message); }
      } else if (msg.message?.stickerMessage) {
        messageType = 'sticker';
        mediaMimeType = 'image/webp';
        try {
          mediaBuffer = await downloadMediaMessage(msg, 'buffer', {});
        } catch (e) {}
      }

      // Skip empty messages (protocol, reactions, etc.)
      if (!text && !mediaBuffer) continue;

      // Extract phone number from JID (e.g., "265991234567@s.whatsapp.net" → "265991234567")
      const phone = jid.split('@')[0];
      // Group messages have "-" in the JID
      const isGroup = jid.includes('@g.us');
      const senderId = isGroup ? (msg.key.participant || jid) : jid;

      const payload = {
        type: 'message',
        workspaceId,
        from: phone,
        jid,
        isGroup,
        senderId: isGroup ? (msg.key.participant || '') : phone,
        fromMe,
        messageId,
        text,
        messageType,
        timestamp: msg.messageTimestamp || Math.floor(Date.now() / 1000),
        mediaMimeType,
        mediaFilename,
        // If media, we'll upload it separately (base64 encoded)
        mediaBase64: mediaBuffer ? mediaBuffer.toString('base64') : null,
      };

      postWebhook(workspaceId, payload).catch(e =>
        logger.error(`[${workspaceId}] Webhook failed:`, e.message)
      );
    }
  });

  // ── Message receipts (delivered, read) ─────────────────────────────────
  sock.ev.on('messages.update', (updates) => {
    for (const update of updates) {
      if (update.update?.status) {
        const statusMap = {
          0: 'sent',
          1: 'delivered',
          2: 'read',
        };
        const status = statusMap[update.update.status];
        if (status && update.key?.id) {
          postWebhook(workspaceId, {
            type: 'receipt',
            workspaceId,
            messageId: update.key.id,
            status,
            from: update.key.remoteJid?.split('@')[0],
          }).catch(() => {});
        }
      }
    }
  });

  return session;
}

// ── Webhook to our Vercel app ─────────────────────────────────────────────
async function postWebhook(workspaceId, payload) {
  const url = `${WEBHOOK_BASE}/api/webhooks/whatsapp?source=baileys&workspace_id=${workspaceId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    logger.error(`Webhook to ${url} returned ${res.status}`);
  }
  return res;
}

// ── REST API ──────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, sessions: Array.from(sessions.keys()).map(id => ({
    workspaceId: id,
    status: sessions.get(id)?.status,
  }))});
});

// Get QR code for a workspace (starts session if not running)
app.get('/qr/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;
  let session = sessions.get(workspaceId);

  if (!session || session.status === 'disconnected' || session.status === 'qr_expired') {
    try {
      session = await startSession(workspaceId);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (session.status === 'connected') {
    return res.json({ status: 'connected' });
  }

  if (session.qr) {
    // Return QR as both raw text and as a data URL image
    try {
      const qrImage = await QRCode.toDataURL(session.qr, { width: 300, margin: 2 });
      return res.json({
        status: 'qr_pending',
        qr: session.qr,
        qrImage,
      });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to generate QR image' });
    }
  }

  // Still connecting, no QR yet
  res.json({ status: session.status });
});

// Request pairing code (link with phone number instead of QR)
// User enters their phone number, we return a code they type into WhatsApp
//
// IMPORTANT: WhatsApp's "Couldn't link device / check the phone number" error
// almost always means the number sent doesn't EXACTLY match the account's real
// number in E.164 form (country code + subscriber number, no leading 0, no +).
// e.g. a Malawi number written locally as 0991234567 must become 265991234567
// (the trunk "0" is dropped) — sending 2650991234567 will be rejected.
// We use libphonenumber-js here to properly validate/normalize instead of a
// naive strip-non-digits, since this app has to support numbers from many
// countries (remote teams).
app.post('/pair/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ error: 'phoneNumber is required' });
  }

  // Normalize to E.164: ensure a leading + before parsing, then validate.
  const raw = phoneNumber.trim();
  const withPlus = raw.startsWith('+') ? raw : `+${raw.replace(/[^0-9]/g, '')}`;
  const parsed = parsePhoneNumberFromString(withPlus);

  if (!parsed || !parsed.isValid()) {
    return res.status(400).json({
      error: "That doesn't look like a valid phone number. Enter it as country code + number, WITHOUT the leading 0 (e.g. Malawi 0991234567 → 265991234567).",
    });
  }
  const cleanPhone = parsed.number.slice(1); // E.164 minus the leading '+'

  // CRITICAL: Any leftover auth state on disk (from a previous QR attempt,
  // a failed pairing, or a stale session) will corrupt the pairing-code flow.
  // useMultiFileAuthState reloads those old creds, and WhatsApp rejects the
  // pairing code because the registration keys don't match what it expects
  // for a fresh link. We must wipe the directory before starting.
  const existing = sessions.get(workspaceId);
  if (existing) {
    try { existing.sock?.end?.(new Error('switching to pairing-code flow')); } catch (_) {}
    sessions.delete(workspaceId);
  }
  // Wipe the auth state directory completely — fresh creds for fresh pairing
  const authDir = getAuthDir(workspaceId);
  fs.rmSync(authDir, { recursive: true, force: true });
  fs.mkdirSync(authDir, { recursive: true });

  let session;
  try {
    session = await startSession(workspaceId);
    // Give the socket a moment to open its websocket before requesting a code.
    await new Promise(r => setTimeout(r, 2500));
    session = sessions.get(workspaceId);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to start session: ' + e.message });
  }

  if (!session?.sock) {
    return res.status(503).json({ error: 'Session not ready, try again in a moment' });
  }

  try {
    // requestPairingCode returns a string like "ABCD1234"
    const code = await session.sock.requestPairingCode(cleanPhone);
    session.pairingCode = code;
    session.status = 'pairing_pending';
    session.pairingRequestedAt = Date.now();

    // WhatsApp pairing codes expire quickly (~60s) — flag it so the UI can warn/refresh.
    if (session.pairingTimeout) clearTimeout(session.pairingTimeout);
    session.pairingTimeout = setTimeout(() => {
      if (session.status === 'pairing_pending') {
        session.pairingCode = null;
        session.status = 'pairing_expired';
      }
    }, 60000);

    // Notify our backend
    postWebhook(workspaceId, { type: 'pairing', status: 'code_generated', code }).catch(() => {});

    res.json({ ok: true, pairingCode: code, phoneNumber: cleanPhone, expiresInSeconds: 60 });
  } catch (e) {
    logger.error(`[${workspaceId}] Pairing code failed:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get connection status
app.get('/status/:workspaceId', (req, res) => {
  const { workspaceId } = req.params;
  const session = sessions.get(workspaceId);
  if (!session) return res.json({ status: 'disconnected' });
  res.json({ status: session.status });
});

// Send a text message
app.post('/send', async (req, res) => {
  const { workspaceId, to, text } = req.body;

  if (!workspaceId || !to || !text) {
    return res.status(400).json({ error: 'workspaceId, to, and text are required' });
  }

  const session = sessions.get(workspaceId);
  if (!session || session.status !== 'connected') {
    return res.status(503).json({ error: 'WhatsApp not connected', status: session?.status || 'disconnected' });
  }

  try {
    // Format phone number to JID
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    const result = await session.sock.sendMessage(jid, { text });
    res.json({ ok: true, messageId: result.key.id });
  } catch (e) {
    logger.error(`[${workspaceId}] Send failed:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Send media (image, video, audio, document)
app.post('/send-media', async (req, res) => {
  const { workspaceId, to, mediaBase64, mediaType, caption, filename, mimeType } = req.body;

  if (!workspaceId || !to || !mediaBase64) {
    return res.status(400).json({ error: 'workspaceId, to, and mediaBase64 are required' });
  }

  const session = sessions.get(workspaceId);
  if (!session || session.status !== 'connected') {
    return res.status(503).json({ error: 'WhatsApp not connected' });
  }

  try {
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    const buffer = Buffer.from(mediaBase64, 'base64');

    let message = {};
    if (mediaType === 'image') {
      message = { image: buffer, caption: caption || '' };
    } else if (mediaType === 'video') {
      message = { video: buffer, caption: caption || '' };
    } else if (mediaType === 'audio') {
      message = { audio: buffer, mimetype: mimeType || 'audio/ogg', ptt: true };
    } else {
      message = { document: buffer, mimetype: mimeType || 'application/octet-stream', fileName: filename || 'file' };
    }

    const result = await session.sock.sendMessage(jid, message);
    res.json({ ok: true, messageId: result.key.id });
  } catch (e) {
    logger.error(`[${workspaceId}] Send media failed:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Disconnect/logout a session
app.post('/disconnect/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;
  const session = sessions.get(workspaceId);
  if (!session) return res.json({ ok: true, message: 'No active session' });

  try {
    await session.sock.logout();
  } catch (e) { /* non-fatal */ }

  // Clear auth state
  const dir = getAuthDir(workspaceId);
  fs.rmSync(dir, { recursive: true, force: true });
  sessions.delete(workspaceId);
  res.json({ ok: true });
});

// Start a session (called from Settings when user wants to connect)
app.post('/start/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;
  try {
    const session = await startSession(workspaceId);
    res.json({ ok: true, status: session.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Auto-reconnect on server restart ─────────────────────────────────────
async function restoreSessions() {
  // On startup, check for existing auth state dirs and reconnect
  if (!fs.existsSync(AUTH_DIR)) return;
  const dirs = fs.readdirSync(AUTH_DIR).filter(d =>
    fs.statSync(path.join(AUTH_DIR, d)).isDirectory()
  );
  for (const workspaceId of dirs) {
    logger.info(`Restoring session for ${workspaceId}`);
    try {
      await startSession(workspaceId);
    } catch (e) {
      logger.error(`Failed to restore ${workspaceId}:`, e.message);
    }
  }
}

app.listen(PORT, () => {
  logger.info(`Nyasadesk Baileys service running on port ${PORT}`);
  restoreSessions();
});
