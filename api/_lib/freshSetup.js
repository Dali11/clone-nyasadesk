// api/_lib/freshSetup.js
// One-shot "fresh start" setup: all the customer provides is their
// Business ID + the phone number they want to connect.
// We auto-look up the business name, reuse or create a WABA for them,
// add the phone number, and fire the verification SMS — no WABA IDs,
// no setup choices, no extra steps.

const GRAPH_VERSION = 'v19.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export async function freshSetup(accessToken, businessId, cc, phoneNumber) {
  if (!accessToken || !businessId || !cc || !phoneNumber) {
    throw new Error('accessToken, businessId, cc and phoneNumber are all required');
  }
  // Meta requires the phone number WITHOUT a leading zero (e.g. 891107334 not 0891107334)
  phoneNumber = String(phoneNumber).replace(/^0+/, '');

  // Look up the business name to use as the WABA + number display name
  const bizRes = await fetch(
    `${GRAPH}/${businessId}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
  );
  const bizData = await bizRes.json();
  if (bizData.error) {
    throw new Error(
      bizData.error.message ||
      'Could not look up that Business ID. Make sure it is correct and your token has business_management permission.'
    );
  }
  const bizName = bizData.name || `Business ${businessId}`;

  // Reuse an existing WABA if one already exists under this business,
  // otherwise create a fresh one (named after the business)
  const ownedRes = await fetch(
    `${GRAPH}/${businessId}/owned_whatsapp_business_accounts?access_token=${encodeURIComponent(accessToken)}`
  );
  const ownedData = await ownedRes.json();
  let wabaId = (ownedData.data || [])[0]?.id || null;

  if (!wabaId) {
    const createRes = await fetch(
      `${GRAPH}/${businessId}/owned_whatsapp_business_accounts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, name: bizName }),
      }
    );
    const createData = await createRes.json();
    if (createData.error) {
      throw new Error(
        createData.error.message ||
        'Failed to create a WhatsApp Business Account for this business.'
      );
    }
    wabaId = createData.id;
  }

  // Add the phone number
  const addRes = await fetch(`${GRAPH}/${wabaId}/phone_numbers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      cc,
      phone_number: phoneNumber,
      verified_name: bizName,
    }),
  });
  const addData = await addRes.json();
  if (addData.error) {
    throw new Error(
      addData.error.message ||
      'Failed to add this phone number. If it is active on the regular WhatsApp Business App, you need to either (a) delete that account from the app first for a full migration, or (b) use "Connect with Facebook" above for coexistence.'
    );
  }
  const phoneNumberId = addData.id;

  // Fire the SMS code immediately so the next screen is ready
  const codeRes = await fetch(`${GRAPH}/${phoneNumberId}/request_code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      code_method: 'SMS',
      language: 'en_US',
    }),
  });
  const codeData = await codeRes.json();
  const codeSent = !codeData.error;

  // Detect if the number is active on the WhatsApp Business App —
  // in that case SMS will never arrive; coexistence via Embedded Signup is required.
  const errorMsg = codeData.error?.message || '';
  const isAppNumber =
    !codeSent &&
    (errorMsg.includes('132000') ||
      errorMsg.toLowerCase().includes('already registered') ||
      errorMsg.toLowerCase().includes('currently registered') ||
      errorMsg.toLowerCase().includes('registered on whatsapp'));

  return { waba_id: wabaId, phone_number_id: phoneNumberId, business_name: bizName, code_sent: codeSent, is_app_number: isAppNumber };
}
