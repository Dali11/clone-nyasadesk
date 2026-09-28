// api/_lib/aiDocumentTools.js
// External Webhook Tool for AI agents: any agent with a `webhook_tool_url`
// in its config can call `register_student` / `generate_login_link` (or any
// future external action) via a secure POST to that URL. The tool definition
// and executor live here so the existing aiAutoReply.js tool-calling loop
// picks them up automatically.

// ── External Webhook Tool ────────────────────────────────────────────────────
// Returns the register_student tool definition when the agent has a
// webhook_tool_url configured. Generic: the URL is stored per-agent, not
// hardcoded here, so any workspace can point it at their own endpoint.
export function getWebhookTools(agent) {
  if (!agent?.webhook_tool_url) return [];
  return [
    {
      type: 'function',
      function: {
        name: 'register_student',
        description: 'Registers a new student account once you have their full name and phone number. Call this ONCE — as soon as you have both details. The system auto-generates the email and password. Do NOT ask the student for email, password, or class.',
        parameters: {
          type: 'object',
          properties: {
            full_name: { type: 'string', description: "Student's full name exactly as they gave it." },
            phone:     { type: 'string', description: "Student's phone number in international format, e.g. 265999123456. Use their WhatsApp number." },
          },
          required: ['full_name', 'phone'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_login_link',
        description: 'Generates a one-tap login link for a student so they can jump straight into Chibondo Academy without typing a password. Call this when a student wants to start learning, access their courses, or log in. The link expires in 15 minutes -- but ALWAYS call this tool again fresh for every login request, never reuse an old link from earlier in the conversation. Reply with the link and a short encouraging message. If the student is not registered yet, register them first with register_student, then call this.',
        parameters: {
          type: 'object',
          properties: {
            phone: { type: 'string', description: "Student's phone number in international format, e.g. 265999123456. Use their WhatsApp number." },
          },
          required: ['phone'],
        },
      },
    },
  ];
}

// Calls the external webhook URL stored in agent.webhook_tool_url.
// Passes a shared secret (agent.webhook_tool_secret) as a Bearer token so
// the receiving endpoint can verify the call is legitimate.
export async function executeWebhookTool(agent, toolName, args) {
  const url    = agent.webhook_tool_url;
  const secret = agent.webhook_tool_secret || '';

  if (!url) throw new Error('Agent has no webhook_tool_url configured.');

  // generate_login_link: call Chibondo Academy's /api/wa-otp?action=generate-link
  // endpoint instead of the register endpoint. Uses the same shared secret.
  if (toolName === 'generate_login_link') {
    // Derive the generate-link URL from the register URL
    // (replace /api/wa-register with /api/wa-otp?action=generate-link)
    const authUrl = url.replace(/\/api\/wa-register$/, '/api/wa-otp?action=generate-link');
    const authSecret = agent.webhook_tool_secret || '';

    const res = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authSecret ? { Authorization: `Bearer ${authSecret}` } : {}),
      },
      body: JSON.stringify({ phone: args.phone }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Auth endpoint responded ${res.status}`);
    console.log('[aiTools] generate_login_link ok for phone %s (registered: %s)', args.phone, json.registered);

    return {
      ok: true,
      link: json.link,
      registered: json.registered,
      name: json.name,
      expires_in_seconds: json.expires_in_seconds,
    };
  }

  if (toolName !== 'register_student') throw new Error('Unknown webhook tool: ' + toolName);

  // Auto-generate email and password from phone number and name.
  // Email  : <local_digits>@chibondoacademy.com  (strip country code prefix, use last 9+ digits)
  // Password: FirstnameSurname + last 3 digits of phone (e.g. "EmmieChungà949")
  //           — at least 8 chars, alphanumeric, predictable so agent can tell the student.
  const enrichedArgs = { ...args };

  if (!enrichedArgs.email && enrichedArgs.phone) {
    // Strip non-digits, keep the local part (drop leading 265 / 0 prefix, keep 9 digits)
    const digits = enrichedArgs.phone.replace(/\D/g, '');
    // Use the full digit string as local part for uniqueness (phone number = unique ID)
    const localPart = digits.length >= 6 ? digits : digits.padEnd(6, '0');
    enrichedArgs.email = `${localPart}@chibondoacademy.com`;
  }

  if (!enrichedArgs.password && enrichedArgs.full_name) {
    // Build password from first + last name parts, strip spaces/special chars
    const nameParts = enrichedArgs.full_name.trim().split(/\s+/);
    const firstName = (nameParts[0] || '').replace(/[^a-zA-Z]/g, '');
    const lastName  = (nameParts[nameParts.length - 1] || '').replace(/[^a-zA-Z]/g, '');
    const digits    = (enrichedArgs.phone || '').replace(/\D/g, '');
    const suffix    = digits.slice(-3) || '000';
    // e.g. "EmmieChungà949" → cap first letters for readability
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    enrichedArgs.password = `${cap(firstName)}${cap(lastName)}${suffix}`;
    // Ensure minimum 8 chars
    while (enrichedArgs.password.length < 8) enrichedArgs.password += '0';
    // Store generated password so the agent can share it with the student
    enrichedArgs._generated_password = enrichedArgs.password;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ tool: toolName, args: enrichedArgs }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Webhook responded ${res.status}`);

  // Pass back the generated password so the agent can tell the student
  if (enrichedArgs._generated_password) {
    json.password = enrichedArgs._generated_password;
    json.email    = enrichedArgs.email;
  }
  return json;
}
