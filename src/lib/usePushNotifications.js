import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
// Guard: if the key looks like an encrypted Vercel wrapper (starts with "eyJ")
// and is longer than 100 chars, it's invalid. Log a warning but don't crash.
if (VAPID_PUBLIC_KEY && VAPID_PUBLIC_KEY.startsWith('eyJ') && VAPID_PUBLIC_KEY.length > 100) {
  console.error('[push] VITE_VAPID_PUBLIC_KEY appears to be an encrypted Vercel secret, not a raw VAPID key. Push notifications will not work until the correct key is set.');
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
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Request failed');
  return res.json();
}

// Returns true if this push endpoint is a known dead/legacy endpoint format
function isDeadEndpoint(endpoint) {
  if (!endpoint) return true;
  // Old FCM legacy endpoint — Google shut this down permanently in June 2025
  if (endpoint.includes('fcm.googleapis.com/fcm/send/')) return true;
  return false;
}

export function usePushNotifications(workspaceOwnerId) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const didAutoSubscribe = useRef(false);


  const subscribeInternal = useCallback(async (wsId) => {
    if (!wsId) return;
    try {
      const reg = await navigator.serviceWorker.ready;

      // Always check for and remove dead/legacy subscriptions first
      let sub = await reg.pushManager.getSubscription();
      if (sub && isDeadEndpoint(sub.endpoint)) {
        console.warn('[push] Clearing dead legacy FCM endpoint:', sub.endpoint.slice(0, 60));
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }

      // Create fresh subscription if needed
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        console.log('[push] New subscription created:', sub.endpoint.slice(0, 60));
      }

      // Always re-save to Supabase (upsert ensures DB is in sync)
      await authedFetch('/api/team?action=push-subscribe', {
        subscription: sub.toJSON(),
        workspace_id: wsId,
      });
      setSubscribed(true);
      console.log('[push] Subscription saved to DB ✓');
    } catch (e) {
      console.error('[push] subscribeInternal failed:', e?.message || e);
    }
  }, []);

  useEffect(() => {
    if (!supported || !workspaceOwnerId || didAutoSubscribe.current) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    didAutoSubscribe.current = true;
    // Small delay so SW has time to register first
    setTimeout(() => {
      subscribeInternal(workspaceOwnerId).catch(() => {});
    }, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, workspaceOwnerId]);

  useEffect(() => {
    const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
    setSupported(isSupported);
    if (!isSupported) return;

    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub && !isDeadEndpoint(sub?.endpoint));
    }).catch(() => {});
  }, []);

  // Auto-subscribe on mount when permission already granted
  // This also handles clearing dead subscriptions and re-registering
  const subscribe = useCallback(async () => {
    if (!supported || !workspaceOwnerId) return;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;
      await subscribeInternal(workspaceOwnerId);
    } catch (e) {
      console.error('[usePushNotifications] subscribe failed:', e);
    } finally {
      setLoading(false);
    }
  }, [supported, workspaceOwnerId, subscribeInternal]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await authedFetch('/api/team?action=push-unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      console.error('[usePushNotifications] unsubscribe failed:', e);
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
