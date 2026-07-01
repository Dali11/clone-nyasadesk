const PROD_URL = 'https://nyasadesk1.vercel.app';

// Registers the caller's bot with Telegram's setWebhook API, pointing it at
// our per-workspace webhook URL — makes "Activate Bot" a genuine one-click
// action instead of asking the user to call Telegram's API by hand.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const { bot_token, workspace_id } = req.body || {};
    if (!bot_token || !workspace_id) {
      return res.status(400).json({ ok: false, error: 'bot_token and workspace_id are required' });
    }

    // Verify the token is real and grab the bot's @username while we're at it
    const meRes = await fetch(`https://api.telegram.org/bot${bot_token}/getMe`);
    const meJson = await meRes.json();
    if (!meJson.ok) {
      return res.status(400).json({ ok: false, error: 'Invalid bot token — double check it was copied correctly from @BotFather' });
    }

    const webhookUrl = `${PROD_URL}/api/webhooks/telegram?workspace_id=${encodeURIComponent(workspace_id)}`;
    const hookRes = await fetch(`https://api.telegram.org/bot${bot_token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'edited_message'] }),
    });
    const hookJson = await hookRes.json();
    if (!hookJson.ok) {
      return res.status(400).json({ ok: false, error: hookJson.description || 'Telegram rejected the webhook registration' });
    }

    return res.status(200).json({ ok: true, bot_username: meJson.result?.username || null });
  } catch (e) {
    console.error('[telegram-setup] error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Internal server error' });
  }
}
