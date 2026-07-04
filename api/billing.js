import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { PLAN_PRICING_MWK, PLAN_LABEL } from './_lib/adminAuth.js';

export const config = { api: { bodyParser: false } };

const SUPABASE_URL = 'https://pfbaepibelomiutlotkn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYmFlcGliZWxvbWl1dGxvdGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjMwNjQsImV4cCI6MjA5ODM5OTA2NH0.LKnDu1Qy9WN-sLsulU3Kv12dORfpJXlPhFZBrcvy0JA';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAYCHANGU_SECRET = process.env.PAYCHANGU_SECRET_KEY;
const PAYCHANGU_WEBHOOK_SECRET = process.env.PAYCHANGU_WEBHOOK_SECRET;
const PROD_URL = 'https://nyasadesk1.vercel.app';

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function verifyCaller(req, sbAnon) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await sbAnon.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function activateSubscription(sb, workspaceId, plan, txRef) {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await sb.from('profiles').update({
    plan, subscription_status: 'active', current_period_end: periodEnd.toISOString(),
  }).eq('id', workspaceId);
  await sb.from('transactions').update({
    status: 'success', updated_at: now.toISOString(),
  }).eq('tx_ref', txRef);
}

export default async function handler(req, res) {
  const raw = await readRawBody(req);

  // ── PayChangu webhook (async payment notification) ──────────────────
  // Set this URL in PayChangu dashboard → Settings → API & Webhooks:
  //   https://nyasadesk1.vercel.app/api/billing?hook=paychangu
  if (req.query.hook === 'paychangu') {
    try {
      const signature = req.headers['signature'];
      if (!PAYCHANGU_WEBHOOK_SECRET) {
        console.error('[billing webhook] PAYCHANGU_WEBHOOK_SECRET not configured');
        return res.status(200).send('ok');
      }
      const computed = crypto.createHmac('sha256', PAYCHANGU_WEBHOOK_SECRET).update(raw).digest('hex');
      if (!signature || signature !== computed) {
        console.error('[billing webhook] signature mismatch — discarding');
        return res.status(401).send('invalid signature');
      }
      const event = JSON.parse(raw || '{}');
      const txRef = event.tx_ref || event.reference;
      if (event.status === 'success' && txRef) {
        const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data: txn } = await sb.from('transactions').select('*').eq('tx_ref', txRef).maybeSingle();
        if (txn && txn.status !== 'success') {
          await activateSubscription(sb, txn.workspace_id, txn.plan, txRef);
        }
      }
      return res.status(200).send('ok');
    } catch (e) {
      console.error('[billing webhook] error:', e);
      return res.status(200).send('ok');
    }
  }

  // ── Authenticated client actions ────────────────────────────────────
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
  const action = req.query.action || body.action;

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON);
    const callerId = await verifyCaller(req, sbAnon);
    if (!callerId) return res.status(401).json({ error: 'Missing or invalid session' });

    const { data: callerProfile } = await sb.from('profiles').select('workspace_id, role').eq('id', callerId).maybeSingle();
    const workspaceId = callerProfile?.workspace_id || callerId;
    const isOwner = String(callerId) === String(workspaceId);
    const isAdmin = callerProfile?.role === 'admin';

    // GET ?action=status — subscription status + pricing + transaction history
    if (req.method === 'GET' && (action === 'status' || !action)) {
      const { data: profile } = await sb.from('profiles')
        .select('plan, subscription_status, trial_ends_at, current_period_end, billing_currency')
        .eq('id', workspaceId).maybeSingle();
      const { data: txns } = await sb.from('transactions')
        .select('tx_ref, plan, amount, currency, status, created_at')
        .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(10);
      return res.status(200).json({ ...profile, pricing: PLAN_PRICING_MWK, plan_labels: PLAN_LABEL, transactions: txns || [] });
    }

    // POST ?action=checkout — initiate PayChangu standard checkout
    if (req.method === 'POST' && action === 'checkout') {
      if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Only admins can manage billing' });
      if (!PAYCHANGU_SECRET) return res.status(500).json({ error: 'Payments are not configured yet. Please contact support.' });
      const plan = body.plan;
      if (!PLAN_PRICING_MWK[plan]) return res.status(400).json({ error: 'Unknown plan' });

      const { data: authUser } = await sb.auth.admin.getUserById(callerId);
      const email = authUser?.user?.email || undefined;
      const txRef = `nyasa_${String(workspaceId).slice(0, 8)}_${Date.now()}`;
      const amount = PLAN_PRICING_MWK[plan];

      const pcRes = await fetch('https://api.paychangu.com/payment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${PAYCHANGU_SECRET}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          amount: String(amount),
          currency: 'MWK',
          email,
          callback_url: `${PROD_URL}/settings?tab=subscription`,
          return_url: `${PROD_URL}/settings?tab=subscription`,
          tx_ref: txRef,
          customization: { title: `Nyasadesk ${PLAN_LABEL[plan]} plan`, description: 'Monthly subscription' },
          meta: { workspace_id: workspaceId, plan },
        }),
      });
      const pcJson = await pcRes.json();
      if (!pcRes.ok || pcJson.status !== 'success') {
        console.error('[billing checkout] paychangu error:', pcJson);
        return res.status(400).json({ error: pcJson.message || 'Could not start checkout' });
      }

      await sb.from('transactions').insert({
        workspace_id: workspaceId, tx_ref: txRef, plan, amount, currency: 'MWK', status: 'pending',
        meta: { initiated_by: callerId },
      });

      return res.status(200).json({ checkout_url: pcJson.data?.checkout_url });
    }

    // POST ?action=verify — verify a transaction after redirect back from PayChangu
    if (req.method === 'POST' && action === 'verify') {
      const txRef = body.tx_ref;
      if (!txRef) return res.status(400).json({ error: 'tx_ref is required' });
      if (!PAYCHANGU_SECRET) return res.status(500).json({ error: 'Payments are not configured yet' });

      const { data: txn } = await sb.from('transactions').select('*').eq('tx_ref', txRef).maybeSingle();
      if (!txn) return res.status(404).json({ error: 'Unknown transaction' });
      if (String(txn.workspace_id) !== String(workspaceId)) return res.status(403).json({ error: 'Not your transaction' });

      if (txn.status === 'success') return res.status(200).json({ status: 'success', plan: txn.plan });

      const vRes = await fetch(`https://api.paychangu.com/verify-payment/${encodeURIComponent(txRef)}`, {
        headers: { Authorization: `Bearer ${PAYCHANGU_SECRET}`, Accept: 'application/json' },
      });
      const vJson = await vRes.json();
      const paid = vJson?.data?.status === 'success';
      if (paid) {
        await activateSubscription(sb, workspaceId, txn.plan, txRef);
        return res.status(200).json({ status: 'success', plan: txn.plan });
      }
      await sb.from('transactions').update({ status: vJson?.data?.status || 'pending', updated_at: new Date().toISOString() }).eq('tx_ref', txRef);
      return res.status(200).json({ status: vJson?.data?.status || 'pending' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[billing] error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
