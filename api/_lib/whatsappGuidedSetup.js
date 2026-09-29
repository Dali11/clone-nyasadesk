// api/_lib/whatsappGuidedSetup.js
// Direct-Graph-API "guided setup" for WhatsApp Cloud API — an alternative to
// Meta's Embedded Signup (FB.login popup), which has repeatedly hit browser/
// JS-SDK-domain/OAuth issues that are entirely on Meta's side and outside
// our control. This flow never opens a Facebook popup at all.
//
// The customer still has to do ONE manual thing (there's no way around this
// — SOME token has to be granted, whether via Embedded Signup's OAuth or
// this): generate a System User access token in their OWN Meta Business
// Manager, with "Manage" permission on their own WhatsApp Business Account
// (WABA). They paste just that ONE token in. Everything else — which WABA(s)
// it can manage, which phone numbers exist on it, and wiring up webhook
// delivery to our endpoint — happens server-side via Graph API calls:
//   1. debug_token          -> discover which WABA(s) this token can manage
//   2. {waba_id}/phone_numbers -> list phone numbers on each WABA
//   3. {waba_id}/subscribed_apps with override_callback_uri -> Meta's
//      documented "webhook override" feature, which redirects webhook
//      delivery for this WABA to OUR endpoint without the customer needing
//      their own separate Facebook Developer App or webhook config at all.
//
// The WABA itself always stays in the customer's own Business Portfolio —
// nothing here transfers ownership. We only get delegated API access
// (same net effect Embedded Signup would have granted).

const GRAPH_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export async function discoverWabas(accessToken) {
  if (!accessToken) throw new Error('Access token is required');

  // Self-debug (input_token === access_token) works for any valid token
  // regardless of which Facebook App originally issued it — avoids needing
  // our own app to "own" a foreign token to inspect it.
  const debugRes = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`);
  const debugData = await debugRes.json();
  if (debugData.error) throw new Error(debugData.error.message || 'That access token was rejected by Meta — double check it was copied in full.');

  const info = debugData.data || {};
  if (info.is_valid === false) throw new Error('This access token is invalid or has expired. Generate a new one from Business Settings > System Users.');

  const scopes = info.scopes || [];
  if (!scopes.includes('whatsapp_business_management')) {
    throw new Error('This token is missing the "whatsapp_business_management" permission. When generating it, make sure both whatsapp_business_management and whatsapp_business_messaging are checked.');
  }

  const granular = info.granular_scopes || [];
  const wabaScope = granular.find(g => g.scope === 'whatsapp_business_management');
  let wabaIds = wabaScope?.target_ids || [];

  // Fallback for tokens without granular target_ids enumerated: ask the
  // token's own business identity for owned WABAs directly.
  if (!wabaIds.length) {
    const meRes = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
    const meData = await meRes.json();
    if (meData.id) {
      const ownedRes = await fetch(`${GRAPH}/${meData.id}/owned_whatsapp_business_accounts?access_token=${encodeURIComponent(accessToken)}`);
      const ownedData = await ownedRes.json();
      wabaIds = (ownedData.data || []).map(w => w.id);
    }
  }

  if (!wabaIds.length) {
    throw new Error('No WhatsApp Business Accounts found for this token. Check that the System User was assigned "Manage" access to the right WABA in Business Settings > Users > System Users > Add Assets.');
  }

  const wabas = [];
  for (const wabaId of wabaIds) {
    const [wabaInfoRes, numbersRes] = await Promise.all([
      fetch(`${GRAPH}/${wabaId}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`),
      fetch(`${GRAPH}/${wabaId}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`),
    ]);
    const wabaInfo = await wabaInfoRes.json();
    const numbersData = await numbersRes.json();
    if (wabaInfo.error) continue; // skip WABAs this token can't actually read details for

    wabas.push({
      waba_id: wabaId,
      name: wabaInfo.name || wabaId,
      phone_numbers: (numbersData.data || []).map(p => ({
        phone_number_id: p.id,
        display_phone_number: p.display_phone_number || null,
        verified_name: p.verified_name || null,
        code_verification_status: p.code_verification_status || null,
        quality_rating: p.quality_rating || null,
      })),
    });
  }

  return wabas;
}

export async function connectWaba(sb, { workspaceId, accessToken, wabaId, phoneNumberId }) {
  if (!workspaceId || !accessToken || !wabaId || !phoneNumberId) {
    throw new Error('workspaceId, accessToken, wabaId and phoneNumberId are all required');
  }

  const verifyToken = `nyasa_${workspaceId.slice(-8)}`;
  const callbackUri = `https://nyasadesk.com/api/webhooks/whatsapp`;

  // IMPORTANT ORDER: save the verify_token to DB FIRST before calling Meta's
  // webhook subscription endpoint. Meta immediately sends a verification ping
  // to our callback URL — if the token isn't in the DB yet, our handler
  // returns 403 and Meta rejects with #2200 "Callback verification failed".
  const { error: preErr } = await sb.from('channel_configs').upsert({
    workspace_id: workspaceId, channel: 'whatsapp', enabled: true,
    config: {
      provider: 'cloud',
      access_token: accessToken,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      verify_token: verifyToken,
      connected_via: 'guided_graph_api',
      connected_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,channel' });
  if (preErr) throw new Error(preErr.message);

  // Now subscribe webhooks — Meta's ping will find the token in the DB.
  //
  // TWO-STEP subscription (2026-09-29, aligned with whatsappSetup.subscribeWebhooks):
  // Meta requires the app to be subscribed BEFORE override_callback_uri can be
  // set. Sending override_callback_uri in the INITIAL subscription of an app
  // that isn't subscribed to the WABA yet (exactly the case when migrating a
  // WABA to a new app) triggers error #100. Step 1: plain subscribe. Step 2:
  // set the callback override on the already-subscribed app.
  const subUrl = `${GRAPH}/${wabaId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`;
  let subRes = await fetch(subUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  let subData = await subRes.json();
  if (subData.error) {
    throw new Error(subData.error.message || 'Failed to subscribe webhooks for this WABA. The token may be missing "Manage" permission on it.');
  }

  subRes = await fetch(subUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      override_callback_uri: callbackUri,
      verify_token: verifyToken,
    }),
  });
  subData = await subRes.json();
  if (subData.error) {
    throw new Error(subData.error.message || 'Failed to set the webhook callback for this WABA. The token may be missing "Manage" permission on it.');
  }

  // Fetch full phone details now that webhooks are subscribed.
  const numRes = await fetch(`${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating&access_token=${encodeURIComponent(accessToken)}`);
  const numData = await numRes.json();

  const config = {
    provider: 'cloud',
    access_token: accessToken,
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
    verify_token: verifyToken,
    phone_number: numData.display_phone_number || null,
    business_name: numData.verified_name || null,
    quality_rating: numData.quality_rating || null,
    connected_via: 'guided_graph_api',
    connected_at: new Date().toISOString(),
  };

  // Update config with full phone details.
  const { error } = await sb.from('channel_configs').upsert({
    workspace_id: workspaceId, channel: 'whatsapp', enabled: true, config,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,channel' });

  if (error) throw new Error(error.message);
  return config;
}

// ── Start from scratch: create a brand new WABA + register a brand new ──
// number, entirely via Graph API (no Meta dashboard visit needed). Only
// works for a business creating assets under ITS OWN Business ID — no
// App Review / Advanced Access required for that case (only accessing
// someone ELSE's WABA needs Advanced Access).

export async function createWaba(accessToken, businessId, name) {
  if (!accessToken || !businessId || !name) throw new Error('accessToken, businessId and name are required');
  const res = await fetch(`${GRAPH}/${businessId}/owned_whatsapp_business_accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, name }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Failed to create a new WhatsApp Business Account. Make sure the Business ID is correct and the token has business_management permission on it.');
  return { waba_id: data.id };
}

export async function addPhoneNumber(accessToken, wabaId, { cc, phoneNumber, verifiedName }) {
  if (!accessToken || !wabaId || !cc || !phoneNumber || !verifiedName) {
    throw new Error('accessToken, wabaId, cc, phoneNumber and verifiedName are all required');
  }
  // Strip leading zero — Meta API rejects numbers like 0891107334, expects 891107334
  phoneNumber = String(phoneNumber).replace(/^0+/, '');
  const res = await fetch(`${GRAPH}/${wabaId}/phone_numbers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, cc, phone_number: phoneNumber, verified_name: verifiedName }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Failed to add this phone number. If it\'s currently active on the regular WhatsApp Business App, that\'s why — this path only works for a free number. Use "Connect with Facebook" above for coexistence (keeping the app), or delete the WhatsApp account from the app on your phone first for a full migration.');
  return { phone_number_id: data.id };
}

export async function requestVerificationCode(accessToken, phoneNumberId, codeMethod) {
  if (!accessToken || !phoneNumberId) throw new Error('accessToken and phoneNumberId are required');
  const res = await fetch(`${GRAPH}/${phoneNumberId}/request_code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ code_method: codeMethod === 'VOICE' ? 'VOICE' : 'SMS', language: 'en_US' }),
  });
  const data = await res.json();
  if (data.error) {
    const msg = data.error.message || '';
    const code = data.error.code;
    // Error 132000 = number is registered on WhatsApp Business App.
    // SMS will never arrive — only Embedded Signup coexistence QR can bridge it.
    const isAppNumber =
      code === 132000 ||
      msg.includes('132000') ||
      msg.toLowerCase().includes('already registered') ||
      msg.toLowerCase().includes('currently registered') ||
      msg.toLowerCase().includes('registered on whatsapp');
    const err = new Error(
      isAppNumber
        ? 'This number is currently active on the WhatsApp Business App — Meta blocks SMS verification for it. You need to delete the account from the app first (Settings → Account → Delete my account), then retry.'
        : (msg || 'Failed to send a verification code to this number.')
    );
    if (isAppNumber) err.code = 'WHATSAPP_APP_NUMBER';
    throw err;
  }
  return { ok: true };
}

export async function verifyPhoneCode(accessToken, phoneNumberId, code) {
  if (!accessToken || !phoneNumberId || !code) throw new Error('accessToken, phoneNumberId and code are required');
  const res = await fetch(`${GRAPH}/${phoneNumberId}/verify_code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'That verification code was rejected — check it and try again.');
  return { ok: true };
}

export async function registerPhoneNumber(accessToken, phoneNumberId, pin) {
  if (!accessToken || !phoneNumberId || !pin) throw new Error('accessToken, phoneNumberId and pin are required');
  // Meta v21.0+: access_token goes in Authorization header (not body).
  // 'certificate' field is required — the string literal 'cert' satisfies
  // the check (Meta validates the field exists, not its value, when the
  // number's display name is already approved and the cert has been downloaded
  // at least once via WhatsApp Manager).
  const res = await fetch(`${GRAPH}/${phoneNumberId}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin, certificate: 'cert' }),
  });
  const data = await res.json();
  if (data.error) {
    const msg = data.error.message || '';
    // Provide clearer guidance for the most common failure modes
    if (msg.toLowerCase().includes('display name') || msg.toLowerCase().includes('pending')) {
      throw new Error('Registration failed: your display name has not been approved yet. Go to WhatsApp Manager → Phone Numbers → your number → Edit display name, ensure it includes your actual business name, and wait for approval before trying again.');
    }
    if (msg.toLowerCase().includes('certificate')) {
      throw new Error('Registration failed: you need to download the certificate from WhatsApp Manager first. Go to your phone number → click "Download certificate", then retry.');
    }
    throw new Error(msg || 'Failed to register this number for Cloud API use.');
  }
  return { ok: true };
}
