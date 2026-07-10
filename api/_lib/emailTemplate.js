// ── Nyasadesk branded email template ──────────────────────────────────────
// Single source of truth for all transactional emails sent from Nyasadesk.
// Matches the dark-green WhatsApp-inspired brand used in the invite email.
//
// Usage:
//   import { buildEmail } from './_lib/emailTemplate.js';
//   const html = buildEmail({
//     preheader: 'Short preview text shown in inbox',
//     body: `...inner HTML content (no wrapping needed)...`,
//     cta: { label: 'Accept Invitation', url: 'https://...' },  // optional
//     footer: 'Optional extra footer note',                      // optional
//   });

function buildEmail({ preheader = '', body = '', cta = null, footer = '' }) {
  const ctaBlock = cta ? `
    <div style="text-align:center;margin:28px 0;">
      <a href="${cta.url}"
        style="display:inline-block;padding:14px 36px;background:#25D366;color:#000;
               text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;
               letter-spacing:0.1px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        ${cta.label}
      </a>
    </div>` : '';

  const footerNote = footer ? `
    <p style="margin:12px 0 0;color:#374151;font-size:10px;text-align:center;line-height:1.5;">
      ${footer}
    </p>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>Nyasadesk</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-text-size-adjust:100%;">

  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${preheader}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
        style="max-width:520px;background:#111B21;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.18);">

        <!-- ── Header ── -->
        <tr>
          <td style="background:#075E54;padding:24px 32px;text-align:center;">
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr>
                <td style="vertical-align:middle;padding-right:10px;">
                  <img src="https://nyasadesk.com/icon-192.png" alt="Nyasadesk"
                    width="40" height="40"
                    style="width:40px;height:40px;border-radius:10px;display:block;border:0;" />
                </td>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.4px;
                               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                    Nyasadesk
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Body ── -->
        <tr>
          <td style="padding:36px 32px;">
            ${body}
            ${ctaBlock}
          </td>
        </tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;">
            <img src="https://nyasadesk.com/icon-192.png" alt=""
              width="24" height="24"
              style="width:24px;height:24px;border-radius:6px;display:inline-block;
                     vertical-align:middle;margin-right:6px;border:0;" />
            <span style="color:#4B5563;font-size:11px;vertical-align:middle;
                         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              Nyasadesk &middot;
              <a href="https://nyasadesk.com" style="color:#4B5563;text-decoration:none;">nyasadesk.com</a>
            </span>
            ${footerNote}
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export { buildEmail };
