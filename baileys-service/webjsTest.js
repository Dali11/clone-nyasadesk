// TEMPORARY diagnostic module — tests whether a real headless-Chromium
// whatsapp-web.js client (which loads the actual web.whatsapp.com page)
// can complete new-device linking from this Railway box, as a way to
// isolate whether WhatsApp's rejection of Baileys pairing is IP-based
// (would still fail here too) or fingerprint-based (might succeed here).
//
// NOT wired into the real send/receive pipeline — QR-only, single
// in-memory session per workspace, no persistence guarantees. Delete
// this file (and its require() in server.js) once the diagnosis is done.

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');

const sessions = new Map(); // workspaceId -> { client, status, qrImage }

function registerWebjsTestRoutes(app, logger) {
  app.get('/webjs-qr/:workspaceId', async (req, res) => {
    const { workspaceId } = req.params;
    let session = sessions.get(workspaceId);

    if (session && session.status === 'connected') {
      return res.json({ status: 'connected' });
    }
    if (session && session.qrImage) {
      return res.json({ status: session.status, qrImage: session.qrImage });
    }
    if (session && session.status === 'starting') {
      return res.json({ status: 'starting' });
    }

    // Start a fresh client
    session = { client: null, status: 'starting', qrImage: null };
    sessions.set(workspaceId, session);

    try {
      const client = new Client({
        authStrategy: new LocalAuth({ clientId: workspaceId, dataPath: './webjs_auth' }),
        puppeteer: {
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
          ],
        },
      });
      session.client = client;

      client.on('qr', async (qr) => {
        logger.info(`[webjs-test:${workspaceId}] QR generated`);
        session.qrImage = await QRCode.toDataURL(qr);
        session.status = 'qr_pending';
      });

      client.on('ready', () => {
        logger.info(`[webjs-test:${workspaceId}] READY — linked successfully!`);
        session.status = 'connected';
        session.qrImage = null;
      });

      client.on('auth_failure', (msg) => {
        logger.error(`[webjs-test:${workspaceId}] auth_failure: ${msg}`);
        session.status = 'auth_failure';
      });

      client.on('disconnected', (reason) => {
        logger.warn(`[webjs-test:${workspaceId}] disconnected: ${reason}`);
        session.status = 'disconnected';
      });

      client.initialize().catch((e) => {
        logger.error(`[webjs-test:${workspaceId}] initialize failed: ${e.message}`);
        session.status = 'error';
        session.error = e.message;
      });

      // Give it a moment then respond with whatever we have so far;
      // the frontend/test caller should poll /webjs-qr again if not ready yet.
      setTimeout(() => {
        res.json({ status: session.status, qrImage: session.qrImage, error: session.error });
      }, 4000);
    } catch (e) {
      logger.error(`[webjs-test:${workspaceId}] setup failed: ${e.message}`);
      res.status(500).json({ status: 'error', error: e.message });
    }
  });

  app.get('/webjs-status/:workspaceId', (req, res) => {
    const session = sessions.get(req.params.workspaceId);
    if (!session) return res.json({ status: 'none' });
    res.json({ status: session.status, error: session.error });
  });
}

module.exports = { registerWebjsTestRoutes };
