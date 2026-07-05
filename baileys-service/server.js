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
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;
const WEBHOOK_BASE = process.env.WEBHOOK_BASE || 'https://nyasadesk1.vercel.app';
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
  const store = makeInMemoryStore({ logger });

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

  const session = { sock, store, status: 'connecting', qr: null, qrTimeout: null };
  sessions.set(workspaceId, session);

  // Load store from file
  const storeFile = path.join(getAuthDir(workspaceId), 'store.json');
  if (fs.existsSync(storeFile)) {
    store.readFromFile(storeFile);
  }
  // Save store periodically
  setInterval(() => {
    if (fs.existsSync(getAuthDir(workspaceId))) {
      store.writeToFile(storeFile);
    }
  }, 30000);

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
      session.qr = null;
      if (session.qrTimeout) clearTimeout(session.qrTimeout);
      logger.info(`[${workspaceId}] WhatsApp connected`);
      // Notify our backend
      postWebhook(workspaceId, { type: 'connection', status: 'connected' }).catch(() => {});
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      session.status = 'disconnected';
      session.qr = null;
      logger.warn(`[${workspaceId}] Connection closed, code=${code}`);

      if (code !== DisconnectReason.loggedOut) {
        // Reconnect (not a logout — network issue, restart, etc.)
        setTimeout(() => startSession(workspaceId), 3000);
      } else {
        // Logged out — clear auth state
        logger.info(`[${workspaceId}] Logged out, clearing auth state`);
        const dir = getAuthDir(workspaceId);
        fs.rmSync(dir, { recursive: true, force: true });
        sessions.delete(workspaceId);
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

  store.bind(sock.ev);
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
