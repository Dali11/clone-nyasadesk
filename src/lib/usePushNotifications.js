import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

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
  const [subscribed, setSubscribed] = useState(false);
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
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      console.log('[push] Browser subscription created:', sub.endpoint.slice(0, 60));
    }

    // Save to DB — if this fails, undo the browser subscription to keep them in sync
    try {
      await authedFetch('/api/team?action=push-subscribe', {
        subscription: sub.toJSON(),
        workspace_id: wsId,
      });
      console.log('[push] Subscription persisted to DB ✓');
      setSubscribed(true);
      return true;
    } catch (dbErr) {
      console.error('[push] DB save failed — rolling back browser subscription:', dbErr?.message);
      await sub.unsubscribe().catch(() => {});
      setSubscribed(false);
      throw dbErr; // re-throw so callers can surface the error
    }
  }, []);

  // ── Auto-subscribe on mount if permission already granted ───────────────
  useEffect(() => {
    if (!supported || !workspaceOwnerId || didAutoSubscribe.current) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    didAutoSubscribe.current = true;
    setTimeout(() => {
      subscribeInternal(workspaceOwnerId).catch(() => {});
    }, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, workspaceOwnerId]);

  // ── Check browser subscription state on mount ───────────────────────────
  useEffect(() => {
    const isSupported =
      'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
    setSupported(isSupported);
    if (!isSupported) return;

    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      const browserHasSub = !!sub && !isDeadEndpoint(sub?.endpoint);
      setSubscribed(browserHasSub);

      // If browser has a subscription, silently re-sync it to the DB on mount
      // This fixes the case where the DB row was lost but the browser sub persisted
      if (browserHasSub && workspaceOwnerId) {
        authedFetch('/api/team?action=push-subscribe', {
          subscription: sub.toJSON(),
          workspace_id: workspaceOwnerId,
        }).catch((e) => {
          // Silent — don't unsubscribe here, just log (user didn't ask us to change anything)
          console.warn('[push] Background re-sync failed:', e?.message);
        });
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceOwnerId]);

  // ── Public subscribe ────────────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!supported) return;
    if (!workspaceOwnerId) {
      console.error('[push] subscribe() called before workspaceOwnerId is available');
      return;
    }
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;
      await subscribeInternal(workspaceOwnerId);
    } catch (e) {
      console.error('[push] subscribe failed:', e?.message || e);
      // Error is surfaced via setSubscribed(false) inside subscribeInternal
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

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
