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

const GRAPH_VERSION = 'v19.0';
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

  // Meta's documented webhook-override feature: subscribes this WABA to
  // deliver webhooks straight to our endpoint, bypassing any need for the
  // customer to own/configure a separate Facebook Developer App.
  const subRes = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      override_callback_uri: callbackUri,
      verify_token: verifyToken,
    }),
  });
  const subData = await subRes.json();
  if (subData.error) {
    throw new Error(subData.error.message || 'Failed to subscribe webhooks for this WABA. The token may be missing "Manage" permission on it.');
  }

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

  const { error } = await sb.from('channel_configs').upsert({
    workspace_id: workspaceId, channel: 'whatsapp', enabled: true, config,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,channel' });

  if (error) throw new Error(error.message);
  return config;
}
