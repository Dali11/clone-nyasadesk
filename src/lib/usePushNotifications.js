import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// The VAPID public key is PUBLIC data by design (it's embedded in every
// browser subscription). It comes from the build env and matches the
// server's VAPID_PRIVATE_KEY pair — the mount effect below also verifies
// that an existing browser subscription was created with THIS key and
// resubscribes if not.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
if (VAPID_PUBLIC_KEY && VAPID_PUBLIC_KEY.startsWith('eyJ2IjoidjIi')) {
  console.error('[push] VITE_VAPID_PUBLIC_KEY appears to be an encrypted Vercel secret, not a raw VAPID key.');
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function authedFetch(path, body) {
  // Always refresh the session before fetching — avoids stale token failures
  const { data: refreshed } = await supabase.auth.getSession();
  const token = refreshed?.session?.access_token;
  if (!token) throw new Error('No active session — please log in again');
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Diagnostic beacon (2026-09-29): fire-and-forget report to the server at
// every push-subscribe failure point, so mobile failures (where devtools are
// unreachable) are visible in server logs. Plain fetch — deliberately NOT
// authedFetch: a broken session is one of the failure modes we're chasing.
async function reportPushDiag(stage, detail) {
  try {
    await fetch('/api/team?action=push-diag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: String(stage || '?'),
        detail: String(detail || '').slice(0, 400),
        permission: typeof Notification !== 'undefined' ? Notification.permission : 'n/a',
        ua: navigator.userAgent.slice(0, 160),
      }),
    });
  } catch { /* beacon is best-effort */ }
}

function isDeadEndpoint(endpoint) {
  if (!endpoint) return true;
  if (endpoint.includes('fcm.googleapis.com/fcm/send/')) return true;
  return false;
}

export function usePushNotifications(workspaceOwnerId) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  // Seed from last-known state to avoid the initial false→true flash that makes
  // the toggle look like it's reverting. The async check on mount will correct it.
  const [subscribed, setSubscribed] = useState(() => {
    try { return localStorage.getItem('nyasa_push_subscribed') === '1'; } catch (_) { return false; }
  });
  const [loading, setLoading]       = useState(false);
  const didAutoSubscribe             = useRef(false);

  // ── Core subscribe logic ────────────────────────────────────────────────
  const subscribeInternal = useCallback(async (wsId) => {
    if (!wsId) {
      console.warn('[push] subscribeInternal called with no workspaceOwnerId — skipping');
      return false;
    }
    const reg = await navigator.serviceWorker.ready;

    // Clean dead/legacy endpoints first
    let sub = await reg.pushManager.getSubscription();
    if (sub && isDeadEndpoint(sub.endpoint)) {
      console.warn('[push] Clearing dead legacy endpoint');
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }

    // Create browser subscription if needed
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        console.log('[push] Browser subscription created:', sub.endpoint.slice(0, 60));
      } catch (subscribeErr) {
        reportPushDiag('browser-subscribe-failed', subscribeErr?.message);
        console.warn('[push] pushManager.subscribe() failed, retrying after clearing state:', subscribeErr?.message);
        // Some browsers (Android Chrome) fail if there's a stale/expired subscription
        // state that wasn't cleaned up. Force-clear and retry once.
        try {
          const staleSub = await reg.pushManager.getSubscription();
          if (staleSub) await staleSub.unsubscribe();
        } catch (_) {}
        // Small delay before retry to let the browser settle
        await new Promise(resolve => setTimeout(resolve, 500));
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        console.log('[push] Browser subscription created (retry):', sub.endpoint.slice(0, 60));
      }
    }

    // Save to DB — if this fails, undo the browser subscription to keep them in sync
    try {
      await authedFetch('/api/team?action=push-subscribe', {
        subscription: sub.toJSON(),
        workspace_id: wsId,
      });
      console.log('[push] Subscription persisted to DB ✓');
      setSubscribed(true);
      try { localStorage.setItem('nyasa_push_subscribed', '1'); } catch (_) {}
      return true;
    } catch (dbErr) {
      reportPushDiag('db-save-failed', dbErr?.message);
      console.error('[push] DB save failed — rolling back browser subscription:', dbErr?.message);
      await sub.unsubscribe().catch(() => {});
      setSubscribed(false);
      try { localStorage.setItem('nyasa_push_subscribed', '0'); } catch (_) {}
      throw dbErr; // re-throw so callers can surface the error
    }
  }, []);

  // Auto-resubscription is handled in the mount check effect above.
  // This effect is intentionally empty — kept as a placeholder.
  // (Previously used setTimeout 1500ms which caused visible toggle flicker)

  // ── Check browser subscription state on mount ───────────────────────────
  useEffect(() => {
    const isSupported =
      'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
    setSupported(isSupported);
    if (!isSupported) return;

    // Use serviceWorker.ready (not register) so we wait for full activation
    // before querying pushManager — avoids false negatives during SW install.
    navigator.serviceWorker.ready.then(async (reg) => {
      let sub = await reg.pushManager.getSubscription();

      // KEY-MISMATCH CHECK (2026-09-29): a subscription created with a
      // DIFFERENT VAPID public key can never receive pushes from this
      // server (push services reject the signed JWT). Unsubscribe it so the
      // auto-resubscribe path below recreates it with the current key.
      if (sub && !isDeadEndpoint(sub.endpoint) && sub.options?.applicationServerKey) {
        const current = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        const existing = new Uint8Array(sub.options.applicationServerKey);
        const sameKey = existing.length === current.length &&
          current.every((b, i) => b === existing[i]);
        if (!sameKey) {
          console.warn('[push] existing subscription uses an old VAPID key — recreating it');
          await sub.unsubscribe().catch(() => {});
          sub = null;
        }
      }

      const browserHasSub = !!sub && !isDeadEndpoint(sub?.endpoint);

      if (browserHasSub) {
        setSubscribed(true);
        try { localStorage.setItem('nyasa_push_subscribed', '1'); } catch (_) {}
        // Re-sync to DB in case the row was lost
        if (workspaceOwnerId) {
          authedFetch('/api/team?action=push-subscribe', {
            subscription: sub.toJSON(),
            workspace_id: workspaceOwnerId,
          }).catch((e) => console.warn('[push] Background re-sync failed:', e?.message));
        }
      } else {
        // No browser subscription.
        // If permission was previously granted, silently recreate it —
        // subscriptions expire (~30 days) or get cleared on SW update.
        // This is why the toggle appears to "reset": the sub expired but
        // we were showing 'on' from localStorage.
        if (
          workspaceOwnerId &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted' &&
          !didAutoSubscribe.current
        ) {
          didAutoSubscribe.current = true;
          console.log('[push] Permission granted but no active subscription — recreating');
          subscribeInternal(workspaceOwnerId).catch((e) => {
            console.warn('[push] Auto-resubscribe failed:', e?.message || e);
            // Subscription is truly gone — update the toggle to reflect reality
            setSubscribed(false);
            try { localStorage.setItem('nyasa_push_subscribed', '0'); } catch (_) {}
          });
        } else {
          setSubscribed(false);
          try { localStorage.setItem('nyasa_push_subscribed', '0'); } catch (_) {}
        }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceOwnerId]);

  // ── Public subscribe ────────────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!supported) return { ok: false, error: 'Push not supported in this browser' };
    if (!workspaceOwnerId) {
      console.error('[push] subscribe() called before workspaceOwnerId is available');
      return { ok: false, error: 'Workspace not ready — please try again' };
    }
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === 'denied') {
        reportPushDiag('permission-denied', 'requestPermission returned denied (browser/site setting blocks it)');
        return { ok: false, error: 'Notifications blocked in browser settings' };
      }
      if (perm !== 'granted') {
        reportPushDiag('permission-not-granted', `requestPermission returned ${perm}`);
        return { ok: false, error: 'Permission not granted' };
      }
      await subscribeInternal(workspaceOwnerId);
      reportPushDiag('subscribed-ok', 'full subscribe path completed');
      return { ok: true };
    } catch (e) {
      reportPushDiag('subscribe-failed', e?.message || String(e));
      console.error('[push] subscribe failed:', e?.message || e);
      return { ok: false, error: e?.message || 'Failed to enable notifications' };
    } finally {
      setLoading(false);
    }
  }, [supported, workspaceOwnerId, subscribeInternal]);

  // ── Public unsubscribe ──────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Remove from DB first, then browser — order matters for consistency
        await authedFetch('/api/team?action=push-unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      try { localStorage.setItem('nyasa_push_subscribed', '0'); } catch (_) {}
    } catch (e) {
      console.error('[push] unsubscribe failed:', e?.message || e);
      // Don't leave UI in wrong state — force-recheck from browser
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg) {
        const sub = await reg.pushManager.getSubscription().catch(() => null);
        setSubscribed(!!sub && !isDeadEndpoint(sub?.endpoint));
      }
    } finally {
      setLoading(false);
    }
  }, [supported]);

  // ── Test: fire a local notification to confirm browser+SW are working ──
  const sendTestNotification = useCallback(async () => {
    if (!supported) return { ok: false, error: 'Push not supported' };
    try {
      const reg = await navigator.serviceWorker.ready;
      const perm = Notification.permission;
      if (perm !== 'granted') return { ok: false, error: `Permission is '${perm}' — enable notifications first` };
      await reg.showNotification('Nyasadesk test ✓', {
        body: 'Notifications are working correctly!',
        icon: '/icon-192.png',
        badge: '/badge-n.png',
        tag: 'nyasa-test',
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || 'Test notification failed' };
    }
  }, [supported]);

  return { supported, permission, subscribed, loading, subscribe, unsubscribe, sendTestNotification };
}
