// api/_lib/whatsappSetup.js
// Comprehensive WhatsApp Cloud API setup library.
//
// Consolidates ALL Graph API setup logic (v19.0) into a single ESM module:
//   - Token validation (debug_token self-debug)
//   - WABA discovery (from granular scopes + fallback to owned_whatsapp_business_accounts)
//   - WABA info, phone-number listing, phone-detail enrichment
//   - Phone registration (auto-PIN), verification code request/verify
//   - Webhook subscription with callback-override
//   - Messaging-limit enrichment (non-fatal)
//   - autoSetup — a full one-shot pipeline tying it all together
//
// Every error message is user-friendly and suggests the fix. Pure ESM, no require.

const GRAPH_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Small wrapper that POSTs JSON to a full Graph URL and returns parsed JSON.
 * Throws a user-friendly Error on Graph API errors.
 */
async function graphPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || 'Meta returned an unspecified error for this request.');
  }
  return data;
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Token validation
// ──────────────────────────────────────────────────────────────────────────

/**
 * Validate an access token via debug_token (self-debug: input_token === access_token).
 *
 * @param {string} accessToken
 * @returns {Promise<{ valid: boolean, scopes: string[], granular_scopes: array, user_id: string, app_id: string, expires_at: number }>}
 * @throws with a user-friendly message if the token is invalid, expired, or
 *         missing the whatsapp_business_management / whatsapp_business_messaging scopes.
 */
export async function validateToken(accessToken) {
  if (!accessToken) {
    throw new Error('An access token is required. Generate one from Meta Business Settings > Users > System Users.');
  }

  // Self-debug: input_token === access_token works for any valid token
  // regardless of which Facebook App issued it.
  const debugRes = await fetch(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`
  );
  const debugData = await debugRes.json();

  if (debugData.error) {
    throw new Error(
      debugData.error.message ||
        'That access token was rejected by Meta — double-check it was copied in full from Business Settings > Users > System Users.'
    );
  }

  const info = debugData.data || {};

  if (info.is_valid === false) {
    throw new Error(
      'This access token is invalid or has expired. Generate a new one from Business Settings > Users > System Users.'
    );
  }

  const scopes = info.scopes || [];
  const granularScopes = info.granular_scopes || [];

  const REQUIRED_SCOPES = ['whatsapp_business_management', 'whatsapp_business_messaging'];

  for (const scope of REQUIRED_SCOPES) {
    if (!scopes.includes(scope)) {
      throw new Error(
        `Token is missing ${scope} permission. When generating in Business Settings > System Users, check both whatsapp_business_management and whatsapp_business_messaging.`
      );
    }
  }

  // Check expiry (expires_at is a Unix timestamp).
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = info.expires_at || info.data_access_expires_at || 0;
  if (expiresAt && expiresAt < now) {
    throw new Error(
      'This access token has expired. Generate a new one from Business Settings > Users > System Users.'
    );
  }

  return {
    valid: true,
    scopes,
    granular_scopes: granularScopes,
    user_id: info.user_id || info.profile_id || null,
    app_id: info.app_id || null,
    expires_at: expiresAt || null,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 2. WABA discovery
// ──────────────────────────────────────────────────────────────────────────

/**
 * Discover all WhatsApp Business Accounts this token can manage.
 *
 * Uses debug_token granular_scopes to find WABA IDs; falls back to
 * /{me_id}/owned_whatsapp_business_accounts when granular target_ids are absent.
 * For each WABA, fetches id, name, and phone_numbers (with full details).
 *
 * @param {string} accessToken
 * @returns {Promise<Array<{ waba_id: string, name: string, phone_numbers: object[] }>>}
 */
export async function discoverWabas(accessToken) {
  if (!accessToken) throw new Error('Access token is required.');

  // validateToken gives us granular_scopes + validates the required scopes.
  const { granular_scopes: granular } = await validateToken(accessToken);

  const wabaScope = granular.find((g) => g.scope === 'whatsapp_business_management');
  let wabaIds = wabaScope?.target_ids || [];

  // Fallback for tokens without granular target_ids: ask the token's own
  // business identity for owned WABAs directly.
  if (!wabaIds.length) {
    const meRes = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
    const meData = await meRes.json();
    if (meData.id) {
      const ownedRes = await fetch(
        `${GRAPH}/${meData.id}/owned_whatsapp_business_accounts?access_token=${encodeURIComponent(accessToken)}`
      );
      const ownedData = await ownedRes.json();
      if (ownedData.error) {
        throw new Error(
          ownedData.error.message ||
            'Could not list WhatsApp Business Accounts for this token. Check that the System User was assigned "Manage" access to the WABA in Business Settings > Users > System Users > Add Assets.'
        );
      }
      wabaIds = (ownedData.data || []).map((w) => w.id);
    }
  }

  if (!wabaIds.length) {
    throw new Error(
      'No WhatsApp Business Accounts found for this token. Check that the System User was assigned "Manage" access to the right WABA in Business Settings > Users > System Users > Add Assets.'
    );
  }

  const wabas = [];
  for (const wabaId of wabaIds) {
    const [wabaInfoRes, numbersRes] = await Promise.all([
      fetch(`${GRAPH}/${wabaId}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`),
      fetch(`${GRAPH}/${wabaId}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`),
    ]);
    const wabaInfo = await wabaInfoRes.json();
    const numbersData = await numbersRes.json();

    // Skip WABAs this token can't actually read details for.
    if (wabaInfo.error) continue;

    const phoneNumbers = (numbersData.data || []).map((p) => ({
      id: p.id,
      display_phone_number: p.display_phone_number || null,
      verified_name: p.verified_name || null,
      code_verification_status: p.code_verification_status || null,
      quality_rating: p.quality_rating || null,
      name_status: p.name_status || null,
    }));

    wabas.push({
      waba_id: wabaId,
      name: wabaInfo.name || wabaId,
      phone_numbers: phoneNumbers,
    });
  }

  return wabas;
}

// ──────────────────────────────────────────────────────────────────────────
// 3. WABA info
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fetch WABA info fields.
 *
 * @param {string} accessToken
 * @param {string} wabaId
 * @returns {Promise<object>} Raw fields object: { id, name, currency, timezone_id, message_template_namespace }
 * @throws on error.
 */
export async function getWabaInfo(accessToken, wabaId) {
  if (!accessToken || !wabaId) throw new Error('accessToken and wabaId are required.');

  const res = await fetch(
    `${GRAPH}/${wabaId}?fields=id,name,currency,timezone_id,message_template_namespace&access_token=${encodeURIComponent(accessToken)}`
  );
  const data = await res.json();
  if (data.error) {
    throw new Error(
      data.error.message || 'Failed to fetch WhatsApp Business Account info. Verify the WABA ID and token permissions.'
    );
  }
  return data;
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Phone details
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fetch full details for a single phone number.
 *
 * @param {string} accessToken
 * @param {string} phoneNumberId
 * @returns {Promise<object>} Full phone object with all requested fields.
 * @throws on error.
 */
export async function getPhoneDetails(accessToken, phoneNumberId) {
  if (!accessToken || !phoneNumberId) throw new Error('accessToken and phoneNumberId are required.');

  const res = await fetch(
    `${GRAPH}/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,name_status,account_mode,eligibility_for_api_business_global_search&access_token=${encodeURIComponent(accessToken)}`
  );
  const data = await res.json();
  if (data.error) {
    throw new Error(
      data.error.message || 'Failed to fetch phone number details. Verify the phone number ID and token permissions.'
    );
  }
  return data;
}

// ──────────────────────────────────────────────────────────────────────────
// 5. List phone numbers on a WABA
// ──────────────────────────────────────────────────────────────────────────

/**
 * List all phone numbers on a WABA.
 *
 * @param {string} accessToken
 * @param {string} wabaId
 * @returns {Promise<Array<object>>} Array of phone objects with the requested fields.
 */
export async function listPhoneNumbers(accessToken, wabaId) {
  if (!accessToken || !wabaId) throw new Error('accessToken and wabaId are required.');

  const res = await fetch(
    `${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,name_status&access_token=${encodeURIComponent(accessToken)}`
  );
  const data = await res.json();
  if (data.error) {
    throw new Error(
      data.error.message || 'Failed to list phone numbers on this WABA. Verify the WABA ID and token permissions.'
    );
  }
  return data.data || [];
}

// ──────────────────────────────────────────────────────────────────────────
// 6. Phone registration status check (pure)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pure function: returns true if the number's OTP ownership check was verified.
 *
 * NOTE (2026-09-26 audit fix): code_verification_status === 'VERIFIED' means
 * Meta verified the number via OTP — NOT that it is registered on the Cloud
 * API. Registration is a separate POST /{PHONE_NUMBER_ID}/register call (see
 * registerPhone). This function is kept for the manual-connect wizard, which
 * uses it to decide whether the user still needs the OTP + PIN flow. Do NOT
 * use it to skip Cloud API registration — autoSetup() now always registers.
 *
 * @param {object} phoneDetails - Object containing code_verification_status
 * @returns {boolean}
 */
export function isPhoneRegistered(phoneDetails) {
  return phoneDetails?.code_verification_status === 'VERIFIED';
}

// ──────────────────────────────────────────────────────────────────────────
// 7. Register phone for Cloud API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Register a phone number for Cloud API use.
 *
 * v21.0+ request shape (matching whatsappGuidedSetup.js): access token in the
 * Authorization header (not the query string) and the required `certificate`
 * field. Registration is IDEMPOTENT from the caller's perspective: if Meta
 * answers that the number is already registered, that is success, not an
 * error — the caller just doesn't get a PIN back (Meta never shared one).
 *
 * @param {string} accessToken
 * @param {string} phoneNumberId
 * @param {string} [pin] - 6-digit PIN. Auto-generated if not provided.
 * @returns {Promise<{ ok: boolean, already_registered: boolean, pin: string|null }>}
 *   pin returned (so the caller can surface it) only when WE registered it now.
 * @throws with a user-friendly message on genuine registration failures.
 */
export async function registerPhone(accessToken, phoneNumberId, pin) {
  if (!accessToken || !phoneNumberId) {
    throw new Error('accessToken and phoneNumberId are required.');
  }

  // Auto-generate a 6-digit PIN if not provided.
  const finalPin = pin || String(Math.floor(100000 + Math.random() * 900000));

  const res = await fetch(`${GRAPH}/${phoneNumberId}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin: finalPin, certificate: 'cert' }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    const msg = data.error.message || '';
    const code = data.error.code || 0;
    // Meta error 130429 (and its message variants): the number is already
    // registered on the Cloud API. Nothing to do — report success without a PIN.
    if (code === 130429 || /already (?:been )?registered/i.test(msg)) {
      return { ok: true, already_registered: true, pin: null };
    }
    throw new Error(
      msg ||
        'Failed to register this phone number for Cloud API use. Make sure the number has been verified first (request + verify a code), and that no other number is already registered on it.'
    );
  }

  return { ok: true, already_registered: false, pin: finalPin };
}

// ──────────────────────────────────────────────────────────────────────────
// 8. Request verification code
// ──────────────────────────────────────────────────────────────────────────

/**
 * Request a verification code (SMS or VOICE) for a phone number.
 *
 * @param {string} accessToken
 * @param {string} phoneNumberId
 * @param {'SMS'|'VOICE'} [codeMethod='SMS']
 * @returns {Promise<{ ok: boolean }>}
 * @throws with user-friendly message on error.
 */
export async function requestVerificationCode(accessToken, phoneNumberId, codeMethod = 'SMS') {
  if (!accessToken || !phoneNumberId) {
    throw new Error('accessToken and phoneNumberId are required.');
  }

  const method = codeMethod === 'VOICE' ? 'VOICE' : 'SMS';

  let rawError = null;
  try {
    await graphPost(
      `${GRAPH}/${phoneNumberId}/request_code?access_token=${encodeURIComponent(accessToken)}`,
      { code_method: method, language: 'en_US' }
    );
  } catch (e) {
    rawError = e.message || '';
  }

  // Meta error 132000 / "already registered" / "currently registered on WhatsApp"
  // means the number is active on the WhatsApp Business App. SMS will never
  // arrive in that state — the only way to connect it without losing the app
  // is Embedded Signup's coexistence flow (QR-code handshake inside the app).
  const isCoexistenceCase =
    rawError &&
    (rawError.includes('132000') ||
      rawError.toLowerCase().includes('already registered') ||
      rawError.toLowerCase().includes('currently registered') ||
      rawError.toLowerCase().includes('registered on whatsapp'));

  if (isCoexistenceCase) {
    const err = new Error(
      'This number is currently active on the WhatsApp Business App. ' +
      'SMS verification will not work for active app numbers. ' +
      'To connect it without losing the app, use Embedded Signup (Connect with Facebook) — ' +
      'Meta will walk you through a QR-code scan inside the app to link both.'
    );
    err.code = 'WHATSAPP_APP_NUMBER';
    throw err;
  }

  if (rawError) {
    throw new Error(
      rawError ||
        'Failed to send a verification code to this number. Check that the number is correct and capable of receiving SMS/voice calls.'
    );
  }

  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// 9. Verify phone code
// ──────────────────────────────────────────────────────────────────────────

/**
 * Verify a phone number with a code received via SMS/voice.
 *
 * @param {string} accessToken
 * @param {string} phoneNumberId
 * @param {string} code
 * @returns {Promise<{ ok: boolean }>}
 * @throws with user-friendly message on error.
 */
export async function verifyPhoneCode(accessToken, phoneNumberId, code) {
  if (!accessToken || !phoneNumberId || !code) {
    throw new Error('accessToken, phoneNumberId and code are required.');
  }

  try {
    await graphPost(
      `${GRAPH}/${phoneNumberId}/verify_code?access_token=${encodeURIComponent(accessToken)}`,
      { code }
    );
  } catch (e) {
    throw new Error(
      e.message || 'That verification code was rejected — check it and try again.'
    );
  }

  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// 10. Subscribe webhooks
// ──────────────────────────────────────────────────────────────────────────

/**
 * Subscribe our app to a WABA's webhooks using Meta's callback-override feature.
 *
 * @param {string} accessToken
 * @param {string} wabaId
 * @returns {Promise<{ ok: boolean }>}
 * @throws with user-friendly message on failure.
 */
export async function subscribeWebhooks(accessToken, wabaId) {
  if (!accessToken || !wabaId) {
    throw new Error('accessToken and wabaId are required.');
  }

  const callbackUri = 'https://nyasadesk.com/api/webhooks/whatsapp';
  const verifyToken = `nyasa_${wabaId.slice(-8)}`;
  const url = `${GRAPH}/${wabaId}/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`;

  try {
    // Step 1: Subscribe the app to this WABA (no override yet).
    // Meta requires the app to be subscribed BEFORE override_callback_uri can be set.
    // Sending override_callback_uri in the initial subscription triggers error #100.
    await graphPost(url, {});

    // Step 2: Now set the callback override on the already-subscribed app.
    await graphPost(url, {
      override_callback_uri: callbackUri,
      verify_token: verifyToken,
    });
  } catch (e) {
    throw new Error(
      e.message ||
        'Failed to subscribe webhooks for this WABA. The token may be missing "Manage" permission on it. Check Business Settings > Users > System Users > Add Assets.'
    );
  }

  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// 11. Fetch messaging limits (non-fatal)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fetch messaging-limit / verification status fields for a WABA.
 * Non-fatal: returns whatever fields are available (some may be absent).
 *
 * @param {string} accessToken
 * @param {string} wabaId
 * @returns {Promise<object>} Fields object (on_behalf_of_business_info, business_verification_status, account_review_status).
 */
export async function fetchMessagingLimits(accessToken, wabaId) {
  if (!accessToken || !wabaId) throw new Error('accessToken and wabaId are required.');

  // Direct fetch — intentionally non-fatal even if some fields are missing.
  const res = await fetch(
    `${GRAPH}/${wabaId}?fields=on_behalf_of_business_info,business_verification_status,account_review_status&access_token=${encodeURIComponent(accessToken)}`
  );
  const data = await res.json();

  // Even if data.error is present, return whatever fields we got (best-effort).
  return data;
}

// ──────────────────────────────────────────────────────────────────────────
// 12. autoSetup — full one-shot pipeline
// ──────────────────────────────────────────────────────────────────────────

/**
 * Full setup pipeline for a known token + wabaId + phoneNumberId.
 *
 * Steps:
 *   1. getPhoneDetails
 *   2. ALWAYS registerPhone (idempotent — auto-generates a PIN if we register it)
 *   3. subscribeWebhooks
 *   4. fetchMessagingLimits (non-fatal, caught and included as null on failure)
 *   5. Returns { phone, waba_limits, auto_registered, auto_pin (if applicable) }
 *
 * Never throws on non-critical steps (limits fetch) — catches those and includes them as null.
 *
 * @param {string} accessToken
 * @param {string} wabaId
 * @param {string} phoneNumberId
 * @returns {Promise<{ phone: object, waba_limits: object|null, auto_registered: boolean, auto_pin: string|null }>}
 */
export async function autoSetup(accessToken, wabaId, phoneNumberId) {
  if (!accessToken || !wabaId || !phoneNumberId) {
    throw new Error('accessToken, wabaId and phoneNumberId are all required for autoSetup.');
  }

  // Step 1: Get full phone details with retry mechanism for propagation delays.
  let phone;
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      phone = await getPhoneDetails(accessToken, phoneNumberId);
      break;
    } catch (err) {
      lastError = err;
      if (attempt < 4) {
        console.warn(`[autoSetup] Failed to get phone details on attempt ${attempt}. Retrying in ${attempt * 1000}ms...`, err);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  if (!phone) {
    throw new Error(`Failed to fetch phone number details after multiple attempts. Meta may still be processing the registration or there may be a permission delay. Error: ${lastError?.message || 'Unknown error'}`);
  }

  let autoRegistered = false;
  let autoPin = null;

  // Step 2: ALWAYS attempt Cloud API registration (2026-09-26 audit fix).
  //
  // The old code skipped this when code_verification_status === 'VERIFIED',
  // conflating Meta's OTP ownership check with Cloud API registration. Every
  // number that comes out of Embedded Signup is VERIFIED, so registration was
  // NEVER run: the channel "connected" (webhooks subscribed, config saved)
  // while the number stayed dead — "not on WhatsApp" from any client, and
  // outbound sends failing with Meta #133010. Registration is idempotent
  // (registerPhone treats Meta's "already registered" as success), so we
  // simply always run it and keep the generated PIN when we did the work.
  const regResult = await registerPhone(accessToken, phoneNumberId);
  if (!regResult.already_registered) {
    autoRegistered = true;
    autoPin = regResult.pin;
  }

  // Step 3: Subscribe webhooks with retry mechanism for propagation delays.
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await subscribeWebhooks(accessToken, wabaId);
      break;
    } catch (err) {
      if (attempt === 4) {
        throw new Error(`Failed to subscribe webhooks after multiple attempts. Error: ${err.message || 'Unknown error'}`);
      }
      console.warn(`[autoSetup] Failed to subscribe webhooks on attempt ${attempt}. Retrying in ${attempt * 1000}ms...`, err);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  // Step 4: Fetch messaging limits (non-fatal).
  let wabaLimits = null;
  try {
    wabaLimits = await fetchMessagingLimits(accessToken, wabaId);
  } catch {
    // Non-critical — just augment as null.
    wabaLimits = null;
  }

  // Step 5: Return the full result.
  return {
    phone,
    waba_limits: wabaLimits,
    auto_registered: autoRegistered,
    auto_pin: autoPin,
  };
}
